"""Deploy the accounts API to AWS App Runner as a container.

Why App Runner rather than the Lambda Function URL that was tried first: this
account is in an AWS Organization whose SCPs appear to block anonymous
lambda:InvokeFunctionUrl, and fronting the URL with CloudFront OAC ran into a
second problem — OAC signs with SigV4 in the Authorization header, which collides
with the session token. App Runner gets its own public HTTPS endpoint and avoids
both.

Eligibility is not a concern here: the account already runs App Runner services,
so it predates the April 2026 cutoff for new customers.

Trade-off accepted: App Runner bills for a provisioned instance (~$5-25/month
even idle) where Lambda was effectively free, and the API is no longer same-origin
with the site, so CORS applies again.

    cd infra
    $env:AWS_PROFILE = "dreamforge"
    python deploy_backend_apprunner.py
"""

from __future__ import annotations

import base64
import json
import os
import secrets
import subprocess
import sys
import time

import boto3
from botocore.exceptions import ClientError

REGION = "us-east-1"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.join(ROOT, "backend")

SERVICE_NAME = "dreamforge-backend"
REPO_NAME = "dreamforge-backend"
IMAGE_TAG = os.environ.get("IMAGE_TAG", "latest")

INSTANCE_ROLE = "dreamforge-apprunner-instance"
ACCESS_ROLE = "dreamforge-apprunner-access"
SECRET_NAME = "dreamforge/jwt-secret"

USERS_TABLE = os.environ.get("USERS_TABLE", "dreamforge-users")
SITE_ORIGIN = os.environ.get("SITE_ORIGIN", "")
PORT = "8080"

session = boto3.Session(region_name=REGION)
iam = session.client("iam")
ecr = session.client("ecr")
apprunner = session.client("apprunner")
secretsmanager = session.client("secretsmanager")
account_id = session.client("sts").get_caller_identity()["Account"]

REGISTRY = f"{account_id}.dkr.ecr.{REGION}.amazonaws.com"
IMAGE_URI = f"{REGISTRY}/{REPO_NAME}:{IMAGE_TAG}"


def log(message: str) -> None:
    print(message, flush=True)


def run(command: list[str], **kwargs) -> None:
    """Run a shell command, streaming output, raising on failure."""
    result = subprocess.run(command, **kwargs)
    if result.returncode != 0:
        raise SystemExit(f"Command failed: {' '.join(command[:3])}...")


# ── secret ───────────────────────────────────────────────────────────────────


def ensure_secret() -> str:
    """App Runner resolves this into an environment variable at runtime, so the
    value never appears in the service configuration or the image."""
    try:
        arn = secretsmanager.describe_secret(SecretId=SECRET_NAME)["ARN"]
        log(f"  = secret {SECRET_NAME}")
        return arn
    except ClientError as exc:
        if exc.response["Error"]["Code"] != "ResourceNotFoundException":
            raise

    created = secretsmanager.create_secret(
        Name=SECRET_NAME,
        Description="DreamForge JWT signing secret",
        SecretString=secrets.token_urlsafe(48),
        Tags=[{"Key": "project", "Value": "dreamforge"}],
    )
    log(f"  + secret {SECRET_NAME}")
    return created["ARN"]


# ── ECR ──────────────────────────────────────────────────────────────────────


def ensure_repository() -> None:
    try:
        ecr.create_repository(
            repositoryName=REPO_NAME,
            imageScanningConfiguration={"scanOnPush": True},
            encryptionConfiguration={"encryptionType": "AES256"},
            tags=[{"Key": "project", "Value": "dreamforge"}],
        )
        log(f"  + repository {REPO_NAME}")
    except ClientError as exc:
        if exc.response["Error"]["Code"] != "RepositoryAlreadyExistsException":
            raise
        log(f"  = repository {REPO_NAME}")


def build_and_push() -> None:
    token = ecr.get_authorization_token()["authorizationData"][0]
    username, password = (
        base64.b64decode(token["authorizationToken"]).decode().split(":", 1)
    )

    log("  docker login")
    run(
        ["docker", "login", "--username", username, "--password-stdin", REGISTRY],
        input=password.encode(),
    )

    log("  docker build")
    run(
        [
            "docker",
            "build",
            # App Runner runs x86_64 by default; building on arm64 hardware
            # without this produces an image that will not start.
            "--platform",
            "linux/amd64",
            "-t",
            IMAGE_URI,
            ".",
        ],
        cwd=BACKEND_DIR,
    )

    log("  docker push")
    # --quiet: the per-layer progress output is thousands of lines and buries
    # any real error that follows it.
    run(["docker", "push", "--quiet", IMAGE_URI])


