# DreamForge — Backend

Node.js API for accounts and per-user data. Express, DynamoDB, no Cognito.

This service is **entirely separate from the creative agent.** It stores users and their bookmarks. It cannot start a run, influence a theme, or reach the agent in any way — that separation is what keeps the autonomy claim intact.

---

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/health` | — | Liveness |
| `POST` | `/api/auth/signup` | — | Create account → `{ token, user }` |
| `POST` | `/api/auth/login` | — | Sign in → `{ token, user }` |
| `POST` | `/api/auth/logout` | — | No-op; tokens are stateless |
| `GET` | `/api/me` | Bearer | Profile + saved capsule dates |
| `PATCH` | `/api/me` | Bearer | Update display name |
| `PUT` | `/api/me/saved/:date` | Bearer | Bookmark a capsule |
| `DELETE` | `/api/me/saved/:date` | Bearer | Remove a bookmark |

---

## Security

Real credentials are stored here, so these are not optional.

### Password hashing — bcrypt

`bcryptjs` (pure JS) rather than the native `bcrypt` package. The native one compiles C++ bindings that must match the Lambda target, so a module built on Windows fails to load on arm64 Amazon Linux. Pure JS trades some speed for a package that deploys anywhere.

Work factor **12**, measured on this hardware:

| Cost | Hash | Verify |
|---|---|---|
| 10 | 141 ms | 114 ms |
| 11 | 237 ms | 203 ms |
| **12** | **432 ms** | **428 ms** |
| 13 | 872 ms | 760 ms |

Set `BCRYPT_COST=11` if login latency matters more than margin. 10 is the OWASP floor; below that the config clamps back to the default.

**Passwords are SHA-256 pre-hashed before bcrypt.** bcrypt silently discards everything past 72 bytes, so a long passphrase would have its tail ignored with no error. Hashing to a fixed-length digest first removes that cliff without weakening bcrypt — the digest keeps the full entropy of the input. Same construction as Passlib's `bcrypt_sha256`, which is why records are stored as `bcrypt-sha256$$2a$12$…`.

The stored format is self-describing, so `verifyPassword` also accepts plain `$2a$`/`$2b$` bcrypt and legacy `scrypt$` records. On a successful login, anything below the current scheme or cost is re-hashed transparently — no password resets, no migration script.

### Everything else

| Control | Implementation |
|---|---|
| Session | HS256 JWT, 2 h expiry, minimal claims (`sub`, `email`) |
| Token verification | Signature checked, then the user is re-read from DynamoDB, so a deleted account stops working immediately |
| Account enumeration | Login returns one identical error for unknown email and wrong password, and still spends hashing time on a missing account so timing doesn't leak |
| Brute force | 5 failed attempts per IP+email per 15 min |
| CORS | Explicit origin allowlist, never a reflected `Origin` |
| Headers | `helmet`, `x-powered-by` disabled |
| Body size | 8 kb ceiling |
| Uniqueness | Conditional `PutItem` on `attribute_not_exists(email)` — atomic, no read-then-write race |
| Secrets | `JWT_SECRET` required, min 32 chars, boot refused if a `dev-` secret reaches production |
| Logging | User IDs only. Never passwords, tokens, or hashes. |

### Known limitations — read before deploying

**The rate limiter is in-memory and per-process.** Behind several warm Lambda containers an attacker gets the allowance once per container. It raises the cost of credential stuffing; it is not a hard ceiling. Fix properly with a DynamoDB counter plus TTL, or AWS WAF rate rules in front of the Function URL.

**The token is stored in browser `localStorage`.** That is readable by any successful XSS. Mitigated by a 2 h expiry and by there being nothing sensitive behind it — bookmarks over public capsules. An httpOnly, `SameSite` cookie is the stronger option and would require the API and site on one origin (CloudFront behaviour routing).

**`JWT_SECRET` must not live in the SAM template or a plain Lambda env var.** Use Secrets Manager or an SSM SecureString and read it at cold start. Rotating it invalidates every session, which is the intended behaviour.

---

## Local development

```cmd
npm install
copy .env.example .env
```

Edit `.env` and generate a real secret:

```cmd
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Create the DynamoDB table (real AWS — there is no local emulator here):

```cmd
npm run tables:create
```

Run it:

