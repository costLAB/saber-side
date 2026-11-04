import { type Orbit, openOrbit, SELFIE, spinMini, twistMini } from '@saber-side/shared';
import * as THREE from 'three';
import { buildRobot, disposeRobot, type Robot, type RobotKit } from '../avatar/robot';
import { bendMaterial, REAL_OFF } from '../render/ring/bend';

// The Selfie in VR: a "mini-me", a small live copy of your robot floating in front of you (quest-vr PR 9). It's built
// from the same parts and paint, and posed from your robot every frame, so it waves when you wave. The right stick
// spins and tilts it; or reach in and grip it, and it turns with your hand. The camera never moves, so it's comfortable.
//
// It hangs in your play space, where you were looking when you opened it, so it stays put while you look around.
// It's drawn in real space (parked REAL_OFF up, which the bend shader draws as-is: render/ring/bend.ts), so it lands
// exactly where the rig puts it, on the floor or in the hub.
//
// It's built the first time it opens, not at boot: three.js draws every new object's id from Math.random, and the
// flat game mustn't shift because VR exists.

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);

export function createMiniMe(kit: RobotKit, bot: Robot) {
  let mini: Robot | null = null;
  /** Each part of your robot, and the part of the mini-me that copies it. */
  let pairs: [THREE.Object3D, THREE.Object3D][] = [];
  let open = false;
  let orbit: Orbit = openOrbit();
  /** Where the mini-me's middle floats in your play space (meters), and which way it faced you when it opened. */
  const at = new THREE.Vector3();
  let facing = 0;
  /** The hand turning it: which, where the mini-me was when it gripped, and the hand's turn and tilt then. */
  let grip: { hand: number; start: Orbit; turn: number; tilt: number } | null = null;

  const v = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const q2 = new THREE.Quaternion();
  const m = new THREE.Matrix4();
  const m2 = new THREE.Matrix4();

  /** Builds (or rebuilds, after the robot changes parts) the mini-me, and pairs up the parts it copies. */
  function ensure(): Robot {
    if (mini && mini.build === bot.build) return mini;
    if (mini) {
      mini.root.parent?.remove(mini.root);
      disposeRobot(mini, Object.values(kit.materials));
    }
    const next = buildRobot(kit, bot.build);
    next.root.matrixAutoUpdate = false;
    next.root.traverse((o) => {
      const drawn = o as THREE.Mesh | THREE.Sprite;
      if (!(drawn as THREE.Mesh).isMesh && !(drawn as THREE.Sprite).isSprite) return;
      o.frustumCulled = false;
      for (const mat of Array.isArray(drawn.material) ? drawn.material : [drawn.material]) bendMaterial(mat);
    });
    pairs = [];
    // the grip moves between hands in VR, and holds things the mini-me doesn't have, so it's paired on its own
    const pair = (a: THREE.Object3D, b: THREE.Object3D) => {
      pairs.push([a, b]);
      const ac = a.children.filter((c) => c !== bot.grip);
      const bc = b.children.filter((c) => c !== next.grip);
      for (let i = 0; i < Math.min(ac.length, bc.length); i++) pair(ac[i] as THREE.Object3D, bc[i] as THREE.Object3D);
    };
    pair(bot.lean, next.lean);
    mini = next;
    return next;
  }

  /** Poses the mini-me like your robot, this frame. */
  function copyPose(r: Robot) {
    for (const [a, b] of pairs) {
      b.position.copy(a.position);
      b.quaternion.copy(a.quaternion);
      b.scale.copy(a.scale);
      b.visible = a.visible;
    }
    const gripParent = pairs.find(([a]) => a === bot.grip.parent)?.[1];
    if (gripParent && r.grip.parent !== gripParent) gripParent.add(r.grip);
    r.grip.position.copy(bot.grip.position);
    r.grip.quaternion.copy(bot.grip.quaternion);
    r.coat.value = bot.coat.value;
  }

  /** A hand's turn (round the vertical) and tilt (up and down), from which way its grip points. */
  function handAngles(quat: THREE.Quaternion) {
    v.set(0, 0, -1).applyQuaternion(quat);
    return { turn: Math.atan2(-v.x, -v.z), tilt: Math.asin(Math.max(-1, Math.min(1, v.y))) };
  }

  return {
    get open() {
      return open;
    },
    get orbit() {
      return orbit;
    },
    /** Opens it in front of your eyes (or puts it away). */
    toggle(head: THREE.Vector3, headQ: THREE.Quaternion) {
      open = !open;
      grip = null;
      if (!open) return;
      ensure();
      orbit = { ...openOrbit(), tilt: 0 };
      v.set(0, 0, -1).applyQuaternion(headQ);
      v.y = 0;
      if (v.lengthSq() < 1e-6) v.set(0, 0, -1);
      v.normalize();
      at.copy(head).addScaledVector(v, SELFIE.miniAhead);
      at.y -= SELFIE.miniBelow;
      // it faces you: its front (+z) points back along your look
      facing = Math.atan2(-v.x, -v.z);
    },
    close() {
      open = false;
      grip = null;
    },
    /** The right stick spins and tilts it. */
    stick(x: number, y: number, dt: number) {
      if (open && !grip) orbit = spinMini(orbit, x, y, dt);
    },
    /**
     * Lets a hand grip it and turn it. Returns the hands that are holding it, whose grip the game shouldn't see.
     */
    hands(
      hands: { pos: THREE.Vector3; quat: THREE.Quaternion; grab: boolean; tracked: boolean }[],
      wasGrab: boolean[],
    ) {
      const taken = new Set<number>();
      if (!open) return taken;
      if (grip) {
        const h = hands[grip.hand];
        if (!h?.tracked || !h.grab) grip = null;
        else {
          const a = handAngles(h.quat);
          orbit = twistMini(grip.start, a.turn - grip.turn, a.tilt - grip.tilt);
          taken.add(grip.hand);
        }
      }
      if (!grip)
        hands.forEach((h, i) => {
          if (grip || !h.tracked || !h.grab || wasGrab[i]) return;
          if (h.pos.distanceTo(at) > SELFIE.miniReach) return;
          const a = handAngles(h.quat);
          grip = { hand: i, start: orbit, turn: a.turn, tilt: a.tilt };
          taken.add(i);
        });
      return taken;
    },
    /** Where its middle floats in your play space (meters). */
    at,
    /**
     * Places and poses it for this frame (or hides it): in the rig's play space, `rigScale` scene units per meter, and
     * its middle `middle` scene units above its wheel.
     */
    draw(scene: THREE.Scene, rig: THREE.Object3D, rigScale: number, middle: number) {
      if (!open) {
        if (mini) mini.root.visible = false;
        return;
      }
      const r = ensure();
      if (r.root.parent !== scene) scene.add(r.root);
      r.root.visible = true;
      copyPose(r);
      const s = SELFIE.miniScale / rigScale;
      q.setFromAxisAngle(Y_AXIS, facing + orbit.turn).multiply(q2.setFromAxisAngle(X_AXIS, -orbit.tilt));
      m.compose(at, q, v.setScalar(s)).multiply(m2.makeTranslation(0, -middle, 0));
      rig.updateMatrixWorld(true);
      r.root.matrix.makeTranslation(0, REAL_OFF, 0).multiply(m2.copy(rig.matrixWorld)).multiply(m);
      r.root.matrixWorldNeedsUpdate = true;
    },
    /** Takes it out of the scene (leaving VR). */
    hide() {
      open = false;
      grip = null;
      if (mini) mini.root.visible = false;
    },
    /** The mini-me itself, for tests. */
    get robot() {
      return mini;
    },
  };
}
