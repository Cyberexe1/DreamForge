---
inclusion: fileMatch
fileMatchPattern: 'agent/**'
---

# Writing Agent Code

The loop is `sense → recall → decide → create → critique → revise → publish`. Detail in `docs/AGENT_WORKFLOW.md`.

## Per-step contracts

| Step | May raise? | On failure |
|---|---|---|
| `sense` | **No** | Return context with fallback fields (date/season always available) |
| `recall` | **No** | Return `[]`, log a warning, proceed with no memory |
| `decide` | Yes, after 1 retry | Fall back to a season-derived theme, `form: short_story`, log loudly |
| `create.text` | **Yes** | Nothing to publish — let it fail so EventBridge retries |
| `create.image` | **No** | Return `None`; capsule publishes with `image_key: null` |
| `critique` | **No** | Return `score=7` (pass) so a critic outage can't block publishing |
| `publish` | **Yes** | Partial publish is worse than a retry |

`create.text` and `publish` are the only steps allowed to fail the run. Everything else degrades.

## Publish order — do not reorder

1. PNG → S3
2. `data/YYYY-MM-DD.json` → S3
3. `data/latest.json` → S3
4. `data/index.json` → S3
5. DynamoDB `PutItem`
6. CloudFront invalidation on `/data/*`

The image lands before the JSON that references it. If the run dies mid-publish, the site never renders a capsule pointing at a missing object.

Dated capsules are write-once; only `latest.json` and `index.json` are overwritten.

## Idempotency

The date is the key. Re-running the same day overwrites that day. Never append a timestamp or UUID to keys — EventBridge retries after a timeout that actually succeeded, and duplicate capsules would poison tomorrow's memory.

## Bedrock

All calls through `bedrock.py`. Steps never construct a `bedrock-runtime` client.

```python
converse(system=..., user=..., temperature=0.9, max_tokens=500)  # text
generate_image(prompt=..., negative=...)                          # image
```

- Converse API only, never `invoke_model` for text
- Parse with the shared `parse_json` helper — models wrap JSON in markdown fences despite instructions
- `ThrottlingException` → exponential backoff, 3 attempts. Other errors fail fast.
- **`critique` must be a fresh call.** Never continue the `create` conversation. A model reviewing its own work in-context defends it.

## Revision loop

Exactly one pass when `score < CRITIQUE_THRESHOLD`, then accept the result unconditionally. No re-scoring, no second pass, no while-loop. An unbounded improve-until-good loop can burn the 120 s timeout and publish nothing — and publishing a 6/10 story on time is the behaviour being demonstrated.

Record `critique_score` and `revisions` in `meta` truthfully, including on the days it struggled.

## Logging

One structured line per step through `logging_util.log()`. Never `print()`.

The trigger line must carry the source and `human_input=none` — that line is the submission's core evidence:

```python
log("trigger", source=event.get("trigger", "eventbridge.schedule"), human_input="none")
```

Never log story text, base64 image bytes, or full prompts. Log lengths and IDs instead.

## No hardcoded creativity

`theme`, `mood`, `form`, and `art_direction` come from the model. Don't add a themes list, a mood rotation, or a template bank — that turns the agent back into a generator, which is exactly what the challenge distinguishes against. The one exception is the `decide` fallback path, and it's logged as a failure when used.

## Config

Read from `os.environ` in `config.py`, once, at module scope. No `os.getenv` scattered through step modules. No literal model IDs, bucket names, or coordinates in step code.

## Timing

Wrap each step and record `elapsed_ms`. Total must stay under the 120 s timeout with room to spare — the image call is the variable one. If total run time creeps past ~70 s, investigate before adding anything new to the loop.
