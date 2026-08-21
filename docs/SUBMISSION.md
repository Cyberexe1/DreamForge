# Submission

**Deadline:** Aug 24, 2026 · 1:00 PM PT
**Target:** submit Sunday evening. Only the first 101 qualifying submissions are prize-eligible, and early submission also leaves room for a failed deploy.

---

## Hard gates

Fail any of these and nothing else matters.

| # | Gate | Where it's satisfied |
|---|---|---|
| 1 | Creative output generated **without manual user initiation** | EventBridge Scheduler → Lambda. No generate button exists in the UI. |
| 2 | Uses at least one AWS service | Seven: EventBridge, Lambda, Bedrock, S3, DynamoDB, CloudFront, CloudWatch |
| 3 | Article, 500+ words, six sections | See outline below |
| 4 | Title format exact | `Weekend Creative Agent Challenge: DreamForge` |
| 5 | Tag | `agents` |
| 6 | Public repo **or** live app | Provide both |

---

## Article outline

Title, character for character:

```
Weekend Creative Agent Challenge: DreamForge
```

### 1 · Vision & What It Does (~120 words)

Open with the distinction, because it's the thing being judged:

> Most AI creative tools wait for you. You open them, type a prompt, press a button. DreamForge doesn't wait. At 8:00 every morning it wakes up on its own, looks at the date and the weather, remembers what it made last week, decides what today should be about, and publishes a piece of art and a short story about it. There is no generate button on the website, because there is nothing for a visitor to initiate. By the time you arrive, the work is already done.

Then: what a capsule contains (theme, image, story, quote), and why the daily rhythm makes it creative rather than mechanical — the constraint of *having to make something new about the same rain* is the interesting part.

### 2 · How You Built It (~150 words)

Development order, then the real obstacles. Pull these from [`MEMORY.md`](MEMORY.md) — they're already written:

- **Proving autonomy without waiting for tomorrow** (`D-014`) — set the cron five minutes ahead first, confirm `human_input=none` in the logs, then set the real 08:00.
- **The agent kept writing the same poem** (`D-006`) — rain dominates August context. Fixed with a 7-day DynamoDB memory the decision step must work around.
- **Self-critique that actually criticised** (`D-004`) — a model scoring its own work in-context always approves it. A fresh call with no authorship context scores honestly.
- **Bounding the improvement loop** (`D-005`) — one revision, no re-scoring. Publishing a 6/10 story on time beats publishing nothing.

### 3 · AWS Services / Architecture (~150 words)

Embed the diagram. Walk the path once:

```
EventBridge Scheduler → Lambda (7-step agent loop)
   → Bedrock: Nova Pro (decide, write, critique)
   → Bedrock: Nova Canvas (image)
   → S3 (image + capsule JSON) + DynamoDB (memory)
   → CloudFront → React
```

Then say what you deliberately left out and why — no API Gateway, no auth, no Step Functions. Naming the things you didn't build reads as judgement, and it also reinforces gate 1: there is no network path from the browser back to the agent.

Mention least privilege briefly: the agent's role has no `s3:DeleteObject`, so no bug can destroy the archive.

### 4 · What You Learned (~120 words)

Pick two or three with substance rather than listing technologies:

- Scheduled invocation is the whole difference between a generator and an agent, and it's about fifteen lines of template.
- Memory is what makes autonomous output feel authored. Without it, similar inputs produce similar work forever.
- Negative constraints in prompts outperform positive encouragement. "No cliches about rain" did more than any amount of "be creative."
- Designing for partial failure changes the architecture: an agent that must publish daily needs every non-essential input to have a fallback.

### 5 · Autonomous Generation Evidence

Paste a real CloudWatch log from a scheduled run:

```
08:00:00  trigger      source=eventbridge.schedule  human_input=none
08:00:01  sense        season=Monsoon temp=27C condition="Moderate rain"
08:00:02  recall       recent_themes=6 avoiding=["Monsoon Dreams","Concrete Silence"]
08:00:05  decide       theme="The Cartographer of Puddles" mood=playful-melancholy
08:00:12  create.text  title="The City That Waited for Rain" words=203
08:00:26  create.image model=nova-canvas bytes=1418204
08:00:31  critique     score=6 weakness="ending over-explains"
08:00:39  revise       pass=1 accepted=true
08:00:44  publish      s3=data/2026-08-21.json dynamodb=ok
08:00:45  complete     duration_ms=45120 revisions=1
```

Plus: EventBridge schedule screenshot, S3 listing with several dated capsules, and the site's archive showing multiple days. **Multiple days of history is the strongest evidence available** — it can't be faked with a single manual run.

### 6 · Links

```
🔗 Live: https://<cloudfront-domain>
💻 Repo: https://github.com/<user>/dreamforge
```

---

## Pre-submit checklist

**Autonomy**
- [ ] At least one capsule with `meta.trigger = eventbridge.schedule`
- [ ] EventBridge console shows a valid **Next invocation**
- [ ] No generate button, admin trigger, or callable endpoint anywhere in the UI
- [ ] CloudWatch log from a scheduled run saved

**Working product**
- [ ] Live URL loads in a private window
- [ ] Image, title, story, quote all render
- [ ] Archive links resolve
- [ ] No console errors
- [ ] Loads on mobile

**Repo**
- [ ] Public, and cloneable fresh with nothing missing
- [ ] README has live URL and a screenshot at the top
- [ ] Architecture diagram committed
- [ ] `infra/template.yaml` present — the whole stack is reproducible
- [ ] **No credentials, `.env`, or account IDs in any committed file**
- [ ] `.env.example` provided

**Article**
- [ ] Title exact, including the colon
- [ ] Tag `agents` applied
- [ ] 500+ words (check the count, don't estimate)
- [ ] All six sections present
- [ ] Diagram embedded, log pasted
- [ ] Both links open correctly from the published article

---

## Last check before you hit submit

Read the article as an evaluator who has already skimmed forty submissions and is looking for a reason to move on. In the first fifteen seconds they should be able to answer:

1. What does it create? → a daily story + image
2. Who triggers it? → nobody, EventBridge does, at 08:00
3. Does it use AWS? → visibly, seven services in one diagram
4. Does it actually work? → there's a live link and a timestamped log

If any of those four takes hunting, fix the article, not the code.
