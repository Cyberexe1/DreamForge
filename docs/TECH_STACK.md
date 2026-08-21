# Tech Stack

Every choice here is optimised for one thing: **a working autonomous run by Saturday morning.** Where two options were close, the one with fewer moving parts won.

---

## Region

**`us-east-1`**

Bedrock model availability is widest here, and Nova Canvas is not in every region. Pick one region and never think about it again — cross-region Bedrock calls are a classic weekend time sink.

---

## Agent runtime

| Choice | Version | Why |
|---|---|---|
| **Python** | 3.12 | Fastest to write, `boto3` is bundled in the Lambda runtime |
| **AWS Lambda** | arm64, 1024 MB, 120 s timeout | Image generation is the slow part; 120 s is comfortable headroom |
| **boto3** | runtime-provided | Do not vendor it — it bloats the zip and drifts from the runtime |
| **requests** | 2.32.3 | Weather API call. Pinned exactly. |

Nothing else. No LangChain, no agent framework. The loop is ~200 lines of explicit Python, which means when something breaks at 2 AM you can actually read it.

> Lambda memory is CPU, not just RAM. 1024 MB is the sweet spot — 512 MB roughly doubles JSON/base64 handling time for the image payload.

---

## AI models (Amazon Bedrock)

| Purpose | Model ID | Notes |
|---|---|---|
| Theme decision + story + quote | `anthropic.claude-3-5-sonnet-20241022-v2:0` | Called via the **Converse API**, not `invoke_model` |
| Self-critique | same model, separate call | Cheap, and keeps the critic honest by not sharing context |
| Image | `amazon.nova-canvas-v1:0` | Returns base64 PNG |
| Image fallback | `amazon.titan-image-generator-v2:0` | Used if Nova Canvas access is not yet granted |

**Use the Converse API for all text calls.** It gives one uniform request/response shape, so swapping Claude for Nova Pro later is a one-line change instead of a rewrite.

⚠️ **Bedrock model access is not on by default.** Request access to Anthropic + Amazon models in the Bedrock console *first thing* — approval is usually instant but occasionally is not, and everything else is blocked behind it.

---

## Storage

| Service | Purpose |
|---|---|
| **S3** — `creative-pulse-artifacts` | Generated images + capsule JSON. Private bucket, read through CloudFront OAC only. |
| **S3** — `creative-pulse-web` | Built React site. Also private + OAC. |
| **DynamoDB** — `creative-pulse-history` | Agent memory and run history. On-demand billing. |

Neither bucket is public. Public S3 buckets are the #1 way a hackathon repo becomes a security incident — CloudFront Origin Access Control gives the same result with none of the exposure.

### DynamoDB table

| Attribute | Type | Notes |
|---|---|---|
| `pk` | S (partition) | `CAPSULE` for capsules, `RUN` for run logs |
| `sk` | S (sort) | ISO date `2026-08-21` — sorts chronologically for free |
| `theme`, `title`, `story`, `quote`, `image_key`, `mood`, `context`, `critique_score`, `revisions`, `duration_ms` | — | payload |

Single table, one partition per entity type. Latest capsule is a single `Query` with `Limit=1, ScanIndexForward=False`.

---

## Frontend

| Choice | Version | Why |
|---|---|---|
| **React** | 18.3 | Familiar, no learning curve to pay for |
| **Vite** | 5.4 | Cold start in ms, builds static output S3 serves directly |
| **TypeScript** | 5.5 | Catches capsule-shape mistakes at build time |
| **Tailwind CSS** | 3.4 | Polished UI without writing a design system |
| **framer-motion** | 11.x | One fade-in on the daily reveal. That's the whole animation budget. |

**No API Gateway. No backend server.** The agent writes `latest.json` and `index.json` to S3; the site `fetch`es them from CloudFront. That removes an entire service, its IAM, its CORS config, and its cold starts from the weekend.

```
web  ──fetch──►  https://<cf-domain>/data/latest.json
                 https://<cf-domain>/data/index.json
                 https://<cf-domain>/images/2026-08-21.png
```

---

## Infrastructure as code

**AWS SAM** — one `infra/template.yaml` for Lambda, the schedule, both buckets, DynamoDB, CloudFront, and IAM.

CDK is nicer for large systems. SAM wins here because `sam deploy --guided` gets you to a deployed Lambda in about four minutes with no bootstrap step and no synth loop.

Everything is in code, so the whole stack is reproducible from a fresh clone — worth a sentence in the article.

---

## Scheduling

**Amazon EventBridge Scheduler** (the newer service, not a classic CloudWatch Events rule).

```
cron(30 2 * * ? *)   # 02:30 UTC = 08:00 IST
```

EventBridge Scheduler gets you a real timezone field, so you can write `08:00` with `ScheduleExpressionTimezone: Asia/Kolkata` and stop doing UTC arithmetic in your head. It also has a built-in retry policy, which matters when Bedrock throttles.

This scheduler *is the autonomy gate.* It's the single most important resource in the template.

---

## External data (free, no keys)

| API | Use | Auth |
|---|---|---|
| [Open-Meteo](https://open-meteo.com/) | Temperature, precipitation, weather code | None |

No API key means no secret to store, no Secrets Manager, no rotation, no leaked credential in a public repo. If Open-Meteo is down, `sense.py` degrades to date/season-only context and the agent still publishes. **The agent must never fail to publish because a non-essential input was unavailable.**

---

## Observability

CloudWatch Logs with one structured JSON line per step:

```json
{"step":"decide","ts":"2026-08-21T08:00:04Z","theme":"Monsoon","elapsed_ms":2140}
```

These lines are copy-pasted straight into the article as the **autonomous generation log** — the evidence that the run had no human in it. Structured logging is not gold-plating here; it's a deliverable.

---

## Deliberately not used

| Skipped | Reason |
|---|---|
| API Gateway | Nothing needs to be called from the browser |
| Cognito / auth backend | The login flow is a browser-local demo session that protects nothing — see `D-019`. Real auth would be days of work serving none of the challenge gates. |
| react-router | A 30-line hash router covers four routes, and needs no CloudFront rewrite rules |
| Step Functions | The loop is a few sequential calls; a state machine adds config, not capability |
| RDS / Aurora | Wildly oversized for one JSON row a day |
| Bedrock Agents | The custom loop is easier to explain and demo than a managed agent's traces |
| SQS / SNS | No fan-out, no queue depth, nothing to decouple |

Each row here is a sentence you can write in the article's architecture section. Explaining what you *didn't* build reads as judgement.

---

## Cost

One run a day: a few Bedrock calls, one image, a handful of KB in S3, two DynamoDB writes.

Comfortably **under $1/month.** CloudFront and DynamoDB on-demand stay inside free tier at this volume; Bedrock is the only real line item and it's cents.
