import {
  type ArmShape,
  CAT_TAIL,
  createTailChain,
  damp,
  MESSAGE,
  reachFor,
  resetTailChain,
  type StationView,
  stepTailChain,
  TAIL_GRAB,
  type TailAnswer,
  type TailChain,
  type TailGrab,
  type TailInput,
  type TailPin,
  tailStretch,
} from '@saber-side/shared';
import * as THREE from 'three';
import { applyArmPose, type CatTail, type Robot, type RobotArm } from '../avatar/robot';

// Snatch's tail, alive (docs/initiatives/sketchbook-characters.md, "The cat's tail"): every cat on screen, this
// device's own included, swings its tail with the ragdoll in shared/sim/tail-chain.ts, from its robot as drawn. It's
// cosmetic, so each client runs its own; nothing about it goes over the wire but who holds it.
//
// And friends can grab it. Grab (the same press that picks up an item) with no item near reaches for the nearest
// friend's tail: the station checks it (sim/tail-grab.ts) and puts who holds it on the cat's seat, and every client
// pins that tail to that robot's hand. On an iPad or Mac the free right hand takes it (a saber stays in the left);
// in VR, the hand that gripped. Pressing grab again lets go. The cat feels it: a held tail tugs it toward the hand,
// pulled too far the grip breaks (the station decides), and a spin attack shakes it free.

/** What the module needs of the game: this device's robot, and where it drives (null when it isn't on the floor). */
export interface TailsWorld {
  bot: Robot;
  drivingOnFloor(): { x: number; z: number } | null;
}

/** A friend's robot on screen (app/presence.ts). */
export interface OtherRobot {
  id: string;
  name: string;
  robot: Robot;
}

/** The station, once aboard. */
export interface TailsLink {
  room: { sessionId: string; state: StationView; send(type: string, message?: unknown): void };
  /** The friends' robots on screen, by session id. */
  others(): Iterable<OtherRobot>;
}

/** The VR hand that gripped (app/vr-hands.ts GrabHand): where it is, and how far it reaches. */
export interface TailHand {
  at: THREE.Vector3;
  reach: number;
}

export interface Tails {
  /** Online, or offline when undefined. */
  attach(link: TailsLink | undefined): void;
  /** Call every frame, after remote robots are posed. */
  frame(dt: number): void;
  /** The station refused a grab. */
  refused(answer: TailAnswer): void;
  /** Whose tail a grab here would reach, for the prompt (a name), or null. `hand` is the VR hand, if any. */
  near(hand?: TailHand | null): string | null;
  /** Reaches for the nearest friend's tail. True if it reached for one. */
  tryGrab(hand?: TailHand | null): boolean;
  /** Whether this robot holds a tail (or is asking to). */
  holding(): boolean;
  /** Lets go of the tail this robot holds. */
  letGo(): void;
  /** Poses the arm holding a tail, on flat devices. True if it did (the game leaves that arm alone then). */
  poseArm(arm: RobotArm, dt: number): boolean;
  /** This robot started a spin attack: it shakes its own tail free. */
  spun(): void;
  /** For tests (`?debug`): every cat's chain, by whose it is ('me' for this device's). */
  readonly debug: { chains(): Map<string, TailChain> };
}

/** How near a flat grab reaches: from the robot's middle to a point of a friend's tail, across the floor. */
const FLAT_REACH = 2.8;
/** And how high above or below its feet. */
const FLAT_HEIGHT = 3.2;
/** Cats farther than this from this robot keep their tail at rest, unsimulated (it's cheaper, and too far to see). */
const FAR = 60;
/** A grab waits this long for the station to say yes before it gives up showing it. */
const PENDING_SECONDS = 1.5;
/** How tightly a hand holding a tail closes. */
const HOLD_CURL = 0.9;

interface Rig {
  chain: TailChain;
  points: THREE.Vector3[];
}

interface Pending {
  target: string;
  segment: number;
  hand: number;
  left: number;
}

const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

