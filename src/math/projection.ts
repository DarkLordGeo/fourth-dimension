import type { Vec4 } from './tesseract';

/** Smallest allowed gap between the eye and a point along w. */
export const MIN_W_GAP = 0.15;

/**
 * Central (perspective) projection from 4D onto the hyperplane w = 0.
 *
 * A ray is cast from `eye` through `p`; where it crosses w = 0 is the image.
 * With the eye on the w axis at distance d this reduces to the familiar
 *   (x, y, z) · d / (d − w).
 * An eye that is far away and off-axis gives, in the limit, an oblique
 * parallel projection — the "two displaced cubes" picture of a tesseract.
 *
 * Writes the 3D image into `out` at `offset` and returns the scale factor
 * d / (d − w). The gap (d − w) is clamped so a point can never reach the
 * eye's hyperplane and blow up.
 */
export function projectTo3D(
  p: Vec4 | ArrayLike<number>,
  eye: Vec4 | ArrayLike<number>,
  out: Float32Array | number[],
  offset = 0,
): number {
  const gap = Math.max(eye[3] - p[3], MIN_W_GAP);
  const t = eye[3] / gap;
  const u = 1 - t;
  out[offset] = p[0] * t + eye[0] * u;
  out[offset + 1] = p[1] * t + eye[1] * u;
  out[offset + 2] = p[2] * t + eye[2] * u;
  return t;
}
