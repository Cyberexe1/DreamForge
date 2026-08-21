/** Non-secret build-time config. Nothing here authenticates to anything. */

export const REPO_URL =
  import.meta.env.VITE_REPO_URL ?? 'https://github.com/your-user/dreamforge';

/** Kept in sync with the EventBridge Scheduler cron in infra/template.yaml. */
export const RUN_TIME_LABEL = '08:00 IST';
