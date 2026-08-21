# Architecture

## System diagram

```
                    ┌──────────────────────────────────────┐
                    │   Amazon EventBridge Scheduler       │
                    │   cron(0 8 * * ? *) Asia/Kolkata     │
                    │   ── the autonomy trigger ──         │
                    └───────────────────┬──────────────────┘
                                        │ scheduled invoke
                                        ▼
        ┌───────────────────────────────────────────────────────────┐
        │            AWS Lambda · dreamforge-agent              │
        │            Python 3.12 · arm64 · 1024MB · 120s            │
        │                                                           │
        │   sense ─► recall ─► decide ─► create ─► critique ─►       │
        │                        ▲                    │             │
        │                        └──── revise ◄───────┘             │
        │                                             ─► publish    │
        └───┬──────────────┬──────────────┬───────────────┬─────────┘
            │              │              │               │
            ▼              ▼              ▼               ▼
    ┌───────────────┐ ┌──────────┐ ┌──────────────┐ ┌──────────────┐
    │  Open-Meteo   │ │ Bedrock  │ │  DynamoDB    │ │      S3      │
    │  weather API  │ │ Nova Pro │ │  history +   │ │  artifacts   │
    │  (no auth)    │ │  Nova    │ │  memory      │ │  images/json │
    └───────────────┘ └──────────┘ └──────────────┘ └──────┬───────┘
                                                            │
                            ┌───────────────────────────────┘
                            ▼
                  ┌───────────────────┐        ┌──────────────────┐
                  │    CloudFront     │◄───────│  S3 · web bucket │
                  │  OAC · HTTPS      │  OAC   │  React build     │
                  └─────────┬─────────┘        └──────────────────┘
                            │
                            ▼
                  ┌───────────────────┐
                  │  Browser · React  │
                  │  read-only viewer │
                  └───────────────────┘
```

Read the diagram left to right: **nothing points from the browser back into the agent.** That one-way arrow is the architectural expression of "autonomous" — the frontend has no ability to trigger generation, because that path does not exist.

---

## Request flow, step by step

| # | Time (rel.) | Actor | Action |
|---|---|---|---|
| 1 | +0s | EventBridge | Fires scheduled event, no payload needed |
| 2 | +0.2s | Lambda | Cold start, loads config from env vars |
| 3 | +1s | `sense` | Date, weekday, season, Open-Meteo weather for the configured city |
| 4 | +2s | `recall` | DynamoDB query: last 7 capsules → recent themes list |
| 5 | +5s | `decide` | Bedrock/Nova Pro picks theme, mood, output form, avoiding recent themes |
| 6 | +12s | `create` | Bedrock/Nova Pro writes title + story + quote |
| 7 | +25s | `create` | Bedrock/Nova Canvas renders the image from a theme-derived art prompt |
| 8 | +30s | `critique` | Second Nova Pro call scores the story 1–10 against the theme |
| 9 | +40s | `revise` | Only if score < 7 — one rewrite pass, then accept regardless |
| 10 | +44s | `publish` | PNG → S3, capsule JSON → S3 (`latest.json` + dated), row → DynamoDB |
| 11 | +45s | `publish` | CloudFront invalidation for `/data/*` |

Typical end-to-end: **40–60 seconds.** Timeout is 120 s so a slow image call can't kill the run.

---

## S3 layout

### Artifacts bucket — `dreamforge-artifacts`

```
/data/latest.json          ← today's capsule (the frontend's homepage)
/data/index.json           ← array of {date, title, theme, image_key} for the archive
/data/2026-08-21.json      ← immutable per-day capsule
/data/2026-08-20.json
/images/2026-08-21.png
/images/2026-08-20.png
```

`latest.json` is overwritten daily; dated files are write-once. That means the archive is append-only and a bad run can never destroy history.

### Web bucket — `dreamforge-web`

Vite build output. `index.html` + hashed assets.

Both buckets: **Block Public Access fully on**, encryption at rest, accessed only by CloudFront via Origin Access Control. The agent's Lambda role is the only principal with write access.

---

## Cache policy

| Path | Cache-Control | Reasoning |
|---|---|---|
| `/data/latest.json` | `max-age=300` | Fresh-ish without hammering S3 |
| `/data/index.json` | `max-age=300` | Same |
| `/data/YYYY-MM-DD.json` | `max-age=31536000, immutable` | Never changes |
| `/images/*` | `max-age=31536000, immutable` | Never changes |
| `index.html` | `max-age=0, must-revalidate` | So deploys are visible immediately |

