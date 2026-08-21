# Memory

Two kinds of memory live in this project, and they're easy to confuse:

1. **Agent memory** — what DreamForge remembers about its own past work, so it doesn't repeat itself
2. **Project memory** — what *we* decided while building, so a decision is never re-litigated at 2 AM

---

# Part 1 · Agent memory

## Why the agent needs memory at all

Without memory, the agent is a function of the day's weather. In Mumbai in August that means eleven consecutive rain poems, because rain is the loudest signal in the context. Each one would be fine in isolation and the archive would be unreadable.

Memory converts a repetitive input into a creative constraint: *it rained again, and you already wrote the obvious rain piece — find another angle.* That's the same pressure a daily columnist works under, and it's what makes the output feel authored rather than generated.

## What is stored

DynamoDB `dreamforge-history`, one item per capsule:

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

### D-019 · Login/signup and a dashboard, initially as a browser-local demo session
**Decided:** Aug 21 · **superseded by `D-022`**
Requested against the original no-accounts scoping. First pass was a `localStorage` session marker with no server, on the grounds that real auth was too much for the weekend. Replaced the same day by a real backend — see `D-022`. Kept on record because the reasoning explains why the frontend was structured to make the swap cheap: all auth state was already funnelled through one module.

### D-020 · GitHub link moved from header to footer only
**Decided:** Aug 21
The header needed the space for Log in / Sign up. The repo link stays in the footer, so the submission link a judge needs is still reachable from every page.

### D-021 · Hash router, hand-written, no react-router
**Decided:** Aug 21
About thirty lines in `src/lib/router.ts`. Two reasons over path routing: the site is static on S3/CloudFront and path routes would need custom error-page rewrites on the distribution, and treating any hash without a leading `/` as an in-page anchor let the existing `#today` / `#archive` links keep working untouched.

### D-022 · Real accounts: Node/Express backend + DynamoDB, no Cognito
**Decided:** Aug 21 · supersedes `D-019`
Requested directly: real credentials in DynamoDB, own backend, Node.js, no Cognito. New `backend/` service, deployed as a Lambda behind a Function URL rather than API Gateway.

Cognito would have been less code and less risk, but it was explicitly ruled out. Since that means hand-rolling credential storage, the security work is not optional:

| Control | Implementation |
|---|---|
| Hashing | bcrypt via `bcryptjs`, cost 12, measured at ~430 ms |
| 72-byte problem | SHA-256 pre-hash before bcrypt, with a test proving no truncation |
| Enumeration | Login returns one identical error for unknown email and wrong password, and still hashes on a miss so timing doesn't leak |
| Brute force | 5 failed attempts per IP+email per 15 min |
| Uniqueness | Conditional `PutItem` on `attribute_not_exists(email)` — no read-then-write race |
| Hash containment | `toPublicUser()` is the only exit from the repository module |
| Secret | `JWT_SECRET` ≥32 chars, boot refused if a `dev-` secret reaches production |

**The boundary that matters:** this API has no path to the agent. No invoke permission, no shared table, no shared queue. Accounts and creativity are separate systems, so `D-001` still holds — nothing a browser can reach starts a run.

Two limitations recorded rather than hidden: the rate limiter is in-memory so it's per-container behind scaled Lambda, and the token sits in `localStorage` where XSS could read it. Both are written up in `backend/README.md` with the proper fixes (DynamoDB counter or WAF; httpOnly cookie on a single origin).

### D-023 · bcrypt over scrypt, `bcryptjs` over native `bcrypt`
**Decided:** Aug 21 · supersedes the scrypt choice made earlier the same day
First implementation used `crypto.scrypt` — no dependency, memory-hard, ranked above bcrypt by OWASP. Switched to bcrypt on request; it's the more conventional choice and easier to hand to a reviewer.

`bcryptjs` rather than the native `bcrypt` package because native bindings must be compiled for arm64 Amazon Linux, and a module built on Windows silently fails to load in Lambda. Pure JS costs speed (measured: 141/237/432/872 ms at cost 10/11/12/13) and buys a package that deploys anywhere.

