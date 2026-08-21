# Tech Standards

Full rationale in `docs/TECH_STACK.md`. These are the rules to follow while writing code.

## Fixed choices — don't substitute

| Layer | Choice |
|---|---|
| Region | `us-east-1`, everywhere |
| Agent | Python 3.12, AWS Lambda (arm64, 1024 MB, 120 s) |
| Text model | `us.amazon.nova-lite-v1:0` via **Converse API** — chosen by measurement, see `agent/scripts/probe_one.py` |
| Image model | `amazon.nova-canvas-v1:0` — **no fallback exists in this account** |
| Storage | S3 (artifacts + web), DynamoDB (`dreamforge-history`) |
| Schedule | EventBridge Scheduler |
| IaC | AWS SAM, single `infra/template.yaml` |
| Frontend | React 18 + Vite 5 + TypeScript + Tailwind 3 |
| Weather | Open-Meteo (no API key) |

## Backend (`backend/`)

Node 20 + Express, ESM JavaScript. Runs locally via `src/server.js`, in AWS as a Lambda behind a **Function URL** via `src/lambda.js` and `serverless-http` — not API Gateway.

| Concern | Choice |
|---|---|
| Passwords | `bcryptjs` (pure JS, no native build), cost 12, SHA-256 pre-hashed first |
| Sessions | HS256 JWT, 2 h expiry, `jsonwebtoken` |
| Storage | DynamoDB `dreamforge-users`, partition key `email` |
| Headers / CORS | `helmet` + `cors` with an explicit origin allowlist |
| Tests | `node --test`, no framework |

`bcryptjs` not `bcrypt`: the native package compiles bindings that must match arm64 Amazon Linux, so a module built on Windows won't load in Lambda.

The SHA-256 pre-hash exists because bcrypt silently truncates at 72 bytes. Don't remove it — there's a test that proves the truncation is gone.

## Don't add

No agent frameworks (LangChain, CrewAI), no API Gateway, no Cognito, no Step Functions, no SQS/SNS beyond the DLQ, no RDS, no ORM. Agent deps are `requests` plus the runtime's `boto3`. If a task seems to need a new dependency, raise it before installing.

The frontend routes with a ~30-line hash router in `src/lib/router.ts`, not `react-router`. Hash routing also means CloudFront needs no SPA error-page rewrites.

## Python conventions

- Type hints on every function signature
- `dataclasses` for the capsule shape — no bare dicts crossing module boundaries
- One module per agent step under `agent/steps/`, each with a single public function
- Prompts live only in `agent/prompts.py`, never inlined at a call site
- All config from `os.environ` with explicit defaults, read once at module top
- Don't vendor `boto3` into the deployment package — the runtime provides it
- Pin dependencies exactly (`requests==2.32.3`), never with `>=`

## Logging

Structured JSON, one line per step, via the shared helper:

```python
log("decide", theme=theme, mood=mood, elapsed_ms=ms)
```

Never `print()`. Never log full story text, base64 image data, or credentials.

## Error handling

Catch narrowly. `except Exception` is only acceptable in a step whose documented behaviour is to degrade gracefully, and it must log the exception before falling back. Silent excepts are never acceptable — a swallowed error becomes a mystery at 8 AM tomorrow.

Bedrock `ThrottlingException` gets exponential backoff, 3 attempts. Other Bedrock errors fail fast.

## Bedrock rules

- Text calls always go through the Converse API, never `invoke_model` — one uniform shape means swapping models is a one-line change
- All model responses are parsed with the shared `parse_json` helper that strips markdown fences
- Temperature per step: `decide` 0.9, `create` 0.8, `critique` 0.2, `revise` 0.7
- The critique call must be a **fresh** call with no shared history. Never append it to the create conversation — a model reviewing its own work in-context always approves it.

## Security

- Buckets are private. Public access stays fully blocked; reads go through CloudFront OAC.
- The Lambda role gets no `s3:DeleteObject` and no `s3:GetObject`. The agent only writes.
- Scope IAM resources to specific ARNs, never `Resource: "*"`.
- No secrets in the repo, in env vars, or in logs. There are no secrets in this design — keep it that way.
- Never commit account IDs, `.env` files, or CloudFront distribution IDs.

## TypeScript conventions

- `web/src/types.ts` mirrors the capsule contract in `docs/ARCHITECTURE.md`. Change both in the same commit.
- No `any`. Narrow the fetched JSON at the boundary.
- Handle `image_key: null` — text-only capsules are a valid state, not an error.
- Capsules come from CloudFront via `src/api.ts`; accounts come from the Node API via `src/lib/backend.ts`. Two separate origins, never mixed.
- All auth state flows through `src/auth.ts`. Components read it with `useAuth()` and never touch the token.
