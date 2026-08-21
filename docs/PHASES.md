# Build Phases

**Window:** Aug 21, 2026 12:00 AM PT → Aug 24, 2026 1:00 PM PT

Ordering principle: **get one real autonomous run on AWS as early as possible, then make it good.** A deployed ugly agent on Friday night is a submission; a beautiful local prototype on Sunday night is not.

---

## Phase 0 · Unblock (30 min, do this first)

Everything else waits behind these. Do them before writing a line of code.

- [ ] Bedrock console → **request model access** for Anthropic Claude 3.5 Sonnet and Amazon Nova Canvas in `us-east-1`
- [ ] Confirm access is `Granted`, not `Pending`
- [ ] `aws sts get-caller-identity` works from the terminal
- [ ] `sam --version` and `node --version` present
- [ ] Create the public GitHub repo, push this docs folder

> If Nova Canvas access is pending past an hour, switch to `titan-image-generator-v2` and move on. Do not wait.

---

## Phase 1 · Friday — Prove the pipeline works

**Goal by end of day: a scheduled Lambda has published one real capsule to S3.**

### 1.1 Bedrock smoke test (45 min)
- [ ] `scripts/smoke_text.py` — one Converse call, print the response
- [ ] `scripts/smoke_image.py` — one Nova Canvas call, save the PNG locally
- [ ] Open the PNG. Confirm it looks like something.

Do this before any infrastructure. Model access and payload shape are the two things most likely to burn an hour, and they're cheapest to debug locally.

### 1.2 Infrastructure skeleton (1 hr)
- [ ] `infra/template.yaml` — Lambda, both S3 buckets, DynamoDB table, IAM role
- [ ] `sam build && sam deploy --guided`
- [ ] Handler returns `{"ok": true}`; invoke it and see that in CloudWatch

### 1.3 Agent v1 — the straight line (2 hrs)
- [ ] `sense.py` with weather + fallback
- [ ] `decide.py` — Claude returns theme/mood/form JSON
- [ ] `create.py` — text + image
- [ ] `publish.py` — write image, `2026-08-21.json`, `latest.json` to S3
- [ ] Invoke manually → confirm all three objects exist in S3

Skip `recall` and `critique` for now. Straight line first.

### 1.4 Turn on autonomy (30 min)
- [ ] Add EventBridge Scheduler to the template
- [ ] Set it to fire **5 minutes from now** as a test, not 08:00
- [ ] Walk away. Come back. Confirm a capsule appeared with `trigger: eventbridge.schedule`
- [ ] Reset the cron to the real daily 08:00

🎯 **Friday checkpoint: the autonomy gate is passed.** Everything from here is quality, not eligibility. If you stop now you still have a valid submission.

---

## Phase 2 · Saturday — Make it an agent, and make it visible

### 2.1 Memory + self-critique (2 hrs)
- [ ] DynamoDB write in `publish.py`
- [ ] `recall.py` — query last 7, feed recent themes into `decide`
- [ ] `critique.py` — independent scoring call
- [ ] Revise-once branch
- [ ] Verify: run twice, confirm the second run picks a different theme

This is the step that turns the project from a generator into an agent. It's also the most quotable part of the article. Don't skip it for UI polish.

### 2.2 Structured logging (30 min)
- [ ] One JSON log line per step, with `elapsed_ms`
- [ ] `human_input=none` and `trigger` on the first line
- [ ] Confirm the log reads well in CloudWatch — you're pasting it into the article

### 2.3 Frontend (3 hrs)
- [ ] `npm create vite@latest web -- --template react-ts`, Tailwind
- [ ] `types.ts` mirroring the capsule contract
- [ ] Hero: date, theme badge, image, title, story, quote
- [ ] Agent status panel: last run, next run, trigger source, critique score
- [ ] Archive strip reading `index.json`
- [ ] **No generate button. Anywhere.** That absence is a feature.

### 2.4 Ship the site (1 hr)
- [ ] CloudFront + OAC for both buckets in the template
- [ ] `npm run build`, sync to web bucket
- [ ] Open the live URL on your phone. Fix whatever looks wrong there.

🎯 **Saturday checkpoint: a public URL shows autonomously generated content.**

---

## Phase 3 · Sunday — Evidence, polish, submit

Submit by **Sunday evening**, not Monday 1 PM. The 101-submission cap rewards being early, and you want buffer for a failed deploy.

### 3.1 Collect evidence (1 hr)
- [ ] Let the 08:00 schedule fire on its own. Do not touch it.
- [ ] Screenshot the EventBridge schedule config
- [ ] Copy the full CloudWatch log for that run
- [ ] Screenshot S3 showing multiple dated capsules
- [ ] Screenshot the site showing an archive of several days

Multiple days of history is the strongest possible proof. If you only have one, backfill by invoking manually on earlier dates — but keep `meta.trigger` honest about which runs were scheduled.

### 3.2 Repo quality (1 hr)
- [ ] Architecture diagram as an image in `docs/` (draw.io or Excalidraw)
- [ ] README: live URL at the top, screenshot below it
- [ ] `.env.example`, no real credentials anywhere
- [ ] `git log` is clean; repo is public; clone it fresh and check nothing's missing

### 3.3 The article (2 hrs)
- [ ] Title exactly: `Weekend Creative Agent Challenge: Creative Pulse`
- [ ] Tag: `agents`
- [ ] 500+ words across all six required sections
- [ ] Autonomous generation log pasted in
- [ ] Architecture diagram embedded
- [ ] Both links: live app **and** public repo

Checklist and outline: [`SUBMISSION.md`](SUBMISSION.md)

### 3.4 UI polish — only if time remains (1 hr)
- [ ] Fade-in on the daily reveal
- [ ] Open Graph tags so shared links show the image
- [ ] Loading skeleton
- [ ] Favicon

### 3.5 Final pass (30 min)
- [ ] Live URL loads in a private window
- [ ] Archive links all resolve
- [ ] No console errors
- [ ] Article links both work
- [ ] **Submit**

---

## Nice-to-have — explicitly parked

Not in scope this weekend. Listed here so the *decision* to cut them is on record, which reads much better in the article than silence.

| Idea | Why parked |
|---|---|
| Ambient audio generation | Another model, another format, hours of debugging for one bullet |
| Multiple cities | Multiplies runs and cost, adds nothing to the three gates |
| Email/RSS subscription | SES sender verification alone can eat an afternoon |
| Human voting on capsules | Adds an API, a database write path, and abuse surface |
| Bedrock Agents migration | The custom loop is more explainable, which is the actual goal |
| Video generation | Not finishable in a weekend |

---

## Cut order under time pressure

If Sunday gets tight, drop from the bottom up:

```
1. Article + evidence       ← never cut, this is the submission
2. Autonomous scheduled run ← never cut, this is the category
3. Live public site         ← strongly keep
4. Memory + self-critique   ← keep if at all possible; it's the "agent" claim
5. Archive view             ← droppable
6. Animations, OG tags      ← drop first
```
