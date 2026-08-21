"""Run the agent locally against real AWS.

There is no emulator here — Bedrock has no local mode, so faking the rest buys
nothing. Instead this writes under a `dev/` key prefix so experiments never touch
the real archive, and tags the capsule `local.dev` so it can never be mistaken
for a scheduled run.

    cd agent
    $env:AWS_PROFILE = "dreamforge"
    $env:ARTIFACTS_BUCKET = "dreamforge-artifacts-<account>"
    python local_run.py

Add --no-publish to exercise the whole creative loop without writing anything.
"""

from __future__ import annotations

import json
import os
import sys

os.environ.setdefault("KEY_PREFIX", "dev/")
os.environ.setdefault("AWS_REGION", "us-east-1")

DRY_RUN = "--no-publish" in sys.argv


def main() -> int:
    if DRY_RUN:
        _patch_publish_to_noop()
    elif not os.environ.get("ARTIFACTS_BUCKET"):
        print("ARTIFACTS_BUCKET is not set. Either set it, or pass --no-publish.")
        return 2

    from handler import lambda_handler  # imported late so env vars are in place

    result = lambda_handler({"trigger": "local.dev"})
    print("\n" + json.dumps(result, indent=2))
    return 0


def _patch_publish_to_noop() -> None:
    """Let the full loop run — including Bedrock — while writing nothing."""
    os.environ.setdefault("ARTIFACTS_BUCKET", "dry-run-no-bucket")

    from models import Capsule
    from steps import publish

    def fake_publish(capsule: Capsule) -> None:
        print("\n" + "=" * 62)
        print(f"{capsule.date}  {capsule.weekday}")
        print(f"theme:  {capsule.theme}   mood: {capsule.mood}   form: {capsule.form}")
        if capsule.reasoning:
            print(f"why:    {capsule.reasoning}")
        print("=" * 62)
        print(f"\n{capsule.title}\n")
        print(capsule.story)
        print(f"\n  \u201c{capsule.quote}\u201d")
        print("\n" + "-" * 62)
        print(f"score {capsule.meta['critique_score']}  "
              f"revisions {capsule.meta['revisions']}  "
              f"visual {capsule.meta.get('image_kind')}")
        print("(dry run — nothing was written)")

    def fake_put_visual(date: str, data: bytes, kind: str) -> str:
        """Write the visual to disk so a dry run is still inspectable."""
        extension = "svg" if kind == "poster" else "png"
        path = f"dryrun-{date}.{extension}"
        with open(path, "wb") as handle:
            handle.write(data)
        print(f"\nvisual written to {path} ({len(data)} bytes) — open it to check")
        return f"dry-run/{date}.{extension}"

    publish.publish = fake_publish  # type: ignore[assignment]
    publish.put_visual = fake_put_visual  # type: ignore[assignment]


if __name__ == "__main__":
    raise SystemExit(main())
