"""Route /api/* through CloudFront to the backend Lambda, using OAC + SigV4.

Why this instead of a public Function URL: a public URL returned 403 no matter
how correct its resource policy was. The account belongs to an AWS Organization
with SCPs enabled, and blocking anonymous lambda:InvokeFunctionUrl is a common
guardrail — not something an account admin can override.

This is the better design regardless, and was the recommendation in docs/IAM.md
before the block forced it:

  * the Function URL switches to AWS_IAM, so it is never publicly invokable —
    only CloudFront can call it, signing each request with SigV4
  * the API becomes SAME-ORIGIN with the site, so CORS stops applying at all
  * it opens the door to an httpOnly SameSite cookie later, which would remove
    the localStorage-token XSS exposure noted in backend/README.md

    cd infra
    $env:AWS_PROFILE = "dreamforge"
    python attach_api_to_cdn.py
"""

from __future__ import annotations

import sys
from copy import deepcopy

import boto3
from botocore.exceptions import ClientError

REGION = "us-east-1"
DISTRIBUTION_ID = "E1JWXDVORYY3V8"
FUNCTION_NAME = "dreamforge-backend"

# AWS managed cache policy.
CACHING_DISABLED = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"

ORIGIN_REQUEST_POLICY_NAME = "dreamforge-api-no-authorization"

session = boto3.Session(region_name=REGION)
cloudfront = session.client("cloudfront")
lambda_client = session.client("lambda")
account_id = session.client("sts").get_caller_identity()["Account"]

ORIGIN_ID = "api"


def log(message: str) -> None:
    print(message, flush=True)


def lock_down_function_url() -> str:
    """Switch the URL to AWS_IAM and drop any anonymous invoke permission."""
    config = lambda_client.update_function_url_config(
        FunctionName=FUNCTION_NAME,
        AuthType="AWS_IAM",
        # CloudFront handles the browser; the URL itself needs no CORS.
        Cors={
            "AllowOrigins": ["*"],
            "AllowMethods": ["GET", "POST", "PATCH", "PUT", "DELETE"],
            "AllowHeaders": ["content-type", "authorization"],
            "MaxAge": 86400,
        },
    )
    log("  = function URL AuthType -> AWS_IAM (no longer publicly invokable)")

    for statement_id in ("AllowPublicFunctionUrl", "FunctionUrlPublic"):
        try:
            lambda_client.remove_permission(
                FunctionName=FUNCTION_NAME, StatementId=statement_id
            )
            log(f"    removed anonymous permission {statement_id}")
        except ClientError as exc:
            if exc.response["Error"]["Code"] != "ResourceNotFoundException":
                raise

    distribution_arn = f"arn:aws:cloudfront::{account_id}:distribution/{DISTRIBUTION_ID}"
    try:
        lambda_client.add_permission(
            FunctionName=FUNCTION_NAME,
            StatementId="AllowCloudFrontOac",
            Action="lambda:InvokeFunctionUrl",
            Principal="cloudfront.amazonaws.com",
            SourceArn=distribution_arn,
            FunctionUrlAuthType="AWS_IAM",
        )
        log("    + invoke permission for this distribution only")
    except ClientError as exc:
        if exc.response["Error"]["Code"] != "ResourceConflictException":
            raise
        log("    = invoke permission already present")

    # Strip scheme and trailing slash: CloudFront wants a bare domain name.
    return config["FunctionUrl"].replace("https://", "").rstrip("/")


def ensure_oac() -> str:
    name = "dreamforge-lambda-oac"
    paginator = cloudfront.get_paginator("list_origin_access_controls")
    for page in paginator.paginate():
        for item in page.get("OriginAccessControlList", {}).get("Items", []):
            if item["Name"] == name:
                log(f"  = lambda origin access control {item['Id']}")
                return item["Id"]

    response = cloudfront.create_origin_access_control(
        OriginAccessControlConfig={
            "Name": name,
            "Description": "DreamForge backend Lambda URL",
            "SigningProtocol": "sigv4",
            "SigningBehavior": "always",
            # Note "lambda", not "s3" — the origin type must match.
            "OriginAccessControlOriginType": "lambda",
        }
    )
    oac_id = response["OriginAccessControl"]["Id"]
    log(f"  + lambda origin access control {oac_id}")
    return oac_id


def ensure_origin_request_policy() -> str:
    """Forward everything to the origin EXCEPT the viewer's Authorization header.

    This is the crux of OAC-in-front-of-Lambda. Origin Access Control signs each
    request with SigV4 *in the Authorization header*. Forwarding the viewer's own
    Authorization overwrites that signature, and the Function URL rejects the
    call with 403 — which reads like a permissions problem rather than a header
    collision.

    The managed AllViewerExceptHostHeader policy forwards Authorization, so it
    cannot be used here. Session tokens travel in X-Auth-Token instead.
    """
    # list_origin_request_policies is not a pageable operation in botocore.
    existing = cloudfront.list_origin_request_policies(Type="custom")
    for item in existing.get("OriginRequestPolicyList", {}).get("Items", []):
        if item["OriginRequestPolicy"]["OriginRequestPolicyConfig"]["Name"] == (
            ORIGIN_REQUEST_POLICY_NAME
        ):
            policy_id = item["OriginRequestPolicy"]["Id"]
            log(f"  = origin request policy {policy_id}")
            return policy_id

    response = cloudfront.create_origin_request_policy(
        OriginRequestPolicyConfig={
            "Name": ORIGIN_REQUEST_POLICY_NAME,
            "Comment": "Forward all viewer headers except Authorization, which OAC needs for SigV4",
            "HeadersConfig": {
                "HeaderBehavior": "allExcept",
                "Headers": {"Quantity": 1, "Items": ["authorization"]},
            },
            "CookiesConfig": {"CookieBehavior": "all"},
            "QueryStringsConfig": {"QueryStringBehavior": "all"},
        }
    )
    policy_id = response["OriginRequestPolicy"]["Id"]
    log(f"  + origin request policy {policy_id}")
    return policy_id


