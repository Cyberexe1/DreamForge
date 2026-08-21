# Deployment

Region is **`us-east-1`** everywhere. Don't mix regions — Bedrock model availability differs and cross-region calls are a needless failure mode.

---

## Prerequisites

| Tool | Check |
|---|---|
| AWS CLI v2, configured | `aws sts get-caller-identity` |
| AWS SAM CLI | `sam --version` |
| Python 3.12 | `python --version` |
| Node 20+ | `node --version` |

### Bedrock model access — do this first

Bedrock models are **off by default.** Nothing in this project works until access is granted.

1. Bedrock console → `us-east-1` → **Model access**
2. Request: `Amazon Nova Pro`, `Amazon Nova Canvas`
3. Wait for status **Granted** (usually a minute, occasionally longer)

Verify from the terminal before deploying anything:

```cmd
python scripts\smoke_text.py
python scripts\smoke_image.py
```

Nova Canvas is the only text-to-image model available in this account, so there is no fallback to switch to. If its access stays pending, build the text path first — the agent publishes text-only capsules correctly by design.

---

## Deploy the backend

```cmd
cd infra
sam build
sam deploy --guided
```

Answers for `--guided`:

| Prompt | Answer |
|---|---|
| Stack name | `dreamforge` |
| Region | `us-east-1` |
| Confirm changes before deploy | `N` |
| Allow SAM to create IAM roles | `Y` |
| Disable rollback | `N` |
| Save arguments to samconfig.toml | `Y` |

Subsequent deploys are just `sam build && sam deploy`.

Stack outputs — note these down:

```
ArtifactsBucketName    dreamforge-artifacts-<account>
WebBucketName          dreamforge-web-<account>
DistributionDomain     dxxxxxxxxxxxxx.cloudfront.net
FunctionName           dreamforge-agent
```

---

## Lambda environment variables

Set in `template.yaml`, not by hand in the console — console edits vanish on the next deploy.

```yaml
Environment:
  Variables:
    ARTIFACTS_BUCKET: !Ref ArtifactsBucket
    HISTORY_TABLE: !Ref HistoryTable
    DISTRIBUTION_ID: !Ref Distribution
    TEXT_MODEL_ID: amazon.nova-pro-v1:0
    IMAGE_MODEL_ID: amazon.nova-canvas-v1:0
    CITY: Mumbai
    LATITUDE: "19.0760"
    LONGITUDE: "72.8777"
    TIMEZONE: Asia/Kolkata
    MEMORY_WINDOW_DAYS: "7"
    CRITIQUE_THRESHOLD: "7"
    LOG_LEVEL: INFO
```

No secrets here. Open-Meteo needs no key and Bedrock uses the execution role, so there is nothing sensitive in this block — which is why there's no Secrets Manager in the stack.

---

## First manual run

Prove the agent works before trusting a schedule with it.

```cmd
aws lambda invoke --function-name dreamforge-agent --payload "{\"trigger\":\"manual.cli\"}" out.json
type out.json
```

Then verify all four things landed:

```cmd
aws s3 ls s3://dreamforge-artifacts-<account>/data/
aws s3 ls s3://dreamforge-artifacts-<account>/images/
aws dynamodb scan --table-name dreamforge-history --max-items 1
aws logs tail /aws/lambda/dreamforge-agent --since 10m
```

Download the image and actually look at it. An agent that publishes a corrupt PNG passes every automated check.

---

## Turn on autonomy

The scheduler is the single most important resource in the stack. Test it with a near-future cron so you find problems in minutes rather than tomorrow morning.

**Step 1 — temporary test schedule.** In `template.yaml`, set the cron to about five minutes ahead:

```yaml
ScheduleExpression: cron(35 14 * * ? *)
ScheduleExpressionTimezone: Asia/Kolkata
```

Deploy, then wait. Don't invoke anything.

```cmd
aws logs tail /aws/lambda/dreamforge-agent --follow
```

You're looking for one line:

```
trigger source=eventbridge.schedule human_input=none
```

That line is the challenge's core requirement, demonstrated. Screenshot it.

**Step 2 — real schedule.**

```yaml
ScheduleExpression: cron(0 8 * * ? *)
ScheduleExpressionTimezone: Asia/Kolkata
```

Redeploy. Confirm in the EventBridge Scheduler console that **Next invocation** shows tomorrow 08:00 IST.

---

## Deploy the frontend

```cmd
cd web
npm install
npm run build

aws s3 sync dist/ s3://dreamforge-web-<account>/ --delete
aws cloudfront create-invalidation --distribution-id <dist-id> --paths "/*"
```

`web/.env.production`:

```
VITE_DATA_BASE=https://dxxxxxxxxxxxxx.cloudfront.net
```

The frontend has read-only credentials to nothing — it fetches public JSON over HTTPS. There's no key in the bundle because there's nothing for it to authenticate to.

---

## Verify end to end

```cmd
curl https://dxxxxxxxxxxxxx.cloudfront.net/data/latest.json
```

- [ ] Site loads at the CloudFront URL
- [ ] Today's capsule renders: image, title, story, quote
- [ ] Agent status panel shows last run and next run
- [ ] Archive strip lists previous days and the links resolve
- [ ] No console errors
- [ ] Loads correctly on a phone
- [ ] `meta.trigger` reads `eventbridge.schedule` on scheduled capsules

---

## Local development

The agent runs locally against real AWS — no emulators, no LocalStack. Bedrock has no local mode, so faking the rest buys nothing.

```cmd
set ARTIFACTS_BUCKET=dreamforge-artifacts-<account>
set HISTORY_TABLE=dreamforge-history
set AWS_REGION=us-east-1
python -m agent.local_run
```

`local_run.py` calls the same handler with `trigger: "local.dev"` and writes to a `dev/` prefix in S3 so experiments never touch the real archive or the real memory table.

Frontend:

```cmd
cd web
npm run dev
```

Point `VITE_DATA_BASE` at the live CloudFront domain and develop the UI against real capsules.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `AccessDeniedException` on Bedrock | Model access not granted | Bedrock console → Model access |
| `ValidationException: model not supported` | Wrong region or wrong model ID | Confirm `us-east-1` and exact ID string |
| `ThrottlingException` | On-demand Bedrock limit | Backoff is built in; retry |
| Task timed out at 120s | Image call hung | Confirm timeout is 120 s, memory 1024 MB |
| Image is a garbled mess of letters | `no text` missing from prompts | See [`PROMPTS.md`](PROMPTS.md) |
| Schedule never fires | Scheduler role can't invoke Lambda | Check the scheduler's IAM role in the template |
| Site shows yesterday's capsule | CloudFront cache | Confirm the run's invalidation succeeded |
| 403 from CloudFront | OAC bucket policy missing | Redeploy; SAM writes the policy |
| `json.decoder.JSONDecodeError` | Model wrapped JSON in fences | Use the shared `parse_json` helper |

---

## Teardown

```cmd
aws s3 rm s3://dreamforge-artifacts-<account> --recursive
aws s3 rm s3://dreamforge-web-<account> --recursive
cd infra
sam delete --stack-name dreamforge
```

⚠️ Those `s3 rm --recursive` commands permanently delete every generated capsule and image, and `sam delete` removes the DynamoDB history table with it. There is no undo and no backup. **Only run this after the submission has been judged** — the archive is the evidence.
