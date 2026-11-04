import {
  type ArmShape,
  atMouth,
  controllerCurl,
  HAND_REACH,
  HAPTICS,
  type HandGesture,
  type HandJoints,
  HOLD_CURL,
  handGesture,
  mouthPoint,
  OPEN_HAND,
  reachFor,
  THROW_MAX,
} from '@saber-side/shared';
import type { XRFrame, XRInputSource, XRJointSpace, XRReferenceSpace } from 'three';
import * as THREE from 'three';
import { applyArmPose, type Robot, type RobotArm } from '../avatar/robot';

// A Quest player's hands, as their robot's arms. Each frame the VR mode (app/vr.ts) hands over the controllers (or
// tracked hands), and this:
// - reaches the robot's arms for them through the IK in shared/sim/arm-ik.ts, so the robot's hands go where yours
//   are, as near as its arms reach. The angles go in `RobotArm.cur`, which the pose messages already carry, so friends
//   see the arms move;
// - turns the robot's head the way the headset turns, relative to its body (the pose's head angles);
// - works out grabbing and using: grip (or a fist) and trigger (or a pinch), per hand, so a grab picks up what's near
//   that hand, and the held item sits in that hand, pointing the way your hand does;
// - eats a carrot brought up to your mouth, throws what you let go of with your hand's swing, and buzzes the
//   controllers: on pick-up and drop, a hum while a saber is lit, and a kick when a blaster fires.
//
// Three.js objects are only read and re-parented here, never created at boot (see app/vr.ts).

/** An item the robot can hold, as the legacy game keeps it. */
export interface HeldItem {
  kind: string;
  group: THREE.Object3D;
  vel: THREE.Vector3;
  /** A saber's glow, 0 (off) to 1 (lit). */
  lit?: number;
}

/** Where a grabbing hand is reaching from, for the legacy game's grab. */
export interface GrabHand {
  /** The robot's grip, in the robot's world (the floor strip, or real space). */
  at: THREE.Vector3;
  /** How far from `at` an item can be picked up. */
  reach: number;
  /** Whether this hand holds the robot's item (so an empty grab drops it). */
  holding: boolean;
}

/** What the hands need from the VR mode each frame. */
export interface HandFrame {
  frame: XRFrame;
  space: XRReferenceSpace;
  /** The headset, in the play space (meters). */
  head: THREE.Vector3;
  headQ: THREE.Quaternion;
}

/** One hand, as read this frame. */
interface Hand {
  side: 'left' | 'right';
  tracked: boolean;
  /** The grip, in the play space (meters), pointing along its -z. */
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  grab: boolean;
  use: boolean;
  /** The use button (or pinch) went down this frame. */
  usedNow: boolean;
  curl: number;
  /** How far the robot's grip fell short of yours, last pose (scene units, in its core frame). */
  miss: number;
  gesture: HandGesture;
  /** A tracked hand, not a controller. */
  bare: boolean;
  pad: Gamepad | null;
  /** The robot's grip on this side, in the robot's world, and how fast it's moving. */
  grip: THREE.Vector3;
  lastGrip: THREE.Vector3 | null;
  vel: THREE.Vector3;
}

const JOINTS = {
  wrist: 'wrist',
  thumbTip: 'thumb-tip',
  indexTip: 'index-finger-tip',
  middleTip: 'middle-finger-tip',
  ringTip: 'ring-finger-tip',
  pinkyTip: 'pinky-finger-tip',
} as const satisfies Record<keyof HandJoints, string>;

/** How each kind of item sits in the robot's hand, from the hand's frame (your grip: forward is -z, up is +y). */
// the blade (or the carrot's tip) along +y points out ahead of your fist
const POINT_AHEAD = new THREE.Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2);
const ITEM_TURN: Record<string, THREE.Quaternion> = {
  saber: POINT_AHEAD,
  carrot: POINT_AHEAD,
  // the blaster's barrel along -z points ahead, its body (at -y) on top of your hand
  gun: new THREE.Quaternion(0, 0, 1, 0),
};

const TURN_AROUND = new THREE.Quaternion(0, 1, 0, 0);
/** The head turns at most this far from the body (radians): side to side, up and down, and tilting. */
const HEAD_YAW = 1.4;
const HEAD_PITCH = 0.9;
const HEAD_ROLL = 0.6;
/** A hand moving its grip farther than this in a frame jumped (a lap of the ring, a lift ride): no speed from that. */
const JUMP = 3;

