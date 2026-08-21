---
inclusion: fileMatch
fileMatchPattern: 'web/**'
---

# Frontend Rules

The site is a **read-only viewer**. It fetches JSON from CloudFront and renders it. That's the whole job.

## Absolutely no generation UI

No generate button, no regenerate, no "make another", no prompt input, no theme picker, no admin trigger, no keyboard shortcut. No `fetch` or `POST` to anything that could invoke the agent — no such endpoint exists, and none should be added.

The absence of a generate button is a judged feature, not an omission. If a task asks for one, say why it can't be built and offer the read-only alternative.

## Data access

Two files, both `GET`, both from `VITE_DATA_BASE`:

```ts
GET ${VITE_DATA_BASE}/data/latest.json    // today's capsule
GET ${VITE_DATA_BASE}/data/index.json     // archive list
GET ${VITE_DATA_BASE}/data/2026-08-20.json  // a specific past day
```

All fetching lives in `src/api.ts`. Components receive data as props and never fetch.

## Types

`src/types.ts` mirrors the capsule contract in `docs/ARCHITECTURE.md` exactly. Both change in the same commit. No `any` — narrow the response once at the `api.ts` boundary.

## States to handle

| State | Behaviour |
|---|---|
| Loading | Skeleton, not a spinner. The layout shouldn't jump. |
| `image_key: null` | Gradient placeholder derived from the mood. Text-only is valid, not an error. |
| Empty `index.json` | Show today only, hide the archive strip |
| Fetch fails | "The agent's latest work is on its way" — never a raw error or an empty page |

Text-only capsules are the agent degrading correctly. The UI must make that look intentional.

## Make the autonomy visible

`AgentStatus.tsx` is doing evaluation work, not decoration. Show:

- Last execution timestamp, from `meta.generated_at`
- Next scheduled execution (computed client-side from the known 08:00 IST cron)
- Trigger source, from `meta.trigger` — render it verbatim, never relabel a `manual.cli` run as scheduled
- The agent's own `reasoning` for today's theme — this is the clearest proof a decision happened
- `critique_score` and `revisions`, honestly, including low scores

An evaluator should be able to tell within seconds that nothing here was human-initiated.

## Style

Tailwind utilities only, no separate CSS files. Dark, editorial, gallery-like — the image and the words are the interface. Mobile-first; check on a phone before calling anything done.

Animation budget: one fade-in on the daily reveal. Nothing else.

## Accessibility

- `alt` on the generated image using `title` + `theme`
- Semantic elements: `<article>`, `<time datetime>`, `<blockquote>` for the quote
- Real heading order, `h1` → `h2`
- Contrast checked against the dark background
- Keyboard-reachable archive links with visible focus rings

## Env

`VITE_DATA_BASE` only. Commit `.env.example`, never `.env`. Nothing secret belongs in a client bundle, and this app authenticates to nothing — keep it that way.
