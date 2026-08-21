"""Step 2 — read the agent's memory.

Contract: never raises. A memory failure returns an empty Memory and the agent
proceeds without it. A possibly-repetitive capsule is worth vastly more than a
missing one.

Why this step exists at all: without memory the agent is a function of the
weather, and in Mumbai in August that means eleven consecutive rain poems. Memory
turns a repetitive input into a creative constraint.
"""

from __future__ import annotations

import boto3
from botocore.exceptions import ClientError

from config import CONFIG
from logging_util import warn
from models import Memory

_table = boto3.resource("dynamodb", region_name=CONFIG.region).Table(CONFIG.history_table)

CAPSULE_PK = "CAPSULE"


def recall(limit: int | None = None) -> Memory:
    """The most recent capsules, newest first. Never raises."""
    window = limit if limit is not None else CONFIG.memory_window_days

    try:
        response = _table.query(
            KeyConditionExpression=boto3.dynamodb.conditions.Key("pk").eq(CAPSULE_PK),
            # ISO dates sort lexicographically, so descending order is free.
            ScanIndexForward=False,
            Limit=window,
            ProjectionExpression="sk, theme, mood, #f, title",
            ExpressionAttributeNames={"#f": "form"},
        )
    except ClientError as exc:
        warn("recall", memory="unavailable", reason=exc.response.get("Error", {}).get("Code"))
        return Memory()
    except Exception as exc:  # noqa: BLE001 - documented degrade path
        warn("recall", memory="unavailable", reason=type(exc).__name__)
        return Memory()

    entries = [
        {
            "date": item.get("sk", ""),
            "theme": item.get("theme", ""),
            "mood": item.get("mood", ""),
            "form": item.get("form", ""),
            "title": item.get("title", ""),
        }
        for item in response.get("Items", [])
    ]

    return Memory(entries=entries)


def all_capsules(limit: int = 60) -> list[dict[str, str]]:
    """Everything needed to rebuild the public archive index.

    The agent has no s3:GetObject, so index.json cannot be read and appended to.
    It is rebuilt from DynamoDB instead — which also means the index can never
    drift from the source of truth.
    """
    try:
        response = _table.query(
            KeyConditionExpression=boto3.dynamodb.conditions.Key("pk").eq(CAPSULE_PK),
            ScanIndexForward=False,
            Limit=limit,
            ProjectionExpression="sk, title, theme, image_key",
        )
    except Exception as exc:  # noqa: BLE001 - index is decorative, never fatal
        warn("publish.index", outcome="query_failed", reason=type(exc).__name__)
        return []

    return [
        {
            "date": item.get("sk", ""),
            "title": item.get("title", ""),
            "theme": item.get("theme", ""),
            "image_key": item.get("image_key") or None,
        }
        for item in response.get("Items", [])
        if item.get("sk")
    ]
