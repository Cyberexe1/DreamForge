# Project Structure

```
Autonomous_Agent/
├─ agent/                    # Lambda — the creative agent
│  ├─ handler.py             # entrypoint, orchestrates the 7 steps, nothing else
│  ├─ steps/
│  │  ├─ sense.py            # world context   → never raises
│  │  ├─ recall.py           # read memory     → never raises
│  │  ├─ decide.py           # theme/mood/form/art_direction
│  │  ├─ create.py           # text + image
│  │  ├─ critique.py         # independent scoring
│  │  └─ publish.py          # S3 + DynamoDB + invalidation
│  ├─ bedrock.py             # Converse + image wrappers, backoff, parse_json
│  ├─ prompts.py             # every prompt, versioned
│  ├─ models.py              # Capsule / Context / Decision dataclasses
│  ├─ logging_util.py        # structured log()
│  ├─ config.py              # env vars read once
│  ├─ local_run.py           # local invoke, writes to dev/ prefix
│  └─ requirements.txt
├─ web/                      # React + Vite frontend (read-only)
│  ├─ src/
│  │  ├─ App.tsx             # route switch only
│  │  ├─ types.ts            # mirrors the capsule contract
│  │  ├─ api.ts              # fetch latest.json / index.json
│  │  ├─ auth.ts             # local session marker — NOT authentication
│  │  ├─ config.ts           # non-secret build-time config
│  │  ├─ mock.ts             # dev-only fixture
│  │  ├─ lib/
│  │  │  ├─ router.ts        # hash router
│  │  │  ├─ schedule.ts      # next run, IST formatting
│  │  │  ├─ mood.ts          # mood → gradient
│  │  │  └─ usePulseData.ts  # shared capsule + archive loader
│  │  ├─ pages/
│  │  │  ├─ Home.tsx
│  │  │  ├─ AuthPage.tsx     # login + signup, one component
│  │  │  └─ Dashboard.tsx    # read-only console
│  │  └─ components/
│  │     ├─ Header.tsx       # rounded floating bar, auth CTAs
│  │     ├─ Hero.tsx
│  │     ├─ CapsuleHero.tsx
│  │     ├─ AgentStatus.tsx  # last run, next run, trigger, score, reasoning
│  │     ├─ HowItWorks.tsx
│  │     ├─ ArchiveStrip.tsx
│  │     ├─ States.tsx       # loading skeleton + waiting state
│  │     └─ Footer.tsx
│  └─ .env.example
├─ backend/                  # Node API: accounts + per-user data
│  ├─ src/
│  │  ├─ app.js              # express wiring: helmet, CORS, routes
│  │  ├─ server.js           # local listener
│  │  ├─ lambda.js           # Lambda handler (Function URL)
│  │  ├─ config.js           # env read + validated at boot
│  │  ├─ db.js               # DynamoDB document client
│  │  ├─ lib/
│  │  │  ├─ password.js      # bcrypt + SHA-256 pre-hash — only plaintext handler
│  │  │  ├─ token.js         # JWT sign/verify
│  │  │  └─ validate.js
│  │  ├─ middleware/         # auth, rateLimit, errors
│  │  ├─ repositories/
│  │  │  └─ users.js         # only module that touches the users table
│  │  └─ routes/             # auth.js, me.js
│  ├─ scripts/               # create-tables, bench-bcrypt
│  └─ test/                  # node --test
├─ infra/
│  └─ template.yaml          # SAM: Lambda, schedule, buckets, tables, CDN, IAM
├─ scripts/
│  ├─ smoke_text.py
│  └─ smoke_image.py
├─ docs/
└─ .kiro/steering/
```

## Boundaries

**`handler.py` orchestrates, steps do work.** No Bedrock calls, no boto3 clients, and no business logic in the handler — it wires steps together and logs. If it grows past ~80 lines, logic has leaked into it.

**Steps don't call each other.** Each takes data in, returns data out. `handler.py` owns the sequencing. A step that imports another step is a design error.

**One boto3 client per service, created at module scope**, reused across warm invocations. Never inside a function.

**`bedrock.py` is the only module that talks to Bedrock.** Steps call its wrappers, never `boto3.client("bedrock-runtime")` directly.

**`web/` never imports from `agent/`.** The contract between them is the capsule JSON, documented in `docs/ARCHITECTURE.md`.

**Pages compose, components render.** Data loading lives in `pages/` via `usePulseData`; components take props and never fetch. `App.tsx` is a route switch and nothing else.

**In the backend, only `repositories/users.js` touches DynamoDB and only `lib/password.js` sees plaintext.** Routes never handle a hash. Every user object leaving the repository goes through `toPublicUser()`, which strips `passwordHash` — that single chokepoint is why a hash cannot leak into a response by accident.

**The backend has no path to the agent.** No invoke permission, no shared table, no shared queue. Keep it that way.

## Naming

- Python: `snake_case`, modules named for the step they implement
- React components: `PascalCase.tsx`, one component per file
- S3 keys: `data/YYYY-MM-DD.json`, `images/YYYY-MM-DD.png` — the date **is** the key
- Env vars: `SCREAMING_SNAKE_CASE`

## When adding a step

1. New module in `agent/steps/`, one public function
2. Its prompt (if any) goes in `prompts.py` with a version constant
3. Wire it into `handler.py`
4. Add its log line to the sequence in `docs/AGENT_WORKFLOW.md`
5. If it changes the capsule, update `models.py`, `web/src/types.ts`, and the contract in `docs/ARCHITECTURE.md` **in the same commit**

## Docs to keep current

| Change | Also update |
|---|---|
| Capsule shape | `docs/ARCHITECTURE.md`, `web/src/types.ts` |
| A prompt | `docs/PROMPTS.md` + bump its version constant |
| A non-obvious decision | `docs/MEMORY.md` — new `D-xxx` entry, same commit |
| A new AWS resource | `docs/ARCHITECTURE.md`, `docs/DEPLOYMENT.md`, README table |
| Finished a task | Tick the box in `docs/PHASES.md` |

`docs/MEMORY.md` is append-only. Superseding an old decision means adding a new entry, not editing the old one — the reasoning trail is what makes it useful, and it's the source material for the article's "challenges" section.
