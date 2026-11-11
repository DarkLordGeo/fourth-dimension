import { describe, expect, it } from 'vitest';
import { createTesseract, distance4, type Vec4 } from './tesseract';
import {
  PLANES,
  identity,
  multiply,
  orthonormalize,
  planeRotation,
  rotateInPlane,
  transform,
} from './rotation';
import { projectTo3D } from './projection';

const t = createTesseract();
const asVec = (a: ArrayLike<number>): Vec4 => [a[0], a[1], a[2], a[3]];

describe('tesseract', () => {
  it('has 16 vertices, 32 edges, 24 faces, 8 cells', () => {
    expect(t.vertices).toHaveLength(16);
    expect(t.edges).toHaveLength(32);
    expect(t.faces).toHaveLength(24);
    expect(t.cells).toHaveLength(8);
  });

  it('has distinct vertices with every coordinate ±1', () => {
    expect(new Set(t.vertices.map((v) => v.join())).size).toBe(16);
    for (const v of t.vertices) for (const c of v) expect(Math.abs(c)).toBe(1);
  });

  it('connects only vertices differing in exactly one coordinate', () => {
    const seen = new Set<string>();
    for (const e of t.edges) {
      const a = t.vertices[e.a];
      const b = t.vertices[e.b];
      const differing = [0, 1, 2, 3].filter((k) => a[k] !== b[k]);
      expect(differing).toEqual([e.axis]);
      expect(distance4(a, b)).toBe(2);
      seen.add(`${Math.min(e.a, e.b)}-${Math.max(e.a, e.b)}`);
    }
    expect(seen.size).toBe(32);
  });

  it('gives every vertex four edges and eight edges per axis', () => {
    const degree = new Array(16).fill(0);
    const perAxis = [0, 0, 0, 0];
    for (const e of t.edges) {
      degree[e.a]++;
      degree[e.b]++;
      perAxis[e.axis]++;
    }
    expect(degree.every((d) => d === 4)).toBe(true);
    expect(perAxis).toEqual([8, 8, 8, 8]);
  });

  it('has planar square faces and cubic cells', () => {
    for (const f of t.faces) {
      const [a, b, c, d] = f.vertices.map((i) => t.vertices[i]);
      for (const [p, q] of [[a, b], [b, c], [c, d], [d, a]]) expect(distance4(p, q)).toBe(2);
      expect(distance4(a, c)).toBeCloseTo(2 * Math.SQRT2);
    }
    for (const c of t.cells) {
      expect(c.vertices).toHaveLength(8);
      const inside = t.edges.filter((e) => c.vertices.includes(e.a) && c.vertices.includes(e.b));
      expect(inside).toHaveLength(12);
    }
  });
});

