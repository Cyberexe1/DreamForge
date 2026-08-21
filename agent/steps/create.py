"""Step 4 — produce the work.

Two contracts, deliberately different:

  write_text()   MAY raise. There is nothing to publish without words, so a
                 failure here should fail the run and let EventBridge retry.
  render_image()  NEVER raises. Returns (None, prompt) and the capsule publishes
                 text-only with image_key: null.

The art prompt is built from the art_direction the model wrote during `decide`,
so the picture and the story descend from one creative intent rather than being
two separate interpretations of the weather.
"""

from __future__ import annotations

import poster
import prompts
from bedrock import converse, generate_image, parse_json
from logging_util import warn
from models import Decision, Work, WorldContext
from steps.sense import describe_weather


def write_text(context: WorldContext, decision: Decision) -> Work:
    """Write the piece. Raises on failure — this is the one unrecoverable step."""
    work = _parse_work(
        converse(
            system=prompts.CREATE_SYSTEM,
            user=prompts.CREATE_USER.format(
                theme=decision.theme,
                mood=decision.mood,
                location=context.location,
                season=context.season,
                weather=describe_weather(context),
                weekday=context.weekday,
                form_spec=prompts.FORM_SPECS.get(
                    decision.form, prompts.FORM_SPECS["short_story"]
                ),
            ),
            temperature=prompts.TEMPERATURE["create"],
            max_tokens=prompts.MAX_TOKENS["create"],
        ),
        fallback_title=decision.theme,
    )
    return _ensure_length(work, decision)


def _ensure_length(work: Work, decision: Decision) -> Work:
    """One retry if the draft came back far too short.

    Stating the range in the prompt is not enough — compliance varies run to run,
    and a published capsule came back at 66 words against a 180-220 target. One
    extra attempt, then accept whatever we have: a short piece on time still beats
    nothing, so this must not become a loop.
    """
    minimum, _ = prompts.WORD_RANGES.get(decision.form, prompts.WORD_RANGES["short_story"])
    words = len(work.body.split())
    if words >= minimum:
        return work

    warn("create.text", outcome="too_short", words=words, minimum=minimum)

    try:
        longer = _parse_work(
            converse(
                system=prompts.CREATE_SYSTEM,
                user=prompts.LENGTHEN_USER.format(
                    actual=words,
                    minimum=minimum,
                    title=work.title,
                    body=work.body,
                ),
                temperature=prompts.TEMPERATURE["create"],
                max_tokens=prompts.MAX_TOKENS["create"],
            ),
            fallback_title=work.title,
        )
    except Exception as exc:  # noqa: BLE001 - keep the shorter draft rather than fail
        warn("create.text", outcome="lengthen_failed", reason=type(exc).__name__)
        return work

    # Only take the retry if it actually helped.
    return longer if len(longer.body.split()) > words else work


def revise(work: Work, weakness: str) -> Work:
    """One rewrite pass addressing a single named weakness.

    Returns the original on failure: a revision that cannot be produced is not a
    reason to discard a publishable draft.
    """
    try:
        raw = converse(
            system=prompts.CREATE_SYSTEM,
            user=prompts.REVISE_USER.format(
                title=work.title,
                body=work.body,
                weakness=weakness,
            ),
            temperature=prompts.TEMPERATURE["revise"],
            max_tokens=prompts.MAX_TOKENS["revise"],
        )
        return _parse_work(raw, fallback_title=work.title)
    except Exception:  # noqa: BLE001 - documented degrade path
        return work


def render_visual(
    context: WorldContext, decision: Decision, work: Work
) -> tuple[bytes | None, str, str | None]:
    """Produce the capsule's visual. Never raises.

    Returns (data, prompt, kind) where kind is:
      "diffusion" — a real generated image from the image model
      "poster"    — an agent-composed typographic SVG
      None        — nothing could be produced; the capsule publishes text-only

    A diffusion image always wins when available. The poster exists because
    Nova Canvas is unobtainable on this account (see D-031), and it is labelled
    honestly rather than passed off as generated artwork.
    """
    prompt = prompts.IMAGE_PROMPT.format(
        art_direction=decision.art_direction,
        theme=decision.theme,
        mood=decision.mood,
        weather=describe_weather(context),
        location=context.location,
        season=context.season,
    )

    png = generate_image(prompt=prompt, negative=prompts.IMAGE_NEGATIVE)
    if png:
        return png, prompt, "diffusion"

    try:
        svg = poster.render(
            theme=decision.theme,
            title=work.title,
            quote=work.quote,
            date=context.date,
            weekday=context.weekday,
            season=context.season,
            location=context.location,
            mood=decision.mood,
        )
        return svg, prompt, "poster"
    except Exception as exc:  # noqa: BLE001 - a visual is never worth failing over
        warn("create.poster", outcome="failed", reason=type(exc).__name__)
        return None, prompt, None


def _parse_work(raw: str, *, fallback_title: str) -> Work:
    data = parse_json(raw)

    body = str(data.get("body", "")).strip()
    if not body:
        raise ValueError("model returned an empty body")

    title = str(data.get("title", "")).strip() or fallback_title
    quote = str(data.get("quote", "")).strip()

    if not quote:
        # The quote renders standalone in the UI, so derive one rather than
        # showing an empty pull-quote.
        quote = body.split("\n")[0].strip()[:120]

    return Work(title=title, body=body, quote=quote)
