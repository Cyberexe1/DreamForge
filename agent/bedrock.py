"""The only module that talks to Bedrock.

Text goes through the Converse API rather than invoke_model so every text call
has one uniform request/response shape — swapping the model is a config change,
not a rewrite. Images use invoke_model because Nova Canvas is not a Converse
model.
"""

from __future__ import annotations

import base64
import json
import random
import time
from typing import Any

import boto3
from botocore.config import Config as BotoConfig
from botocore.exceptions import ClientError

from config import CONFIG
from logging_util import warn

# One client at module scope, reused across warm invocations.
_client = boto3.client(
    "bedrock-runtime",
    region_name=CONFIG.region,
    config=BotoConfig(
        # The image call is the slow one; leave room under the 120s Lambda timeout.
        read_timeout=75,
        connect_timeout=10,
        retries={"max_attempts": 0},  # backoff is handled below, explicitly
    ),
)

_RETRYABLE = {"ThrottlingException", "ServiceUnavailableException", "ModelTimeoutException"}
_MAX_ATTEMPTS = 3


class BedrockUnavailable(RuntimeError):
    """Raised when a call cannot be completed after retries."""


def converse(
    *,
    system: str,
    user: str,
    temperature: float,
    max_tokens: int,
) -> str:
    """One text turn. Returns the model's text, or raises BedrockUnavailable.

    Deliberately stateless: each call is a fresh conversation. That is what makes
    the critique step an independent reviewer rather than the author defending
    its own work.
    """
    body: dict[str, Any] = {
        "modelId": CONFIG.text_model_id,
        "system": [{"text": system}],
        "messages": [{"role": "user", "content": [{"text": user}]}],
        "inferenceConfig": {
            "maxTokens": max_tokens,
            "temperature": temperature,
            "topP": 0.9,
        },
    }

    response = _with_backoff("converse", lambda: _client.converse(**body))
    content = response.get("output", {}).get("message", {}).get("content", [])
    for block in content:
        if "text" in block:
            return block["text"]
    raise BedrockUnavailable("Converse returned no text block")


def generate_image(*, prompt: str, negative: str) -> bytes | None:
    """Render a PNG, or return None.

    Returns None rather than raising because a missing image must never stop the
    day's capsule from publishing. Nova Canvas is currently the only
    text-to-image model available and it may not be enabled, so this path being
    unavailable is an expected state, not an exception.
    """
    payload = {
        "taskType": "TEXT_IMAGE",
        "textToImageParams": {
            "text": prompt[:1024],
            # Nova Canvas rejects an empty negativeText, so only send a real one.
            **({"negativeText": negative[:1024]} if len(negative) >= 3 else {}),
        },
        "imageGenerationConfig": {
            "numberOfImages": 1,
            "width": 1024,
            "height": 1024,
            "cfgScale": 7.5,
            "quality": "standard",
            "seed": random.randint(0, 858_993_459),
        },
    }

    try:
        response = _with_backoff(
            "image",
            lambda: _client.invoke_model(
                modelId=CONFIG.image_model_id,
                contentType="application/json",
                accept="application/json",
                body=json.dumps(payload),
            ),
        )
    except (BedrockUnavailable, ClientError) as exc:
        warn("create.image", outcome="unavailable", reason=type(exc).__name__, detail=str(exc)[:200])
        return None

    try:
        parsed = json.loads(response["body"].read())
        images = parsed.get("images") or []
        if not images:
            warn("create.image", outcome="empty", reason=parsed.get("error"))
            return None
        return base64.b64decode(images[0])
    except (KeyError, ValueError, TypeError) as exc:
        warn("create.image", outcome="unreadable", reason=type(exc).__name__)
        return None


def parse_json(text: str) -> dict[str, Any]:
    """Models wrap JSON in markdown fences despite being told not to."""
    cleaned = text.strip()

    if cleaned.startswith("```"):
        parts = cleaned.split("```")
        if len(parts) >= 2:
            cleaned = parts[1]
            if cleaned.lstrip().lower().startswith("json"):
                cleaned = cleaned.lstrip()[4:]
        cleaned = cleaned.strip()

    # Some models add a sentence before the object. Take the outermost braces.
    if not cleaned.startswith("{"):
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start != -1 and end > start:
            cleaned = cleaned[start : end + 1]

    parsed = json.loads(cleaned)
    if not isinstance(parsed, dict):
        raise ValueError("Expected a JSON object")
    return parsed


def _with_backoff(label: str, call):
    """Exponential backoff with jitter, for throttling only. Other errors fail fast."""
    last: Exception | None = None

    for attempt in range(1, _MAX_ATTEMPTS + 1):
        try:
            return call()
        except ClientError as exc:
            code = exc.response.get("Error", {}).get("Code", "")
            last = exc
            if code not in _RETRYABLE:
                raise
            if attempt == _MAX_ATTEMPTS:
                break
            delay = (2 ** (attempt - 1)) + random.uniform(0, 0.4)
            warn(label, retry=attempt, code=code, sleep_s=round(delay, 2))
            time.sleep(delay)

    raise BedrockUnavailable(f"{label} failed after {_MAX_ATTEMPTS} attempts: {last}")
