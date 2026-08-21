import type { ArchiveEntry, Capsule } from './types';

/**
 * Development fixture, used only when VITE_USE_MOCK=true in a dev server.
 * Lets the UI be built before the agent's first run exists.
 * Deliberately tagged local.dev so it can never be mistaken for real output.
 */
export const MOCK_CAPSULE: Capsule = {
  date: '2026-08-21',
  weekday: 'Friday',
  context: {
    location: 'Mumbai, India',
    season: 'Monsoon',
    temp_c: 27,
    condition: 'Moderate rain',
    is_weekend: false,
    special_day: null,
  },
  theme: 'The Cartographer of Puddles',
  mood: 'playful-melancholy',
  form: 'short_story',
  reasoning:
    'Rain is the third wet day in a row and the last two capsules were both solemn; a smaller, stranger, more human-scale angle keeps the week from flattening.',
  title: 'The City That Waited for Rain',
  story: `He kept the map in his coat, folded into eighths, soft as cloth at the creases.

Every puddle on the Andheri stretch had a name and a depth. The one outside the shuttered watch repair was Tuesday, four centimetres, treacherous at the eastern rim. The long one by the bus shelter he had called Patience, because it never fully dried, not even in April.

The rain had come back overnight. He walked out at six to check his work.

Tuesday had widened. Patience had joined a smaller puddle he had not yet named, and together they held the whole orange length of a streetlight, unbroken, the way a held breath holds a room.

He crouched. He took out the map. He wrote nothing for a while.

Above him, a window opened and someone shook out a cloth, and the light in the water broke into pieces and reassembled itself, patiently, without being asked.`,
  quote: 'Some cities do not wait for rain. They rehearse for it.',
  image_key: 'images/2026-08-21.png',
  image_prompt:
    'Warm streetlight, reflections, low angle, painterly. A rain-soaked street at dawn.',
  meta: {
    generated_at: '2026-08-21T02:30:45Z',
    trigger: 'local.dev',
    critique_score: 8,
    revisions: 1,
    duration_ms: 45120,
    image_kind: 'poster',
    models: {
      text: 'us.amazon.nova-lite-v1:0',
      image: 'amazon.nova-canvas-v1:0',
    },
  },
};

export const MOCK_ARCHIVE: ArchiveEntry[] = [
  {
    date: '2026-08-21',
    title: 'The City That Waited for Rain',
    theme: 'The Cartographer of Puddles',
    image_key: 'images/2026-08-21.png',
  },
  {
    date: '2026-08-20',
    title: 'Nine Floors of Nobody',
    theme: 'Concrete Silence',
    image_key: 'images/2026-08-20.png',
  },
  {
    date: '2026-08-19',
    title: 'Seat 4B, Westbound',
    theme: 'The Long Commute',
    image_key: 'images/2026-08-19.png',
  },
  {
    date: '2026-08-18',
    title: 'What the Gutters Carried',
    theme: 'Monsoon Dreams',
    image_key: null,
  },
  {
    date: '2026-08-17',
    title: 'A Brief History of Standing Still',
    theme: 'Platform Nine, Again',
    image_key: 'images/2026-08-17.png',
  },
];