# ── IAM ──────────────────────────────────────────────────────────────────────


def ensure_role(name: str, service: str, inline: dict | None, managed: str | None) -> str:
    trust = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Principal": {"Service": service},
                "Action": "sts:AssumeRole",
            }
        ],
    }

    try:
        iam.create_role(
            RoleName=name,
            AssumeRolePolicyDocument=json.dumps(trust),
            # ASCII only: IAM rejects characters outside Latin-1.
            Description=f"DreamForge - assumed by {service}",
            Tags=[{"Key": "project", "Value": "dreamforge"}],
        )
        log(f"  + role {name}")
        time.sleep(10)
    except ClientError as exc:
        if exc.response["Error"]["Code"] != "EntityAlreadyExists":
            raise
        iam.update_assume_role_policy(RoleName=name, PolicyDocument=json.dumps(trust))
        log(f"  = role {name}")

    if inline:
        iam.put_role_policy(
            RoleName=name, PolicyName="dreamforge", PolicyDocument=json.dumps(inline)
        )
    if managed:
        iam.attach_role_policy(RoleName=name, PolicyArn=managed)

    return f"arn:aws:iam::{account_id}:role/{name}"


def ecr_pull_policy() -> dict:
    """Pull-only access for App Runner's build role.

    Equivalent to the managed AWSAppRunnerServicePolicyForECRAccess, written
    inline. GetAuthorizationToken has no resource scope, so it must be "*"; every
    other action is limited to this one repository.
    """
    return {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Sid": "AuthToken",
                "Effect": "Allow",
                "Action": "ecr:GetAuthorizationToken",
                "Resource": "*",
            },
            {
                "Sid": "PullThisRepositoryOnly",
                "Effect": "Allow",
                "Action": [
                    "ecr:BatchCheckLayerAvailability",
                    "ecr:GetDownloadUrlForLayer",
                    "ecr:BatchGetImage",
                    "ecr:DescribeImages",
                ],
                "Resource": f"arn:aws:ecr:{REGION}:{account_id}:repository/{REPO_NAME}",
            },
        ],
    }


def instance_policy(secret_arn: str) -> dict:
    """Least privilege for the running container.

    Absent and must stay absent: lambda:InvokeFunction. This API must have no
    path to the creative agent, which is started by its schedule alone. Also
    absent: dynamodb:Scan, so no single call can read every user, and any access
    to the history table, which belongs to the agent.
    """
    return {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Sid": "UsersTableItemAccess",
                "Effect": "Allow",
                "Action": [
                    "dynamodb:GetItem",
                    "dynamodb:PutItem",
                    "dynamodb:UpdateItem",
                    "dynamodb:DeleteItem",
                ],
                "Resource": f"arn:aws:dynamodb:{REGION}:{account_id}:table/{USERS_TABLE}",
            },
            {
                "Sid": "ReadJwtSecret",
                "Effect": "Allow",
                "Action": "secretsmanager:GetSecretValue",
                "Resource": secret_arn,
            },
        ],
    }


# ── App Runner ───────────────────────────────────────────────────────────────


def find_service() -> str | None:
    """apprunner:ListServices is not a pageable operation in botocore, so page
    manually with NextToken."""
    token: str | None = None
    while True:
        kwargs = {"NextToken": token} if token else {}
        response = apprunner.list_services(**kwargs)
        for item in response.get("ServiceSummaryList", []):
            if item["ServiceName"] == SERVICE_NAME:
                return item["ServiceArn"]
        token = response.get("NextToken")
        if not token:
            return None


