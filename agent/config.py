"""Configuration, read from the environment once at import time.

Reading here rather than inside steps means a misconfigured deployment fails at
cold start with a clear message, instead of halfway through a run at 08:00.
"""

from __future__ import annotations

import os
from dataclasses import dataclass


def _env(name: str, default: str) -> str:
    return os.environ.get(name, default).strip()


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, str(default)))
    except ValueError:
        return default


def _float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, str(default)))
    except ValueError:
        return default


@dataclass(frozen=True)
class Config:
    region: str
    artifacts_bucket: str
    history_table: str
    distribution_id: str

    text_model_id: str
    image_model_id: str

    city: str
    latitude: float
    longitude: float
    timezone: str

    memory_window_days: int
    critique_threshold: int

    # Prefix for S3 keys. local_run overrides this so experiments never touch
    # the real archive.
    key_prefix: str

    @property
    def data_prefix(self) -> str:
        return f"{self.key_prefix}data" if self.key_prefix else "data"

    @property
    def image_prefix(self) -> str:
        return f"{self.key_prefix}images" if self.key_prefix else "images"


CONFIG = Config(
    region=_env("AWS_REGION", "us-east-1"),
    artifacts_bucket=_env("ARTIFACTS_BUCKET", ""),
    history_table=_env("HISTORY_TABLE", "dreamforge-history"),
    distribution_id=_env("DISTRIBUTION_ID", ""),
    # Chosen by measurement, not reputation — see scripts/probe_models.py.
    # Nova Lite hit the 180-220 word target (196) while the larger Nova Pro
    # undershot it (152). Alternatives that also passed, one env var away:
    # global.amazon.nova-2-lite-v1:0, qwen.qwen3-32b-v1:0, deepseek.v3.2
    text_model_id=_env("TEXT_MODEL_ID", "us.amazon.nova-lite-v1:0"),
    image_model_id=_env("IMAGE_MODEL_ID", "amazon.nova-canvas-v1:0"),
    city=_env("CITY", "Mumbai, India"),
    latitude=_float("LATITUDE", 19.0760),
    longitude=_float("LONGITUDE", 72.8777),
    timezone=_env("TIMEZONE", "Asia/Kolkata"),
    memory_window_days=_int("MEMORY_WINDOW_DAYS", 7),
    critique_threshold=_int("CRITIQUE_THRESHOLD", 7),
    key_prefix=_env("KEY_PREFIX", ""),
)