def attach_behaviour(api_domain: str, oac_id: str, origin_request_policy_id: str) -> None:
    current = cloudfront.get_distribution_config(Id=DISTRIBUTION_ID)
    etag = current["ETag"]
    config = current["DistributionConfig"]

    origins = config["Origins"]["Items"]
    origins = [o for o in origins if o["Id"] != ORIGIN_ID]
    origins.append(
        {
            "Id": ORIGIN_ID,
            "DomainName": api_domain,
            "OriginAccessControlId": oac_id,
            "CustomOriginConfig": {
                "HTTPPort": 80,
                "HTTPSPort": 443,
                "OriginProtocolPolicy": "https-only",
                "OriginSslProtocols": {"Quantity": 1, "Items": ["TLSv1.2"]},
                "OriginReadTimeout": 30,
                "OriginKeepaliveTimeout": 5,
            },
            # Required on update even when empty: the existing S3 origins carry
            # it, and CloudFront rejects a mixed payload with IllegalUpdate.
            "OriginPath": "",
            "CustomHeaders": {"Quantity": 0},
        }
    )
    config["Origins"] = {"Quantity": len(origins), "Items": origins}

    existing = [
        b for b in config.get("CacheBehaviors", {}).get("Items", [])
        if b["PathPattern"] != "/api/*"
    ]

    # CloudFront requires every optional field to be present on update and
    # reports them one at a time (SmoothStreaming, FieldLevelEncryptionId,
    # LambdaFunctionAssociations, ...). Cloning an existing behaviour inherits
    # the full shape instead of discovering each missing key by trial.
    template = existing[0] if existing else config["DefaultCacheBehavior"]
    api_behaviour = deepcopy(template)
    api_behaviour.update(
        {
            "PathPattern": "/api/*",
            "TargetOriginId": ORIGIN_ID,
            "ViewerProtocolPolicy": "https-only",
            # Never cache an authenticated API response.
            "CachePolicyId": CACHING_DISABLED,
            # Forwards everything except Authorization — see the note in
            # ensure_origin_request_policy.
            "OriginRequestPolicyId": origin_request_policy_id,
            "Compress": True,
            "AllowedMethods": {
                "Quantity": 7,
                "Items": ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"],
                "CachedMethods": {"Quantity": 2, "Items": ["GET", "HEAD"]},
            },
        }
    )
    # A cloned behaviour may carry legacy forwarding config, which cannot coexist
    # with a cache policy id.
    api_behaviour.pop("ForwardedValues", None)
    api_behaviour.pop("MinTTL", None)
    api_behaviour.pop("DefaultTTL", None)
    api_behaviour.pop("MaxTTL", None)

    behaviours = [api_behaviour] + existing
    config["CacheBehaviors"] = {"Quantity": len(behaviours), "Items": behaviours}

    # Drop the 403/404 -> /index.html mappings. They were distribution-wide, so
    # they rewrote failed API responses into the HTML shell with a 200 — which
    # hides the real status and makes any API fault undebuggable. The app routes
    # on the hash, so every real page already resolves to /index.html and these
    # mappings bought nothing.
    if config.get("CustomErrorResponses", {}).get("Quantity"):
        config["CustomErrorResponses"] = {"Quantity": 0, "Items": []}
        log("  - removed 403/404 -> index.html rewrites (they masked API errors)")

    cloudfront.update_distribution(
        Id=DISTRIBUTION_ID, DistributionConfig=config, IfMatch=etag
    )
    log("  + /api/* behaviour -> backend Lambda")


def main() -> int:
    log(f"account: {account_id}   distribution: {DISTRIBUTION_ID}\n")

    log("lambda function URL")
    api_domain = lock_down_function_url()
    log(f"    origin domain: {api_domain}")

    log("\norigin access control")
    oac_id = ensure_oac()

    log("\norigin request policy")
    origin_request_policy_id = ensure_origin_request_policy()

    log("\ncloudfront behaviour")
    attach_behaviour(api_domain, oac_id, origin_request_policy_id)

    domain = cloudfront.get_distribution(Id=DISTRIBUTION_ID)["Distribution"]["DomainName"]
    log("\n" + "=" * 70)
    log(f"API is now same-origin:  https://{domain}/api/...")
    log("=" * 70)
    log("\nSet VITE_API_BASE to https://" + domain + " and redeploy the site.")
    log("Distribution changes take 5-10 minutes to propagate.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except ClientError as exc:
        error = exc.response.get("Error", {})
        log(f"\nFailed: {error.get('Code')} - {error.get('Message')}")
        sys.exit(1)
