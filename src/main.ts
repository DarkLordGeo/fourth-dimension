import './ui/style.css';
import { createTesseract } from './math/tesseract';
import { PLANES, identity, orthonormalize, rotateInPlane, setIdentity, transform, type Plane } from './math/rotation';
import { projectTo3D } from './math/projection';
import { createStage } from './render/stage';
import { createTesseractView } from './render/tesseractView';
import { assignSettings, defaultSettings } from './app/state';
import { FREE_START, STAGES, eyeApproach, freeGain, orbitDrift, scriptedTurns, stageIndex, wExtent } from './app/sequence';
import { createControls } from './ui/controls';

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const stage = createStage(canvas);
const tesseract = createTesseract();
const view = createTesseractView(tesseract);
stage.scene.add(view.object);

const settings = defaultSettings();
const orientation = identity();

// Far oblique 4D viewpoint used while the second cube is introduced.
const FAR = 40;
const OBLIQUE = 0.62;
const OBLIQUE_DIR = [0.78, 0.5, 0.38].map((c, _, a) => c / Math.hypot(...a));

let time = 0;
let extent = 0;
let approach = 0;
let distance = settings.distance;
let frame = 0;
let shiftX = 0;
let shiftY = 0;

function applyDisplay() {
  view.setMode(settings.mode);
  view.setVerticesVisible(settings.showVertices);
  view.setEdgesVisible(settings.showEdges);
}

const ui = createControls(document.getElementById('ui')!, settings, {
  changed(engage) {
    // Touching rotation or projection controls hands the object to the user.
    if (engage && time < FREE_START + 3) time = FREE_START + 3;
    applyDisplay();
  },
  jumpToStage(i) {
    time = STAGES[i].start;
    if (i < 3) setIdentity(orientation);
    if (i === 0) extent = approach = 0;
  },
  resetOrientation() {
    setIdentity(orientation);
  },
  resetAll() {
    assignSettings(settings, defaultSettings());
    setIdentity(orientation);
    time = extent = approach = 0;
    distance = settings.distance;
    stage.resetCamera();
    applyDisplay();
    ui.sync();
  },
});
applyDisplay();

const rotated = [0, 0, 0, 0];
const eye = [0, 0, 0, 0];
const positions = new Float32Array(16 * 3);
const scales = new Float32Array(16);
const ws = new Float32Array(16);
const turns: Partial<Record<Plane, number>> = {};

function step(dt: number) {
  if (!settings.paused) {
    const t0 = time;
    time += dt * settings.speed;

    for (const p of PLANES) turns[p] = 0;
    scriptedTurns(t0, time, turns);
    const gain = freeGain(time) * dt * settings.speed;
    if (gain > 0) {
      for (const p of PLANES) if (settings.planes[p].enabled) turns[p]! += settings.planes[p].rate * gain;
    }
    for (const p of PLANES) rotateInPlane(orientation, p, turns[p]!);
    if (++frame % 240 === 0) orthonormalize(orientation);
  }

  // Ease the projection parameters toward the sequence / user targets.
  const k = 1 - Math.exp(-dt * 5);
  extent += (wExtent(time) - extent) * k;
  approach += (eyeApproach(time) - approach) * k;
  distance += (settings.distance - distance) * k;

  const d = 1 / ((1 - approach) / FAR + approach / distance);
  const side = -OBLIQUE * (1 - approach) * d;
  eye[0] = side * OBLIQUE_DIR[0];
  eye[1] = side * OBLIQUE_DIR[1];
  eye[2] = side * OBLIQUE_DIR[2];
  eye[3] = d;

  for (let i = 0; i < 16; i++) {
    const v = tesseract.vertices[i];
    transform(orientation, [v[0], v[1], v[2], v[3] * extent], rotated);
    scales[i] = projectTo3D(rotated, eye, positions, i * 3);
    ws[i] = rotated[3];
  }
  view.update(positions, scales, ws);

  stage.controls.autoRotate = !settings.paused;
  stage.controls.autoRotateSpeed = 1.1 * orbitDrift(time) * settings.speed;

  const inset = ui.inset();
  shiftX += (inset.right / 2 - shiftX) * k;
  shiftY += (inset.bottom / 2 - shiftY) * k;
  stage.setShift(shiftX, shiftY);
  ui.setStage(stageIndex(time));
}

let last = performance.now();
let raf = 0;
function loop(now: number) {
  raf = requestAnimationFrame(loop);
  // Clamp so a throttled or backgrounded tab never produces a jump.
  const dt = Math.min(Math.max((now - last) / 1000, 0), 0.1);
  last = now;
  step(dt);
  stage.render();
}
function onVisibility() {
  last = performance.now();
}
document.addEventListener('visibilitychange', onVisibility);
raf = requestAnimationFrame(loop);

// Inspection hook for automated checks; read-only view of the live state.
(window as unknown as Record<string, unknown>).__tesseract = {
  get time() { return time; },
  set time(v: number) { time = v; },
  orientation,
  positions,
  settings,
};

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    cancelAnimationFrame(raf);
    document.removeEventListener('visibilitychange', onVisibility);
    ui.dispose();
    stage.dispose();
  });
}
