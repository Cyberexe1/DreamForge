# Product: DreamForge

An autonomous creative agent. Every morning at 08:00 IST it publishes a **Daily Creative Capsule** — a theme it chose, an AI image, a ~200 word story or poem, and a quote — with no human involvement.

Built for the Weekend Creative Agent Challenge (Aug 21–24, 2026).

## The one rule that outranks everything

**No human initiates generation. Ever.**

The challenge requires creative output "without manual user initiation." This is the eligibility gate, so it wins every design argument.

Concretely:
- ❌ Never add a generate/create/regenerate/"run now" button to the frontend
- ❌ Never add an API endpoint, Function URL, or any callable path that triggers the agent
- ❌ Never add form inputs that shape the output
- ✅ The frontend is strictly read-only: it fetches JSON and renders it
- ✅ Manual runs happen through the AWS CLI only, tagged `meta.trigger = "manual.cli"`

If a request would create a user-triggered generation path, say so and propose the read-only alternative instead of building it.

This applies to the dashboard too. The dashboard observes published output — it has no control that can start a run, schedule one, or influence what gets made.

## Accounts are real, and separate from the agent

`backend/` is a Node/Express API storing users in DynamoDB with bcrypt-hashed passwords (`D-022`). It is **not** Cognito, by request.

The hard boundary: the backend knows about users and bookmarks. It has no path to the agent — no invoke permission, no shared queue, no shared table. The agent is started by its schedule alone. Any change that gives the API a way to reach the agent breaks the submission's core claim and must be refused.

Security rules that are not negotiable, since real credentials are involved:
- Passwords only ever hashed through `backend/src/lib/password.js`. Never store, log, or return plaintext.
- `passwordHash` never leaves `backend/src/repositories/users.js` — everything goes through `toPublicUser()`.
- Login returns one identical error for unknown email and wrong password.
- `JWT_SECRET` comes from Secrets Manager in AWS, never from the SAM template or a plain env var.
- Never log passwords, tokens, or hashes. User IDs only.

## Autonomy must stay provable

Every capsule records `meta.trigger`. Scheduled runs are `eventbridge.schedule`; anything else is honestly labelled. Never fake a trigger value — the archive is the submission's evidence.

Every step logs one structured line, with `human_input=none` on the trigger line. Those logs are a deliverable, not debug output. Don't strip or quieten them.

## It must be an agent, not a generator

The loop senses, recalls, decides, creates, critiques, revises, publishes. Theme, form, and art direction are **chosen by the model**, never selected from a hardcoded list. If a change would replace a model decision with a lookup table, flag it — that's the difference the project is judged on.

## Publishing beats perfection

The agent must produce something every single day.

- Weather API down → publish with less context
- Memory query fails → publish without memory
- Image fails → publish text-only, `image_key: null`
- Story scores 6/10 → publish it, record the score

The only unrecoverable failure is losing the text. Every other input needs a fallback. A stale site beats a broken site; partial output beats no output.

## Scope discipline

Three days, and only the first 101 qualifying submissions are prize-eligible. Finished and autonomous beats ambitious and broken.

Before adding anything, ask whether it serves one of the three gates: autonomous creative output, AWS usage, or the 500+ word article. If not, it goes in the *Nice-to-have* table in `docs/PHASES.md` rather than into the code.