def source_configuration(access_role_arn: str, secret_arn: str) -> dict:
    origins = [SITE_ORIGIN] if SITE_ORIGIN else []
    origins += ["http://localhost:5173", "http://localhost:5174"]

    return {
        "ImageRepository": {
            "ImageIdentifier": IMAGE_URI,
            "ImageRepositoryType": "ECR",
            "ImageConfiguration": {
                "Port": PORT,
                "RuntimeEnvironmentVariables": {
                    "NODE_ENV": "production",
                    "PORT": PORT,
                    "AWS_REGION": REGION,
                    "USERS_TABLE": USERS_TABLE,
                    "JWT_EXPIRES_IN": "2h",
                    "BCRYPT_COST": "11",
                    "ALLOWED_ORIGINS": ",".join(origins),
                },
                # Resolved by App Runner from Secrets Manager at start, so the
                # value never appears in the service config or the image.
                "RuntimeEnvironmentSecrets": {"JWT_SECRET": secret_arn},
            },
        },
        "AutoDeploymentsEnabled": False,
        "AuthenticationConfiguration": {"AccessRoleArn": access_role_arn},
    }


def ensure_service(access_role_arn: str, instance_role_arn: str, secret_arn: str) -> str:
    health_check = {
        "Protocol": "HTTP",
        "Path": "/api/health",
        "Interval": 10,
        "Timeout": 5,
        "HealthyThreshold": 1,
        "UnhealthyThreshold": 5,
    }
    instance_config = {
        # Smallest size available. The workload is a few logins a day, and bcrypt
        # at cost 11 is the only real CPU cost.
        "Cpu": "256",
        "Memory": "512",
        "InstanceRoleArn": instance_role_arn,
    }

    existing = find_service()
    if existing:
        apprunner.update_service(
            ServiceArn=existing,
            SourceConfiguration=source_configuration(access_role_arn, secret_arn),
            InstanceConfiguration=instance_config,
            HealthCheckConfiguration=health_check,
        )
        log(f"  = service {SERVICE_NAME} updated")
        return existing

    response = apprunner.create_service(
        ServiceName=SERVICE_NAME,
        SourceConfiguration=source_configuration(access_role_arn, secret_arn),
        InstanceConfiguration=instance_config,
        HealthCheckConfiguration=health_check,
        Tags=[{"Key": "project", "Value": "dreamforge"}],
    )
    log(f"  + service {SERVICE_NAME} created")
    return response["Service"]["ServiceArn"]


def wait_for_running(service_arn: str) -> dict:
    log("  waiting for RUNNING (first deploy takes 3-6 minutes)")
    for _ in range(60):
        service = apprunner.describe_service(ServiceArn=service_arn)["Service"]
        status = service["Status"]
        if status == "RUNNING":
            return service
        if status in ("CREATE_FAILED", "DELETE_FAILED"):
            raise SystemExit(f"Service reached {status}. Check the App Runner console logs.")
        time.sleep(15)
    raise SystemExit("Timed out waiting for RUNNING.")


# ── main ─────────────────────────────────────────────────────────────────────


def main() -> int:
    log(f"account: {account_id}   region: {REGION}")
    log(f"image:   {IMAGE_URI}")
    log(f"origin:  {SITE_ORIGIN or '(localhost only)'}\n")

    log("secret")
    secret_arn = ensure_secret()

    log("\necr")
    ensure_repository()
    build_and_push()

    log("\niam")
    instance_role_arn = ensure_role(
        INSTANCE_ROLE, "tasks.apprunner.amazonaws.com", instance_policy(secret_arn), None
    )
    # Inline rather than the managed AWSAppRunnerServicePolicyForECRAccess: the
    # deploy user's iam:AttachRolePolicy is deliberately restricted to a single
    # managed policy ARN, and widening that to allow arbitrary attachments would
    # weaken the guard far more than this saves.
    access_role_arn = ensure_role(
        ACCESS_ROLE, "build.apprunner.amazonaws.com", ecr_pull_policy(), None
    )

    log("\napp runner")
    service_arn = ensure_service(access_role_arn, instance_role_arn, secret_arn)
    service = wait_for_running(service_arn)

    url = f"https://{service['ServiceUrl']}"
    log("\n" + "=" * 70)
    log(f"API  {url}")
    log("=" * 70)
    log(f"\nHealth: {url}/api/health")
    log("Set VITE_API_BASE to that URL, rebuild the site, sync to the web bucket.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except ClientError as exc:
        error = exc.response.get("Error", {})
        log(f"\nFailed: {error.get('Code')} - {error.get('Message')}")
        sys.exit(1)
