---
inclusion: manual
---

# Writing the Submission Article

Pull this in with `#article` when drafting or editing the submission post. Full outline in `docs/SUBMISSION.md`.

## Non-negotiables

- Title, character for character: `Weekend Creative Agent Challenge: DreamForge`
- Tag: `agents`
- 500+ words minimum — count it, don't estimate
- Six sections: Vision & What It Does · How You Built It · AWS Services / Architecture · What You Learned · Evidence · Links
- Both links present: live app **and** public repo

Getting the title format wrong is a disqualification, not a deduction. Check it last, before submitting.

## Lead with autonomy

The first paragraph must make clear that nobody triggers this. That's the category. Open on the contrast — most AI tools wait for you, this one doesn't — and mention that the site has no generate button because there's nothing for a visitor to initiate.

## Show, don't claim

Every autonomy claim gets evidence next to it:

| Claim | Evidence |
|---|---|
| Runs autonomously | CloudWatch log with `human_input=none` and a timestamp |
| Runs daily | S3 listing / site archive with multiple dated capsules |
| Uses AWS | Architecture diagram with the seven services |
| Actually works | Live URL |
| Makes decisions | The agent's own `reasoning` string for a real theme |

Multiple days of history is the single strongest artifact available. It can't be produced by one manual run.

## Source material already exists

Don't write from scratch:

- Section 2 challenges → the `D-xxx` entries in `docs/MEMORY.md` are already "problem + how I solved it"
- Section 3 architecture → `docs/ARCHITECTURE.md`, including the *deliberately not used* table
- Section 4 learnings → the reasoning paragraphs in `docs/TECH_STACK.md` and `docs/AGENT_WORKFLOW.md`
- The "why this is an agent" paragraph → already written at the end of `docs/AGENT_WORKFLOW.md`

## Tone

Plain and specific. Concrete numbers over adjectives — "45 seconds end to end, seven AWS services, one revision pass" beats "incredibly powerful". No hype, no exclamation marks, no "revolutionary".

Name what you cut and why. "I skipped API Gateway because nothing needs to call the agent" reads as judgement and doubles as an autonomy argument. A list of everything built reads as a feature dump.

Write about the things that went wrong. The rain-repetition problem and the self-critique that wouldn't criticise are the most interesting content in the whole submission, and they're what makes it read as engineering rather than a demo.

## Honesty

Never describe a manually-invoked run as scheduled. If the archive was partly backfilled, `meta.trigger` records that, and the log you paste must be from a genuine scheduled run. The evidence is checkable — an inflated claim is a much worse outcome than a modest true one.

## Before publishing

- [ ] Title exact, including the colon
- [ ] `agents` tag applied
- [ ] Word count over 500
- [ ] All six sections present
- [ ] Diagram embedded and legible at article width
- [ ] Log pasted as a code block, not a screenshot of text
- [ ] Both links opened from the published page, in a private window
- [ ] Read it once as a judge on their fortieth submission: what it creates, who triggers it, which AWS services, does it work — all four answerable in fifteen seconds
