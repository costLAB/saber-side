import { type Planet, SURFACE_EDGE, terrainHeight } from '../content/space';
import { clamp, TAU } from '../math';
import type { XYZ } from '../ring-space';
import { Vec3 } from '../vec3';
import type { LaserPool } from './lasers';

/** A little alien on a planet surface. It wanders, hops, and runs from ships that swoop low. */
export interface Alien {
  pos: Vec3;
  /** Where it's walking to (x, z on the ground). */
  tx: number;
  tz: number;
  /** Facing, about +y. */
  yaw: number;
  /** Offsets its hop so the crowd doesn't bounce in step. */
  phase: number;
  alive: boolean;
  /** Seconds until a zapped alien comes back. */
  respawn: number;
}

export const ALIEN_COUNT = 34;
/** Aliens run from a ship within this distance (across the ground) that's less than `FLEE_HEIGHT` above them. */
export const FLEE_RANGE = 70;
export const FLEE_HEIGHT = 60;
export const WALK_SPEED = 4;
export const RUN_SPEED = 11;
export const HOP_HEIGHT = 1.2;
export const RESPAWN_TIME = 5;
/** Lasers hit within `HIT_RADIUS` of a point `HIT_HEIGHT` above an alien's feet (models are about 6.6 tall). */
export const HIT_HEIGHT = 3.3;
export const HIT_RADIUS = 4.4;

/** Puts an alien down somewhere in a ring between `rMin` and `rMax` around (cx, cz), alive and standing still. */
export function placeAlien(a: Alien, rng: () => number, cx: number, cz: number, rMin: number, rMax: number) {
  const ang = rng() * TAU;
  const r = rMin + rng() * (rMax - rMin);
  a.pos.set(
    clamp(cx + Math.cos(ang) * r, -SURFACE_EDGE, SURFACE_EDGE),
    0,
    clamp(cz + Math.sin(ang) * r, -SURFACE_EDGE, SURFACE_EDGE),
  );
  a.tx = a.pos.x;
  a.tz = a.pos.z;
  a.alive = true;
}

/** A crowd of aliens near where ships arrive (the surface origin). */
export function spawnAliens(rng: () => number, n = ALIEN_COUNT): Alien[] {
  return Array.from({ length: n }, () => {
    const a: Alien = { pos: new Vec3(), tx: 0, tz: 0, yaw: 0, phase: rng() * TAU, alive: true, respawn: 0 };
    placeAlien(a, rng, 0, 0, 40, 700);
    return a;
  });
}

/**
 * One tick for every alien: zapped ones count down and respawn near the ship, the rest wander (or flee the ship),
 * hop along the ground, and get hit by any laser that reaches them. Each hit removes the laser, and the point it hit
 * is pushed onto `zaps`. Returns the number of aliens zapped this tick.
 */
export function stepAliens(
  aliens: Alien[],
  planet: Planet,
  ship: XYZ,
  lasers: LaserPool,
  t: number,
  dt: number,
  rng: () => number,
  zaps: XYZ[],
): number {
  let zapped = 0;
  for (const a of aliens) {
    const p = a.pos;
    if (!a.alive) {
      a.respawn -= dt;
      if (a.respawn <= 0) placeAlien(a, rng, ship.x, ship.z, 150, 400);
      continue;
    }
    const sx = p.x - ship.x;
    const sz = p.z - ship.z;
    const dShip = Math.hypot(sx, sz);
    const near = dShip < FLEE_RANGE;
    if (near && ship.y - p.y < FLEE_HEIGHT) {
      a.tx = p.x + (sx / (dShip || 1)) * 40;
      a.tz = p.z + (sz / (dShip || 1)) * 40;
    } else if (Math.hypot(a.tx - p.x, a.tz - p.z) < 2) {
      a.tx = p.x + (rng() - 0.5) * 80;
      a.tz = p.z + (rng() - 0.5) * 80;
    }
    const dx = a.tx - p.x;
    const dz = a.tz - p.z;
    const dd = Math.hypot(dx, dz);
    const step = Math.min(dd, (near ? RUN_SPEED : WALK_SPEED) * dt);
    if (dd > 0.1) {
      p.x += (dx / dd) * step;
      p.z += (dz / dd) * step;
      a.yaw = Math.atan2(dx, dz);
    }
    p.y = terrainHeight(planet, p.x, p.z) + Math.abs(Math.sin(t * 7 + a.phase)) * HOP_HEIGHT;

    const hx = p.x;
    const hy = p.y + HIT_HEIGHT;
    const hz = p.z;
    for (const l of lasers.lasers) {
      if (l.life <= 0) continue;
      if (Math.hypot(l.pos.x - hx, l.pos.y - hy, l.pos.z - hz) < HIT_RADIUS) {
        l.life = 0;
        a.alive = false;
        a.respawn = RESPAWN_TIME;
        zaps.push({ x: hx, y: hy, z: hz });
        zapped++;
        break;
      }
    }
  }
  return zapped;
}
