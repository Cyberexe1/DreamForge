/**
 * The agent runs at 08:00 Asia/Kolkata, set by the EventBridge Scheduler cron
 * in infra/template.yaml. Keep RUN_HOUR_IST in sync with that cron.
 */
const RUN_HOUR_IST = 8;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** The next moment the schedule will fire, as a UTC instant. */
export function nextRun(now: Date = new Date()): Date {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth();
  const d = ist.getUTCDate();

  let target = Date.UTC(y, m, d, RUN_HOUR_IST) - IST_OFFSET_MS;
  if (target <= now.getTime()) {
    target = Date.UTC(y, m, d + 1, RUN_HOUR_IST) - IST_OFFSET_MS;
  }
  return new Date(target);
}

/** "in 6h 12m" */
export function timeUntil(target: Date, now: Date = new Date()): string {
  const ms = target.getTime() - now.getTime();
  if (ms <= 0) return 'any moment';

  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) return `in ${minutes}m`;
  return `in ${hours}h ${minutes}m`;
}

const IST_TIME = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const IST_DATETIME = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** "08:00 IST" */
export function istTime(d: Date): string {
  return `${IST_TIME.format(d)} IST`;
}

/** "21 Aug, 08:00 IST" */
export function istDateTime(d: Date): string {
  return `${IST_DATETIME.format(d)} IST`;
}

/** "Friday, 21 August 2026" from a plain YYYY-MM-DD capsule date. */
export function longDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** "20 Aug" for archive cards. */
export function shortDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}
