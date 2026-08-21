/**
 * The agent invents its own mood strings, so this maps loosely by keyword
 * rather than exhaustively. Used for the text-only placeholder gradient and
 * accent tinting, both of which must degrade to something reasonable.
 */
const MOOD_GRADIENTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/melanchol|wistful|solemn|grief|quiet/, 'from-indigo-900 via-slate-800 to-slate-950'],
  [/playful|bright|joy|warm|hopeful/, 'from-amber-700 via-rose-800 to-slate-950'],
  [/weary|tired|grey|gray|mundane/, 'from-slate-700 via-slate-800 to-slate-950'],
  [/tense|restless|urgent|storm/, 'from-rose-900 via-purple-900 to-slate-950'],
  [/serene|calm|still|tender/, 'from-teal-800 via-sky-900 to-slate-950'],
];

const FALLBACK_GRADIENT = 'from-indigo-900 via-slate-800 to-slate-950';

export function moodGradient(mood: string): string {
  const m = mood.toLowerCase();
  for (const [pattern, classes] of MOOD_GRADIENTS) {
    if (pattern.test(m)) return classes;
  }
  return FALLBACK_GRADIENT;
}

/** "playful-melancholy" reads better as "playful melancholy" in prose. */
export function prettyMood(mood: string): string {
  return mood.replace(/[-_]/g, ' ');
}

/** "short_story" -> "Short story" */
export function prettyForm(form: string): string {
  const words = form.replace(/[-_]/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
