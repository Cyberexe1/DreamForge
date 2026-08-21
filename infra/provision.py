"""Provision the storage and delivery layer: two private S3 buckets behind one
CloudFront distribution.

Idempotent — every step checks for an existing resource and leaves it alone. Safe
to re-run.

This covers the resources DreamForge's deploy policy already allows. The Lambda,
its execution role and the EventBridge schedule need iam:CreateRole and
iam:PassRole, which that user does not have yet, so they live in
infra/template.yaml instead.

    cd infra
    $env:AWS_PROFILE = "dreamforge"
    python provision.py
"""

from __future__ import annotations

import json
import sys
import time

import boto3
from botocore.exceptions import ClientError

REGION = "us-east-1"
PROJECT = "dreamforge"

# AWS managed cache policies.
CACHING_OPTIMIZED = "658327ea-f89d-4fab-a63d-7e88639e58f6"

session = boto3.Session(region_name=REGION)
s3 = session.client("s3")
cloudfront = session.client("cloudfront")
account_id = session.client("sts").get_caller_identity()["Account"]

WEB_BUCKET = f"{PROJECT}-web-{account_id}"
ARTIFACTS_BUCKET = f"{PROJECT}-artifacts-{account_id}"


def log(message: str) -> None:
    print(message, flush=True)


# ── S3 ───────────────────────────────────────────────────────────────────────


def bucket_exists(name: str) -> bool:
    try:
        s3.head_bucket(Bucket=name)
        return True
    except ClientError as exc:
        if exc.response["Error"]["Code"] in ("404", "NoSuchBucket"):
            return False
        if exc.response["Error"]["Code"] == "403":
            # Exists, owned by someone else. Bucket names are globally unique.
            raise SystemExit(f"Bucket name {name} is taken by another account.") from exc
        raise


def create_bucket(name: str) -> None:
    if bucket_exists(name):
        log(f"  = {name} exists")
    else:
        # us-east-1 must not send a LocationConstraint; every other region must.
        s3.create_bucket(Bucket=name)
        log(f"  + {name} created")

    s3.put_public_access_block(
        Bucket=name,
        PublicAccessBlockConfiguration={
            "BlockPublicAcls": True,
            "IgnorePublicAcls": True,
            "BlockPublicPolicy": True,
            "RestrictPublicBuckets": True,
        },
    )
    s3.put_bucket_encryption(
        Bucket=name,
        ServerSideEncryptionConfiguration={
            "Rules": [
                {
                    "ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"},
                    "BucketKeyEnabled": True,
                }
            ]
        },
    )
    s3.put_bucket_tagging(
        Bucket=name,
        Tagging={"TagSet": [{"Key": "project", "Value": PROJECT}]},
    )
    log(f"    public access blocked, AES256 encryption on")


def put_oac_bucket_policy(name: str, distribution_arn: str) -> None:
    """Read access for CloudFront only.

    The AWS:SourceArn condition is load-bearing: without it any CloudFront
    distribution in any AWS account could read this bucket.
    """
    policy = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Sid": "AllowCloudFrontServicePrincipalReadOnly",
                "Effect": "Allow",
                "Principal": {"Service": "cloudfront.amazonaws.com"},
                "Action": "s3:GetObject",
                "Resource": f"arn:aws:s3:::{name}/*",
                "Condition": {"StringEquals": {"AWS:SourceArn": distribution_arn}},
            }
        ],
    }
    s3.put_bucket_policy(Bucket=name, Policy=json.dumps(policy))
    log(f"  + {name} bucket policy -> CloudFront OAC only")


# ── CloudFront ───────────────────────────────────────────────────────────────


def find_oac(name: str) -> str | None:
    paginator = cloudfront.get_paginator("list_origin_access_controls")
    for page in paginator.paginate():
        for item in page.get("OriginAccessControlList", {}).get("Items", []):
            if item["Name"] == name:
                return item["Id"]
    return None


def ensure_oac() -> str:
    name = f"{PROJECT}-oac"
    existing = find_oac(name)
    if existing:
        log(f"  = origin access control {existing}")
        return existing

    response = cloudfront.create_origin_access_control(
        OriginAccessControlConfig={
            "Name": name,
            "Description": "DreamForge S3 origins",
            "SigningProtocol": "sigv4",
            "SigningBehavior": "always",
            "OriginAccessControlOriginType": "s3",
        }
    )
    oac_id = response["OriginAccessControl"]["Id"]
    log(f"  + origin access control {oac_id}")
    return oac_id


