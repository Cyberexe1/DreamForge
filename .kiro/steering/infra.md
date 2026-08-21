---
inclusion: fileMatch
fileMatchPattern: 'infra/**'
---

# Infrastructure Rules

One file: `infra/template.yaml`, AWS SAM. Everything is in code — the stack must be reproducible from a fresh clone.

## Resources, and nothing more

| Resource | Notes |
|---|---|
| `AWS::Serverless::Function` | Python 3.12, arm64, 1024 MB, 120 s timeout |
| `AWS::Scheduler::Schedule` | `cron(0 8 * * ? *)`, `Asia/Kolkata` — **the autonomy gate** |
| `AWS::S3::Bucket` ×2 | artifacts, web |
| `AWS::DynamoDB::Table` | on-demand billing |
| `AWS::CloudFront::Distribution` + OAC | public read for both buckets |
| `AWS::SQS::Queue` | DLQ for the function |
| IAM roles | scoped, inline |

Don't add API Gateway, Function URLs, Cognito, Step Functions, or a VPC. A Function URL in particular would create exactly the user-triggerable path the project is designed not to have.

## The schedule is the most important resource

Use **EventBridge Scheduler** (`AWS::Scheduler::Schedule`), not a classic `AWS::Events::Rule`. It has a real timezone field, so the cron reads `08:00` with `ScheduleExpressionTimezone: Asia/Kolkata` and there's no UTC arithmetic to get wrong.

Include a retry policy — Bedrock throttles occasionally:

```yaml
RetryPolicy:
  MaximumRetryAttempts: 2
  MaximumEventAgeInSeconds: 3600
```

While testing, set the cron a few minutes ahead to prove the trigger works, then set it back to `0 8`. Never leave a test cron in a committed template.

## IAM — specific ARNs only

`Resource: "*"` is not acceptable in this template. The Lambda role gets:

```yaml
bedrock:InvokeModel        → the two model ARNs, listed explicitly
s3:PutObject               → arn:...:artifacts/*
dynamodb:PutItem, Query    → the history table ARN
cloudfront:CreateInvalidation → the distribution ARN
```

Deliberately absent: **`s3:DeleteObject`** and **`s3:GetObject`**. The agent only writes new objects, so no bug or bad loop can destroy or read back the archive. Adding either needs a `D-xxx` entry in `docs/MEMORY.md` explaining why.

## Buckets

Both buckets:

```yaml
PublicAccessBlockConfiguration:
  BlockPublicAcls: true
  BlockPublicPolicy: true
  IgnorePublicAcls: true
  RestrictPublicBuckets: true
BucketEncryption: AES256
```

Public read happens through CloudFront **Origin Access Control**, never a public bucket policy and never legacy OAI. A public S3 bucket is the standard way a hackathon repo becomes a security writeup.

No `DeletionPolicy: Retain` on the artifacts bucket during the build — but also don't run teardown until after judging. The archive is the evidence.

## Env vars

All Lambda config comes from the template, referencing resources with `!Ref` / `!GetAtt`. Never hardcode a bucket name or account ID. Never set env vars by hand in the console — the next `sam deploy` erases them.

No secrets in this template. There are none in the design (Open-Meteo needs no key, Bedrock uses the role), so there's no Secrets Manager and no `NoEcho` parameter. Keep it that way.

## Outputs

Export what deployment needs:

```yaml
Outputs: ArtifactsBucketName, WebBucketName, DistributionDomain, DistributionId, FunctionName
```

## Changing the stack

Before deploying a change that touches CloudFront or the buckets, remember distribution updates take several minutes to propagate — don't queue those late Sunday.

Any new resource: update `docs/ARCHITECTURE.md`, `docs/DEPLOYMENT.md`, and the AWS services table in `README.md` in the same commit.

## Destructive operations

`sam delete` removes the DynamoDB history table and both buckets. `aws s3 rm --recursive` permanently deletes every generated capsule and image. There's no backup and no undo. Always confirm before running either — and not before the submission has been judged.
