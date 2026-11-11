import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const BASE_FOV = 30;
const HOME = new THREE.Vector3(6.4, 3.6, 10.2);

export interface Stage {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  render(): void;
  resetCamera(): void;
  /** Slide the picture (in CSS pixels) so an open panel never covers the object. */
  setShift(x: number, y: number): void;
  dispose(): void;
}

/** Renderer, camera, light and atmosphere. Knows nothing about four dimensions. */
export function createStage(canvas: HTMLCanvasElement): Stage {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x040507);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const envTarget = pmrem.fromScene(room, 0.04);
  scene.environment = envTarget.texture;
  scene.environmentIntensity = 0.4;
  room.dispose();
  pmrem.dispose();

  // Backdrop: a barely-there vertical falloff so the void has depth.
  const backdrop = new THREE.Mesh(
    new THREE.SphereGeometry(80, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader:
        'varying vec3 vDir; void main(){ float h = smoothstep(-0.55, 0.75, vDir.y); vec3 c = mix(vec3(0.013,0.016,0.022), vec3(0.004,0.005,0.007), h); gl_FragColor = vec4(c,1.0); }',
    }),
  );
  scene.add(backdrop);

  const camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.5, 200);
  camera.position.copy(HOME);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.enablePan = false;
  controls.minDistance = 5;
  controls.maxDistance = 30;
  controls.rotateSpeed = 0.7;
  controls.zoomSpeed = 0.7;
  controls.target.set(0, 0, 0);
  controls.saveState();

  const key = new THREE.DirectionalLight(0xfff4e6, 2.4);
  key.position.set(5, 11, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.radius = 9;
  key.shadow.blurSamples = 16;
  key.shadow.bias = -0.0004;
  const sc = key.shadow.camera;
  sc.left = sc.bottom = -8;
  sc.right = sc.top = 8;
  sc.near = 1;
  sc.far = 30;
  scene.add(key);

  const rim = new THREE.DirectionalLight(0x9fc0ff, 1.1);
  rim.position.set(-7, 2, -6);
  scene.add(rim);
  scene.add(new THREE.HemisphereLight(0x8fa3c0, 0x050506, 0.25));

  // A dim pool of floor that fades to nothing; it exists to catch the shadow.
  const fade = document.createElement('canvas');
  fade.width = fade.height = 256;
  const g = fade.getContext('2d')!;
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, '#fff');
  grad.addColorStop(0.4, '#555');
  grad.addColorStop(1, '#000');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const fadeTex = new THREE.CanvasTexture(fade);
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(15, 64),
    new THREE.MeshStandardMaterial({
      color: 0x0b0d12,
      roughness: 0.82,
      metalness: 0.1,
      transparent: true,
      alphaMap: fadeTex,
      envMapIntensity: 0.08,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -3.6;
  floor.receiveShadow = true;
  scene.add(floor);

  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.2, 0.6, 1.0);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  let shiftX = 0;
  let shiftY = 0;
  function applyShift() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    if (Math.abs(shiftX) < 0.5 && Math.abs(shiftY) < 0.5) camera.clearViewOffset();
    else camera.setViewOffset(w, h, shiftX, shiftY, w, h);
  }

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(dpr);
    composer.setSize(w, h);
    camera.aspect = w / h;
    // Keep the horizontal field of view on narrow (portrait) screens.
    const half = Math.tan(THREE.MathUtils.degToRad(BASE_FOV / 2));
    const fit = camera.aspect < 1.15 ? half * (1.15 / camera.aspect) : half;
    camera.fov = Math.min(THREE.MathUtils.radToDeg(Math.atan(fit) * 2), 75);
    camera.updateProjectionMatrix();
    applyShift();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  window.addEventListener('resize', resize);
  resize();

  return {
    scene,
    camera,
    controls,
    render() {
      controls.update();
      composer.render();
    },
    resetCamera() {
      controls.reset();
    },
    setShift(x, y) {
      if (Math.abs(x - shiftX) < 0.25 && Math.abs(y - shiftY) < 0.25) return;
      shiftX = x;
      shiftY = y;
      applyShift();
    },
    dispose() {
      observer.disconnect();
      window.removeEventListener('resize', resize);
      controls.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      });
      fadeTex.dispose();
      envTarget.dispose();
      target.dispose();
      composer.dispose();
      renderer.dispose();
    },
  };
}
