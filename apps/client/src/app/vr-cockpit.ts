import { COCKPIT, stickInput, throttleInput, withinReach } from '@saber-side/shared';
import * as THREE from 'three';
import type { VrShipControls } from './flight';

// The ship's cockpit controls in VR (quest-vr PR 7): a joystick by your right hand and a throttle by your left, in
// the cockpit, in your play space (the rig rides in the ship's frame, so they stay put while space moves outside).
//
// - Grip the joystick's knob to take hold of it. Tilt it forward to dive and back to climb, tilt it or twist it to
//   turn, and squeeze the trigger to fire. Letting go springs it back to the middle.
// - Grip the throttle's handle and slide it forward to speed up, back to slow down. It stays where you leave it.
//
// Either hand can take either control. The rules (tilts, the throttle's travel and its speeds) are in
// shared/sim/vr-cockpit.ts. Built the first time you board a ship in VR.

interface HandPose {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  tracked: boolean;
  grab: boolean;
  use: boolean;
}

interface Hold {
  hand: number;
  from: THREE.Vector3;
  yaw: number;
  throttle: number;
}

const v = new THREE.Vector3();

/** Which way a hand points round the vertical (radians, positive to the left), for the stick's twist. */
function handYaw(q: THREE.Quaternion): number {
  v.set(0, 0, -1).applyQuaternion(q);
  return Math.atan2(-v.x, -v.z);
}

export function createCockpit() {
  const group = new THREE.Group();
  group.name = 'vr-cockpit';
  const metal = new THREE.MeshStandardMaterial({ color: 0x48413b, roughness: 0.4, metalness: 0.8 });
  const grip = new THREE.MeshStandardMaterial({ color: 0xc0662a, roughness: 0.6, metalness: 0.2 });
  // the joystick: a base, and a shaft that pivots at its foot, with a knob on top
  const stick = new THREE.Group();
  const stickBase = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.03, 20), metal);
  stickBase.position.y = -0.16;
  stick.add(stickBase);
  const stickPivot = new THREE.Group();
  stickPivot.position.y = -0.15;
  stick.add(stickPivot);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.015, 0.15, 10), metal);
  shaft.position.y = 0.075;
  stickPivot.add(shaft);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), grip);
  knob.position.y = 0.15;
  stickPivot.add(knob);
  group.add(stick);
  // the throttle: a track along the cockpit floor, and a handle that slides along it
  const throttle = new THREE.Group();
  const track = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, COCKPIT.throttleTravel + 0.04), metal);
  track.position.y = -0.06;
  throttle.add(track);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.035), grip);
  throttle.add(handle);
  group.add(throttle);
  group.visible = false;

  let stickHold: Hold | null = null;
  let throttleHold: Hold | null = null;
  let throttleAt: number = COCKPIT.throttleStart;
  const was = [false, false];
  /** Where your head was when you sat down (the play space, meters): the controls are placed from it. */
  const seat = new THREE.Vector3();

  const rest = (at: { x: number; y: number; z: number }) => v.set(seat.x + at.x, seat.y + at.y, seat.z + at.z);
  /** Where the throttle's handle is now, for its setting. */
  const handleAt = (t: number) => ({
    ...COCKPIT.throttle,
    z: COCKPIT.throttle.z + (COCKPIT.throttleTravel / 2) * (1 - 2 * t),
  });

  return {
    group,
    /** For tests: the setting, which hands hold what, and where the controls rest in the play space. */
    get throttle() {
      return throttleAt;
    },
    get holding() {
      return { stick: stickHold?.hand ?? null, throttle: throttleHold?.hand ?? null };
    },
    restAt(which: 'stick' | 'throttle') {
      const at = which === 'stick' ? COCKPIT.stick : handleAt(throttleAt);
      const p = rest(at);
      return { x: p.x, y: p.y, z: p.z };
    },
    /** Sits you down: the controls go in front of where your head is now, and the throttle back to cruising. */
    sit(head: THREE.Vector3) {
      seat.copy(head);
      stickHold = null;
      throttleHold = null;
      throttleAt = COCKPIT.throttleStart;
      group.visible = true;
    },
    leave() {
      stickHold = null;
      throttleHold = null;
      group.visible = false;
    },
    /**
     * Reads the hands on the controls this frame. Returns the ship's controls, the hands holding a control (whose
     * grip and trigger the game shouldn't see), and which hands just took hold (for a buzz).
     */
    update(hands: HandPose[]) {
      const took: number[] = [];
      hands.forEach((h, i) => {
        const fresh = h.tracked && h.grab && !was[i];
        was[i] = h.tracked && h.grab;
        if (stickHold?.hand === i && !(h.tracked && h.grab)) stickHold = null;
        if (throttleHold?.hand === i && !(h.tracked && h.grab)) throttleHold = null;
        if (!fresh) return;
        const local = { x: h.pos.x - seat.x, y: h.pos.y - seat.y, z: h.pos.z - seat.z };
        if (!stickHold && withinReach(local, COCKPIT.stick)) {
          stickHold = { hand: i, from: h.pos.clone(), yaw: handYaw(h.quat), throttle: 0 };
          took.push(i);
        } else if (!throttleHold && withinReach(local, handleAt(throttleAt))) {
          throttleHold = { hand: i, from: h.pos.clone(), yaw: 0, throttle: throttleAt };
          took.push(i);
        }
      });
      const out: VrShipControls = { throttle: throttleAt, fire: false };
      let tilt = { fwd: 0, side: 0, twist: 0 };
      if (stickHold) {
        const h = hands[stickHold.hand] as HandPose;
        const moved = { x: h.pos.x - stickHold.from.x, y: h.pos.y - stickHold.from.y, z: h.pos.z - stickHold.from.z };
        const s = stickInput(moved, handYaw(h.quat) - stickHold.yaw);
        out.pitch = s.pitch;
        out.turn = s.turn;
        out.fire = h.use;
        tilt = s.tilt;
      }
      if (throttleHold) {
        const h = hands[throttleHold.hand] as HandPose;
        throttleAt = throttleInput(throttleHold.throttle, h.pos.z - throttleHold.from.z);
        out.throttle = throttleAt;
      }
      // draw them where they are: the stick leans the way it's pushed (and springs back), the handle slides
      stick.position.copy(rest(COCKPIT.stick));
      stickPivot.rotation.set(-tilt.fwd * 0.45, tilt.twist * 0.6, -tilt.side * 0.45);
      throttle.position.copy(rest(COCKPIT.throttle));
      handle.position.set(0, 0, (COCKPIT.throttleTravel / 2) * (1 - 2 * throttleAt));
      const taken = new Set<number>();
      if (stickHold) taken.add(stickHold.hand);
      if (throttleHold) taken.add(throttleHold.hand);
      return { controls: out, taken, took };
    },
  };
}
