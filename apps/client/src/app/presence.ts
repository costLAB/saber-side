import {
  type AboardView,
  ARM_POSE,
  classicBuild,
  cleanRobotBuild,
  MESSAGE,
  POSE,
  POSE_HZ,
  type PoseField,
  type StationView,
  wrapD,
} from '@saber-side/shared';
import * as THREE from 'three';
import { applyArmPose, buildRobot, openMouth, type Robot, type RobotArm, type RobotKit } from '../avatar/robot';
import type { DrawTexFn } from '../render/kit';
import { textLabel } from '../render/label';
import { bendMaterial } from '../render/ring/bend';

// Other players' robots: built from their parts when they come aboard, labeled with their name, and moved to
// follow the poses the station passes on. Remote robots are drawn a little in the past (DELAY_MS) and blended between
// the two poses either side of that moment, so they move smoothly even though poses arrive only a few times a second.
// This device's own pose goes out at POSE_HZ.

export interface PresenceWorld {
  scene: THREE.Scene;
  /** This device's own robot. */
  bot: Robot;
  kit: RobotKit;
  drawTex: DrawTexFn;
}

/** The parts of a joined Colyseus room presence uses. */
export interface PresenceRoom {
  sessionId: string;
  state: StationView;
  send(type: string, message: unknown): void;
}

export interface Presence {
  /** Start showing (and sending to) this room, or stop when it's undefined. */
  attach(room: PresenceRoom | undefined): void;
  /** Call after each station patch. */
  sync(): void;
  /** Call every frame. */
  frame(dt: number): void;
  /** How many other robots are on screen (for tests). */
  readonly count: number;
}

/** One pose interval plus room for jitter. */
const DELAY_MS = 1000 / POSE_HZ + 70;
/** A gap longer than this means the robot sat still; its next move is blended over one interval, not a jump. */
const IDLE_MS = 3000 / POSE_HZ;
/** Farther than this between two poses is a teleport (a lift ride, docking a ship): no blending across it. */
const JUMP = 50;

const FIELD = Object.fromEntries(POSE.map(([name], i) => [name, i])) as Record<PoseField, number>;
const TAU = Math.PI * 2;
const turn = (a: number) => ((a % TAU) + TAU) % TAU;

interface Snapshot {
  t: number;
  v: number[];
}

interface Remote {
  robot: Robot;
  label: THREE.Sprite;
  name: string;
  color: string;
  build: string;
  snaps: Snapshot[];
}

const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();

/** Reads this device's robot as drawn this frame, in POSE order. */
function readPose(bot: Robot): number[] {
  bot.root.getWorldPosition(_p);
  bot.root.getWorldQuaternion(_q);
  const v: Record<string, number> = {
    px: _p.x,
    py: _p.y,
    pz: _p.z,
    qx: _q.x,
    qy: _q.y,
    qz: _q.z,
    qw: _q.w,
    leanX: bot.lean.rotation.x,
    leanZ: bot.lean.rotation.z,
    squashX: bot.squash.scale.x,
    squashY: bot.squash.scale.y,
    spin: turn(bot.spinner.rotation.y),
    headX: bot.head.rotation.x,
    headY: bot.head.rotation.y,
    headZ: bot.head.rotation.z,
    drive: turn(bot.drive.rotation.x),
    shown: bot.root.visible ? 1 : 0,
    jaw: bot.jaw.amount,
  };
  bot.arms.forEach((arm, i) => {
    for (const k of ARM_POSE) v[`arm${i}${k}`] = arm.cur[k];
  });
  return POSE.map(([name]) => v[name] ?? 0);
}

/** A player's parts, from their synced entry. Anything unreadable draws as the classic robot in their color. */
function parseBuild(entry: AboardView) {
  try {
    return cleanRobotBuild(JSON.parse(entry.build)) ?? classicBuild(entry.color);
  } catch {
    return classicBuild(entry.color);
  }
}

/** The pose numbers from a player's synced entry, in POSE order. */
function entryPose(entry: AboardView): number[] {
  const e = entry as unknown as Record<PoseField, number | boolean>;
  return POSE.map(([name]) => Number(e[name]));
}

/** Blends two poses: positions and angles straight, turning angles the short way round, rotation by slerp. */
function blend(a: number[], b: number[], f: number): number[] {
  const at = (v: number[], k: PoseField) => v[FIELD[k]] as number;
  const dz = wrapD(at(b, 'pz') - at(a, 'pz'));
  const jumped = Math.hypot(at(b, 'px') - at(a, 'px'), at(b, 'py') - at(a, 'py'), dz) > JUMP;
  if (jumped) return f < 0.5 ? a : b;
  const out = POSE.map(([, kind], i) => {
    const x = a[i] as number;
    const y = b[i] as number;
    if (kind === 'flag') return y;
    if (kind === 'turn') return x + (((y - x + Math.PI * 3) % TAU) - Math.PI) * f;
    return x + (y - x) * f;
  });
  out[FIELD.pz] = at(a, 'pz') + dz * f;
  _qa.set(at(a, 'qx'), at(a, 'qy'), at(a, 'qz'), at(a, 'qw')).normalize();
  _qb.set(at(b, 'qx'), at(b, 'qy'), at(b, 'qz'), at(b, 'qw')).normalize();
  _qa.slerp(_qb, f);
  out[FIELD.qx] = _qa.x;
  out[FIELD.qy] = _qa.y;
  out[FIELD.qz] = _qa.z;
  out[FIELD.qw] = _qa.w;
  return out;
}