describe('4D rotation', () => {
  const angles = [0.3, -1.1, 2.4, 0.7, -0.45, 5.2];

  it.each(PLANES)('%s rotation is orthogonal with determinant-preserving structure', (plane) => {
    const r = planeRotation(plane, 0.83);
    const rt = new Float64Array(16);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) rt[i * 4 + j] = r[j * 4 + i];
    const p = multiply(r, rt);
    const id = identity();
    for (let k = 0; k < 16; k++) expect(p[k]).toBeCloseTo(id[k], 12);
  });

  it.each(PLANES)('%s rotation moves only its two axes', (plane) => {
    const r = planeRotation(plane, 1.234);
    const moved = new Set<number>();
    for (const v of t.vertices) {
      const out = transform(r, v);
      for (let k = 0; k < 4; k++) if (Math.abs(out[k] - v[k]) > 1e-12) moved.add(k);
    }
    expect([...moved].sort()).toEqual(plane.split('').map((c) => 'xyzw'.indexOf(c)));
  });

  it('preserves 4D Euclidean distance between every pair of vertices', () => {
    const m = identity();
    PLANES.forEach((p, i) => rotateInPlane(m, p, angles[i]));
    const rotated = t.vertices.map((v) => asVec(transform(m, v)));
    for (let i = 0; i < 16; i++) {
      expect(Math.hypot(...rotated[i])).toBeCloseTo(2, 12);
      for (let j = i + 1; j < 16; j++) {
        expect(distance4(rotated[i], rotated[j])).toBeCloseTo(distance4(t.vertices[i], t.vertices[j]), 12);
      }
    }
  });

  it('rotateInPlane matches explicit matrix multiplication', () => {
    const a = identity();
    let b = identity();
    PLANES.forEach((p, i) => {
      rotateInPlane(a, p, angles[i]);
      b = multiply(planeRotation(p, angles[i]), b);
    });
    for (let k = 0; k < 16; k++) expect(a[k]).toBeCloseTo(b[k], 12);
  });

  it('w takes part: an XW quarter turn carries x into w', () => {
    const out = transform(planeRotation('xw', Math.PI / 2), [1, 0, 0, 0]);
    expect(out[0]).toBeCloseTo(0, 12);
    expect(out[3]).toBeCloseTo(1, 12);
  });

  it('undoing the rotation, or resetting it, reconstructs the original geometry', () => {
    const m = identity();
    PLANES.forEach((p, i) => rotateInPlane(m, p, angles[i]));
    [...PLANES].reverse().forEach((p, i) => rotateInPlane(m, p, -angles[5 - i]));
    t.vertices.forEach((v) => {
      const out = transform(m, v);
      for (let k = 0; k < 4; k++) expect(out[k]).toBeCloseTo(v[k], 12);
    });
    t.vertices.forEach((v) => expect(asVec(transform(identity(), v))).toEqual(v));
  });

  it('stays orthonormal over a long accumulation', () => {
    const m = identity();
    for (let f = 0; f < 200000; f++) {
      rotateInPlane(m, 'xw', 0.0071);
      rotateInPlane(m, 'yw', 0.0043);
      rotateInPlane(m, 'zw', 0.0029);
      if (f % 240 === 0) orthonormalize(m);
    }
    for (const v of t.vertices) expect(Math.hypot(...asVec(transform(m, v)))).toBeCloseTo(2, 9);
  });
});

describe('projection', () => {
  it('matches d / (d − w) for an on-axis eye', () => {
    const out = [0, 0, 0];
    const s = projectTo3D([1, -1, 1, 1], [0, 0, 0, 3], out);
    expect(s).toBeCloseTo(1.5);
    expect(out).toEqual([1.5, -1.5, 1.5]);
    projectTo3D([1, -1, 1, -1], [0, 0, 0, 3], out);
    expect(out).toEqual([0.75, -0.75, 0.75]);
  });

  it('leaves the w = 0 hyperplane fixed', () => {
    const out = [0, 0, 0];
    projectTo3D([0.4, -1.7, 0.9, 0], [2, 5, -3, 4], out);
    expect(out[0]).toBeCloseTo(0.4);
    expect(out[1]).toBeCloseTo(-1.7);
    expect(out[2]).toBeCloseTo(0.9);
  });

  it('is finite for every orientation at the closest allowed eye distance', () => {
    const out = [0, 0, 0];
    const m = identity();
    for (let f = 0; f < 5000; f++) {
      rotateInPlane(m, 'xw', 0.031);
      rotateInPlane(m, 'yw', 0.017);
      rotateInPlane(m, 'zw', 0.011);
      rotateInPlane(m, 'xy', 0.007);
      for (const v of t.vertices) {
        projectTo3D(transform(m, v), [0, 0, 0, 2.4], out);
        expect(out.every(Number.isFinite)).toBe(true);
        expect(Math.hypot(...out)).toBeLessThan(40);
      }
    }
  });

  it('never divides by zero even if a point reaches the eye', () => {
    const out = [0, 0, 0];
    projectTo3D([1, 1, 1, 2], [0, 0, 0, 2], out);
    expect(out.every(Number.isFinite)).toBe(true);
  });
});
