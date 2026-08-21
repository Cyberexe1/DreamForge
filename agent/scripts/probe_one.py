"""Probe exactly one model, in its own process.

Replaces an in-process loop that reloaded modules between candidates — that
approach silently reported one model's result under another's name, because the
Bedrock client is built at module scope from config read at import time. A fresh
process per model is the only way to be certain which model answered.

    python scripts/probe_one.py us.amazon.nova-lite-v1:0
"""

from __future__ import annotations

import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

SYSTEM = (
    "You are a writer with a distinctive voice: concrete, restrained, physical. "
    "Respond with JSON only. No preamble, no markdown fences."
)

USER = """DIRECTION
Theme: The Cartographer of Puddles
Mood: playful-melancholy
Setting: Mumbai India, Monsoon, Moderate rain 27C, Friday

FORM: short story - continuous PROSE.
- Between 180 and 220 words. This length is a requirement, not a suggestion.
- Three or four paragraphs, separated by \\n\\n.
- Full sentences that run to the margin. This is prose, NOT verse:
  do not break lines mid-sentence and do not write in short stacked lines.
- Include at least one concrete physical action a character performs.

Return JSON:
{
  "title": "4-8 words",
  "body": "the work itself, use \\n for line breaks",
  "quote": "one original line, standalone, under 20 words"
}"""


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: probe_one.py <model-id>")
        return 2

    model_id = sys.argv[1]
    os.environ["TEXT_MODEL_ID"] = model_id

    from bedrock import converse, parse_json  # noqa: PLC0415
    from config import CONFIG  # noqa: PLC0415

    # Prove which model is actually being called.
    assert CONFIG.text_model_id == model_id, f"config says {CONFIG.text_model_id}"

    started = time.perf_counter()
    try:
        raw = converse(system=SYSTEM, user=USER, temperature=0.8, max_tokens=1200)
    except Exception as exc:  # noqa: BLE001 - probing, every failure is data
        detail = str(exc)
        print(
            json.dumps(
                {
                    "model": model_id,
                    "access": "LEGACY-DENIED" if "Legacy" in detail else "ERROR",
                    "detail": detail[:110],
                }
            )
        )
        return 1

    elapsed = int((time.perf_counter() - started) * 1000)

    try:
        body = str(parse_json(raw).get("body", ""))
    except Exception:  # noqa: BLE001
        print(json.dumps({"model": model_id, "access": "OK", "json": "UNPARSEABLE"}))
        return 1

    words = len(body.split())
    lines = [ln for ln in body.split("\n") if ln.strip()]
    avg = words / max(len(lines), 1)

    print(
        json.dumps(
            {
                "model": model_id,
                "access": "OK",
                "ms": elapsed,
                "words": words,
                "in_range": 180 <= words <= 220,
                "prose": avg >= 12,
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