```cmd
npm run dev          :: node --watch on http://localhost:4000
npm test             :: password hashing suite
npm run bench:bcrypt :: measure work factor on this machine
```

Needs valid AWS credentials in the environment (`aws configure`) and Node 20.6+ for `--env-file`.

### Smoke test

```cmd
curl http://localhost:4000/api/health

curl -X POST http://localhost:4000/api/auth/signup ^
  -H "Content-Type: application/json" ^
  -d "{\"name\":\"Ada\",\"email\":\"ada@example.com\",\"password\":\"a-long-enough-password\"}"
```

---

## DynamoDB — users table

Partition key **`email`** (lowercased). Email is the key because login is by email and it must be unique, which makes account creation a single conditional write with no race window. `userId` is a separate UUID so it stays stable if email changes are ever allowed.

| Attribute | Type | Notes |
|---|---|---|
| `email` | S | Partition key, lowercased |
| `userId` | S | UUID |
| `name` | S | Display name |
| `passwordHash` | S | `bcrypt-sha256$…` — never leaves the repository module |
| `createdAt` | S | ISO |
| `lastLoginAt` | S | ISO |
| `loginCount` | N | Atomic `ADD` |
| `savedDates` | L | Bookmarked capsule dates |

`toPublicUser()` in `src/repositories/users.js` strips `passwordHash`. Every value leaving that module goes through it, so a hash cannot reach a response body by accident.

---

## Deployment

Runs as a Lambda behind a **Function URL** (`src/lambda.js` via `serverless-http`). A Function URL rather than API Gateway: one less service for plain HTTPS request/response.

```yaml
BackendFunction:
  Type: AWS::Serverless::Function
  Properties:
    Handler: src/lambda.handler
    Runtime: nodejs20.x
    Architectures: [arm64]
    MemorySize: 512
    Timeout: 15
    Environment:
      Variables:
        NODE_ENV: production
        USERS_TABLE: !Ref UsersTable
        ALLOWED_ORIGINS: !Sub 'https://${Distribution.DomainName}'
        # JWT_SECRET from Secrets Manager — never inline
    FunctionUrlConfig:
      AuthType: NONE      # the app authenticates; the URL is public by design
    Policies:
      - DynamoDBCrudPolicy:
          TableName: !Ref UsersTable
      - AWSSecretsManagerGetSecretValuePolicy:
          SecretArn: !Ref JwtSecret

UsersTable:
  Type: AWS::DynamoDB::Table
  Properties:
    TableName: dreamforge-users
    BillingMode: PAY_PER_REQUEST
    AttributeDefinitions:
      - AttributeName: email
        AttributeType: S
    KeySchema:
      - AttributeName: email
        KeyType: HASH
    SSESpecification:
      SSEEnabled: true
    PointInTimeRecoverySpecification:
      PointInTimeRecoveryEnabled: true
```

⚠️ **This role must never get `lambda:InvokeFunction` on the agent.** The agent is started by its schedule alone. Nothing reachable from a browser may trigger it, or the submission's core claim breaks.

`AuthType: NONE` is correct here — it means the Function URL itself does not require IAM signing, which is required for a browser to reach it. Authentication happens inside the app.

---

## Structure

```
backend/
├─ src/
│  ├─ app.js                  express app: helmet, CORS, routes
│  ├─ server.js               local listener
│  ├─ lambda.js               Lambda handler via serverless-http
│  ├─ config.js               env read + validated once at boot
│  ├─ db.js                   DynamoDB document client
│  ├─ lib/
│  │  ├─ password.js          bcrypt + SHA-256 pre-hash, legacy verify
│  │  ├─ token.js             JWT sign/verify
│  │  └─ validate.js          input validation
│  ├─ middleware/
│  │  ├─ auth.js              bearer verification
│  │  ├─ rateLimit.js         failed-attempt limiter
│  │  └─ errors.js            central handler, no stack leakage
│  ├─ repositories/
│  │  └─ users.js             every DynamoDB access for users
│  └─ routes/
│     ├─ auth.js              signup, login, logout
│     └─ me.js                profile + saved capsules
├─ scripts/
│  ├─ create-tables.mjs
│  └─ bench-bcrypt.mjs
└─ test/
   └─ password.test.js
```

Only `repositories/users.js` touches DynamoDB. Only `lib/password.js` handles plaintext. Routes never see a hash.
