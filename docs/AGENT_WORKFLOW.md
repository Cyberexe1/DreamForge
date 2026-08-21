# The Agent Loop

The difference between "an AI generator on a timer" and "an autonomous creative agent" is what happens between the trigger and the output. A generator does one thing: prompt in, text out. An agent **senses its environment, consults memory, makes a decision, evaluates its own work, and acts on that evaluation.**

DreamForge does seven steps. Five of them involve a decision the code did not hardcode.

```
   ┌──────────┐
   │  TRIGGER │  EventBridge · no human
   └────┬─────┘
        ▼
   1. SENSE      what is true about the world right now?
        ▼
   2. RECALL     what have I already made?
        ▼
   3. DECIDE     what should today be about?          ◄── agency
        ▼
   4. CREATE     make the thing
        ▼
   5. CRITIQUE   is it good enough?                    ◄── agency
        ▼
   6. REVISE     ──── if not, try once more ───┐
        │                                      │
        │         ◄────────────────────────────┘
        ▼
   7. PUBLISH    ship it, remember it
```

---

## 1. SENSE — build world context

`agent/steps/sense.py`

Gathers the facts the agent will react to:

| Signal | Source |
|---|---|
| Date, weekday, is_weekend | System clock, `Asia/Kolkata` |
| Season | Derived from month + location (Indian seasons: Monsoon, Winter, Summer, Post-Monsoon) |
| Temperature, condition | Open-Meteo current weather |
| Special day | Small local lookup table (New Year, solstice, festivals) |

```python
{
  "date": "2026-08-21", "weekday": "Friday", "is_weekend": False,
  "location": "Mumbai, India", "season": "Monsoon",
  "temp_c": 27, "condition": "Moderate rain", "special_day": None
}
```

Hard rule: **sense never raises.** Every field has a fallback. A weather API hiccup must not stop the day's creation — it just means the agent works with less context, exactly like a person who didn't look out the window.

---

## 2. RECALL — read memory

`agent/steps/recall.py`

Queries DynamoDB for the last 7 capsules and extracts the themes and moods already used.

```python
recent = ["Monsoon Dreams", "Concrete Silence", "The Long Commute", ...]
```

This is what makes the agent feel alive rather than random. Without memory it will produce rain poems for eleven straight days in August, because rain is the strongest signal in the context. With memory it is *forced* to find a new angle on the same weather — which is a much more interesting creative constraint, and it's the same one a daily columnist works under.

Memory design detail: [`MEMORY.md`](MEMORY.md)

---

## 3. DECIDE — choose today's creative direction

`agent/steps/decide.py`

The pivotal step. Context + memory go to Nova Pro, which returns a structured decision:

```json
{
  "theme": "The Cartographer of Puddles",
  "mood": "playful-melancholy",
  "form": "short_story",
  "reasoning": "Rain is the third wet day in a row and the last two capsules were both solemn; a smaller, stranger, more human-scale angle keeps the week from flattening.",
  "art_direction": "warm streetlight, reflections, low angle, painterly"
}
```

Three things are genuinely delegated to the model, not chosen by the code:

- **the theme** — not picked from a hardcoded list
- **the form** — story, poem, or micro-script, whichever fits the mood
- **the art direction** — so image and text share one intent

`reasoning` is stored and shown in the UI. Surfacing the agent's *why* is the cheapest, most convincing way to demonstrate that a decision actually happened.

Temperature is high (0.9) here. This is the one step where you want variance.

---

## 4. CREATE — produce the work

`agent/steps/create.py`

Two Bedrock calls:

**Text** — Nova Pro gets the theme, mood, form, and context, and returns `title`, `story` (~200 words), `quote`.

**Image** — the art prompt is assembled from `theme` + `art_direction` + `mood`, then sent to Nova Canvas. Notably the *model* wrote the art direction in step 3, so the image is anchored to the same creative decision as the story rather than being a separate interpretation of the weather.

```python
image_prompt = (
    f"{art_direction}, evoking '{theme}', mood: {mood}, "
    f"{condition} in {location}, cinematic, highly detailed, no text"
)
```

`no text` matters — image models render garbled lettering and it ruins an otherwise good picture.

---

## 5. CRITIQUE — self-evaluation

`agent/steps/critique.py`

A **fresh** Nova Pro call, given only the theme and the story, with no knowledge that it wrote them:

```json
{ "score": 6, "weakness": "The ending explains the metaphor instead of trusting it." }
```

The isolation is the point. A model asked "is your work good?" says yes. A model asked "score this stranger's story" is usefully critical. Same weights, different framing, much better signal.

Cutoff: **7 out of 10.**

---

## 6. REVISE — act on the critique

If `score < 7`, one rewrite pass with the weakness passed in as the instruction, then accept whatever comes back.

**Exactly one retry, and no re-scoring.** Two hard limits, both deliberate:

- an unbounded improve-until-good loop can burn a 120 s Lambda timeout and publish nothing
- a run that publishes a 6/10 story is a success; a run that publishes nothing is a failure

Publishing imperfect work on schedule is the behaviour being demonstrated. `revisions` and the final score go in `meta`, so the archive honestly records the days the agent struggled.

---

## 7. PUBLISH — ship and remember

`agent/steps/publish.py`

1. PNG → `s3://.../images/2026-08-21.png`
2. Capsule → `s3://.../data/2026-08-21.json` (immutable)
3. Same capsule → `s3://.../data/latest.json` (overwrite)
4. Rebuild and write `data/index.json` for the archive strip
5. DynamoDB `PutItem` — this becomes tomorrow's memory
6. CloudFront invalidation on `/data/*`

Order matters: the image lands **before** the JSON that references it. If the run dies mid-publish the site never shows a capsule pointing at a missing image.

---

## Autonomy evidence

Every step emits one structured log line. A real run produces the log that goes straight into the article:

```
08:00:00  trigger      source=eventbridge.schedule  human_input=none
08:00:01  sense        season=Monsoon temp=27C condition="Moderate rain"
08:00:02  recall       recent_themes=6 avoiding=["Monsoon Dreams","Concrete Silence"]
08:00:05  decide       theme="The Cartographer of Puddles" mood=playful-melancholy form=short_story
08:00:12  create.text  title="The City That Waited for Rain" words=203
08:00:26  create.image model=nova-canvas bytes=1418204
08:00:31  critique     score=6 weakness="ending over-explains"
08:00:39  revise       pass=1 accepted=true
08:00:44  publish      s3=data/2026-08-21.json dynamodb=ok invalidation=I2QX...
08:00:45  complete     duration_ms=45120 revisions=1
```

`human_input=none` on line one is the whole submission in a single field.

---

## Why this is an agent, in one paragraph

You'll need this for the article, so here it is written once:

> DreamForge is not a prompt on a timer. Each morning it gathers real-world signals it was not given in advance, reads its own history to see what it has already said, and then *decides* — theme, form, and visual direction — with a stated rationale. It generates the work, evaluates that work through an independent critic, and revises when the critic is unconvinced. Then it publishes and commits the result to memory, which constrains what it can do tomorrow. No human is in any part of that path. The website has no generate button, because there is nothing for a human to initiate.