export function createVrHands(bot: Robot) {
  const hands: Hand[] = (['left', 'right'] as const).map((side) => ({
    side,
    tracked: false,
    pos: new THREE.Vector3(),
    quat: new THREE.Quaternion(),
    grab: false,
    use: false,
    usedNow: false,
    curl: 0,
    miss: 0,
    gesture: { ...OPEN_HAND },
    bare: false,
    pad: null,
    grip: new THREE.Vector3(),
    lastGrip: null,
    vel: new THREE.Vector3(),
  }));
  /** The robot's arms on each side: arms[0] is its left (+x), arms[1] its right. */
  const ARM_OF = { left: 0, right: 1 } as const;

  /** The hand that just grabbed this frame, if any, and the one holding the robot's item. */
  let grabbing: number | null = null;
  let heldBy: number | null = null;
  let lastHeld: HeldItem | null = null;
  let lastRecoil = 0;
  let humIn = 0;
  let mouthWas = false;
  let gripTurned = false;
  /** Haptic pulses sent, for tests (`?debug`). */
  const pulses: string[] = [];

  /** Play space → the robot root's frame (scene units), and its turn; set by the VR mode for each use. */
  const toRoot = new THREE.Matrix4();
  const turnRoot = new THREE.Quaternion();

  const v = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const q2 = new THREE.Quaternion();
  const e = new THREE.Euler(0, 0, 0, 'YXZ');
  const shapes = new WeakMap<RobotArm, ArmShape>();

  /** An arm's size, read once off its joints (the robot's parts differ). */
  function shapeOf(arm: RobotArm): ArmShape {
    let s = shapes.get(arm);
    if (!s) {
      const p = arm.shoulder.position;
      s = {
        s: arm.s,
        shoulder: { x: p.x, y: p.y, z: p.z },
        upper: arm.elbow.position.length(),
        fore: arm.wrist.position.length(),
        hand: Math.abs(bot.grip.position.y) * arm.wrist.scale.y,
      };
      shapes.set(arm, s);
    }
    return s;
  }

  /** Where the robot's grip is on an arm (in the robot's world). */
  function gripPoint(arm: RobotArm, out: THREE.Vector3) {
    arm.wrist.updateWorldMatrix(true, false);
    return arm.wrist.localToWorld(out.copy(bot.grip.position));
  }

  function pulse(i: number | null, kind: keyof typeof HAPTICS, scale = 1) {
    if (i === null) return;
    const h = HAPTICS[kind];
    pulses.push(`${hands[i]?.side}:${kind}`);
    if (pulses.length > 50) pulses.shift();
    const actuator = (hands[i]?.pad as (Gamepad & { hapticActuators?: GamepadHapticActuator[] }) | null)
      ?.hapticActuators?.[0] as (GamepadHapticActuator & { pulse?: (v: number, ms: number) => unknown }) | undefined;
    try {
      const p = actuator?.pulse?.(h.intensity * scale, h.ms);
      if (p instanceof Promise) p.catch(() => {});
    } catch {
      // no haptics on this device
    }
  }

  /** Reads the controllers and hands for this frame. */
  function read(sources: readonly XRInputSource[], f: HandFrame) {
    for (const h of hands) h.tracked = false;
    grabbing = null;
    for (const src of sources) {
      const h = hands.find((x) => x.side === src.handedness);
      if (!h) continue;
      const space = src.gripSpace ?? (src.hand as unknown as Map<string, XRJointSpace> | undefined)?.get('wrist');
      const pose = space ? f.frame.getPose(space, f.space) : undefined;
      if (!pose) continue;
      const p = pose.transform.position;
      const o = pose.transform.orientation;
      h.pos.set(p.x, p.y, p.z);
      h.quat.set(o.x, o.y, o.z, o.w);
      h.bare = !!src.hand;
      h.pad = src.hand ? null : (src.gamepad as unknown as Gamepad);
      const was = { grab: h.grab, use: h.use };
      if (src.hand) {
        const joints = readJoints(src.hand as unknown as Map<string, XRJointSpace>, f);
        if (!joints) continue;
        h.gesture = handGesture(joints, h.gesture);
        h.grab = h.gesture.fist;
        h.use = h.gesture.pinch;
        h.curl = h.gesture.curl;
      } else {
        const b = src.gamepad?.buttons ?? [];
        h.grab = !!b[1]?.pressed;
        h.use = !!b[0]?.pressed;
        h.curl = controllerCurl(b[1]?.value ?? 0, b[0]?.value ?? 0);
      }
      h.tracked = true;
      if (h.grab && !was.grab) grabbing = ARM_OF[h.side];
      h.usedNow = h.use && !was.use;
    }
    for (const h of hands) if (!h.tracked) h.grab = h.use = h.usedNow = false;
  }

  function readJoints(hand: Map<string, XRJointSpace>, f: HandFrame): HandJoints | null {
    const out: Partial<Record<keyof HandJoints, { x: number; y: number; z: number }>> = {};
    for (const [k, name] of Object.entries(JOINTS) as [keyof HandJoints, string][]) {
      const joint = hand.get(name);
      const pose = joint ? f.frame.getJointPose?.(joint, f.space) : undefined;
      if (!pose) return null;
      const p = pose.transform.position;
      out[k] = { x: p.x, y: p.y, z: p.z };
    }
    return out as HandJoints;
  }

  return {
    hands,
    pulses,
    pulse,
    toRoot,
    turnRoot,

    /**
     * Reads this frame's hands, and says which actions they press: `held` while down, and `fresh` when a hand closes
     * on one while the other already holds it (so it's pressed again, as each hand's own press).
     */
    input(sources: readonly XRInputSource[], f: HandFrame, held: HeldItem | null) {
      read(sources, f);
      const now = new Set<string>();
      const fresh = new Set<string>();
      for (const h of hands) {
        if (h.grab) now.add('grab');
        if (h.use) now.add('use');
        if (h.usedNow) fresh.add('use');
      }
      if (grabbing !== null) fresh.add('grab');
      // a carrot brought up to your mouth takes a bite (another as soon as each one's done, while it stays there)
      const by = heldBy === null ? null : hands[heldBy];
      if (held?.kind === 'carrot' && by?.tracked) {
        const down = v.set(0, -1, 0).applyQuaternion(f.headQ);
        const ahead = v2.set(0, 0, -1).applyQuaternion(f.headQ);
        mouthWas = atMouth(by.pos, mouthPoint(f.head, down, ahead), mouthWas);
        if (mouthWas) {
          now.add('use');
          fresh.add('use');
        }
      } else mouthWas = false;
      return { now, fresh };
    },

    /** Poses an arm from its hand, if that hand is tracked. Returns whether it did. */
    poseArm(arm: RobotArm): boolean {
      const i = bot.arms.indexOf(arm);
      const h = hands[i];
      if (!h?.tracked) return false;
      // your grip, from the play space to the robot's core (the arms' frame)
      v.copy(h.pos).applyMatrix4(toRoot);
      bot.core.worldToLocal(bot.root.localToWorld(v));
      bot.core.getWorldQuaternion(q2).invert();
      bot.root.getWorldQuaternion(q);
      q2.multiply(q).multiply(turnRoot).multiply(h.quat);
      v2.set(0, 0, -1).applyQuaternion(q2);
      const r = reachFor(shapeOf(arm), v, v2, arm.cur);
      Object.assign(arm.cur, r.angles);
      h.miss = Math.hypot(r.grip.x - v.x, r.grip.y - v.y, r.grip.z - v.z);
      arm.cur.curl = lastHeld && heldBy === i ? Math.max(h.curl, HOLD_CURL) : h.curl;
      applyArmPose(arm);
      return true;
    },

    /** Turns the robot's head the way the headset turns from its body. */
    poseHead(headQ: THREE.Quaternion) {
      // the headset looks along its -z, the robot's head along its +z
      e.setFromQuaternion(q.copy(turnRoot).multiply(headQ).multiply(TURN_AROUND), 'YXZ');
      const clampTo = (a: number, m: number) => Math.max(-m, Math.min(m, a));
      bot.head.rotation.set(clampTo(e.x, HEAD_PITCH), clampTo(e.y, HEAD_YAW), clampTo(e.z, HEAD_ROLL), 'YXZ');
    },

    /** The hand that grabbed this frame, for the legacy grab: where it reaches from, and whether it holds the item. */
    grabHand(): GrabHand | null {
      const arm = grabbing === null ? undefined : bot.arms[grabbing];
      if (!arm || grabbing === null) return null;
      return { at: gripPoint(arm, new THREE.Vector3()), reach: HAND_REACH, holding: !!lastHeld && heldBy === grabbing };
    },

    /**
     * Puts the held item in the hand that holds it, pointing the way your hand does; and notices pick-ups, drops
     * (thrown with the hand's swing), a lit saber, and blaster shots, for the haptics. `dt` is this frame's step and
     * `recoil` the legacy game's blaster recoil (1 just after a shot).
     */
    poseGrip(held: HeldItem | null, dt: number, recoil: number) {
      for (let i = 0; i < hands.length; i++) {
        const h = hands[i] as Hand;
        const arm = bot.arms[i];
        if (!h.tracked || !arm) {
          h.lastGrip = null;
          continue;
        }
        gripPoint(arm, h.grip);
        if (h.lastGrip && h.grip.distanceTo(h.lastGrip) < JUMP && dt > 0)
          h.vel.lerp(v.copy(h.grip).sub(h.lastGrip).divideScalar(dt), 0.5);
        else h.vel.set(0, 0, 0);
        h.lastGrip = (h.lastGrip ?? new THREE.Vector3()).copy(h.grip);
      }
      if (held !== lastHeld) {
        if (held) {
          if (grabbing !== null) heldBy = grabbing;
          heldBy ??= 0;
          pulse(heldBy, 'pickUp');
        } else if (lastHeld && heldBy !== null) {
          // let go: it flies off with the hand's swing (a hand held still just drops it)
          const h = hands[heldBy];
          if (h?.tracked && lastHeld.group.visible) {
            lastHeld.vel.copy(h.vel);
            if (lastHeld.vel.length() > THROW_MAX) lastHeld.vel.setLength(THROW_MAX);
          }
          pulse(heldBy, 'drop');
          heldBy = null;
        }
        lastHeld = held;
      }
      if (held?.kind === 'saber' && (held.lit ?? 0) > 0.05) {
        humIn -= dt;
        if (humIn <= 0) {
          pulse(heldBy, 'saberHum', held.lit);
          humIn = HAPTICS.saberHum.every;
        }
      } else humIn = 0;
      if (held?.kind === 'gun' && recoil > lastRecoil + 0.3) pulse(heldBy, 'blasterKick');
      lastRecoil = recoil;

      // the item sits in the hand holding it, turned the way your hand is
      const i = heldBy;
      const arm = i === null ? undefined : bot.arms[i];
      const h = i === null ? undefined : hands[i];
      if (!held || !arm || !h?.tracked) {
        settleGrip();
        return;
      }
      if (bot.grip.parent !== arm.wrist) arm.wrist.add(bot.grip);
      bot.root.getWorldQuaternion(q);
      q.multiply(turnRoot)
        .multiply(h.quat)
        .multiply(ITEM_TURN[held.kind] ?? POINT_AHEAD);
      arm.wrist.getWorldQuaternion(q2);
      bot.grip.quaternion.copy(q2.invert().multiply(q));
      gripTurned = true;
    },

    /** A frame VR doesn't pose the robot (spinning, in a ship): the legacy animation holds the item as it always has. */
    idle(held: HeldItem | null) {
      settleGrip();
      lastHeld = held;
      if (!held) heldBy = null;
      grabbing = null;
    },

    /** Gives the grip back to the robot's left hand, as the flat game holds things (leaving VR, say). */
    release() {
      settleGrip();
      for (const h of hands) {
        h.tracked = h.grab = h.use = false;
        h.lastGrip = null;
      }
      grabbing = null;
      mouthWas = false;
    },
  };

  function settleGrip() {
    const left = bot.arms[0];
    if (left && bot.grip.parent !== left.wrist) left.wrist.add(bot.grip);
    if (gripTurned) {
      // the legacy game only sets the grip's x angle; the rest goes back to how it holds things
      bot.grip.rotation.y = 0;
      bot.grip.rotation.z = 0;
      gripTurned = false;
    }
  }
}

export type VrHands = ReturnType<typeof createVrHands>;