`verifyPassword` still accepts `scrypt$` records and re-hashes them on next successful login, so the switch needed no migration and breaks no account. The stored format is prefixed (`bcrypt-sha256$`) specifically so the next scheme change is equally cheap.

### D-024 · Saved capsules as the per-user data
**Decided:** Aug 21
A dashboard needs something that is actually the user's. Bookmarked capsule dates are the smallest thing that qualifies: a list of date strings on the user item, no new table, and nothing sensitive — the capsules themselves stay public. Saving is a preference, not a request for work, so it doesn't touch `D-001`.

### D-025 · Four separate IAM identities, none of them broad
**Decided:** Aug 21
Deployer, App Runner instance, agent execution, scheduler. Each gets only what it needs, scoped to named ARNs rather than `*`.

The boundary that carries the most weight: the backend's instance role has **no `lambda:InvokeFunction`** and no access to the history table. The agent's role has **no `s3:DeleteObject` or `s3:GetObject`**. Those two absences mean accounts and creativity cannot reach each other, so `D-001` is enforced by IAM rather than by convention.

Deployer IAM permissions are a separate policy from deployer service permissions, because anyone who can create a role and attach `AdministratorAccess` is an admin regardless of the rest of their policy. Role creation is fenced by a permissions boundary, `AttachRolePolicy` is restricted by `iam:PolicyARN`, and `iam:PassRole` is restricted by `iam:PassedToService`. Detach it once the roles exist.

### D-026 · App Runner is a risk, not a decision yet
**Decided:** Aug 21 · unresolved
Requested as the backend host, but AWS closed App Runner to new customers on 30 Apr 2026 — accounts not already onboarded can't create services. Eligibility has to be confirmed in the console before any of it is built.

Two things this changes if it goes ahead: cost moves from ~$0 to $5–25/month for an always-provisioned instance, and the earlier "under $1/month" claim in `TECH_STACK.md` had to be corrected. `backend/src/lambda.js` already exists, so falling back to a Function URL is a config change rather than a rewrite. Documented both paths rather than picking one blind.

### D-027 · Renamed to DreamForge
**Decided:** Aug 21
"Creative Pulse" → **DreamForge** across 35 files: docs, steering, both packages, all IAM policy documents, and every AWS resource name.

Done with a scripted replace rather than by hand, because the string appeared in resource names, package names, storage keys and the article title, and a missed one in an IAM ARN fails at deploy time with a confusing error. Mapping covered `Creative Pulse`, `CREATIVE PULSE`, `CreativePulse`, `creative-pulse` and the `cp.*` localStorage keys.

Resource names now: `dreamforge-users`, `dreamforge-history`, `dreamforge-artifacts-*`, `dreamforge-web-*`, `dreamforge-agent`, roles `dreamforge-*`, policies `DreamForge*`, secret `dreamforge/jwt-secret`. Token key `df.token.v1`.

Brand glyph changed from 🌧️ to ✦. The rain cloud was tied to the "Creative Pulse" monsoon framing; a spark suits a forge. Used as a text character rather than an emoji so it renders identically everywhere, including inside the SVG favicon.

One deliberate leftover: `creativepulse` was in the common-password blocklist, now `dreamforge` and `dreamforge1` — the product name is the first thing a user tries as a password.

Article title is now `Weekend Creative Agent Challenge: DreamForge`. That prefix is fixed by the challenge rules and must not be renamed.

### D-028 · Amazon Nova Pro replaces Claude for all text
**Decided:** Aug 21 · supersedes the model choice in `D-002`-era planning
Claude ruled out by request. Picked `amazon.nova-pro-v1:0` from the available Bedrock models after listing what the account actually offers rather than choosing from memory.

Why Nova Pro over Llama 3.3 70B, Mistral Large 3, or the others on offer:

- **Same provider as the image model.** One model-access request, one vendor relationship.
- **Full Converse API support**, so `bedrock.py` needs no change — the whole point of using Converse from the start (`D-002`).
- **Better article narrative.** "The entire creative pipeline runs on Amazon foundation models on Amazon infrastructure" is a stronger line for AWS judges than mixing in a third party.

