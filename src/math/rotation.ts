import type { Vec4 } from './tesseract';

/** 4×4 matrix, row-major. */
export type Mat4 = Float64Array;

/**
 * In four dimensions rotation happens in a plane, not about an axis.
 * There are C(4,2) = 6 independent coordinate planes.
 */
export const PLANES = ['xy', 'xz', 'xw', 'yz', 'yw', 'zw'] as const;
export type Plane = (typeof PLANES)[number];

export const PLANE_AXES: Record<Plane, readonly [number, number]> = {
  xy: [0, 1],
  xz: [0, 2],
  xw: [0, 3],
  yz: [1, 2],
  yw: [1, 3],
  zw: [2, 3],
};

export function identity(): Mat4 {
  const m = new Float64Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

export function setIdentity(m: Mat4): Mat4 {
  m.fill(0);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

/** Rotation by `angle` in a coordinate plane; the two other axes are untouched. */
export function planeRotation(plane: Plane, angle: number): Mat4 {
  const [i, j] = PLANE_AXES[plane];
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const m = identity();
  m[i * 4 + i] = c;
  m[i * 4 + j] = -s;
  m[j * 4 + i] = s;
  m[j * 4 + j] = c;
  return m;
}

export function multiply(a: Mat4, b: Mat4, out: Mat4 = new Float64Array(16)): Mat4 {
  const r = out === a || out === b ? new Float64Array(16) : out;
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[i * 4 + k] * b[k * 4 + j];
      r[i * 4 + j] = sum;
    }
  }
  if (r !== out) out.set(r);
  return out;
}

/**
 * In-place m ← R(plane, angle) · m. Only two rows change, so accumulating
 * an orientation frame by frame costs eight multiply-adds per plane.
 */
export function rotateInPlane(m: Mat4, plane: Plane, angle: number): Mat4 {
  if (angle === 0) return m;
  const [i, j] = PLANE_AXES[plane];
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  for (let k = 0; k < 4; k++) {
    const a = m[i * 4 + k];
    const b = m[j * 4 + k];
    m[i * 4 + k] = c * a - s * b;
    m[j * 4 + k] = s * a + c * b;
  }
  return m;
}

export function transform(m: Mat4, v: Vec4, out: number[] | Float64Array = [0, 0, 0, 0]): typeof out {
  const x = v[0], y = v[1], z = v[2], w = v[3];
  out[0] = m[0] * x + m[1] * y + m[2] * z + m[3] * w;
  out[1] = m[4] * x + m[5] * y + m[6] * z + m[7] * w;
  out[2] = m[8] * x + m[9] * y + m[10] * z + m[11] * w;
  out[3] = m[12] * x + m[13] * y + m[14] * z + m[15] * w;
  return out;
}

/** Gram–Schmidt on the rows; removes floating-point drift from long accumulation. */
export function orthonormalize(m: Mat4): Mat4 {
  for (let i = 0; i < 4; i++) {
    for (let p = 0; p < i; p++) {
      let dot = 0;
      for (let k = 0; k < 4; k++) dot += m[i * 4 + k] * m[p * 4 + k];
      for (let k = 0; k < 4; k++) m[i * 4 + k] -= dot * m[p * 4 + k];
    }
    let len = 0;
    for (let k = 0; k < 4; k++) len += m[i * 4 + k] * m[i * 4 + k];
    len = Math.sqrt(len) || 1;
    for (let k = 0; k < 4; k++) m[i * 4 + k] /= len;
  }
  return m;
}
