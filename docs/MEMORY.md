# Memory

Two kinds of memory live in this project, and they're easy to confuse:

1. **Agent memory** — what Creative Pulse remembers about its own past work, so it doesn't repeat itself
2. **Project memory** — what *we* decided while building, so a decision is never re-litigated at 2 AM

---

# Part 1 · Agent memory

## Why the agent needs memory at all

Without memory, the agent is a function of the day's weather. In Mumbai in August that means eleven consecutive rain poems, because rain is the loudest signal in the context. Each one would be fine in isolation and the archive would be unreadable.

Memory converts a repetitive input into a creative constraint: *it rained again, and you already wrote the obvious rain piece — find another angle.* That's the same pressure a daily columnist works under, and it's what makes the output feel authored rather than generated.

## What is stored

DynamoDB `creative-pulse-history`, one item per capsule:

| Field | Used by memory? | Purpose |
|---|---|---|
| `sk` (date) | ✔ | Recency ordering |
| `theme` | ✔ | Primary anti-repetition signal |
| `mood` | ✔ | Prevents tonal monotony (four solemn days in a row) |
| `form` | ✔ | Rotates story / poem / micro-script |
| `title` | ✔ | Cheap way to spot near-duplicate phrasing |
| `story`, `quote`, `image_key` | ✖ | Stored for the site, not fed back to the model |
| `context`, `meta` | ✖ | Audit trail |

## How much is recalled

**A 7-day window.** Query: `pk = "CAPSULE"`, `ScanIndexForward=False`, `Limit=7`.

Seven is a deliberate compromise:

- **Too short (2–3 days)** — the agent cycles between two themes with a short memory of doing so
- **Too long (30 days)** — the avoid-list gets long enough to dominate the decision prompt, and the model starts reaching for strained novelty just to avoid the list

Seven also matches the human sense of "this week", so the agent's variety is legible to someone browsing the archive.

## How it's injected

Only into `decide`, never into `create`. The decision step sees:

```
Recent work to avoid repeating:
  2026-08-20  "Concrete Silence"       mood: solemn      form: poem
  2026-08-19  "The Long Commute"       mood: weary       form: short_story
  2026-08-18  "Monsoon Dreams"         mood: wistful     form: short_story

Do not reuse these themes. Vary the mood and form from the last two days.
```

Keeping memory out of `create` matters. Once a theme is chosen, the writing step should be fully present in that theme — feeding it the archive just makes it hedge and reference things the reader hasn't seen.

## Cold start

Day one has no history. `recall` returns an empty list and the prompt omits the avoid-list section entirely rather than sending `Recent work: none`, which reads as noise to the model. Empty memory is a valid state, not an error.

## Failure behaviour

If the DynamoDB query fails, `recall` logs a warning and returns `[]`. The agent proceeds with no memory. **A memory failure must never block publication** — a possibly-repetitive capsule is worth infinitely more than a missing one.

---

# Part 2 · Project memory (decision log)

Append-only. Each entry: what was decided, and *why*. The why is the valuable half — it's what stops a decision from being quietly reversed later.

---

### D-001 · No generate button in the UI
**Decided:** Aug 21
The challenge requires creative output "without manual user initiation." A generate button — even a hidden admin one — invites the evaluator to read this as an AI generator. The frontend is strictly read-only, with no code path to the agent. Manual runs happen via CLI only, and are tagged `meta.trigger = manual.cli` so the distinction stays honest.

### D-002 · Custom agent loop instead of Bedrock Agents
**Decided:** Aug 21
Bedrock Agents is the more "AWS-native" answer, but its value is tool orchestration over an unknown number of steps. Our flow is a known 7-step sequence. A plain Python loop is faster to build, far easier to debug in CloudWatch, and much easier to *explain* in the article — and explainability is a judged category. Revisit only if tool use becomes dynamic.

### D-003 · No API Gateway
**Decided:** Aug 21
The site only ever reads JSON. S3 + CloudFront serves that. Skipping API Gateway removes a service, its IAM, its CORS config, its cold starts, and its cost, and removes any network path from the browser toward the agent — which reinforces D-001 at the architecture level.

### D-004 · Independent critic call
**Decided:** Aug 21
Asking a model to score its own work in the same conversation produces reflexive praise. A fresh call, given only the theme and the story with no authorship context, produces usable criticism. Same model, different framing, materially better signal.

### D-005 · Exactly one revision, and no re-scoring
**Decided:** Aug 21
An improve-until-good loop is unbounded and can consume the 120 s Lambda timeout, publishing nothing. Publishing a 6/10 story on time is a success; publishing nothing is a failure. One pass, then accept, and record the score honestly in `meta`.

### D-006 · 7-day memory window
**Decided:** Aug 21
See Part 1. Short enough to keep the decision prompt tight, long enough to prevent visible cycling.

### D-007 · Open-Meteo over a keyed weather API
**Decided:** Aug 21
No API key means no secret to store, no Secrets Manager, no rotation, and no chance of leaking a credential in a public repo. Accuracy differences are irrelevant — the weather is creative input, not a forecast product.

### D-008 · Buckets private, CloudFront OAC
**Decided:** Aug 21
A public S3 bucket is the standard way a hackathon repo becomes a security writeup. OAC gives identical public read behaviour with no bucket exposure and costs one template block.

