"""Step 3 — choose today's creative direction.

The pivotal step, and the reason this is an agent rather than a generator. Theme,
mood, form and art direction are all chosen by the model, not selected from a
list. The reasoning is kept and shown in the UI, because a stated rationale is
the clearest evidence a decision actually happened.

May raise after one retry. Falls back to a safe season-derived direction rather
than failing the run — the agent publishes every day, even one where the model
returns nonsense.
"""

from __future__ import annotations

import prompts
from bedrock import BedrockUnavailable, converse, parse_json
from logging_util import warn
from models import Decision, Memory, WorldContext
from steps.sense import describe_weather

_VALID_FORMS = {"short_story", "poem", "micro_script"}


def decide(context: WorldContext, memory: Memory) -> Decision:
    """Pick the theme, mood, form and art direction for today."""
    user_prompt = prompts.DECIDE_USER.format(
        date=context.date,
        weekday=context.weekday,
        weekend_note=" — a weekend" if context.is_weekend else "",
        location=context.location,
        season=context.season,
        weather=describe_weather(context),
        special_day_note=f"\nNotable: {context.special_day}" if context.special_day else "",
        recent_work_block=_recent_work_block(memory),
    )

    for attempt in (1, 2):
        try:
            raw = converse(
                system=prompts.DECIDE_SYSTEM,
                user=user_prompt,
                temperature=prompts.TEMPERATURE["decide"],
                max_tokens=prompts.MAX_TOKENS["decide"],
            )
            return _parse_decision(raw)
        except (ValueError, KeyError, TypeError) as exc:
            warn("decide", attempt=attempt, outcome="unparseable", reason=type(exc).__name__)
        except BedrockUnavailable as exc:
            warn("decide", attempt=attempt, outcome="unavailable", reason=str(exc)[:160])

    warn("decide", outcome="fallback", note="model unusable, using season-derived direction")
    return _fallback(context)


def _recent_work_block(memory: Memory) -> str:
    """An empty archive is a valid state, but it must be stated explicitly.

    Leaving it out entirely caused the model to assume a back catalogue and
    justify today against it — on day one it claimed to be balancing "the recent
    series of uplifting themes" that had never existed.
    """
    if not memory.entries:
        return prompts.NO_HISTORY_BLOCK

    lines = "\n".join(
        f"  {e.get('date', '')}  \"{e.get('theme', '')}\""
        f"  mood: {e.get('mood', '')}  form: {e.get('form', '')}"
        for e in memory.entries
    )
    return prompts.RECENT_WORK_HEADER.format(lines=lines)


def _parse_decision(raw: str) -> Decision:
    data = parse_json(raw)

    theme = str(data["theme"]).strip()
    mood = str(data.get("mood", "unsettled")).strip() or "unsettled"
    form = str(data.get("form", "short_story")).strip().lower()
    reasoning = str(data.get("reasoning", "")).strip()
    art_direction = str(data.get("art_direction", "")).strip()

    if not theme:
        raise ValueError("empty theme")
    if form not in _VALID_FORMS:
        form = "short_story"
    if not art_direction:
        art_direction = "natural light, restrained palette, documentary framing"

    return Decision(
        theme=theme,
        mood=mood,
        form=form,
        reasoning=reasoning,
        art_direction=art_direction,
    )


def _fallback(context: WorldContext) -> Decision:
    """Only reached when the model is unusable. Logged loudly as a failure so a
    fallback day is never mistaken for a real decision."""
    return Decision(
        theme=f"{context.season} Interval",
        mood="observational",
        form="short_story",
        reasoning="",
        art_direction="natural light, restrained palette, documentary framing",
        fallback=True,
    )
