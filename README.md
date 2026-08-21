# 🌧️ Creative Pulse

**An autonomous AI agent that creates a new piece of art + writing every single day — with zero human input.**

> Submission for the **Weekend Creative Agent Challenge** (Aug 21–24, 2026)

---

## What it is

Creative Pulse wakes up on its own every morning, looks at the real world (date, day, season, weather, location), decides what it feels like creating, and publishes a **Daily Creative Capsule**:

| Output | Description |
|---|---|
| 🎭 Theme | A creative direction the agent picks itself (e.g. *"A city waiting for the rain"*) |
| 🎨 Image | AI-generated artwork matching the theme |
| 📝 Story | A ~200 word short story or poem |
| 💬 Quote | A single original line, pull-quote style |

Nobody clicks "Generate". There is no generate button anywhere in the product. The website is a **gallery of what the agent already decided to make.**

```
Bad  ❌   user → click → AI output                  (an AI generator)
Good ✅   schedule → agent → decides → publishes    (an autonomous agent)
```

---

## The autonomy loop

```
        ┌──────────────────────────────┐
        │  EventBridge Scheduler       │
        │  cron: every day 08:00 IST   │
        └──────────────┬───────────────┘
                       ▼
        ┌──────────────────────────────┐
        │  Lambda: creative-agent      │
        │                              │
        │  1. sense    → world context │
        │  2. recall   → last 7 themes │
        │  3. decide   → theme + form  │
        │  4. create   → story + image │
        │  5. critique → self-score    │
        │  6. revise   → if score < 7  │
        │  7. publish  → S3 + DynamoDB │
        └──────────────┬───────────────┘
                       ▼
        ┌──────────────────────────────┐
        │  S3 + CloudFront → React app │
        └──────────────────────────────┘
```

The agent is not a single prompt call. It **senses, remembers, decides, self-critiques, and revises** before publishing. See [`docs/AGENT_WORKFLOW.md`](docs/AGENT_WORKFLOW.md).

---

## AWS services used

| Service | Role |
|---|---|
| **Amazon EventBridge Scheduler** | Fires the agent daily — this is the autonomy |
| **AWS Lambda** | Runs the agent loop (Python 3.12) |
| **Amazon Bedrock** | Claude for text, Nova Canvas for image |
| **Amazon S3** | Stores images + capsule JSON, hosts the frontend |
| **Amazon DynamoDB** | Agent long-term memory + generation history |
| **Amazon CloudFront** | Public delivery of site and artifacts |
| **Amazon CloudWatch Logs** | Autonomous-run evidence log |

Full diagram and data contracts: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

---

## Documentation map

| File | What's in it |
|---|---|
| [`docs/TECH_STACK.md`](docs/TECH_STACK.md) | Every dependency, version, and *why* it was chosen |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Diagram, data flow, S3 layout, DynamoDB schema, IAM |
| [`docs/AGENT_WORKFLOW.md`](docs/AGENT_WORKFLOW.md) | The 7-step agent loop in detail |
| [`docs/PROMPTS.md`](docs/PROMPTS.md) | All Bedrock prompts, versioned |
| [`docs/PHASES.md`](docs/PHASES.md) | Hour-by-hour weekend build plan with checkboxes |
| [`docs/MEMORY.md`](docs/MEMORY.md) | Project decision log + the agent's own memory design |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Deploy, verify, and tear down |
| [`docs/SUBMISSION.md`](docs/SUBMISSION.md) | Article outline + hard submission gates |
| [`.kiro/steering/`](.kiro/steering) | Rules Kiro follows while building this repo |

---

## Repo layout

```
Autonomous_Agent/
├─ agent/                  # Lambda: the creative agent
│  ├─ handler.py           # entrypoint, orchestrates the loop
│  ├─ steps/
│  │  ├─ sense.py          # date, season, weather (Open-Meteo)
│  │  ├─ recall.py         # read recent themes from DynamoDB
│  │  ├─ decide.py         # pick theme + output format
│  │  ├─ create.py         # Bedrock text + image
│  │  ├─ critique.py       # self-score and revise
│  │  └─ publish.py        # write S3 + DynamoDB
│  ├─ bedrock.py           # Converse / image invoke wrappers
│  ├─ models.py            # dataclasses for the capsule
│  └─ requirements.txt
├─ web/                    # React + Vite frontend
│  └─ src/
├─ infra/
│  └─ template.yaml        # AWS SAM: all resources
├─ docs/
└─ .kiro/steering/
```

---

## Quick start

```bash
# 1. deploy the backend agent
cd infra
sam build && sam deploy --guided

# 2. force one run now (proves it works before the schedule fires)
aws lambda invoke --function-name creative-pulse-agent out.json

# 3. run the site
cd ../web
npm install
npm run dev
```

Details and gotchas: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)

---

## Design principle

> **Finished and autonomous beats ambitious and broken.**

Only the first 101 qualifying submissions are prize-eligible. Every scope decision in this repo favours shipping a working autonomous run early. Anything not required to pass the three gates (autonomous creative output / uses AWS / 500+ word article) is explicitly parked in [`docs/PHASES.md`](docs/PHASES.md) under *Nice-to-have*.
