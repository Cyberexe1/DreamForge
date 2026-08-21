"""Deploy the agent Lambda, its execution role, its DLQ, and the EventBridge
schedule that makes the whole thing autonomous.

Uses boto3 directly rather than `sam deploy`. Two reasons: the SAM CLI is not
installed on this machine, and neither available identity has
cloudformation:CreateStack. infra/template.yaml describes the same resources for
anyone who does have both — this script is the executable equivalent.

Idempotent: existing resources are updated in place, never recreated.

    cd infra
    $env:AWS_PROFILE = "dreamforge"
    python deploy_agent.py                      # deploy, keep current schedule
    python deploy_agent.py --schedule-in 5      # fire 5 minutes from now, to prove it
    python deploy_agent.py --schedule-daily     # back to 08:00 Asia/Kolkata
"""

from __future__ import annotations

import io
import json
import os
import sys
import time
import zipfile
from datetime import datetime, timedelta, timezone

import boto3
from botocore.exceptions import ClientError

REGION = "us-east-1"
AGENT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "agent")

FUNCTION_NAME = "dreamforge-agent"
ROLE_NAME = "dreamforge-agent-execution"
SCHEDULER_ROLE_NAME = "dreamforge-scheduler-invoke"
SCHEDULE_NAME = "dreamforge-daily"
DLQ_NAME = "dreamforge-agent-dlq"

ARTIFACTS_BUCKET = os.environ.get("ARTIFACTS_BUCKET", "")
HISTORY_TABLE = os.environ.get("HISTORY_TABLE", "dreamforge-history")
DISTRIBUTION_ID = os.environ.get("DISTRIBUTION_ID", "")

DAILY_CRON = "cron(0 8 * * ? *)"
TIMEZONE = "Asia/Kolkata"

session = boto3.Session(region_name=REGION)
iam = session.client("iam")
lambda_client = session.client("lambda")
scheduler = session.client("scheduler")
sqs = session.client("sqs")
logs = session.client("logs")
account_id = session.client("sts").get_caller_identity()["Account"]


def log(message: str) -> None:
    print(message, flush=True)


# ── packaging ────────────────────────────────────────────────────────────────


def build_zip() -> bytes:
    """Zip the agent source.

    No dependency install step: boto3 comes from the Lambda runtime and the
    weather call uses urllib, so the package is pure source files.
    """
    skip_dirs = {"__pycache__", "scripts", "tests", "preview"}
    buffer = io.BytesIO()

    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for root, dirs, files in os.walk(AGENT_DIR):
            dirs[:] = [d for d in dirs if d not in skip_dirs]
            for filename in files:
                if not filename.endswith(".py"):
                    continue
                full = os.path.join(root, filename)
                archive.write(full, os.path.relpath(full, AGENT_DIR))

    data = buffer.getvalue()
    log(f"  package: {len(data) / 1024:.1f} KB, no dependencies")
    return data


# ── IAM ──────────────────────────────────────────────────────────────────────


def ensure_role(name: str, service: str, inline: dict, *, source_account: bool = False) -> str:
    trust_statement: dict = {
        "Effect": "Allow",
        "Principal": {"Service": service},
        "Action": "sts:AssumeRole",
    }
    if source_account:
        # Guards against the confused-deputy problem.
        trust_statement["Condition"] = {"StringEquals": {"aws:SourceAccount": account_id}}

    trust = {"Version": "2012-10-17", "Statement": [trust_statement]}

    try:
        iam.create_role(
            RoleName=name,
            AssumeRolePolicyDocument=json.dumps(trust),
            # ASCII only: IAM rejects characters outside Latin-1, so no em dash.
            Description=f"DreamForge - assumed by {service}",
            Tags=[{"Key": "project", "Value": "dreamforge"}],
        )
        log(f"  + role {name}")
        # IAM is eventually consistent; Lambda rejects a role it cannot see yet.
        time.sleep(10)
    except ClientError as exc:
        if exc.response["Error"]["Code"] != "EntityAlreadyExists":
            raise
        iam.update_assume_role_policy(RoleName=name, PolicyDocument=json.dumps(trust))
        log(f"  = role {name}")

    iam.put_role_policy(
        RoleName=name,
        PolicyName="dreamforge",
        PolicyDocument=json.dumps(inline),
    )
    log(f"    inline policy applied")
    return f"arn:aws:iam::{account_id}:role/{name}"


