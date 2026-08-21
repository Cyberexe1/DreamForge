"""Step 5 — independent self-evaluation.

This is a fresh Converse call with no shared history, given only the theme and
the story with no hint that the same model wrote them. That isolation is the
whole point: a model asked "is your work good?" says yes, while a model asked to
score a stranger's story is usefully critical. Same weights, different framing.

Contract: never raises. If the critic itself fails, the work passes at the
threshold — a critic outage must not block publishing.
"""

from __future__ import annotations

import prompts
from bedrock import converse, parse_json
from config import CONFIG
from logging_util import warn
from models import Critique, Decision, Work


def critique(work: Work, decision: Decision) -> Critique:
    """Score the work out of 10 and name one fixable weakness."""
    try:
        raw = converse(
            system=prompts.CRITIQUE_SYSTEM,
            user=prompts.CRITIQUE_USER.format(
                theme=decision.theme,
                mood=decision.mood,
                title=work.title,
                body=work.body,
            ),
            temperature=prompts.TEMPERATURE["critique"],
            max_tokens=prompts.MAX_TOKENS["critique"],
        )
        data = parse_json(raw)

        score = int(data["score"])
        if not 1 <= score <= 10:
            raise ValueError(f"score out of range: {score}")

        weakness = str(data.get("weakness", "")).strip()
        return Critique(score=score, weakness=weakness)

    except Exception as exc:  # noqa: BLE001 - documented degrade path
        warn("critique", outcome="skipped", reason=type(exc).__name__)
        # Pass at the threshold so no revision is attempted on an unscored draft.
        return Critique(score=CONFIG.critique_threshold, weakness="", skipped=True)
