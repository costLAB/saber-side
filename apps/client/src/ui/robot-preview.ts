import type { RobotBuild } from '@saber-side/shared';
import * as THREE from 'three';
import { buildRobot, disposeRobot, type Robot, type RobotKit, restPose } from '../avatar/robot';
import { bendMaterial, REAL_OFF } from '../render/ring/bend';

/** A small turntable that shows a robot as it's being built. */
export interface RobotPreview {
  readonly canvas: HTMLCanvasElement;
  show(build: RobotBuild): void;
  dispose(): void;
}

/**
 * Draws robots with the game's own kit, so the preview is exactly what will come aboard. The kit's materials are
 * patched for the ring bend, so the robot stands in "real space" (parked REAL_OFF up), which the bend draws as-is.
 *
 * It has its own small WebGL context and stops (and frees it) once its canvas leaves the page. Returns undefined
 * where WebGL isn't available; the builder works without a preview.
 */
export function createRobotPreview(kit: RobotKit): RobotPreview | undefined {
  const canvas = document.createElement('canvas');
  canvas.className = 'robot-preview';
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    return undefined;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xfff4e6, 0.75));
  const key = new THREE.DirectionalLight(0xfff1dc, 0.95);
  key.position.set(3, 6, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fc4ff, 0.45);
  rim.position.set(-4, 3, -5);
  scene.add(rim);
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);
  const stand = new THREE.Group();
  stand.position.y = REAL_OFF;
  scene.add(stand);
  const shared = Object.values(kit.materials);

  let robot: Robot | undefined;
  let raf = 0;
  let last = 0;
  let turn = -0.5;
  let disposed = false;

  function frame(build: Robot) {
    // Frame the robot's own parts (the spin swooshes reach far wider), whichever way the turntable faces.
    stand.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(build.core);
    box.min.y -= REAL_OFF;
    box.max.y -= REAL_OFF;
    box.min.y = Math.min(box.min.y, 0);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.y / 2, Math.hypot(size.x, size.z) / 2);
    const dist = (radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.08;
    const elev = 0.16;
    camera.position.set(0, center.y + Math.sin(elev) * dist, Math.cos(elev) * dist);
    camera.lookAt(0, center.y, 0);
  }

  function tick(now: number) {
    if (disposed) return;
    if (!canvas.isConnected) return dispose();
    raf = requestAnimationFrame(tick);
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
    last = now;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h || !robot) return;
    if (canvas.width !== Math.round(w * renderer.getPixelRatio()) || camera.aspect !== w / h) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    turn += dt * 0.6;
    robot.root.rotation.y = turn;
    renderer.render(scene, camera);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(raf);
    if (robot) disposeRobot(robot, shared);
    renderer.dispose();
    renderer.forceContextLoss();
  }

  return {
    canvas,
    show(build) {
      if (disposed) return;
      if (robot) {
        stand.remove(robot.root);
        disposeRobot(robot, shared);
      }
      robot = buildRobot(kit, build);
      restPose(robot);
      robot.root.traverse((o) => {
        const m = (o as THREE.Mesh | THREE.Sprite).material;
        if (!m) return;
        // three would cull it where it's parked (REAL_OFF up), not where the bend draws it.
        o.frustumCulled = false;
        for (const x of Array.isArray(m) ? m : [m]) bendMaterial(x);
      });
      robot.root.rotation.y = turn;
      stand.add(robot.root);
      frame(robot);
      if (!raf) raf = requestAnimationFrame(tick);
    },
    dispose,
  };
}