### D-009 · Agent role has no Delete or Get on S3
**Decided:** Aug 21
The agent only ever writes new objects. Omitting `s3:DeleteObject` means no bug, prompt injection, or bad loop can destroy the archive. Scoping destructive permissions out is cheaper than trusting code not to use them.

### D-010 · Dated capsules immutable, only `latest.json` overwritten
**Decided:** Aug 21
Makes history append-only, so a bad run can corrupt at most today. Also makes every dated file infinitely cacheable at the CDN.

### D-011 · `meta.trigger` recorded on every capsule
**Decided:** Aug 21
Turns "it runs autonomously" from a claim into a machine-readable field. Also keeps *us* honest when backfilling test data — a manually-invoked capsule can never masquerade as a scheduled one.

### D-012 · SAM over CDK
**Decided:** Aug 21
`sam deploy --guided` reaches a deployed Lambda in minutes with no bootstrap and no synth loop. CDK's advantages are real at larger scale and irrelevant across three days.

### D-013 · Image before JSON on publish
**Decided:** Aug 21
The capsule JSON references `image_key`. Writing the PNG first means a mid-publish failure can never leave the site rendering a broken image.

### D-014 · Test the schedule at +5 minutes before setting 08:00
**Decided:** Aug 21
Waiting until tomorrow morning to discover the scheduler is misconfigured wastes a third of the available window. Prove the trigger works within minutes, then set the real cron.

### D-015 · `reasoning` is part of the capsule contract, and it's shown in the UI
**Decided:** Aug 21
`decide` already produces a justification for the day's theme. Persisting it and rendering it turns "the agent makes decisions" from a claim in the article into something a visitor reads in the agent's own words. Cost is one string; it resolves Q-3 in favour of showing it. Added to the contract in `ARCHITECTURE.md` and to `web/src/types.ts` in the same pass. Nullable, so a `decide` fallback that produces no reasoning still publishes.

### D-016 · Frontend written by hand, not scaffolded by `npm create vite`
**Decided:** Aug 21
The interactive scaffolder prompts and then installs a template that has to be stripped back anyway. Writing the ten config and source files directly was faster and produced no dead boilerplate.

### D-017 · Dev-only mock fixture, never in production builds
**Decided:** Aug 21
The UI had to be buildable before the agent's first run existed. `VITE_USE_MOCK` is gated on `import.meta.env.DEV` as well as the flag, so a production bundle cannot serve invented work as the agent's output. The fixture is tagged `local.dev` so even in dev it's visibly labelled as not a real run.

### D-018 · Header CTA is "View on GitHub", not any form of generate
**Decided:** Aug 21
A header needed a primary button. Anything resembling generate/refresh-content would undercut `D-001` at the exact spot an evaluator looks first. Linking the public repo is genuinely useful to a judge and creates no trigger path. The one button that does touch data is "Check again" in the waiting state, which re-fetches published JSON and cannot invoke the agent.

### D-019 · Login/signup and a dashboard, as a browser-local demo session
**Decided:** Aug 21 · supersedes the "no auth" line in `D-003`-era scoping
Requested directly, against the original no-accounts scoping. Real authentication means Cognito plus an authorizer plus a protected API — days of work, and it serves none of the three challenge gates.

Built instead: `src/auth.ts` writes a session marker to `localStorage`. No auth server, no account, no password stored or transmitted. Defensible **only** because it protects nothing — every capsule is public, and the dashboard is a read-only view of the same public JSON the landing page reads.

Guardrails, all enforced in steering:
- an amber notice on both auth pages states plainly that it isn't real sign-in
- the dashboard has no control that can start, schedule, or shape a run — `D-001` holds
- `src/auth.ts` carries a header comment saying replace-with-Cognito, don't extend

The honesty banner matters more than the feature. A judge reading "demo access, local to your browser" sees deliberate scoping; a judge discovering fake auth presented as real sees something much worse.

### D-020 · GitHub link moved from header to footer only
**Decided:** Aug 21
The header needed the space for Log in / Sign up. The repo link stays in the footer, so the submission link a judge needs is still reachable from every page.

### D-021 · Hash router, hand-written, no react-router
**Decided:** Aug 21
About thirty lines in `src/lib/router.ts`. Two reasons over path routing: the site is static on S3/CloudFront and path routes would need custom error-page rewrites on the distribution, and treating any hash without a leading `/` as an in-page anchor let the existing `#today` / `#archive` links keep working untouched.

---

## Open questions

| # | Question | Status |
|---|---|---|
| Q-1 | Nova Canvas access granted, or fall back to Titan v2? | Check in Phase 0 |
| Q-2 | Is 200 words the right story length for the hero layout? | Decide when the UI exists |
| Q-3 | Show the agent's `reasoning` text in the UI, or keep it in the archive detail view? | ✅ Resolved — shown in the agent status panel, see `D-015` |
| Q-4 | Backfill a few past days for a fuller archive screenshot? | Acceptable only with honest `meta.trigger` |

---

## How to use this file

- Made a non-obvious call? Add a `D-xxx` entry with the reasoning **in the same commit as the code**.
- About to reverse an earlier decision? Read its entry first. Usually the original reasoning still holds; when it doesn't, add a new entry that supersedes it rather than editing history.
- Writing the article? Sections 2 and 4 are largely already written here. Decision entries are exactly the "challenges and how I solved them" content the judges are asking for.
