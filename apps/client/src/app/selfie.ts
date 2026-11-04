import {
  type Orbit,
  openOrbit,
  orbitOffset,
  robotToStrip,
  SELFIE,
  steerOrbit,
  turnOrbit,
  zoomOrbit,
} from '@saber-side/shared';
import * as THREE from 'three';

// The Selfie on a flat page (iPad, Mac): the chase camera swaps for one that orbits your robot, starting in front of
// it. Dragging, the arrow keys, or Q and E turn it round; up and down tilt it; scroll, pinch, + and − zoom. The robot
// drives nothing while it's open (grab and use still work, so you can light a saber for the picture). Selfie (or P) puts it
// away. In VR, the same button opens the mini-me instead (app/vr-selfie.ts). The rules are in
// shared/sim/selfie.ts.

export interface SelfieGame {
  keys: Record<string, boolean>;
  pressed: Record<string, boolean>;
  canvas: HTMLElement;
  button: HTMLButtonElement | null;
  /** Puts the chase camera back behind the robot (after the Selfie's drags have turned it too). */
  resetCam(): void;
  /** In VR, the Selfie is the mini-me. */
  vr: { readonly presenting: boolean; toggleSelfie(): void; readonly selfieOpen: boolean };
}

/** The actions the Selfie takes over while it's open: driving, and the camera's own keys. */
const TAKEN = ['up', 'down', 'left', 'right', 'jump', 'spin', 'boost', 'camL', 'camR', 'zoomIn', 'zoomOut', 'camReset'];

const v = new THREE.Vector3();
const q = new THREE.Quaternion();

export function createSelfie(game: SelfieGame) {
  const { keys, pressed, canvas, button } = game;
  let orbit: Orbit | null = null;
  /** The taken actions held this frame. */
  const held = new Set<string>();

  function show() {
    const open = game.vr.presenting ? game.vr.selfieOpen : orbit !== null;
    if (!button) return;
    button.classList.toggle('on', open);
    button.setAttribute('aria-pressed', String(open));
  }

  function close() {
    if (!orbit) return;
    orbit = null;
    game.resetCam();
    show();
  }

  function toggle() {
    if (game.vr.presenting) game.vr.toggleSelfie();
    else if (orbit) close();
    else orbit = openOrbit();
    show();
  }

  button?.addEventListener('click', (e) => {
    e.preventDefault();
    toggle();
    button.blur();
  });

  // dragging turns the orbit (the chase camera's own drag turns it too, and is reset on closing)
  const ptrs = new Map<number, { x: number; y: number }>();
  canvas.addEventListener('pointerdown', (e) => {
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  });
  canvas.addEventListener('pointermove', (e) => {
    const pt = ptrs.get(e.pointerId);
    if (!pt) return;
    const dx = e.clientX - pt.x;
    const dy = e.clientY - pt.y;
    pt.x = e.clientX;
    pt.y = e.clientY;
    if (orbit && ptrs.size === 1) orbit = turnOrbit(orbit, -dx * SELFIE.dragTurn, dy * SELFIE.dragTilt);
  });
  const up = (e: PointerEvent) => ptrs.delete(e.pointerId);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => {
    if (orbit) orbit = zoomOrbit(orbit, Math.exp(e.deltaY * 0.0012));
  });

  return {
    toggle,
    close,
    get open() {
      return orbit !== null;
    },
    /** The orbit, for tests. */
    get orbit() {
      return orbit;
    },
    /** Called on every frame's update: keeps the button in step, and takes over the keys while it's open. */
    step(dt: number, mode: string): boolean {
      if (pressed.selfie) toggle();
      if (orbit && (mode === 'ship' || game.vr.presenting)) close();
      if (!orbit) {
        held.clear();
        return false;
      }
      held.clear();
      for (const k of TAKEN) if (keys[k]) held.add(k);
      const on = (k: string) => (held.has(k) ? 1 : 0);
      orbit = steerOrbit(orbit, on('right') + on('camR') - on('left') - on('camL'), on('up') - on('down'), dt);
      if (held.has('zoomIn') || held.has('zoomOut'))
        orbit = zoomOrbit(orbit, Math.exp((on('zoomOut') - on('zoomIn')) * 1.4 * dt));
      // hidden from the game's update (and given back after it), so the robot drives nothing
      for (const k of TAKEN) {
        keys[k] = false;
        pressed[k] = false;
      }
      return true;
    },
    /** Gives back the keys the Selfie hid from this frame's update, so it still sees them held next frame. */
    afterUpdate() {
      for (const k of held) keys[k] = true;
    },
    /**
     * Where the camera stands, for a robot at `at` on the floor strip with heading `yaw` (or, with `frame`, in real
     * space, turned by the robot's own frame), and the point it looks at.
     */
    place(
      at: THREE.Vector3,
      yaw: number,
      lift: number,
      out: THREE.Vector3,
      look: THREE.Vector3,
      frame?: THREE.Quaternion,
    ) {
      if (!orbit) return;
      const o = orbitOffset(orbit);
      if (frame) {
        out.copy(v.set(o.x, o.y, o.z).applyQuaternion(q.copy(frame))).add(at);
        look.set(0, SELFIE.lookHeight, 0).applyQuaternion(q).add(at);
        return;
      }
      const s = robotToStrip(o, yaw);
      out.set(at.x + s.x, Math.max(0.35, s.y + lift), at.z + s.z);
      look.set(at.x, SELFIE.lookHeight + lift, at.z);
    },
  };
}

export type Selfie = ReturnType<typeof createSelfie>;