The agent issues a CloudFront invalidation for `/data/*` at the end of each run, so the new capsule appears immediately rather than up to five minutes late.

---

## The capsule contract

This shape is the interface between the agent and the frontend. Change it in `agent/models.py` and `web/src/types.ts` in the same commit, always.

```json
{
  "date": "2026-08-21",
  "weekday": "Friday",
  "context": {
    "location": "Mumbai, India",
    "season": "Monsoon",
    "temp_c": 27,
    "condition": "Moderate rain",
    "is_weekend": false
  },
  "theme": "Monsoon Dreams",
  "mood": "wistful",
  "form": "short_story",
  "reasoning": "Third wet day running and the last two capsules were both solemn; a smaller, human-scale angle keeps the week from flattening.",
  "title": "The City That Waited for Rain",
  "story": "Once the rain arrived, the city remembered...",
  "quote": "Some cities do not wait for rain. They rehearse for it.",
  "image_key": "images/2026-08-21.svg",
  "image_prompt": null,
  "meta": {
    "generated_at": "2026-08-21T08:00:45Z",
    "trigger": "eventbridge.schedule",
    "critique_score": 8,
    "revisions": 0,
    "duration_ms": 45120,
    "image_kind": "poster",
    "models": {
      "text": "us.amazon.nova-lite-v1:0",
      "image": null
    }
  }
}
```

`meta.image_kind` records **how** the visual was made — `diffusion` for a real generated image, `poster` for an agent-composed typographic SVG, `null` for text-only. The UI captions each accordingly. A poster is legitimate design work but it is not generated artwork, and a reader can open the SVG source, so it must never be labelled as one.

`image_prompt` is only set for `diffusion`. Attaching an art prompt to a poster would describe something that was never made.

`reasoning` comes straight from the `decide` step and is rendered in the UI. It's the cheapest way to show that a decision actually happened rather than a template being filled — an evaluator can read the agent's justification for today's theme in its own words.

`meta.trigger` is worth calling out. It records **how** the run started — `eventbridge.schedule` for real autonomous runs, `manual.cli` for your own testing. The frontend can then honestly badge each capsule, and you have machine-readable proof of autonomy rather than just a claim.

---

## IAM — least privilege

The Lambda execution role gets exactly these, no wildcards on resources:

```yaml
- bedrock:InvokeModel
    Resource:
      - arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-pro-v1:0
      - arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-canvas-v1:0
- s3:PutObject
    Resource: arn:aws:s3:::dreamforge-artifacts/*
- dynamodb:PutItem, dynamodb:Query
    Resource: <history table arn>
- cloudfront:CreateInvalidation
    Resource: <distribution arn>
- logs:CreateLogStream, logs:PutLogEvents   (via AWSLambdaBasicExecutionRole)
```

No `s3:GetObject` — the agent only writes. No `s3:DeleteObject` — the agent cannot destroy the archive even if the code is wrong. Scoping the destructive permissions out entirely is cheaper than trusting the code not to use them.

---

## Failure handling

| Failure | Behaviour |
|---|---|
| Open-Meteo down or slow | 3 s timeout, fall back to date/season-only context, publish anyway |
| Bedrock throttle (`ThrottlingException`) | Exponential backoff, 3 attempts |
| Image generation fails entirely | Publish the capsule text-only with `image_key: null`; frontend shows a gradient placeholder |
| Text generation fails | Hard fail — there is nothing to publish. EventBridge retries, then DLQ. |
| Lambda fails all retries | Message to SQS dead-letter queue; yesterday's `latest.json` stays live so the site never breaks |

The rule underneath all of these: **partial output beats no output, and a stale site beats a broken site.** The only unrecoverable failure is losing the text.

---

## Idempotency

The capsule key is the date. Re-running on the same day overwrites that day's capsule rather than creating a duplicate. Safe to re-invoke while debugging, and safe when EventBridge retries after a timeout that actually succeeded.

---

## Scaling notes (for the article)

Nothing here needs to scale — it's one run a day. But it's worth noting *why* the shape is already scalable: the write path is a scheduled function and the read path is pure CDN. Adding cities means adding schedules and a partition key, not rearchitecting. Traffic on launch day hits CloudFront, never Lambda, so a front-page spike costs cache bandwidth instead of compute.
