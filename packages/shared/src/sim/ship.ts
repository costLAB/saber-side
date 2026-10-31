import type { HubCradle } from '../content/space';
import { clamp, damp, smooth, TAU } from '../math';
import type { SettableXYZ, XYZ } from '../ring-space';
import { Vec3 } from '../vec3';

/**
 * A flying ship. The model points along +z. Its heading is yaw (about +y) then pitch (nose up), and the body also
 * rolls about its own nose (banking into turns plus the barrel roll).
 */
export interface Ship {
  pos: Vec3;
  yaw: number;
  pitch: number;
  speed: number;
  /** Lean into the current turn. */
  bank: number;
  /** Seconds into a barrel roll, or -1 when not rolling. */
  rollT: number;
  /** Total body roll this tick: bank plus the barrel roll. */
  roll: number;
  /** Seconds until the guns can fire again. */
  cooldown: number;
  /** Which wing gun fires next (-1 or 1). */
  gun: number;
}

/** What the pilot wants this tick. `pitch` and `turn` run from -1 to 1. */
export interface ShipInput {
  pitch: number;
  turn: number;
  boost: boolean;
  brake: boolean;
  fire: boolean;
  /** True on the tick the barrel-roll button goes down. */
  roll: boolean;
}

export const NO_INPUT: Readonly<ShipInput> = {
  pitch: 0,
  turn: 0,
  boost: false,
  brake: false,
  fire: false,
  roll: false,
};

const fwd = new Vec3();

/** Cruising speed in space and low over a planet. Boost multiplies it. */
export const CRUISE_SPACE = 120;
export const CRUISE_SURFACE = 45;
export const BOOST = 5;
/** Braking slows to this (0 in space, a slow hover near the ground). */
export const BRAKE_SPACE = 0;
export const BRAKE_SURFACE = 8;
export const TURN_RATE = 1.5;
export const PITCH_RATE = 1.2;
export const PITCH_LIMIT = 1.3;
export const ROLL_TIME = 0.6;
export const FIRE_INTERVAL = 0.11;
/** Lasers leave the guns this much faster than the ship. */
export const LASER_SPEED = 260;
/** Wing gun muzzle in the ship's own frame (x is flipped for the other wing). */
export const MUZZLE: Readonly<XYZ> = { x: 1.7, y: -0.2, z: 1.2 };

export function makeShip(): Ship {
  return { pos: new Vec3(), yaw: 0, pitch: 0, speed: 0, bank: 0, rollT: -1, roll: 0, cooldown: 0, gun: 1 };
}

/**
 * Steers and moves the ship for one tick. Over a planet (`surface`), it cruises slower, brakes to a hover, and
 * levels out when the pilot lets go of pitch.
 */
export function steerShip(s: Ship, input: ShipInput, dt: number, surface: boolean) {
  const cruise = surface ? CRUISE_SURFACE : CRUISE_SPACE;
  const target = input.brake ? (surface ? BRAKE_SURFACE : BRAKE_SPACE) : cruise * (input.boost ? BOOST : 1);
  s.speed = damp(s.speed, target, input.brake ? 2.5 : 1.4, dt);
  s.yaw += input.turn * TURN_RATE * dt;
  s.pitch = clamp(s.pitch + input.pitch * PITCH_RATE * dt, -PITCH_LIMIT, PITCH_LIMIT);
  if (!input.pitch && surface) s.pitch = damp(s.pitch, 0, 0.6, dt);

  s.bank = damp(s.bank, -input.turn * 0.6, 5, dt);
  if (input.roll && s.rollT < 0) s.rollT = 0;
  let barrel = 0;
  if (s.rollT >= 0) {
    s.rollT += dt;
    const q = Math.min(s.rollT / ROLL_TIME, 1);
    barrel = q * q * (3 - 2 * q) * TAU;
    if (q >= 1) s.rollT = -1;
  }
  s.roll = s.bank + barrel;

  const f = shipForward(s, fwd);
  s.pos.x += f.x * s.speed * dt;
  s.pos.y += f.y * s.speed * dt;
  s.pos.z += f.z * s.speed * dt;
}

/** The ship's nose direction (unit length). */
export function shipForward<T>(s: Ship, out: SettableXYZ<T>): T {
  const cp = Math.cos(s.pitch);
  return out.set(Math.sin(s.yaw) * cp, Math.sin(s.pitch), Math.cos(s.yaw) * cp);
}

/**
 * A point in the ship's body frame → world. Same rotation as a three.js group with rotation (-pitch, yaw, 0, 'YXZ')
 * holding a body rotated `roll` about z.
 */
export function shipToWorld<T>(s: Ship, local: XYZ, out: SettableXYZ<T>): T {
  const cr = Math.cos(s.roll);
  const sr = Math.sin(s.roll);
  const x1 = local.x * cr - local.y * sr;
  const y1 = local.x * sr + local.y * cr;
  const z1 = local.z;
  // nose up is a negative rotation about x
  const cp = Math.cos(s.pitch);
  const sp = Math.sin(s.pitch);
  const y2 = y1 * cp + z1 * sp;
  const z2 = -y1 * sp + z1 * cp;
  const cy = Math.cos(s.yaw);
  const sy = Math.sin(s.yaw);
  return out.set(s.pos.x + x1 * cy + z2 * sy, s.pos.y + y2, s.pos.z - x1 * sy + z2 * cy);
}

/** Points the ship along a direction (any length). */
export function aimShip(s: Ship, dir: XYZ) {
  s.yaw = Math.atan2(dir.x, dir.z);
  s.pitch = Math.atan2(dir.y, Math.hypot(dir.x, dir.z));
}

// ---------- launching from the hub ----------

/** The launch cutscene: the ship slides out of its cradle to the axis, then accelerates out through the airlock. */
export const LAUNCH_TIME = 2.5;
const SLIDE_TIME = 1.4;

/** Where the ship is `t` seconds into its launch, in the real frame. */
export function launchPosition<T>(c: HubCradle, t: number, out: SettableXYZ<T>): T {
  if (t < SLIDE_TIME) {
    const k = smooth(0, SLIDE_TIME, t);
    return out.set(c.pos.x + (c.end * 6 - c.pos.x) * k, c.pos.y * (1 - k), c.pos.z * (1 - k));
  }
  return out.set(c.end * (6 + (t - SLIDE_TIME) ** 2 * 22), 0, 0);
}

/** How far open the airlock doors are (0 to 1), `t` seconds into a launch. */
export const airlockOpen = (t: number): number => clamp((t - 0.4) / 0.9, 0, 1);

/** Engine flame size during a launch, as it lights up for the run out of the airlock. */
export const launchFlame = (t: number): number => 1.2 + Math.max(0, t - 1.2) * 2.5;

/** Engine flame size in flight, scaled with speed. */
export const flightFlame = (s: Ship, surface: boolean): number =>
  0.8 + (s.speed / (surface ? CRUISE_SURFACE : CRUISE_SPACE)) * 0.9;