def agent_policy(dlq_arn: str) -> dict:
    """Least privilege for the agent.

    Deliberately absent: s3:DeleteObject and s3:GetObject. The agent only ever
    writes new objects, so no bug can destroy or read back the archive — and that
    archive is the submission's evidence.
    """
    # A "us." inference profile is CROSS-REGION: it may route the call to any US
    # region in the profile, and authorisation is evaluated against the
    # foundation-model ARN in whichever region actually serves it. Listing only
    # us-east-1 produced an AccessDenied naming us-west-2 — a failure that cannot
    # reproduce locally, because a developer's own user usually has broad Bedrock
    # access.
    profile_regions = ["us-east-1", "us-east-2", "us-west-2"]
    model_arns = [
        f"arn:aws:bedrock:{REGION}:{account_id}:inference-profile/us.amazon.nova-lite-v1:0"
    ]
    for region in profile_regions:
        model_arns += [
            f"arn:aws:bedrock:{region}::foundation-model/amazon.nova-lite-v1:0",
            f"arn:aws:bedrock:{region}::foundation-model/amazon.nova-pro-v1:0",
        ]
    # Canvas is not a cross-region profile; it is invoked directly.
    model_arns.append(f"arn:aws:bedrock:{REGION}::foundation-model/amazon.nova-canvas-v1:0")

    statements = [
        {
            "Sid": "InvokeNamedModelsOnly",
            "Effect": "Allow",
            "Action": "bedrock:InvokeModel",
            "Resource": model_arns,
        },
        {
            "Sid": "WriteCapsulesAndVisuals",
            "Effect": "Allow",
            "Action": "s3:PutObject",
            "Resource": f"arn:aws:s3:::{ARTIFACTS_BUCKET}/*",
        },
        {
            "Sid": "AgentMemory",
            "Effect": "Allow",
            "Action": ["dynamodb:PutItem", "dynamodb:Query"],
            "Resource": f"arn:aws:dynamodb:{REGION}:{account_id}:table/{HISTORY_TABLE}",
        },
        {
            "Sid": "Logs",
            "Effect": "Allow",
            "Action": ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
            "Resource": f"arn:aws:logs:{REGION}:{account_id}:log-group:/aws/lambda/{FUNCTION_NAME}*",
        },
        {
            "Sid": "DeadLetter",
            "Effect": "Allow",
            "Action": "sqs:SendMessage",
            "Resource": dlq_arn,
        },
    ]

    if DISTRIBUTION_ID:
        statements.append(
            {
                "Sid": "PublishFreshCapsuleImmediately",
                "Effect": "Allow",
                "Action": "cloudfront:CreateInvalidation",
                "Resource": f"arn:aws:cloudfront::{account_id}:distribution/{DISTRIBUTION_ID}",
            }
        )

    return {"Version": "2012-10-17", "Statement": statements}


def scheduler_policy(function_arn: str) -> dict:
    """One action. This role exists to start the agent and nothing else."""
    return {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Action": "lambda:InvokeFunction",
                "Resource": [function_arn, f"{function_arn}:*"],
            }
        ],
    }


# ── resources ────────────────────────────────────────────────────────────────


def ensure_dlq() -> str:
    """A failed run must be visible, not silent."""
    try:
        url = sqs.create_queue(
            QueueName=DLQ_NAME,
            Attributes={"MessageRetentionPeriod": "1209600"},  # 14 days
            tags={"project": "dreamforge"},
        )["QueueUrl"]
        log(f"  + queue {DLQ_NAME}")
    except ClientError as exc:
        if exc.response["Error"]["Code"] not in (
            "QueueAlreadyExists",
            "AWS.SimpleQueueService.QueueNameExists",
        ):
            raise
        url = sqs.get_queue_url(QueueName=DLQ_NAME)["QueueUrl"]
        log(f"  = queue {DLQ_NAME}")

    return sqs.get_queue_attributes(QueueUrl=url, AttributeNames=["QueueArn"])[
        "Attributes"
    ]["QueueArn"]


def environment() -> dict:
    return {
        "Variables": {
            "ARTIFACTS_BUCKET": ARTIFACTS_BUCKET,
            "HISTORY_TABLE": HISTORY_TABLE,
            "DISTRIBUTION_ID": DISTRIBUTION_ID,
            "TEXT_MODEL_ID": "us.amazon.nova-lite-v1:0",
            "IMAGE_MODEL_ID": "amazon.nova-canvas-v1:0",
            "CITY": "Mumbai, India",
            "LATITUDE": "19.0760",
            "LONGITUDE": "72.8777",
            "TIMEZONE": TIMEZONE,
            "MEMORY_WINDOW_DAYS": "7",
            "CRITIQUE_THRESHOLD": "7",
        }
    }


