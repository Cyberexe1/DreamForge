import type { CSSProperties } from 'react';

/**
 * Mirrors the canvas in agent/poster.py. Change both in the same commit.
 *
 * The ratio matters more than it looks: the visual is a typographic poster, so
 * a box with a different aspect ratio crops words off under object-cover.
 *
 * Applied as an inline style rather than a Tailwind class on purpose — Tailwind
 * scans source statically, so a class name built from these constants at runtime
 * would never make it into the stylesheet.
 */
export const POSTER_WIDTH = 1382;
export const POSTER_HEIGHT = 896;

export const posterAspect: CSSProperties = {
  aspectRatio: `${POSTER_WIDTH} / ${POSTER_HEIGHT}`,
};
