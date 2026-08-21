# IAM & Deployment Permissions

Ready-to-apply policy documents live in [`infra/iam/`](../infra/iam). Replace `<ACCOUNT_ID>` and `<DISTRIBUTION_ID>` before use — never commit the real values.

---

## ⚠️ Read first: App Runner eligibility

**AWS App Runner stopped accepting new customers on April 30, 2026.** Accounts that hadn't onboarded before then cannot create services; existing customers continue unaffected. Every page of the App Runner developer guide now carries that notice.

Check before building anything: open the App Runner console in `us-east-1` and start creating a service. If it's refused, you need a different host for the backend.

### If you're not eligible

| Option | Effort | Cost at this scale | Notes |
|---|---|---|---|
| **Lambda + Function URL** | Lowest — `backend/src/lambda.js` already exists | ~$0 | Already written and documented in `backend/README.md` |
| **ECS Fargate + ALB** | Highest | ~$20/mo for the ALB alone | Real containers, real cost |
| **App Runner** | Low | **~$5–25/mo even idle** | Only if already onboarded |

### Cost correction

`TECH_STACK.md` claims "under $1/month". That was true with Lambda. **App Runner bills for a provisioned instance whether or not anyone visits** — roughly $5–25/month depending on size, and it does not sleep unless you explicitly pause the service. For one run a day and a handful of logins, that's the dominant line item in the whole project.

---

## The four identities

Keep these separate. One over-permissioned role is how a weekend project becomes an incident.

| Identity | Who assumes it | Purpose |
|---|---|---|
| `dreamforge-deployer` | You / CI | Creates and updates infrastructure |
| `dreamforge-apprunner-instance` | `tasks.apprunner.amazonaws.com` | The running backend's own permissions |
| `dreamforge-agent-execution` | `lambda.amazonaws.com` | The creative agent |
| `dreamforge-scheduler-invoke` | `scheduler.amazonaws.com` | Starts the agent daily |

Plus one resource policy: the S3 bucket policy granting CloudFront OAC read.

---

## 1 · Deployer

Two policies, deliberately split.

| File | Contents |
|---|---|
| `deployer-policy.json` | S3, CloudFront, DynamoDB, Lambda, Scheduler, App Runner, ECR, Secrets Manager, Bedrock, Logs, CloudFormation |
| `deployer-iam-policy.json` | IAM role/policy creation — **the dangerous one** |

### Don't use an IAM user if you can avoid it

Access keys are long-lived credentials that end up in shell history, `.env` files and screenshots. Prefer **IAM Identity Center** with a permission set, or an IAM role you assume with `aws sts assume-role`. Both give short-lived credentials. If you must use an access key, delete it the moment the project is judged.

### Why IAM permissions are split out

Anyone who can create a role and attach `AdministratorAccess` to it **is** an administrator, regardless of what else their policy says. `deployer-iam-policy.json` closes that path three ways:

- role creation only for names matching `dreamforge-*`
- role creation requires a **permissions boundary** (`DreamForgeBoundary`), so a created role can never exceed the deployer's own reach
- `iam:AttachRolePolicy` is restricted by `iam:PolicyARN` to project policies and two specific AWS managed ones
- `iam:PassRole` is restricted by `iam:PassedToService` to the four services that legitimately need it

Create the boundary policy first — a copy of `deployer-policy.json` is a reasonable boundary. Then detach `deployer-iam-policy.json` once the stack is stable. You only need it while roles are being created.

### The permission people forget

`iam:PassRole`. Creating a Lambda, an App Runner service or a schedule means handing a role to that service, and AWS treats that as a distinct privileged action. Without it you get `AccessDenied` on an otherwise correct `CreateFunction` call, and the message rarely says `PassRole`.

---

## 2 · App Runner instance role

`trust-apprunner-instance.json` + `apprunner-instance-policy.json`

Two permissions only:

- `GetItem`/`PutItem`/`UpdateItem`/`DeleteItem` on `dreamforge-users`
- `secretsmanager:GetSecretValue` on `dreamforge/jwt-secret-*`

**What must stay absent:**

| Absent | Why |
|---|---|
| `lambda:InvokeFunction` | The backend must have no path to the agent. The agent runs on its schedule alone — that's the submission's core claim. |
| Any access to `dreamforge-history` | That's the agent's memory, not the backend's business |
| `dynamodb:Scan` | Nothing needs a full table read; scans are also how a users table gets exfiltrated in one call |

### Two roles, two principals

This trips people up. App Runner uses **different service principals** for different jobs:

- `tasks.apprunner.amazonaws.com` — the **instance role**, what your code runs as
- `build.apprunner.amazonaws.com` — the **access role**, used to pull an image from ECR

You only need the access role if deploying a container. For it, use `trust-apprunner-build.json` and attach the AWS managed `AWSAppRunnerServicePolicyForECRAccess`.

App Runner also creates **service-linked roles** on its own; `iam:CreateServiceLinkedRole` for `apprunner.amazonaws.com` is in the deployer IAM policy for that.

### GitHub source deploys aren't fully automatable