Verified working end to end before committing to it: a real Converse call returned the expected output. No console request was needed — access was already in place.

### D-029 · Nova Canvas is a risk, and there is no fallback
**Decided:** Aug 21 · unresolved
`amazon.nova-canvas-v1:0` invoke returns `ResourceNotFoundException` despite appearing in `list-foundation-models`. That is the per-account access gate, not a bad model id. The model carries `modelLifecycle.status: LEGACY` and has no `us.` inference profile, so on-demand invoke is the only route in.

Checked for a substitute and there isn't one. Of the 14 IMAGE-modality models available, 13 are Stability editing tools that all require an input image — upscale, inpaint, outpaint, remove-background, style-transfer, control-sketch, search-replace. None is a text-to-image generator. Titan Image Generator is no longer offered.

Consequence: **illustrations are at risk and text is the deliverable.** This is survivable only because `D-0xx` failure handling already specifies that a failed image publishes `image_key: null` and the UI renders a mood gradient for it. Removed the stale Titan fallback from the IAM policy and four docs rather than leaving instructions that point at a model that doesn't exist.

Also worth recording: `bedrock:InvokeModel` in an IAM policy and Bedrock model access are two independent gates. `backend/scripts/bedrock-check.mjs` exists to tell them apart, because `AccessDeniedException` from the console grant looks nothing like an IAM failure and wastes an hour otherwise.

### D-030 · `us.amazon.nova-lite-v1:0` for text, chosen by measurement
**Decided:** Aug 21 · supersedes the Nova Pro choice in `D-028`
Nova Pro produced 147 words of a requested 180–220, and an earlier run returned free verse when asked for prose. So instruction-following got measured instead of assumed: `agent/scripts/probe_one.py` runs the real create prompt and checks word count and prose-vs-verse.

| Model | Words | In range | Prose |
|---|---|---|---|
| `us.amazon.nova-lite-v1:0` | 214 | ✅ | ✅ |
| `qwen.qwen3-32b-v1:0` | 207 | ✅ | ✅ |
| `zai.glm-4.7` | 210 | ✅ | ✅ |
| `deepseek.v3.2` | 222 | ✗ | ✅ |
| `global.amazon.nova-2-lite-v1:0` | 174 | ✗ | ✅ |
| `amazon.nova-pro-v1:0` | 147 | ✗ | ✅ |

**The bigger model was the worse instruction-follower.** Nova Lite wins on adherence and latency and keeps the pipeline on Amazon models. `TEXT_MODEL_ID` is an env var so the alternatives are a config change.

Two process lessons worth keeping:
- The first probe reloaded modules between candidates in one process and **silently reported one model's output under another's name** — the Bedrock client is built at module scope from config read at import. Deleted it; one process per model is the only trustworthy method.
- A leftover `$env:TEXT_MODEL_ID` from a previous command in the same shell overrode the config default and produced a confusing Legacy error. Env vars persist across commands in a PowerShell session.

### D-031 · Nova Canvas is unobtainable — the agent ships text-first
**Decided:** Aug 21 · resolves `D-029`
The real invoke gave the definitive reason:

> Access denied. This Model is marked by provider as Legacy and you have not been actively using the model in the last 30 days.

Access is grandfathered to accounts already using the model before it was marked legacy. **No console request will open it**, so this is settled rather than pending. `amazon.nova-premier-v1:0` is denied the same way.

There is no substitute: of the 14 IMAGE-output models available, the 13 Stability ones all take `TEXT+IMAGE` input and are editing tools — upscale, inpaint, outpaint, style-transfer, control-sketch — requiring a source image. None generates from text alone.

Consequence: capsules publish text-only with `image_key: null`, which the UI already renders as an intentional mood gradient. The Canvas ARN stays in the IAM policy so the agent starts illustrating the day access appears, with no code change.

### D-032 · Zero third-party dependencies in the agent
**Decided:** Aug 21
`requirements.txt` is empty. boto3 comes from the Lambda runtime, and the weather call uses `urllib.request` instead of `requests`.

