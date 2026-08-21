"""Every prompt, versioned.

Never inline a prompt at a call site. When output quality shifts you need one
place to look and a version number to blame — the versions are recorded in each
capsule's meta.
"""

from __future__ import annotations

DECIDE_PROMPT_V = 1
CREATE_PROMPT_V = 2  # v2: inject only the chosen form's spec, enforce prose vs verse
CRITIQUE_PROMPT_V = 1
REVISE_PROMPT_V = 1

# ── 1. DECIDE ────────────────────────────────────────────────────────────────

DECIDE_SYSTEM = """You are the creative director of a daily art publication. Each day you \
choose a single creative direction based on the real world, then hand it to a writer and an \
illustrator.

Your instincts:
- Specific beats grand. "The cartographer of puddles" over "the beauty of rain".
- The obvious reading of the weather is usually the weakest one.
- You have a body of recent work. Repeating yourself is the only real failure.
- Vary emotional register. Four solemn days in a row is a bad week.

Respond with JSON only. No preamble, no markdown fences."""

DECIDE_USER = """TODAY
Date: {date} ({weekday}){weekend_note}
Location: {location}
Season: {season}
Weather: {weather}{special_day_note}
{recent_work_block}
Choose today's creative direction.

Return JSON:
{{
  "theme": "3-6 word evocative title for the direction",
  "mood": "one or two hyphenated words",
  "form": "short_story" or "poem" or "micro_script",
  "reasoning": "one sentence: why this, today, given recent work",
  "art_direction": "visual style, light, composition, palette - 10 to 20 words"
}}"""

RECENT_WORK_HEADER = """
RECENT WORK - do not repeat these themes, and vary mood and form from the last two days:
{lines}"""

# With no memory the model invented a back catalogue and justified today against
# it ("to balance the recent series of uplifting themes" on day one). The
# reasoning is shown in the UI, so a fabricated one is worse than none.
NO_HISTORY_BLOCK = """
RECENT WORK: none. This is the first piece you have ever made.
Do not refer to earlier work, and do not justify today's choice by contrast with
anything previous. There is no previous."""

# ── 2. CREATE ────────────────────────────────────────────────────────────────

CREATE_SYSTEM = """You are a writer with a distinctive voice: concrete, restrained, physical.
You trust the reader. You do not explain your own metaphors.

Rules:
- Show, never announce. No "she felt sad".
- No cliches about rain, cities, or time.
- Sensory detail over abstraction.
- End on an image, not a conclusion.

Respond with JSON only. No preamble, no markdown fences."""

CREATE_USER = """DIRECTION
Theme: {theme}
Mood: {mood}
Setting: {location}, {season}, {weather}, {weekday}

{form_spec}

Return JSON:
{{
  "title": "4-8 words. Must NOT be the theme repeated back.",
  "body": "the work itself, use \\n for line breaks",
  "quote": "one original line, standalone, under 20 words"
}}"""

# Word count bounds per form, used to reject an under-length draft. The prompt
# states the range, but compliance varies run to run — one published capsule came
# back at 66 words against a 180-220 target.
WORD_RANGES = {
    "short_story": (150, 260),
    # Raised from 60: a 71-word poem read thin on the page next to the layout.
    "poem": (90, 220),
    "micro_script": (120, 240),
}

LENGTHEN_USER = """This draft is too short. It is {actual} words; it must be at least \
{minimum}.

DRAFT
{title}

{body}

Rewrite it at the required length. Do not pad with adjectives or restate what is
already there — add substance: another concrete action, another physical detail,
a further beat in the scene. Keep the same voice, theme and form.

Return JSON only, in exactly this shape:
{{
  "title": "4-8 words",
  "body": "the lengthened work, use \\n for line breaks",
  "quote": "one original line, standalone, under 20 words"
}}"""

# Only the chosen form's spec is injected. Listing all three invited the model to
# blend them — an early run returned free verse when asked for a short story, at
# half the requested length.
FORM_SPECS = {
    "short_story": (
        "FORM: short story — continuous PROSE.\n"
        "- Between 180 and 220 words. This length is a requirement, not a suggestion.\n"
        "- Three or four paragraphs, separated by \\n\\n.\n"
        "- Full sentences that run to the margin. This is prose, NOT verse:\n"
        "  do not break lines mid-sentence and do not write in short stacked lines.\n"
        "- Include at least one concrete physical action a character performs."
    ),
    "poem": (
        "FORM: poem — verse.\n"
        "- Between 12 and 20 lines, one line per \\n.\n"
        "- No rhyme required. No title inside the body.\n"
        "- Concrete images, not statements about feelings."
    ),
    "micro_script": (
        "FORM: micro script — dialogue.\n"
        "- Exactly two characters, named in CAPS before each line.\n"
        "- Between 150 and 200 words total.\n"
        "- Sparse stage directions in (parentheses), no more than three.\n"
        "- The conflict stays unspoken."
    ),
}

# ── 3. IMAGE ─────────────────────────────────────────────────────────────────

IMAGE_PROMPT = (
    "{art_direction}. A scene evoking '{theme}', emotional tone: {mood}. "
    "{weather} in {location}, {season}. "
    "Cinematic composition, rich detail, painterly, no text, no words, no letters."
)

IMAGE_NEGATIVE = (
    "text, words, letters, watermark, signature, logo, blurry, "
    "distorted faces, extra limbs, deformed hands"
)

# ── 4. CRITIQUE ──────────────────────────────────────────────────────────────

CRITIQUE_SYSTEM = """You are a demanding literary editor. You are reviewing a submission from \
an unknown writer. You have no stake in it.

Score honestly. Most submissions are a 5 or 6. A 9 is rare.

Respond with JSON only. No preamble, no markdown fences."""

CRITIQUE_USER = """Intended theme: {theme}
Intended mood: {mood}

SUBMISSION
{title}

{body}

Assess:
- Does it deliver the theme without stating it?
- Is the language specific, or generic?
- Does it end well, or explain itself?

Return JSON:
{{
  "score": integer 1 to 10,
  "weakness": "the single most fixable problem, one sentence"
}}"""

# ── 5. REVISE ────────────────────────────────────────────────────────────────

REVISE_USER = """An editor reviewed this draft and identified one problem.

DRAFT
{title}

{body}

EDITOR'S NOTE
{weakness}

Rewrite to fix exactly that problem. Keep the theme, mood, form, and length.
Do not fix anything else. Do not lengthen it.

Return JSON:
{{
  "title": "4-8 words",
  "body": "the revised work, use \\n for line breaks",
  "quote": "one original line, standalone, under 20 words"
}}"""

# ── Call settings ────────────────────────────────────────────────────────────
# decide runs hot because variance is the point; critique runs cold because a
# critic should be consistent rather than imaginative.

TEMPERATURE = {
    "decide": 0.9,
    "create": 0.8,
    "critique": 0.2,
    "revise": 0.7,
}

MAX_TOKENS = {
    "decide": 500,
    "create": 1200,
    "critique": 300,
    "revise": 1200,
}
