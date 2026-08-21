/**
 * Mirrors the capsule contract in docs/ARCHITECTURE.md.
 * Change both in the same commit, along with agent/models.py.
 */

export type CapsuleForm = 'short_story' | 'poem' | 'micro_script';

/** How the run that produced a capsule was started. Never relabel these in the UI. */
export type TriggerSource = 'eventbridge.schedule' | 'manual.cli' | 'local.dev';

export interface WorldContext {
  location: string;
  season: string;
  /** null when the weather lookup degraded. */
  temp_c: number | null;
  condition: string | null;
  is_weekend: boolean;
  special_day?: string | null;
}

export interface CapsuleModels {
  text: string;
  /** null on a text-only capsule. */
  image: string | null;
}

export interface CapsuleMeta {
  generated_at: string;
  trigger: TriggerSource | string;
  critique_score: number | null;
  revisions: number;
  duration_ms: number;
  models: CapsuleModels;
}

export interface Capsule {
  date: string;
  weekday: string;
  context: WorldContext;

  /** The agent's own decisions. */
  theme: string;
  mood: string;
  form: CapsuleForm | string;
  /** Why the agent chose this today. Surfaced in the UI as decision evidence. */
  reasoning: string | null;

  /** The work. */
  title: string;
  story: string;
  quote: string;

  /** null when image generation failed and the agent published text-only. */
  image_key: string | null;
  image_prompt: string | null;

  meta: CapsuleMeta;
}

export interface ArchiveEntry {
  date: string;
  title: string;
  theme: string;
  image_key: string | null;
}
