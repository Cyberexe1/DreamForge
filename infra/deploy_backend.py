"""Deploy the accounts API as a Lambda behind a Function URL.

Why the site's login was broken before this: the API only ever ran on localhost,
and the deployed frontend bundle had http://localhost:4000 baked in. Visitors
have nothing to reach.

Idempotent. Safe to re-run.

    cd infra
    $env:AWS_PROFILE = "dreamforge"
    python deploy_backend.py
"""

from __future__ import annotations

import io
import json
import os
import secrets
import sys
import time
import zipfile

import boto3
from botocore.exceptions import ClientError

REGION = "us-east-1"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.join(ROOT, "backend")

FUNCTION_NAME = "dreamforge-backend"
ROLE_NAME = "dreamforge-backend-execution"
SECRET_NAME = "dreamforge/jwt-secret"
USERS_TABLE = os.environ.get("USERS_TABLE", "dreamforge-users")
SITE_ORIGIN = os.environ.get("SITE_ORIGIN", "")

session = boto3.Session(region_name=REGION)
iam = session.client("iam")
lambda_client = session.client("lambda")
secretsmanager = session.client("secretsmanager")
account_id = session.client("sts").get_caller_identity()["Account"]


def log(message: str) -> None:
    print(message, flush=True)


# ── secret ───────────────────────────────────────────────────────────────────


def ensure_secret() -> str:
    """A strong random secret, stored in Secrets Manager.

    Not a Lambda environment variable: env vars are readable by anyone with
    lambda:GetFunctionConfiguration, and this value forges sessions.
    """
    try:
        existing = secretsmanager.describe_secret(SecretId=SECRET_NAME)
        log(f"  = secret {SECRET_NAME}")
        return existing["ARN"]
    except ClientError as exc:
        if exc.response["Error"]["Code"] != "ResourceNotFoundException":
            raise

    created = secretsmanager.create_secret(
        Name=SECRET_NAME,
        Description="DreamForge JWT signing secret",
        SecretString=secrets.token_urlsafe(48),
        Tags=[{"Key": "project", "Value": "dreamforge"}],
    )
    log(f"  + secret {SECRET_NAME} (48 random bytes)")
    return created["ARN"]


# ── packaging ────────────────────────────────────────────────────────────────


def build_zip() -> bytes:
    """src/ + package.json + node_modules.

    All dependencies are pure JavaScript — bcryptjs rather than native bcrypt
    precisely so this package works on arm64 Amazon Linux without a container
    build.
    """
    node_modules = os.path.join(BACKEND_DIR, "node_modules")
    if not os.path.isdir(node_modules):
        raise SystemExit("node_modules missing. Run npm install in backend/ first.")

    buffer = io.BytesIO()
    skip = {"__pycache__", ".cache", "test", "tests", ".bin"}

    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for relative in ("src", "node_modules"):
            base = os.path.join(BACKEND_DIR, relative)
            for root, dirs, files in os.walk(base):
                dirs[:] = [d for d in dirs if d not in skip]
                for filename in files:
                    if filename.endswith((".md", ".ts", ".map")):
                        continue
                    full = os.path.join(root, filename)
                    archive.write(full, os.path.relpath(full, BACKEND_DIR))

        archive.write(os.path.join(BACKEND_DIR, "package.json"), "package.json")

    data = buffer.getvalue()
    log(f"  package: {len(data) / 1024 / 1024:.1f} MB")
    if len(data) > 50 * 1024 * 1024:
        raise SystemExit("Package exceeds the 50MB direct-upload limit; use S3.")
    return data


# ── IAM ──────────────────────────────────────────────────────────────────────