/** Poses a robot from pose numbers. */
function applyPose(robot: Robot, v: number[]) {
  const at = (k: PoseField) => v[FIELD[k]] as number;
  robot.root.visible = at('shown') > 0.5;
  robot.root.position.set(at('px'), at('py'), at('pz'));
  robot.root.quaternion.set(at('qx'), at('qy'), at('qz'), at('qw')).normalize();
  robot.lean.rotation.set(at('leanX'), 0, at('leanZ'));
  robot.squash.scale.set(at('squashX'), at('squashY'), at('squashX'));
  robot.spinner.rotation.y = at('spin');
  robot.head.rotation.set(at('headX'), at('headY'), at('headZ'), 'YXZ');
  robot.drive.rotation.x = at('drive');
  openMouth(robot, at('jaw'));
  robot.arms.forEach((arm: RobotArm, i) => {
    for (const k of ARM_POSE) arm.cur[k] = v[FIELD[`arm${i}${k}` as PoseField]] as number;
    applyArmPose(arm);
  });
}

export function createPresence(world: PresenceWorld, now: () => number = () => performance.now()): Presence {
  const remotes = new Map<string, Remote>();
  let room: PresenceRoom | undefined;
  let sinceSent = 0;
  let lastSent = '';

  function build(entry: AboardView): Remote {
    // Built from its own parts, each in its own paint (painted parts get their own copies of the materials). No eye
    // light: a point light per robot would cost every lit pixel.
    const robot = buildRobot(world.kit, parseBuild(entry));
    // The name floats just over the top of the robot, however tall its parts make it.
    const top = new THREE.Box3().setFromObject(robot.core).max.y;
    const label = textLabel(world.drawTex, entry.name, entry.color);
    label.scale.set(0.16, 0.03, 1);
    label.position.y = top + 0.55;
    robot.root.add(label);
    // Bend it onto the ring like everything else on the floor (shared materials already are; the copies and the
    // robot's own sprites aren't yet). Bent things can't be frustum-culled by their unbent bounds.
    robot.root.traverse((o) => {
      const drawn = o as THREE.Mesh | THREE.Sprite;
      if (!(drawn as THREE.Mesh).isMesh && !(drawn as THREE.Sprite).isSprite) return;
      o.frustumCulled = false;
      for (const m of Array.isArray(drawn.material) ? drawn.material : [drawn.material]) {
        if (m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) continue;
        m.userData.bent = false;
        bendMaterial(m);
      }
    });
    robot.root.visible = false;
    world.scene.add(robot.root);
    return { robot, label, name: entry.name, color: entry.color, build: entry.build, snaps: [] };
  }

  function remove(id: string) {
    const r = remotes.get(id);
    if (!r) return;
    world.scene.remove(r.robot.root);
    const shared = new Set<THREE.Material>(Object.values(world.kit.materials));
    r.robot.root.traverse((o) => {
      const drawn = o as THREE.Mesh;
      if (!drawn.isMesh && !(o as THREE.Sprite).isSprite) return;
      // Sprites all share one geometry inside three.js, so only meshes give theirs back.
      if (drawn.isMesh) drawn.geometry.dispose();
      for (const m of Array.isArray(drawn.material) ? drawn.material : [drawn.material]) {
        if (!shared.has(m)) m.dispose();
      }
    });
    r.label.material.map?.dispose();
    remotes.delete(id);
  }

  function sync() {
    const players = room?.state.players;
    if (!room || !players) return;
    const t = now();
    const here = new Set<string>();
    players.forEach((entry, id) => {
      if (id === room?.sessionId) return;
      here.add(id);
      let r = remotes.get(id);
      // A rename, or a new look: rebuild.
      if (r && (r.name !== entry.name || r.color !== entry.color || r.build !== entry.build)) {
        remove(id);
        r = undefined;
      }
      if (!r) {
        r = build(entry);
        remotes.set(id, r);
      }
      const v = entryPose(entry);
      const last = r.snaps[r.snaps.length - 1];
      if (last?.v.every((x, i) => x === v[i])) return;
      if (last && t - last.t > IDLE_MS) r.snaps.push({ t: t - 1000 / POSE_HZ, v: last.v });
      r.snaps.push({ t, v });
      if (r.snaps.length > 12) r.snaps.splice(0, r.snaps.length - 12);
    });
    for (const id of [...remotes.keys()]) if (!here.has(id)) remove(id);
  }

  function frame(dt: number) {
    const target = now() - DELAY_MS;
    for (const r of remotes.values()) {
      const { snaps } = r;
      if (!snaps.length) continue;
      let i = snaps.length - 1;
      while (i > 0 && (snaps[i] as Snapshot).t > target) i--;
      const a = snaps[i] as Snapshot;
      const b = snaps[i + 1];
      if (!b || target <= a.t) applyPose(r.robot, a.v);
      else applyPose(r.robot, blend(a.v, b.v, (target - a.t) / (b.t - a.t)));
    }

    if (!room) return;
    sinceSent += dt;
    if (sinceSent < 1 / POSE_HZ) return;
    sinceSent = 0;
    const pose = readPose(world.bot);
    const key = pose.join(',');
    if (key === lastSent) return; // standing still: nothing new to say
    lastSent = key;
    room.send(MESSAGE.pose, pose);
  }

  return {
    attach(next) {
      room = next;
      lastSent = '';
      if (!room) for (const id of [...remotes.keys()]) remove(id);
      else sync();
    },
    sync,
    frame,
    get count() {
      return [...remotes.values()].filter((r) => r.robot.root.visible).length;
    },
  };
}
