import * as THREE from 'three';
import type { Tesseract } from '../math/tesseract';

export type RenderMode = 'wireframe' | 'solid';

export interface TesseractView {
  object: THREE.Group;
  /**
   * @param positions 16 projected points (xyz triples)
   * @param scales    16 perspective scale factors d/(d−w)
   * @param w         16 rotated w coordinates
   */
  update(positions: Float32Array, scales: Float32Array, w: Float32Array): void;
  setMode(mode: RenderMode): void;
  setVerticesVisible(v: boolean): void;
  setEdgesVisible(v: boolean): void;
}

// Colour encodes the w coordinate: steel blue (−w) → neutral → champagne (+w).
const COOL = new THREE.Color(0x5f93e8);
const MID = new THREE.Color(0xd4d9e2);
const WARM = new THREE.Color(0xf2b25e);

function colorForW(w: number, out: THREE.Color): THREE.Color {
  const t = THREE.MathUtils.clamp(w / 1.25, -1, 1);
  return t < 0 ? out.copy(MID).lerp(COOL, -t) : out.copy(MID).lerp(WARM, t);
}

/** Standard PBR material whose emission follows the per-instance colour. */
function luminousMetal(glow: number, roughness: number): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.75, roughness });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uGlow = { value: glow };
    shader.fragmentShader = 'uniform float uGlow;\n' + shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n#ifdef USE_COLOR\n totalEmissiveRadiance += vColor.rgb * uGlow;\n#endif',
    );
  };
  return m;
}

const EDGE_RADIUS = 0.021;
const VERTEX_RADIUS = 0.062;

export function createTesseractView(t: Tesseract): TesseractView {
  const group = new THREE.Group();

  // Edges along x, y, z and edges along w are separate instanced batches so
  // the eight w-edges can carry a slightly brighter, finer material.
  const spatial = t.edges.filter((e) => e.axis !== 3);
  const hyper = t.edges.filter((e) => e.axis === 3);
  const tube = new THREE.CylinderGeometry(1, 1, 1, 14, 1, true);
  const spatialMesh = new THREE.InstancedMesh(tube, luminousMetal(0.3, 0.32), spatial.length);
  const hyperMesh = new THREE.InstancedMesh(tube, luminousMetal(0.85, 0.2), hyper.length);
  const vertexMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1, 24, 16),
    luminousMetal(0.22, 0.22),
    t.vertices.length,
  );
  for (const m of [spatialMesh, hyperMesh, vertexMesh]) {
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    m.castShadow = true;
    m.setColorAt(0, MID);
    m.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    group.add(m);
  }

  // The 24 square faces as one indexed buffer, rewritten in place each frame.
  const faceGeo = new THREE.BufferGeometry();
  const facePos = new Float32Array(t.faces.length * 12);
  const faceCol = new Float32Array(t.faces.length * 12);
  const faceNrm = new Float32Array(t.faces.length * 12);
  const index: number[] = [];
  t.faces.forEach((_, f) => index.push(f * 4, f * 4 + 1, f * 4 + 2, f * 4, f * 4 + 2, f * 4 + 3));
  faceGeo.setIndex(index);
  for (const [name, arr] of [['position', facePos], ['color', faceCol], ['normal', faceNrm]] as const) {
    const attr = new THREE.BufferAttribute(arr, 3);
    attr.setUsage(THREE.DynamicDrawUsage);
    faceGeo.setAttribute(name, attr);
  }
  const faceMat = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.075,
    metalness: 0.35,
    roughness: 0.18,
    clearcoat: 0.6,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const faceMesh = new THREE.Mesh(faceGeo, faceMat);
  faceMesh.frustumCulled = false;
  faceMesh.renderOrder = 1;
  group.add(faceMesh);

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  const mat = new THREE.Matrix4();
  const col = new THREE.Color();
  const noRot = new THREE.Quaternion();

  function writeEdges(
    mesh: THREE.InstancedMesh,
    edges: typeof t.edges,
    thickness: number,
    p: Float32Array,
    s: Float32Array,
    w: Float32Array,
  ) {
    edges.forEach((e, i) => {
      a.fromArray(p, e.a * 3);
      b.fromArray(p, e.b * 3);
      dir.subVectors(b, a);
      const len = dir.length();
      if (len < 1e-5) {
        mat.makeScale(0, 0, 0);
      } else {
        quat.setFromUnitVectors(up, dir.divideScalar(len));
        const r = thickness * THREE.MathUtils.clamp((s[e.a] + s[e.b]) / 2, 0.5, 1.7);
        scl.set(r, len, r);
        mat.compose(c.addVectors(a, b).multiplyScalar(0.5), quat, scl);
      }
      mesh.setMatrixAt(i, mat);
      mesh.setColorAt(i, colorForW((w[e.a] + w[e.b]) / 2, col));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor!.needsUpdate = true;
  }

  return {
    object: group,
    update(p, s, w) {
      if (spatialMesh.visible) {
        writeEdges(spatialMesh, spatial, EDGE_RADIUS, p, s, w);
        writeEdges(hyperMesh, hyper, EDGE_RADIUS * 0.8, p, s, w);
      }
      if (vertexMesh.visible) {
        for (let i = 0; i < 16; i++) {
          const r = VERTEX_RADIUS * THREE.MathUtils.clamp(s[i], 0.5, 1.7);
          mat.compose(a.fromArray(p, i * 3), noRot, scl.set(r, r, r));
          vertexMesh.setMatrixAt(i, mat);
          vertexMesh.setColorAt(i, colorForW(w[i], col));
        }
        vertexMesh.instanceMatrix.needsUpdate = true;
        vertexMesh.instanceColor!.needsUpdate = true;
      }
      if (faceMesh.visible) {
        t.faces.forEach((f, fi) => {
          const v = f.vertices;
          a.fromArray(p, v[0] * 3);
          b.fromArray(p, v[1] * 3);
          c.fromArray(p, v[3] * 3);
          dir.subVectors(b, a).cross(c.sub(a)).normalize();
          for (let k = 0; k < 4; k++) {
            const o = fi * 12 + k * 3;
            facePos[o] = p[v[k] * 3];
            facePos[o + 1] = p[v[k] * 3 + 1];
            facePos[o + 2] = p[v[k] * 3 + 2];
            faceNrm[o] = dir.x;
            faceNrm[o + 1] = dir.y;
            faceNrm[o + 2] = dir.z;
            colorForW(w[v[k]], col).toArray(faceCol, o);
          }
        });
        faceGeo.attributes.position.needsUpdate = true;
        faceGeo.attributes.normal.needsUpdate = true;
        faceGeo.attributes.color.needsUpdate = true;
      }
    },
    setMode(mode) {
      faceMesh.visible = mode === 'solid';
    },
    setVerticesVisible(v) {
      vertexMesh.visible = v;
    },
    setEdgesVisible(v) {
      spatialMesh.visible = hyperMesh.visible = v;
    },
  };
}