def backend_policy(secret_arn: str) -> dict:
    """Least privilege.

    Note what is absent and must stay absent: lambda:InvokeFunction. This API
    must have no path to the creative agent — the agent runs on its schedule
    alone. Also absent: dynamodb:Scan, so no single call can read every user, and
    any access to the history table, which belongs to the agent.
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
            {
                "Sid": "Logs",
                "Effect": "Allow",
                "Action": [
                    "logs:CreateLogGroup",
                    "logs:CreateLogStream",
                    "logs:PutLogEvents",
                ],
                "Resource": f"arn:aws:logs:{REGION}:{account_id}:log-group:/aws/lambda/{FUNCTION_NAME}*",
            },
        ],
    }


def ensure_role(secret_arn: str) -> str:
    trust = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Principal": {"Service": "lambda.amazonaws.com"},
                "Action": "sts:AssumeRole",
            }
        ],
    }

    try:
        iam.create_role(
            RoleName=ROLE_NAME,
            AssumeRolePolicyDocument=json.dumps(trust),
            # ASCII only: IAM rejects characters outside Latin-1.
            Description="DreamForge - accounts API execution role",
            Tags=[{"Key": "project", "Value": "dreamforge"}],
        )
        log(f"  + role {ROLE_NAME}")
        time.sleep(10)
    except ClientError as exc:
        if exc.response["Error"]["Code"] != "EntityAlreadyExists":
            raise
        log(f"  = role {ROLE_NAME}")

    iam.put_role_policy(
        RoleName=ROLE_NAME,
        PolicyName="dreamforge",
        PolicyDocument=json.dumps(backend_policy(secret_arn)),
    )
    log("    inline policy applied")
    return f"arn:aws:iam::{account_id}:role/{ROLE_NAME}"


# ── function ─────────────────────────────────────────────────────────────────


def environment(secret_arn: str) -> dict:
    origins = [SITE_ORIGIN] if SITE_ORIGIN else []
    origins += ["http://localhost:5173", "http://localhost:5174"]
    return {
        "Variables": {
            "NODE_ENV": "production",
            "USERS_TABLE": USERS_TABLE,
            "JWT_SECRET_ARN": secret_arn,
            "JWT_EXPIRES_IN": "2h",
            "BCRYPT_COST": "11",
            "ALLOWED_ORIGINS": ",".join(origins),
        }
    }


def ensure_function(role_arn: str, code: bytes, secret_arn: str) -> str:
    common = {
        "Role": role_arn,
        "Handler": "src/lambda.handler",
        # bcrypt at cost 11 is ~250ms of CPU, plus a cold-start secret fetch.
        "Timeout": 20,
        "MemorySize": 512,
        "Environment": environment(secret_arn),
    }

    try:
        response = _with_iam_propagation(
            lambda: lambda_client.create_function(
                FunctionName=FUNCTION_NAME,
                Runtime="nodejs20.x",
                Architectures=["arm64"],
                Code={"ZipFile": code},
                Description="DreamForge accounts API (signup, login, saved capsules)",
                Publish=False,
                Tags={"project": "dreamforge"},
                **common,
            )
        )
        log(f"  + function {FUNCTION_NAME}")
    except ClientError as exc:
        if exc.response["Error"]["Code"] != "ResourceConflictException":
            raise
        lambda_client.update_function_code(FunctionName=FUNCTION_NAME, ZipFile=code)
        _wait_until_updated()
        response = _with_iam_propagation(
            lambda: lambda_client.update_function_configuration(
                FunctionName=FUNCTION_NAME, **common
            )
        )
        log(f"  = function {FUNCTION_NAME} updated")

    _wait_until_updated()
    return response["FunctionArn"]


def ensure_function_url() -> str:
    """AuthType AWS_IAM, so the URL is never publicly invokable.

    A public URL (AuthType NONE) was the original plan and it returned 403 no
    matter how correct the resource policy was — this account is in an AWS
    Organization whose SCPs block anonymous lambda:InvokeFunctionUrl.

    So only CloudFront calls this URL, signing with SigV4 via Origin Access
    Control. Run infra/attach_api_to_cdn.py to wire that up. Browsers reach the
    API same-origin at https://<distribution>/api/*.

    Deliberately does NOT add an anonymous invoke permission — an earlier version
    did, and re-running this script silently undid the lockdown applied by
    attach_api_to_cdn.py.
    """
    cors = {
        "AllowOrigins": ["*"],
        "AllowMethods": ["GET", "POST", "PATCH", "PUT", "DELETE"],
        "AllowHeaders": ["content-type", "authorization", "x-auth-token"],
        "MaxAge": 86400,
        "AllowCredentials": False,
    }

    try:
        response = lambda_client.create_function_url_config(
            FunctionName=FUNCTION_NAME, AuthType="AWS_IAM", Cors=cors
        )
        log("  + function URL created (AWS_IAM — CloudFront only)")
    except ClientError as exc:
        if exc.response["Error"]["Code"] != "ResourceConflictException":
            raise
        response = lambda_client.update_function_url_config(
            FunctionName=FUNCTION_NAME, AuthType="AWS_IAM", Cors=cors
        )
        log("  = function URL updated (AWS_IAM — CloudFront only)")

    return response["FunctionUrl"]


def _with_iam_propagation(call, attempts: int = 8):
    """Lambda validates the role at create time and IAM is eventually consistent."""
    for attempt in range(1, attempts + 1):
        try:
            return call()
        except ClientError as exc:
            error = exc.response["Error"]
            transient = error["Code"] == "InvalidParameterValueException" and (
                "does not have permissions" in error.get("Message", "")
                or "cannot be assumed" in error.get("Message", "")
            )
            if not transient or attempt == attempts:
                raise
            log(f"    waiting for IAM to propagate ({attempt}/{attempts})")
            time.sleep(5)
    raise RuntimeError("unreachable")


def _wait_until_updated() -> None:
    for _ in range(30):
        state = lambda_client.get_function_configuration(FunctionName=FUNCTION_NAME)
        if state.get("LastUpdateStatus") != "InProgress":
            return
        time.sleep(2)


# ── main ─────────────────────────────────────────────────────────────────────


def main() -> int:
    log(f"account: {account_id}   region: {REGION}")
    log(f"table:   {USERS_TABLE}")
    log(f"origin:  {SITE_ORIGIN or '(localhost only)'}\n")

    log("secret")
    secret_arn = ensure_secret()

    log("\npackage")
    code = build_zip()

    log("\nexecution role")
    role_arn = ensure_role(secret_arn)

    log("\nfunction")
    ensure_function(role_arn, code, secret_arn)

    log("\nfunction URL")
    url = ensure_function_url()

    log("\n" + "=" * 70)
    log(f"API  {url}")
    log("=" * 70)
    log("\nSet VITE_API_BASE to that URL (no trailing slash), rebuild the site,")
    log("and sync it to the web bucket.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except ClientError as exc:
        error = exc.response.get("Error", {})
        log(f"\nFailed: {error.get('Code')} - {error.get('Message')}")
        sys.exit(1)
