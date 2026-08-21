import { imageUrl } from '../api';
import { shortDate } from '../lib/schedule';
import type { ArchiveEntry } from '../types';

/** Previous days. Decorative — hidden entirely when there's no history yet. */
export function ArchiveStrip({
  entries,
  currentDate,
}: {
  entries: ArchiveEntry[];
  currentDate: string;
}) {
  const past = entries.filter((e) => e.date !== currentDate);
  if (past.length === 0) return null;

  return (
    <section id="archive" className="mx-auto max-w-6xl scroll-mt-28 px-5 pt-24 sm:px-8 sm:pt-32">
      <div className="flex items-end justify-between gap-4">
        <div>
          <span className="label">Previously</span>
          <h2 className="mt-3 font-display text-3xl font-light text-white sm:text-4xl">
            {past.length} earlier {past.length === 1 ? 'capsule' : 'capsules'}
          </h2>
        </div>
        <p className="hidden max-w-xs text-sm text-slate-500 sm:block">
          Every entry was written on its own morning, unprompted.
        </p>
      </div>

      <ul className="no-scrollbar mt-8 flex gap-4 overflow-x-auto pb-2">
        {past.map((entry) => (
          <li key={entry.date} className="w-56 shrink-0 sm:w-64">
            <article
              className="group h-full overflow-hidden rounded-3xl border border-white/10
                         bg-white/[0.03] transition-all duration-300 hover:border-white/20
                         hover:bg-white/[0.06]"
            >
              <div className="aspect-[4/3] overflow-hidden bg-ink-850">
                {entry.image_key ? (
                  <img
                    src={imageUrl(entry.image_key)}
                    alt={`Artwork for ${entry.title}`}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                  />
                ) : (
                  <div className="grid h-full w-full place-items-center bg-gradient-to-br from-slate-800 to-ink-900">
                    <span className="text-[11px] text-slate-500">Words only</span>
                  </div>
                )}
              </div>
              <div className="p-5">
                <time dateTime={entry.date} className="font-mono text-[11px] text-slate-500">
                  {shortDate(entry.date)}
                </time>
                <h3 className="mt-2 font-display text-base leading-snug text-white">
                  {entry.title}
                </h3>
                <p className="mt-1.5 text-xs text-pulse-300/70">{entry.theme}</p>
              </div>
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}