def find_distribution() -> dict | None:
    paginator = cloudfront.get_paginator("list_distributions")
    for page in paginator.paginate():
        for item in page.get("DistributionList", {}).get("Items", []):
            if item.get("Comment") == f"{PROJECT} site and artifacts":
                return item
    return None


def s3_origin(bucket: str, origin_id: str, oac_id: str) -> dict:
    return {
        "Id": origin_id,
        "DomainName": f"{bucket}.s3.{REGION}.amazonaws.com",
        "OriginAccessControlId": oac_id,
        "S3OriginConfig": {"OriginAccessIdentity": ""},
        "OriginPath": "",
        "CustomHeaders": {"Quantity": 0},
    }


def behaviour(path_pattern: str | None, origin_id: str) -> dict:
    config = {
        "TargetOriginId": origin_id,
        "ViewerProtocolPolicy": "redirect-to-https",
        "CachePolicyId": CACHING_OPTIMIZED,
        "Compress": True,
        "AllowedMethods": {
            "Quantity": 2,
            "Items": ["GET", "HEAD"],
            "CachedMethods": {"Quantity": 2, "Items": ["GET", "HEAD"]},
        },
    }
    if path_pattern:
        config["PathPattern"] = path_pattern
    return config


def ensure_distribution(oac_id: str) -> tuple[str, str]:
    existing = find_distribution()
    if existing:
        log(f"  = distribution {existing['Id']} ({existing['Status']})")
        return existing["Id"], existing["DomainName"]

    config = {
        "CallerReference": f"{PROJECT}-{int(time.time())}",
        "Comment": f"{PROJECT} site and artifacts",
        "Enabled": True,
        # North America and Europe only — this is a demo, not a global product.
        "PriceClass": "PriceClass_100",
        "DefaultRootObject": "index.html",
        "Origins": {
            "Quantity": 2,
            "Items": [
                s3_origin(WEB_BUCKET, "web", oac_id),
                s3_origin(ARTIFACTS_BUCKET, "artifacts", oac_id),
            ],
        },
        "DefaultCacheBehavior": behaviour(None, "web"),
        "CacheBehaviors": {
            "Quantity": 2,
            "Items": [
                behaviour("/data/*", "artifacts"),
                behaviour("/images/*", "artifacts"),
            ],
        },
        # The app routes on the hash, so every URL resolves to index.html. This
        # keeps a stray path from showing raw S3 XML.
        "CustomErrorResponses": {
            "Quantity": 2,
            "Items": [
                {
                    "ErrorCode": 403,
                    "ResponsePagePath": "/index.html",
                    "ResponseCode": "200",
                    "ErrorCachingMinTTL": 10,
                },
                {
                    "ErrorCode": 404,
                    "ResponsePagePath": "/index.html",
                    "ResponseCode": "200",
                    "ErrorCachingMinTTL": 10,
                },
            ],
        },
        "ViewerCertificate": {"CloudFrontDefaultCertificate": True},
        "HttpVersion": "http2and3",
    }

    response = cloudfront.create_distribution(DistributionConfig=config)
    distribution = response["Distribution"]
    log(f"  + distribution {distribution['Id']} ({distribution['Status']})")
    return distribution["Id"], distribution["DomainName"]


# ── main ─────────────────────────────────────────────────────────────────────


def main() -> int:
    log(f"account: {account_id}   region: {REGION}\n")

    log("S3 buckets")
    create_bucket(WEB_BUCKET)
    create_bucket(ARTIFACTS_BUCKET)

    log("\nCloudFront")
    oac_id = ensure_oac()
    distribution_id, domain = ensure_distribution(oac_id)
    distribution_arn = f"arn:aws:cloudfront::{account_id}:distribution/{distribution_id}"

    log("\nBucket policies")
    put_oac_bucket_policy(WEB_BUCKET, distribution_arn)
    put_oac_bucket_policy(ARTIFACTS_BUCKET, distribution_arn)

    log("\n" + "=" * 66)
    log("ARTIFACTS_BUCKET  " + ARTIFACTS_BUCKET)
    log("WEB_BUCKET        " + WEB_BUCKET)
    log("DISTRIBUTION_ID   " + distribution_id)
    log("SITE              https://" + domain)
    log("=" * 66)
    log("\nA new distribution takes 5-15 minutes to reach Deployed.")
    log("Next: publish a capsule, then sync the site build to the web bucket.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code")
        log(f"\nFailed: {code} — {exc.response.get('Error', {}).get('Message')}")
        if code in ("AccessDenied", "AccessDeniedException"):
            log("The current identity is missing a permission for that call.")
        sys.exit(1)