This drops the one dependency the plan originally carried. `sam build` now produces a package of pure source files — no pip step, no layer, no wheel that might not match arm64 Amazon Linux. It removes a whole category of deployment failure for the cost of a slightly more verbose HTTP call.

Related: `sense._local_now()` computes the timezone by fixed offset rather than `zoneinfo.ZoneInfo("Asia/Kolkata")`, because the Lambda Python runtime ships without tzdata and `ZoneInfo` raises there. That one would only have surfaced after deploying.

### D-033 · Empty memory must be stated, not omitted
**Decided:** Aug 21
The plan said to omit the recent-work block when memory is empty, on the grounds that "Recent work: none" is noise. In practice the model filled the gap by inventing a back catalogue — on the very first run it justified its choice as balancing "the recent series of uplifting themes" that had never existed.

Since `reasoning` is displayed in the UI as evidence of a real decision, a fabricated one is worse than none. Now an explicit block states this is the first piece and forbids referring to earlier work.

### D-034 · Typographic SVG posters as the visual, since no image model is reachable
**Decided:** Aug 21 · follows from `D-031`
With Nova Canvas unobtainable and no text-to-image substitute, capsules would have shipped text-only — a real quality loss, since the visual is what makes the site look finished to an evaluator.

`agent/poster.py` composes an SVG poster instead: mood-derived palette, one of three rotating layouts, the theme set large, the title and pull-quote, and a footer of season/location/mood. About 2.4 KB per capsule.

Chosen over the alternatives:
- **Pillow** would give a real raster image, but ships compiled C extensions that must match arm64 Amazon Linux, needs `sam build --use-container`, and requires bundling a `.ttf` because the Lambda runtime has almost no fonts. Roughly an hour of packaging risk.
- **A hand-rolled PNG writer** is easy for gradients and shapes but text needs font rasterisation, which is the whole reason Pillow exists.
- **An external image API** would send prompts off-platform and undercut the all-AWS architecture.

SVG keeps `requirements.txt` empty, produces 2 KB instead of 1.4 MB, and stays crisp at any size. The one constraint: an SVG in an `<img>` tag is sandboxed and cannot load external fonts, so only web-safe families are used.

**Honesty is the load-bearing part.** `meta.image_kind` is `"poster"`, the UI captions it "Typographic poster composed by the agent", and `image_prompt` is left null because no art prompt was used. The article must describe it the same way. A judge can open the SVG source; claiming generated artwork would be far worse than the constraint itself. The design decisions are still the agent's, since palette and layout follow the mood it chose.

A diffusion image always takes precedence when available, so the day Canvas access appears the poster stops being used with no code change.

### D-035 · Poster canvas is landscape 1382×896, and wrap budgets are computed
**Decided:** Aug 21
Requested change from 1024×1280 portrait to **1382×896** landscape — width ×1.35, height ×0.7.

Checking the arithmetic exposed a real bug in the original: wrap budgets were **hardcoded character counts never validated against pixel width**. The theme wrapped at 64 characters, but 64 characters of Georgia at 62px is roughly 2100px on a 1024px canvas. Short themes happened to fit, so it looked fine; a long one ran off the edge silently.

Now `chars_that_fit(available_px, font_size)` derives the budget from the canvas, and two tests assert no text baseline falls outside the canvas and no line overruns the content width — checked against deliberately overlong input across all three layouts.

Frontend consequences of going landscape:
- `web/src/lib/poster.ts` mirrors the dimensions, applied as an inline `aspectRatio` rather than a Tailwind class. Tailwind scans source statically, so a class built from constants at runtime never reaches the stylesheet.
- Images switched from `object-cover` to **`object-contain`**. Cover crops, and cropping a typographic poster cuts off words — the one thing it cannot survive.
- The capsule hero stacks instead of splitting into columns; a landscape poster in a half-width column renders too small to read.
- Archive thumbnails use the same ratio for the same cropping reason.

Theme lines are capped at two, since 896px of height leaves less room for three blocks than 1280 did.