If you deploy from a repo rather than a container, App Runner needs a **connection**, and the GitHub handshake is a console-only OAuth step. `apprunner:CreateConnection` gets you the resource; a human still has to authorise it in the console once.

---

## 3 · Agent execution role

`trust-lambda.json` + `agent-lambda-policy.json` + managed `AWSLambdaBasicExecutionRole`

Bedrock is scoped to the specific model ARNs — not `bedrock:*` on `*`. If Bedrock rejects a call asking for an inference profile, swap the foundation-model ARN for the matching `inference-profile` ARN and use the `us.`-prefixed model id.

Note the two absent permissions, both intentional: **no `s3:DeleteObject`, no `s3:GetObject`.** The agent only writes new objects. Scoping destructive access out entirely is cheaper than trusting the code never to use it, and the archive it writes is the evidence the submission rests on.

---

## 4 · Scheduler role

`trust-scheduler.json` + `scheduler-invoke-policy.json`

One action: `lambda:InvokeFunction` on `dreamforge-agent`. This role is the autonomy trigger — it's the thing that proves no human starts a run.

Both App Runner and Scheduler trust policies include an `aws:SourceAccount` condition. That guards against the confused-deputy problem, where another account persuades the service to assume your role on its behalf.

---

## 5 · CloudFront → S3

`bucket-policy-oac.json` — a **bucket** policy, not a role. Apply to both buckets.

Keep Block Public Access fully enabled on both. OAC gives identical public-read behaviour with no bucket exposure. The `AWS:SourceArn` condition is load-bearing: without it, any CloudFront distribution in any AWS account could read your bucket.

---

## Apply it

```cmd
set ACCT=<ACCOUNT_ID>

:: deployer policies
aws iam create-policy --policy-name DreamForgeDeploy ^
  --policy-document file://infra/iam/deployer-policy.json
aws iam create-policy --policy-name DreamForgeDeployIAM ^
  --policy-document file://infra/iam/deployer-iam-policy.json
aws iam create-policy --policy-name DreamForgeBoundary ^
  --policy-document file://infra/iam/deployer-policy.json

:: backend instance role
aws iam create-role --role-name dreamforge-apprunner-instance ^
  --assume-role-policy-document file://infra/iam/trust-apprunner-instance.json
aws iam put-role-policy --role-name dreamforge-apprunner-instance ^
  --policy-name backend --policy-document file://infra/iam/apprunner-instance-policy.json

:: agent role
aws iam create-role --role-name dreamforge-agent-execution ^
  --assume-role-policy-document file://infra/iam/trust-lambda.json
aws iam put-role-policy --role-name dreamforge-agent-execution ^
  --policy-name agent --policy-document file://infra/iam/agent-lambda-policy.json
aws iam attach-role-policy --role-name dreamforge-agent-execution ^
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

:: scheduler role
aws iam create-role --role-name dreamforge-scheduler-invoke ^
  --assume-role-policy-document file://infra/iam/trust-scheduler.json
aws iam put-role-policy --role-name dreamforge-scheduler-invoke ^
  --policy-name invoke --policy-document file://infra/iam/scheduler-invoke-policy.json
```

Strip the `_comment` keys first — they're documentation, and IAM rejects unknown top-level keys.

---

## The JWT secret

**Do not put `JWT_SECRET` in an App Runner environment variable or a SAM template.** Both are readable by anyone with describe access to the service, and a template lands in git.

```cmd
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))" > secret.txt

aws secretsmanager create-secret --name dreamforge/jwt-secret ^
  --secret-string file://secret.txt

del secret.txt
```

Reference it in App Runner as a **runtime environment secret**, which is why the instance role needs `secretsmanager:GetSecretValue`. Rotating the secret invalidates every session — that's intended.

---

## Bedrock model access is not IAM

Worth stating because it costs people an hour: `bedrock:InvokeModel` in a policy is necessary but **not sufficient**. Model access is granted per-account in the Bedrock console under **Model access**, and it's off by default. An IAM-correct call still fails with `AccessDeniedException` until the Amazon Nova models show `Granted` in `us-east-1`.

---

## Also update: CORS

Moving the backend to App Runner changes its origin, so the frontend's `VITE_API_BASE` becomes the App Runner service URL and the backend's `ALLOWED_ORIGINS` must be the CloudFront domain:

```
ALLOWED_ORIGINS=https://dxxxxxxxxxxxxx.cloudfront.net
```

Exact origins, comma separated, no wildcards. `backend/src/app.js` rejects anything not on the list rather than reflecting the `Origin` header.

### Worth considering: put the API behind the same CloudFront distribution

Add a second CloudFront behaviour routing `/api/*` to the App Runner service. Three benefits:

- the site and API share one origin, so CORS stops mattering
- it makes an **httpOnly `SameSite` cookie** viable, which removes the `localStorage`-token XSS exposure flagged in `backend/README.md`
- App Runner is no longer directly internet-facing

Cost is one extra behaviour and an origin. It's the single biggest security improvement available for the effort, and it directly addresses the weakest point in the current design.
