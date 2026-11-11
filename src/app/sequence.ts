import type { Plane } from '../math/rotation';

/**
 * The opening sequence, as pure functions of time.
 *
 *  A  a cube — the tesseract with zero extent along w
 *  B  w-extent grows under a distant oblique 4D eye (two displaced cubes),
 *     then the eye swings onto the w axis and moves close (cube within cube)
 *  C  one half-turn each in XW, YW, ZW
 *  D  free rotation, driven by the user's plane settings
 */
export const STAGES = [
  { id: 'A', start: 0, label: 'Cube' },
  { id: 'B', start: 7, label: 'A second cube, along w' },
  { id: 'C', start: 19, label: 'Rotation through w' },
  { id: 'D', start: 40.5, label: 'Continuous rotation' },
] as const;

export const FREE_START = STAGES[3].start;
const FREE_RAMP = 3;

const ease = (x: number) => {
  const t = Math.min(Math.max(x, 0), 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
const span = (t: number, from: number, to: number) => ease((t - from) / (to - from));

export function stageIndex(t: number): number {
  let i = 0;
  for (let k = 0; k < STAGES.length; k++) if (t >= STAGES[k].start) i = k;
  return i;
}

/** Extent of the object along w, 0 (a plain cube) to 1 (a full tesseract). */
export const wExtent = (t: number) => span(t, 7.5, 12);

/** 0 = far oblique eye, 1 = eye on the w axis at the chosen distance. */
export const eyeApproach = (t: number) => span(t, 13, 18.5);

/** Camera drift: on while the object is still three-dimensional, off after. */
export const orbitDrift = (t: number) => 1 - span(t, 12.5, 18);

const TURNS: readonly { plane: Plane; from: number; to: number }[] = [
  { plane: 'xw', from: 19.5, to: 26 },
  { plane: 'yw', from: 26.5, to: 33 },
  { plane: 'zw', from: 33.5, to: 40 },
];

/** Scripted rotation increments (radians) between two instants of stage C. */
export function scriptedTurns(t0: number, t1: number, out: Partial<Record<Plane, number>>): void {
  for (const { plane, from, to } of TURNS) {
    const d = (span(t1, from, to) - span(t0, from, to)) * Math.PI;
    if (d !== 0) out[plane] = d;
  }
}

/** Gain applied to user-controlled rotation; ramps in at the start of D. */
export const freeGain = (t: number) => span(t, FREE_START, FREE_START + FREE_RAMP);
