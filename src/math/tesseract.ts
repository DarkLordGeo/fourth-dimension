/** A point in four-dimensional Euclidean space. */
export type Vec4 = readonly [x: number, y: number, z: number, w: number];

/** An edge joins two vertices that differ along exactly one axis (0=x … 3=w). */
export interface Edge4 {
  readonly a: number;
  readonly b: number;
  readonly axis: 0 | 1 | 2 | 3;
}

/** A square face spans two axes; the other two coordinates are fixed. */
export interface Face4 {
  readonly vertices: readonly [number, number, number, number];
  readonly axes: readonly [number, number];
}

/** A cubic cell: all eight vertices sharing one fixed coordinate. */
export interface Cell4 {
  readonly axis: number;
  readonly sign: -1 | 1;
  readonly vertices: readonly number[];
}

export interface Tesseract {
  readonly vertices: readonly Vec4[];
  readonly edges: readonly Edge4[];
  readonly faces: readonly Face4[];
  readonly cells: readonly Cell4[];
}

/**
 * Builds the unit tesseract {-1,+1}^4.
 * Vertex i has coordinate +1 on axis k when bit k of i is set, otherwise -1.
 */
export function createTesseract(): Tesseract {
  const vertices: Vec4[] = [];
  for (let i = 0; i < 16; i++) {
    vertices.push([i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1, i & 8 ? 1 : -1]);
  }

  const edges: Edge4[] = [];
  for (let a = 0; a < 16; a++) {
    for (let axis = 0; axis < 4; axis++) {
      const b = a | (1 << axis);
      if (b !== a) edges.push({ a, b, axis: axis as Edge4['axis'] });
    }
  }

  const faces: Face4[] = [];
  for (let p = 0; p < 4; p++) {
    for (let q = p + 1; q < 4; q++) {
      const P = 1 << p;
      const Q = 1 << q;
      for (let i = 0; i < 16; i++) {
        if (i & P || i & Q) continue;
        faces.push({ vertices: [i, i | P, i | P | Q, i | Q], axes: [p, q] });
      }
    }
  }

  const cells: Cell4[] = [];
  for (let axis = 0; axis < 4; axis++) {
    for (const sign of [-1, 1] as const) {
      const members: number[] = [];
      for (let i = 0; i < 16; i++) if (vertices[i][axis] === sign) members.push(i);
      cells.push({ axis, sign, vertices: members });
    }
  }

  return { vertices, edges, faces, cells };
}

export function distance4(a: Vec4, b: Vec4): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2], a[3] - b[3]);
}
