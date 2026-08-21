"""Structured logging.

One JSON line per step. These lines are a deliverable, not debug output — the
run log is the evidence that no human initiated the work, and it gets pasted
into the submission article verbatim. Don't quieten them.

Never log story text, base64 image data, or full prompts. Log lengths and ids.
"""

from __future__ import annotations

import json
import logging
import sys
import time
from typing import Any

logger = logging.getLogger("dreamforge")
logger.setLevel(logging.INFO)

# Lambda installs its own root handler. Locally there is none, so add one.
# Deliberately stdout, not the default stderr: CloudWatch captures both, but a
# local run piped through a shell shouldn't look like a stream of errors.
if not logging.getLogger().handlers and not logger.handlers:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(handler)
    logger.propagate = False


def log(step: str, **fields: Any) -> None:
    """Emit one structured line. Values must be small and non-secret."""
    payload = {"step": step, "ts": _now(), **fields}
    logger.info(json.dumps(payload, default=str, ensure_ascii=False))


def warn(step: str, **fields: Any) -> None:
    payload = {"step": step, "level": "warn", "ts": _now(), **fields}
    logger.warning(json.dumps(payload, default=str, ensure_ascii=False))


def error(step: str, **fields: Any) -> None:
    payload = {"step": step, "level": "error", "ts": _now(), **fields}
    logger.error(json.dumps(payload, default=str, ensure_ascii=False))


def _now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


class Timer:
    """Measures a step so every log line can carry elapsed_ms."""

    def __init__(self) -> None:
        self._start = time.perf_counter()

    def ms(self) -> int:
        return int((time.perf_counter() - self._start) * 1000)
