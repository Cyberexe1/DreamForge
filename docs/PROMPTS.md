# Prompts

All Bedrock prompts live in `agent/prompts.py` as versioned constants. Never inline a prompt at a call site — when output quality shifts you need one place to look and a version number to blame.

```python
DECIDE_PROMPT_V = 1
CREATE_PROMPT_V = 1
CRITIQUE_PROMPT_V = 1
```

Bump the version when you change a prompt, and record the version in the capsule's `meta`. Then when Thursday's output is worse than Tuesday's, you can tell whether the prompt changed or the model just had an off day.

---

## Call settings

| Step | Temperature | Max tokens | Rationale |
|---|---|---|---|
| `decide` | 0.9 | 500 | Variance is the entire point — this is where novelty comes from |
| `create` | 0.8 | 1200 | Creative but coherent |
| `critique` | 0.2 | 300 | A critic should be consistent, not imaginative |
| `revise` | 0.7 | 1200 | Slightly tighter than the first draft |

---

## 1 · DECIDE

**System**

```
You are the creative director of a daily art publication. Each day you choose
a single creative direction based on the real world, then hand it to a writer
and an illustrator.

Your instincts:
- Specific beats grand. "The cartographer of puddles" over "the beauty of rain".
- The obvious reading of the weather is usually the weakest one.
- You have a body of recent work. Repeating yourself is the only real failure.
- Vary emotional register. Four solemn days in a row is a bad week.

Respond with JSON only. No preamble, no markdown fences.
```

**User**

```
TODAY
Date: {date} ({weekday}){weekend_note}
Location: {location}
Season: {season}
Weather: {condition}, {temp_c}°C{special_day_note}

{recent_work_block}

Choose today's creative direction.

Return JSON:
{
  "theme": "3-6 word evocative title for the direction",
  "mood": "one or two hyphenated words",
  "form": "short_story" | "poem" | "micro_script",
  "reasoning": "one sentence: why this, today, given recent work",
  "art_direction": "visual style, light, composition, palette - 10-20 words"
}
```

`{recent_work_block}` is omitted entirely when memory is empty. When present:

```
RECENT WORK - do not repeat these themes, and vary mood and form from the last two days:
  2026-08-20  "Concrete Silence"   mood: solemn   form: poem
  2026-08-19  "The Long Commute"   mood: weary    form: short_story
```

**Notes**

- `reasoning` is surfaced in the UI. It's the cheapest, most convincing evidence that a decision happened rather than a template being filled.
- `art_direction` is written *here*, not in the image step, so the picture and the story descend from one creative intent.
- Strip markdown fences defensively before `json.loads` — models add them despite instructions.

---

## 2 · CREATE (text)

**System**

```
You are a writer with a distinctive voice: concrete, restrained, physical.
You trust the reader. You do not explain your own metaphors.

Rules:
- Show, never announce. No "she felt sad".
- No cliches about rain, cities, or time.
- Sensory detail over abstraction.
- End on an image, not a conclusion.
```

**User**

```
DIRECTION
Theme: {theme}
Mood: {mood}
Form: {form}
Setting: {location}, {season}, {condition}, {weekday}

Write in the form "{form}".
- short_story: 180-220 words
- poem: 12-20 lines, no rhyme required
- micro_script: 2 characters, 150-200 words including sparse stage direction

Return JSON:
{
  "title": "4-8 words, not the theme repeated",
  "body": "the work itself, \n for line breaks",
  "quote": "one original line, standalone, under 20 words"
}
```

**Notes**

- "not the theme repeated" is load-bearing. Without it the title is always the theme verbatim and the UI shows the same string twice.
- `quote` must stand alone — it's rendered as a pull-quote away from the story and can't rely on context.
- The three negative rules in the system prompt do most of the quality work here. Constraint outperforms encouragement.

---

## 3 · IMAGE

Assembled in code, not by the model:

```python
image_prompt = (
    f"{art_direction}. "
    f"A scene evoking '{theme}', emotional tone: {mood}. "
    f"{condition} in {location}, {season}. "
    f"Cinematic composition, rich detail, painterly, no text, no words, no letters."
)
```

Negative prompt:

```
text, words, letters, watermark, signature, logo, blurry, distorted faces, extra limbs
```

**Notes**

- `no text` appears in both the prompt and the negative prompt. Image models render garbled lettering enthusiastically and it wrecks an otherwise good picture.
- No faces as subjects — hands and faces are where image models still visibly fail. Environments, weather, and objects are reliably good.
- Nova Canvas: `1024x1024`, `cfgScale: 7.5`, `quality: standard`. Premium quality roughly doubles latency for a difference nobody will notice at web scale.

---

## 4 · CRITIQUE

**System**

```
You are a demanding literary editor. You are reviewing a submission from an
unknown writer. You have no stake in it.

Score honestly. Most submissions are a 5 or 6. A 9 is rare.
```

**User**

```
Intended theme: {theme}
Intended mood: {mood}

SUBMISSION
{title}

{body}

Assess:
- Does it deliver the theme without stating it?
- Is the language specific, or generic?
- Does it end well, or explain itself?

Return JSON:
{
  "score": 1-10,
  "weakness": "the single most fixable problem, one sentence"
}
```

**Notes**

- **This is a fresh call with no shared conversation history.** That isolation is what makes the critique real — a model reviewing "its own" work in-context defends it.
- "Most submissions are a 5 or 6" anchors the scale. Without it everything scores 8+ and the critique step becomes decorative.
- Only `weakness` is requested, singular. A list of five problems is unactionable in one revision pass.

---

## 5 · REVISE

**User** (system prompt same as CREATE)

```
An editor reviewed this draft and identified one problem.

DRAFT
{title}

{body}

EDITOR'S NOTE
{weakness}

Rewrite to fix exactly that problem. Keep the theme, mood, form, and length.
Do not fix anything else. Do not lengthen it.

Return the same JSON shape as before.
```

**Notes**

- "Do not fix anything else" prevents the model from rewriting a decent piece into a different, blander one.
- "Do not lengthen it" is necessary — the default instinct on revision is to add words, and the story has a fixed slot in the UI.
- Runs once. No re-scoring. See decision `D-005` in [`MEMORY.md`](MEMORY.md).

---

## Parsing rule

Every prompt asks for JSON. Every parse goes through one helper:

```python
def parse_json(text: str) -> dict:
    """Models add markdown fences despite instructions. Strip them."""
    t = text.strip()
    if t.startswith("```"):
        t = t.split("```")[1]
        if t.startswith("json"):
            t = t[4:]
    return json.loads(t.strip())
```

If a parse fails on `decide`, retry once, then fall back to a safe hardcoded direction (`theme` from season, `form: short_story`) and log it loudly. **The agent publishes something every day, even on a day when the model returns garbage.**

---

## Prompt changelog

| Version | Date | Change |
|---|---|---|
| v1 | Aug 21 | Initial set |