def ensure_function(role_arn: str, code: bytes, dlq_arn: str) -> str:
    common = {
        "Role": role_arn,
        "Handler": "handler.lambda_handler",
        "Timeout": 120,
        # Memory is CPU on Lambda, not just RAM.
        "MemorySize": 1024,
        "Environment": environment(),
        "DeadLetterConfig": {"TargetArn": dlq_arn},
    }

    def create():
        return lambda_client.create_function(
            FunctionName=FUNCTION_NAME,
            Runtime="python3.12",
            Architectures=["arm64"],
            Code={"ZipFile": code},
            Description="Decides, writes, illustrates and publishes one capsule per day",
            Publish=False,
            Tags={"project": "dreamforge"},
            **common,
        )

    try:
        response = _with_iam_propagation(create)
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

    try:
        logs.put_retention_policy(
            logGroupName=f"/aws/lambda/{FUNCTION_NAME}",
            # The run log is submission evidence. Keep it past judging.
            retentionInDays=30,
        )
    except ClientError:
        # Log group appears on first invoke; harmless if not there yet.
        pass

    return response["FunctionArn"]


def _with_iam_propagation(call, attempts: int = 8):
    """Retry through IAM eventual consistency.

    Lambda validates the execution role's permissions at create time, and a role
    policy written seconds earlier is not always visible yet. The error says
    "does not have permissions", which reads like a policy bug rather than a
    timing one — so retrying is correct, not a workaround.
    """
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


def ensure_schedule(function_arn: str, role_arn: str, expression: str, dlq_arn: str) -> None:
    """The autonomy gate. This is the only thing that starts a run."""
    target = {
        "Arn": function_arn,
        "RoleArn": role_arn,
        # Recorded on the capsule as meta.trigger, so the archive proves which
        # runs were scheduled and which were invoked by hand.
        "Input": json.dumps({"trigger": "eventbridge.schedule"}),
        "RetryPolicy": {
            # Bedrock throttles occasionally; a retry is cheaper than a missed day.
            "MaximumRetryAttempts": 2,
            "MaximumEventAgeInSeconds": 3600,
        },
        "DeadLetterConfig": {"Arn": dlq_arn},
    }
    common = {
        "ScheduleExpression": expression,
        "ScheduleExpressionTimezone": TIMEZONE,
        "FlexibleTimeWindow": {"Mode": "OFF"},
        "State": "ENABLED",
        "Target": target,
        "Description": "Invokes the creative agent every morning. No human involved.",
    }

    try:
        scheduler.create_schedule(Name=SCHEDULE_NAME, **common)
        log(f"  + schedule {SCHEDULE_NAME}  {expression} {TIMEZONE}")
    except ClientError as exc:
        if exc.response["Error"]["Code"] != "ConflictException":
            raise
        scheduler.update_schedule(Name=SCHEDULE_NAME, **common)
        log(f"  = schedule {SCHEDULE_NAME}  {expression} {TIMEZONE}")


def near_future_cron(minutes: int) -> str:
    """A one-off cron a few minutes ahead, to prove the trigger fires without
    waiting until tomorrow morning."""
    target = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30 + minutes)
    return f"cron({target.minute} {target.hour} {target.day} {target.month} ? {target.year})"


# ── main ─────────────────────────────────────────────────────────────────────


def main() -> int:
    if not ARTIFACTS_BUCKET:
        log("ARTIFACTS_BUCKET is not set.")
        return 2

    log(f"account: {account_id}   region: {REGION}")
    log(f"bucket:  {ARTIFACTS_BUCKET}\n")

    log("package")
    code = build_zip()

    log("\ndead letter queue")
    dlq_arn = ensure_dlq()

    log("\nexecution role")
    role_arn = ensure_role(ROLE_NAME, "lambda.amazonaws.com", agent_policy(dlq_arn))

    log("\nfunction")
    function_arn = ensure_function(role_arn, code, dlq_arn)

    log("\nscheduler role")
    scheduler_role_arn = ensure_role(
        SCHEDULER_ROLE_NAME,
        "scheduler.amazonaws.com",
        scheduler_policy(function_arn),
        source_account=True,
    )

    if "--schedule-in" in sys.argv:
        minutes = int(sys.argv[sys.argv.index("--schedule-in") + 1])
        expression = near_future_cron(minutes)
        log(f"\nschedule (TEST — fires once, ~{minutes} min from now)")
    else:
        expression = DAILY_CRON
        log("\nschedule (daily)")

    ensure_schedule(function_arn, scheduler_role_arn, expression, dlq_arn)

    details = scheduler.get_schedule(Name=SCHEDULE_NAME)
    log("\n" + "=" * 66)
    log(f"function   {FUNCTION_NAME}")
    log(f"schedule   {details['ScheduleExpression']}  {details['ScheduleExpressionTimezone']}")
    log(f"state      {details['State']}")
    log(f"dlq        {DLQ_NAME}")
    log("=" * 66)
    log("\nLogs:  aws logs tail /aws/lambda/dreamforge-agent --follow")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except ClientError as exc:
        error = exc.response.get("Error", {})
        log(f"\nFailed: {error.get('Code')} — {error.get('Message')}")
        sys.exit(1)