Two defects the work surfaced:
- **Layout was picked by hash**, which guarantees nothing about variety — one sample week landed on the same layout five days running. Now rotated by calendar day so consecutive capsules always differ. Texture and palette still vary by hash.
- **The preview script computed its own label** with the old formula while the renderer used the new one, so the contact sheet reported layouts that weren't what it displayed. A derived value computed twice will eventually disagree.

XML escaping is not optional here: theme, title and quote are all model output, and one unescaped ampersand yields an SVG that renders as nothing. Covered by tests, including an injected `<script>` tag.

### D-036 · Deployed with boto3 scripts, not `sam deploy`
**Decided:** Aug 21
Two hard blockers made SAM impossible: the **SAM CLI is not installed** on this machine, and **neither available identity has `cloudformation:CreateStack`** — verified with `simulate-principal-policy` rather than guessed.

So provisioning is two idempotent boto3 scripts:
- `infra/provision.py` — buckets, OAC, CloudFront, bucket policies
- `infra/deploy_agent.py` — package, execution role, function, DLQ, scheduler role, schedule

`infra/template.yaml` still exists and describes the same resources for anyone who has SAM and CloudFormation rights. The design principle held — everything is in code and reproducible from a clone — it just isn't CloudFormation.

### D-037 · Cross-region inference profiles need model ARNs in every routed region
**Decided:** Aug 21
The first scheduled run failed with:

> not authorized to perform: bedrock:InvokeModel on resource: arn:aws:bedrock:**us-west-2**::foundation-model/amazon.nova-lite-v1:0

A `us.` inference profile is **cross-region**: it may route to any US region in the profile, and authorisation is evaluated against the foundation-model ARN in whichever region actually serves the call. The policy listed only `us-east-1`.

Now `us-east-1`, `us-east-2` and `us-west-2` are all listed for the routed models, with the inference-profile ARN kept to `us-east-1`.

**This class of bug cannot reproduce locally.** A developer's own user typically has `AmazonBedrockFullAccess`, so the scoped role is only ever exercised in deployment. Worth remembering for anything else that runs under a narrow role.

### D-038 · Inline policy, because the user hit the managed-policy quota
**Decided:** Aug 21
Attaching `DreamForgeDeployAgent` as a managed policy failed with `LimitExceeded` — the DreamForge user already had **10 attached managed policies, which is the AWS per-user quota**.

Applied as an **inline** policy instead (1101 characters against a 2048 limit for users), which doesn't count toward that quota. The alternative was detaching something like `AWSAppRunnerFullAccess`, which would have made an unrelated decision on the user's behalf.

The added grants are narrow on purpose: `iam:CreateRole`/`PutRolePolicy` scoped to `role/dreamforge-*`, `AttachRolePolicy` restricted to exactly `AWSLambdaBasicExecutionRole`, and `iam:PassRole` fenced by `iam:PassedToService` to lambda and scheduler. Unrestricted `CreateRole` plus `AttachRolePolicy` is an account-takeover credential, not a deploy credential.

### D-039 · Two deployment-only failures worth recording
**Decided:** Aug 21
Neither could surface locally:

- **IAM role descriptions reject non-Latin-1 characters.** An em dash in the description failed with an opaque regex validation error. Descriptions are ASCII now.
- **Lambda validates the execution role's permissions at create time**, and a role policy written seconds earlier is not always visible. The error reads "does not have permissions to call SendMessage on SQS", which looks like a policy bug rather than a timing one. `_with_iam_propagation` retries for it explicitly.

### D-040 · Under-length drafts get one retry
**Decided:** Aug 21
The first real published capsule was **66 words against a 180–220 target**. Stating the range in the prompt is not sufficient — compliance varies run to run, and earlier runs had produced 193 and 175.

`_ensure_length` now checks the word count against a per-form minimum and retries once with the actual count quoted back, asking for added substance rather than padding. Measured across four runs afterwards: 112→148, 98→206, and two that needed no help.

One retry, and the longer draft is only taken if it genuinely helped. It must not become a loop — the same reasoning as the critique pass in `D-005`.

Also raised the poem minimum from 60 to 90 words; a 71-word poem read thin against the layout.

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
