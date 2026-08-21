"""DreamForge agent — Lambda entrypoint.

Orchestrates the seven steps and logs. No Bedrock calls, no boto3 clients, no
business logic: those belong in the steps. If this file grows past ~80 lines of
logic, something has leaked into it.

    sense -> recall -> decide -> create -> critique -> revise -> publish
"""

from __future__ import annotations

import time
from typing import Any

import prompts
from config import CONFIG
from logging_util import Timer, log
from models import Capsule
from steps import create, critique, decide, publish, recall, sense

SCHEDULED = "eventbridge.schedule"


def lambda_handler(event: dict[str, Any] | None, _context: Any = None) -> dict[str, Any]:
    run = Timer()
    trigger = (event or {}).get("trigger", SCHEDULED)

    # The single most important line in the log: it records that nothing human
    # started this run. It goes straight into the submission article.
    log("trigger", source=trigger, human_input="none")

    context = _timed("sense", sense.sense, season=lambda c: c.season)
    memory = _timed("recall", lambda: recall.recall(), count=len)

    decision = _step("decide", lambda: decide.decide(context, memory))
    log(
        "decide",
        theme=decision.theme,
        mood=decision.mood,
        form=decision.form,
        fallback=decision.fallback,
    )

    work = _step("create.text", lambda: create.write_text(context, decision))
    log("create.text", title=work.title, words=len(work.body.split()))

    visual, image_prompt, visual_kind = _step(
        "create.visual", lambda: create.render_visual(context, decision, work)
    )
    log("create.visual", kind=visual_kind, bytes=len(visual) if visual else 0)

    assessment = _step("critique", lambda: critique.critique(work, decision))
    log("critique", score=assessment.score, skipped=assessment.skipped)

    revisions = 0
    if not assessment.skipped and assessment.score < CONFIG.critique_threshold:
        # Exactly one pass, then accept unconditionally. An unbounded
        # improve-until-good loop can burn the timeout and publish nothing, and
        # a 6/10 story on time beats a 9/10 that never ships.
        work = _step("revise", lambda: create.revise(work, assessment.weakness))
        revisions = 1
        log("revise", passes=1, accepted=True)

    image_key = (
        publish.put_visual(context.date, visual, visual_kind)
        if visual and visual_kind
        else None
    )

    capsule = Capsule(
        date=context.date,
        weekday=context.weekday,
        context=context.to_capsule_context(),
        theme=decision.theme,
        mood=decision.mood,
        form=decision.form,
        reasoning=decision.reasoning or None,
        title=work.title,
        story=work.body,
        quote=work.quote,
        image_key=image_key,
        # The art prompt only describes a diffusion image. Attaching it to a
        # typographic poster would misrepresent what was made.
        image_prompt=image_prompt if visual_kind == "diffusion" else None,
        meta={
            "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "trigger": trigger,
            "critique_score": None if assessment.skipped else assessment.score,
            "revisions": revisions,
            "duration_ms": run.ms(),
            # Recorded so the UI and the article can describe the visual
            # accurately rather than implying generated artwork.
            "image_kind": visual_kind,
            "models": {
                "text": CONFIG.text_model_id,
                "image": CONFIG.image_model_id if visual_kind == "diffusion" else None,
            },
            "prompt_versions": {
                "decide": prompts.DECIDE_PROMPT_V,
                "create": prompts.CREATE_PROMPT_V,
                "critique": prompts.CRITIQUE_PROMPT_V,
            },
        },
    )

    publish.publish(capsule)

    log(
        "complete",
        date=capsule.date,
        duration_ms=run.ms(),
        revisions=revisions,
        visual=visual_kind,
    )

    return {
        "ok": True,
        "date": capsule.date,
        "theme": capsule.theme,
        "visual": visual_kind,
        "duration_ms": run.ms(),
    }


def _step(name: str, fn):
    """Run a step, recording how long it took even when it fails."""
    timer = Timer()
    try:
        return fn()
    except Exception:
        log(name, outcome="failed", elapsed_ms=timer.ms())
        raise


def _timed(name: str, fn, **summaries):
    """Run a step that cannot fail, logging a short summary of the result."""
    timer = Timer()
    result = fn()
    log(name, elapsed_ms=timer.ms(), **{k: f(result) for k, f in summaries.items()})
    return result
