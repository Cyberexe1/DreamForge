const STEPS = [
  {
    n: '01',
    name: 'Sense',
    body: 'Reads the date, weekday, season and live weather. Never fails — a missing signal just means less context.',
  },
  {
    n: '02',
    name: 'Recall',
    body: 'Queries the last seven capsules. Rain in August is relentless; memory forces a new angle on it.',
  },
  {
    n: '03',
    name: 'Decide',
    body: 'Chooses the theme, mood, form and art direction, and states why. Nothing is picked from a list.',
  },
  {
    n: '04',
    name: 'Create',
    body: 'Writes the piece, then illustrates it from the art direction it wrote itself a step earlier.',
  },
  {
    n: '05',
    name: 'Critique',
    body: 'A separate, unaware reviewer scores the work out of ten. Asked about its own writing, a model just approves it.',
  },
  {
    n: '06',
    name: 'Revise',
    body: 'One rewrite if the score falls short, then it ships regardless. On time at 6/10 beats perfect and absent.',
  },
  {
    n: '07',
    name: 'Publish',
    body: 'Stores the image and capsule, commits the result to memory, and constrains what tomorrow can be.',
  },
] as const;

export function HowItWorks() {
  return (
    <section id="how-it-works" className="mx-auto max-w-6xl scroll-mt-28 px-5 pt-24 sm:px-8 sm:pt-32">
      <span className="label">The loop</span>
      <h2 className="mt-3 max-w-2xl font-display text-3xl font-light leading-tight text-white sm:text-4xl">
        Seven steps, five of them decisions the code didn&apos;t make
      </h2>
      <p className="mt-4 max-w-2xl text-slate-400">
        A generator maps a prompt to an output. An agent senses its surroundings, consults
        memory, commits to a direction, judges the result and acts on that judgement.
      </p>

      <ol className="mt-12 grid gap-px overflow-hidden rounded-3xl border border-white/10 bg-white/[0.06] sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step) => (
          <li key={step.n} className="group bg-ink-900/70 p-6 transition-colors hover:bg-ink-850">
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-xs text-pulse-400/70">{step.n}</span>
              <h3 className="font-display text-lg text-white">{step.name}</h3>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">{step.body}</p>
          </li>
        ))}

        <li className="bg-gradient-to-br from-pulse-500/[0.12] to-transparent p-6">
          <span className="label text-pulse-300/70">Trigger</span>
          <p className="mt-3 font-display text-lg leading-snug text-white">
            EventBridge, 08:00 daily
          </p>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            The only thing that starts a run. There is no other way in.
          </p>
        </li>
      </ol>
    </section>
  );
}
