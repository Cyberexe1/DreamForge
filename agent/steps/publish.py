"""Step 7 — ship it and remember it.

Order matters and must not be reordered: the PNG lands before the JSON that
references it, so a run that dies mid-publish can never leave the site rendering
a capsule that points at a missing image.

Dated capsules are write-once; only latest.json and index.json are overwritten.
That makes the archive append-only, so a bad run can corrupt at most today.

The date is the key. Re-running the same day overwrites that day rather than
creating a duplicate, which makes the whole step idempotent — safe when
EventBridge retries after a timeout that actually succeeded.
"""

from __future__ import annotations

import json
import uuid

import boto3
from botocore.exceptions import ClientError

from config import CONFIG
from logging_util import log, warn
from models import Capsule
from steps.recall import CAPSULE_PK, all_capsules

_s3 = boto3.client("s3", region_name=CONFIG.region)
_table = boto3.resource("dynamodb", region_name=CONFIG.region).Table(CONFIG.history_table)
_cloudfront = boto3.client("cloudfront", region_name=CONFIG.region)

_IMMUTABLE = "public, max-age=31536000, immutable"
_SHORT = "public, max-age=300"


_VISUAL_TYPES = {
    "diffusion": ("png", "image/png"),
    "poster": ("svg", "image/svg+xml"),
}


def put_visual(date: str, data: bytes, kind: str) -> str:
    """Upload the visual before any JSON that references it. Returns its key."""
    extension, content_type = _VISUAL_TYPES[kind]
    key = f"{CONFIG.image_prefix}/{date}.{extension}"

    _s3.put_object(
        Bucket=CONFIG.artifacts_bucket,
        Key=key,
        Body=data,
        ContentType=content_type,
        CacheControl=_IMMUTABLE,
    )
    log("publish.visual", key=key, kind=kind, bytes=len(data))
    return key


def publish(capsule: Capsule) -> None:
    """Write the capsule everywhere it belongs, then invalidate the CDN."""
    body = json.dumps(capsule.to_json_dict(), ensure_ascii=False, indent=2).encode("utf-8")

    # 1. Immutable per-day record. Write-once, so history is append-only.
    _put_json(f"{CONFIG.data_prefix}/{capsule.date}.json", body, _IMMUTABLE)

    # 2. What the homepage reads.
    _put_json(f"{CONFIG.data_prefix}/latest.json", body, _SHORT)

    # 3. Memory, before the index so the index can see today.
    _remember(capsule)

    # 4. Archive listing, rebuilt from DynamoDB.
    _put_index()

    # 5. Make it visible now rather than up to five minutes late.
    _invalidate()


def _put_json(key: str, body: bytes, cache_control: str) -> None:
    _s3.put_object(
        Bucket=CONFIG.artifacts_bucket,
        Key=key,
        Body=body,
        ContentType="application/json",
        CacheControl=cache_control,
    )
    log("publish.json", key=key, bytes=len(body))


def _remember(capsule: Capsule) -> None:
    """Record the capsule. This becomes tomorrow's memory, which is what stops
    the agent repeating today's theme."""
    _table.put_item(
        Item={
            "pk": CAPSULE_PK,
            "sk": capsule.date,
            "theme": capsule.theme,
            "mood": capsule.mood,
            "form": capsule.form,
            "title": capsule.title,
            "image_key": capsule.image_key or "",
            "trigger": capsule.meta.get("trigger", ""),
            "critique_score": capsule.meta.get("critique_score"),
            "revisions": capsule.meta.get("revisions", 0),
            "duration_ms": capsule.meta.get("duration_ms", 0),
            "generated_at": capsule.meta.get("generated_at", ""),
        }
    )
    log("publish.memory", table=CONFIG.history_table, date=capsule.date)


def _put_index() -> None:
    """Rebuilt from DynamoDB rather than read-modify-write on S3, because the
    agent has no s3:GetObject by design. Side benefit: the index can never drift
    from the source of truth."""
    entries = all_capsules()
    if not entries:
        warn("publish.index", outcome="empty")
        return

    body = json.dumps(entries, ensure_ascii=False).encode("utf-8")
    _put_json(f"{CONFIG.data_prefix}/index.json", body, _SHORT)


def _invalidate() -> None:
    """Best effort. A stale CDN for five minutes is not worth failing a run over."""
    if not CONFIG.distribution_id:
        log("publish.invalidate", outcome="skipped", reason="no distribution configured")
        return

    try:
        response = _cloudfront.create_invalidation(
            DistributionId=CONFIG.distribution_id,
            InvalidationBatch={
                "Paths": {"Quantity": 1, "Items": [f"/{CONFIG.data_prefix}/*"]},
                # Must be unique per request; CloudFront treats a repeat as a
                # duplicate and returns the earlier invalidation.
                "CallerReference": f"dreamforge-{uuid.uuid4()}",
            },
        )
        log("publish.invalidate", invalidation=response["Invalidation"]["Id"])
    except ClientError as exc:
        warn("publish.invalidate", outcome="failed", reason=exc.response.get("Error", {}).get("Code"))
    except Exception as exc:  # noqa: BLE001 - never fatal
        warn("publish.invalidate", outcome="failed", reason=type(exc).__name__)