export function createTails(world: TailsWorld): Tails {
  const rigs = new WeakMap<CatTail, Rig>();
  let link: TailsLink | undefined;
  let pending: Pending | undefined;
  /** The arm angles each held-tail arm eases toward, and the shapes the IK needs. */
  const shapes = new WeakMap<RobotArm, ArmShape>();

  function rigOf(tail: CatTail): Rig {
    let rig = rigs.get(tail);
    if (!rig) {
      tail.group.updateWorldMatrix(true, false);
      rig = {
        chain: createTailChain(CAT_TAIL, tail.group.matrixWorld.elements),
        points: CAT_TAIL.rest.map(() => new THREE.Vector3()),
      };
      rigs.set(tail, rig);
    }
    return rig;
  }

  /** The tail's mount and floor this frame. */
  function inputOf(robot: Robot, tail: CatTail, pin: TailPin | null): TailInput {
    tail.group.updateWorldMatrix(true, false);
    robot.root.getWorldPosition(_w);
    // The floor strip is at y = 0; real space (the hub, lifts) is parked above 5000, where there's no floor to hit.
    return { mount: tail.group.matrixWorld.elements, floorY: _w.y > 2500 ? Number.NEGATIVE_INFINITY : 0, pin };
  }

  /** Where a robot's hand holds things, in the world: the left arm's grip, or the right arm's, mirrored. */
  function handPoint(robot: Robot, hand: number, out: THREE.Vector3): THREE.Vector3 {
    const arm = robot.arms[hand] ?? robot.arms[0];
    if (!arm) return robot.grip.getWorldPosition(out);
    arm.wrist.updateWorldMatrix(true, false);
    const g = robot.grip.position;
    return arm.wrist.localToWorld(out.set(arm === robot.arms[0] ? g.x : -g.x, g.y, g.z));
  }

  /** Every friend's robot, by session id. */
  function othersById(): Map<string, OtherRobot> {
    const out = new Map<string, OtherRobot>();
    if (link) for (const o of link.others()) out.set(o.id, o);
    return out;
  }

  /** Who holds each tail, as the station says (and this robot's own grab while it waits for an answer). */
  function grips(): Map<string, { by: string; segment: number; hand: number }> {
    const out = new Map<string, { by: string; segment: number; hand: number }>();
    const players = link?.room.state.players;
    players?.forEach((p, id) => {
      if (p.tailHeldBy) out.set(id, { by: p.tailHeldBy, segment: p.tailSegment, hand: p.tailHand });
    });
    if (pending && link && !out.has(pending.target)) {
      out.set(pending.target, { by: link.room.sessionId, segment: pending.segment, hand: pending.hand });
    }
    return out;
  }

  /** The robot a session id pilots on this screen. */
  function robotOf(id: string, others: Map<string, OtherRobot>): Robot | undefined {
    if (link && id === link.room.sessionId) return world.bot;
    return others.get(id)?.robot;
  }

  /** The tail of mine this robot holds, as [cat's id, grip], if any. */
  function myGrip() {
    if (!link) return undefined;
    for (const [id, g] of grips()) if (g.by === link.room.sessionId) return [id, g] as const;
    return undefined;
  }

  function step(robot: Robot, dt: number, pin: TailPin | null) {
    const tail = robot.tail;
    if (!tail) return;
    const rig = rigOf(tail);
    const input = inputOf(robot, tail, pin);
    robot.root.getWorldPosition(_v);
    world.bot.root.getWorldPosition(_w);
    if (!robot.root.visible || (robot !== world.bot && _v.distanceTo(_w) > FAR)) {
      resetTailChain(rig.chain, input.mount);
      tail.rest();
      return;
    }
    stepTailChain(rig.chain, dt, input);
    _m.copy(tail.group.matrixWorld).invert();
    const pos = rig.chain.pos;
    rig.points.forEach((p, i) => {
      p.set(pos[i * 3] as number, pos[i * 3 + 1] as number, pos[i * 3 + 2] as number).applyMatrix4(_m);
    });
    tail.pose(rig.points);
  }

  /** The nearest free point of a friend's tail a grab here reaches: whose, which point, and the friend's name. */
  function nearest(hand?: TailHand | null) {
    if (!link || myGrip() || !world.bot.arms.length) return undefined;
    const held = grips();
    world.bot.root.getWorldPosition(_w);
    let best: { id: string; name: string; segment: number; d: number } | undefined;
    for (const o of link.others()) {
      const tail = o.robot.tail;
      if (!tail || !o.robot.root.visible || held.has(o.id)) continue;
      const pos = rigOf(tail).chain.pos;
      for (let i = 1; i < CAT_TAIL.rest.length; i++) {
        _v.set(pos[i * 3] as number, pos[i * 3 + 1] as number, pos[i * 3 + 2] as number);
        let d: number;
        if (hand) d = _v.distanceTo(hand.at) <= hand.reach ? _v.distanceTo(hand.at) : Number.POSITIVE_INFINITY;
        else {
          d = Math.hypot(_v.x - _w.x, _v.z - _w.z);
          if (d > FLAT_REACH || Math.abs(_v.y - _w.y) > FLAT_HEIGHT) d = Number.POSITIVE_INFINITY;
        }
        if (d < (best?.d ?? Number.POSITIVE_INFINITY)) best = { id: o.id, name: o.name, segment: i, d };
      }
    }
    return best;
  }

  /** An arm's size, for the IK (as app/vr-hands.ts reads it). */
  function shapeOf(arm: RobotArm): ArmShape {
    let s = shapes.get(arm);
    if (!s) {
      const p = arm.shoulder.position;
      s = {
        s: arm.s,
        shoulder: { x: p.x, y: p.y, z: p.z },
        upper: arm.elbow.position.length(),
        fore: arm.wrist.position.length(),
        hand: Math.abs(world.bot.grip.position.y) * arm.wrist.scale.y,
      };
      shapes.set(arm, s);
    }
    return s;
  }

  return {
    attach(next) {
      link = next;
      pending = undefined;
    },

    frame(dt) {
      if (pending) {
        pending.left -= dt;
        const shown = link?.room.state.players?.get(pending.target)?.tailHeldBy;
        if (pending.left <= 0 || shown) pending = undefined;
      }
      const others = othersById();
      const held = grips();
      const pinFor = (id: string): TailPin | null => {
        const g = held.get(id);
        const by = g && robotOf(g.by, others);
        if (!g || !by) return null;
        const at = handPoint(by, g.hand, _v);
        return { segment: g.segment, x: at.x, y: at.y, z: at.z };
      };
      const me = link?.room.sessionId ?? 'me';
      const myPin = pinFor(me);
      step(world.bot, dt, myPin);
      for (const o of others.values()) step(o.robot, dt, pinFor(o.id));

      // A held tail tugs this cat toward the hand, once the hand is past the tail's slack.
      const tail = world.bot.tail;
      const p = world.drivingOnFloor();
      if (myPin && tail && p) {
        const rig = rigOf(tail);
        const stretch = tailStretch(rig.chain, inputOf(world.bot, tail, myPin)) - TAIL_GRAB.tugSlack;
        if (stretch > 0) {
          const dx = myPin.x - p.x;
          const dz = myPin.z - p.z;
          const d = Math.hypot(dx, dz);
          const speed = Math.min(TAIL_GRAB.tug * stretch, TAIL_GRAB.tugMax);
          if (d > 1e-6) {
            p.x += (dx / d) * speed * dt;
            p.z += (dz / d) * speed * dt;
          }
        }
      }
    },

    refused(answer) {
      if (pending && pending.target === answer.target) pending = undefined;
    },

    near(hand) {
      return nearest(hand)?.name ?? null;
    },

    tryGrab(hand) {
      const best = nearest(hand);
      if (!best || !link) return false;
      // In VR the hand that gripped (the nearer wrist); otherwise the right hand, which the saber leaves free.
      let which = 1;
      if (hand) {
        const d = (i: number) => (world.bot.arms[i] ? handPoint(world.bot, i, _w).distanceTo(hand.at) : Infinity);
        which = d(0) <= d(1) ? 0 : 1;
      }
      if (!world.bot.arms[which]) which = 0;
      const grab: TailGrab = { target: best.id, segment: best.segment, hand: which };
      link.room.send(MESSAGE.grabTail, grab);
      pending = { ...grab, left: PENDING_SECONDS };
      return true;
    },

    holding() {
      return !!myGrip();
    },

    letGo() {
      if (!link || !myGrip()) return;
      pending = undefined;
      link.room.send(MESSAGE.letGoTail);
    },

    poseArm(arm, dt) {
      const grip = myGrip();
      if (!grip || world.bot.arms.indexOf(arm) !== grip[1].hand) return false;
      const cat = othersById().get(grip[0])?.robot;
      const tail = cat?.tail;
      if (!tail) return false;
      // Reach for where that point of the tail would be if nobody held it, so the arm doesn't chase its own hand.
      const t = rigOf(tail).chain.target;
      const k = grip[1].segment * 3;
      _v.set(t[k] as number, t[k + 1] as number, t[k + 2] as number);
      world.bot.core.updateWorldMatrix(true, false);
      world.bot.core.worldToLocal(_v);
      const shape = shapeOf(arm);
      _w.set(_v.x - shape.shoulder.x, _v.y - shape.shoulder.y, _v.z - shape.shoulder.z).normalize();
      const r = reachFor(shape, _v, _w, arm.cur);
      const c = arm.cur;
      const a = r.angles;
      c.ab = damp(c.ab, a.ab, 12, dt);
      c.sw = damp(c.sw, a.sw, 12, dt);
      c.el = damp(c.el, a.el, 12, dt);
      c.ez = damp(c.ez, a.ez, 12, dt);
      c.wr = damp(c.wr, a.wr, 12, dt);
      c.wz = damp(c.wz, a.wz, 12, dt);
      c.curl = damp(c.curl, HOLD_CURL, 12, dt);
      applyArmPose(arm);
      return true;
    },

    spun() {
      if (link?.room.state.players?.get(link.room.sessionId)?.tailHeldBy) link.room.send(MESSAGE.shakeTail);
    },

    debug: {
      chains() {
        const out = new Map<string, TailChain>();
        if (world.bot.tail) out.set('me', rigOf(world.bot.tail).chain);
        for (const o of othersById().values()) if (o.robot.tail) out.set(o.id, rigOf(o.robot.tail).chain);
        return out;
      },
    },
  };
}
