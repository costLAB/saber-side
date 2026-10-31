import {
  CLIMB_WARNING,
  DOCK_RANGE,
  type HubCradle,
  LANDING_RANGE,
  LEAVE_HEIGHT,
  PLANETS,
  type Planet,
  RING_DOCKS,
  SURFACE_CLEARANCE,
  SURFACE_EDGE,
  terrainHeight,
} from '../content/space';
import { clamp } from '../math';
import { HALF_L, type XYZ } from '../ring-space';
import { mulberry } from '../rng';
import { distance, Vec3 } from '../vec3';
import { type Alien, spawnAliens, stepAliens } from './aliens';
import { clearLasers, fireLaser, type LaserPool, makeLasers, stepLasers } from './lasers';
import {
  FIRE_INTERVAL,
  LASER_SPEED,
  LAUNCH_TIME,
  MUZZLE,
  makeShip,
  type Ship,
  type ShipInput,
  shipForward,
  shipToWorld,
  steerShip,
} from './ship';

/**
 * One pilot's trip out of the hub and back:
 *
 * ```
 * docked ─board─► launch ─(launched)─► space ◄─(land / leave)─► surface
 *    ▲                                   │
 *    └──────────────(dock)───────────────┘
 * ```
 *
 * `stepFlight` reports an event when the ship reaches a transition (the launch ends, it reaches a planet, climbs out of
 * one, or reaches a ring dock). The caller decides when to apply it, after a screen flash, by calling `enterSpace`,
 * `landOn`, `leaveSurface`, or `dock`. Until then the event repeats every tick.
 */
export type FlightPhase = 'docked' | 'launch' | 'space' | 'surface';
export type FlightEvent = 'launched' | 'land' | 'leave' | 'dock';

export interface Flight {
  phase: FlightPhase;
  /** The cradle this ship came from and goes back to. */
  cradle: HubCradle | null;
  /** Seconds into the launch cutscene. */
  launchT: number;
  ship: Ship;
  /** The planet the ship is on (surface), or the one it's about to land on (after a `land` event). */
  planet: Planet | null;
  /** Direction from the planet's center the ship arrived from. Leaving puts it back out that way. */
  exitDir: Vec3;
  /** Docking stays off for a few seconds after launch, so the ship doesn't dock right back. */
  dockCooldown: number;
  lasers: LaserPool;
  /** Aliens on each planet visited, by name. They stay put between visits. */
  aliens: Map<string, Alien[]>;
  /** Aliens zapped so far, across every trip. */
  zapped: number;
  /** Space readouts for the HUD: nearest planet and distances (to its surface and to the nearer ring dock). */
  nearest: Planet;
  nearestDist: number;
  dockDist: number;
  rng: () => number;
}

export interface FlightTick {
  event: FlightEvent | null;
  /** Where aliens were zapped this tick. */
  zaps: XYZ[];
}

export const DOCK_COOLDOWN = 4;

export function makeFlight(seed = 0xa11e5): Flight {
  return {
    phase: 'docked',
    cradle: null,
    launchT: 0,
    ship: makeShip(),
    planet: null,
    exitDir: new Vec3(0, 1, 0),
    dockCooldown: 0,
    lasers: makeLasers(),
    aliens: new Map(),
    zapped: 0,
    nearest: PLANETS[0] as Planet,
    nearestDist: 0,
    dockDist: 0,
    rng: mulberry(seed),
  };
}

/** Climb aboard the ship in `cradle` and start the launch. */
export function board(f: Flight, cradle: HubCradle) {
  f.phase = 'launch';
  f.cradle = cradle;
  f.launchT = 0;
  f.planet = null;
  const s = f.ship;
  s.bank = 0;
  s.rollT = -1;
  s.roll = 0;
  s.cooldown = 0;
  clearLasers(f.lasers);
}

/** Out through the airlock: the ship appears just off the ring's end cap, heading away from it. */
export function enterSpace(f: Flight) {
  const end = f.cradle?.end ?? 1;
  f.phase = 'space';
  f.planet = null;
  const s = f.ship;
  s.pos.set(end * (HALF_L + 30), 0, 0);
  s.yaw = (end * Math.PI) / 2;
  s.pitch = 0;
  s.speed = 60;
  f.dockCooldown = DOCK_COOLDOWN;
  clearLasers(f.lasers);
  readSpace(f);
}

/** Arrive low over a planet's surface. The aliens there are made on the first visit. */
export function landOn(f: Flight, planet: Planet) {
  const s = f.ship;
  f.exitDir.set(s.pos.x - planet.pos.x, s.pos.y - planet.pos.y, s.pos.z - planet.pos.z);
  const len = Math.hypot(f.exitDir.x, f.exitDir.y, f.exitDir.z) || 1;
  f.exitDir.set(f.exitDir.x / len, f.exitDir.y / len, f.exitDir.z / len);
  if (!f.aliens.has(planet.name)) f.aliens.set(planet.name, spawnAliens(f.rng));
  f.phase = 'surface';
  f.planet = planet;
  s.pos.set(0, 220, -500);
  s.yaw = 0;
  s.pitch = -0.3;
  s.speed = 45;
  clearLasers(f.lasers);
}

/** Back out to space, just above the planet on the side the ship came in from, heading away. */
export function leaveSurface(f: Flight) {
  const p = f.planet;
  if (!p) return;
  const s = f.ship;
  const d = f.exitDir;
  const r = p.r + 180;
  s.pos.set(p.pos.x + d.x * r, p.pos.y + d.y * r, p.pos.z + d.z * r);
  s.yaw = Math.atan2(d.x, d.z);
  s.pitch = Math.asin(clamp(d.y, -0.9, 0.9));
  s.speed = 80;
  f.phase = 'space';
  f.planet = null;
  clearLasers(f.lasers);
  readSpace(f);
}

/** Into a ring dock: the ship goes back to its cradle. */
export function dock(f: Flight) {
  f.phase = 'docked';
  f.planet = null;
  clearLasers(f.lasers);
}

const muzzle = new Vec3();
const from = new Vec3();
const dir = new Vec3();

export function stepFlight(f: Flight, input: ShipInput, dt: number, t: number): FlightTick {
  const tick: FlightTick = { event: null, zaps: [] };
  if (f.phase === 'docked') return tick;
  if (f.phase === 'launch') {
    f.launchT += dt;
    if (f.launchT > LAUNCH_TIME) tick.event = 'launched';
    return tick;
  }

  const s = f.ship;
  const surface = f.phase === 'surface';
  steerShip(s, input, dt, surface);
  // the wing guns take turns
  s.cooldown -= dt;
  if (input.fire && s.cooldown <= 0) {
    s.gun = -s.gun;
    s.cooldown = FIRE_INTERVAL;
    shipToWorld(s, muzzle.set(s.gun * MUZZLE.x, MUZZLE.y, MUZZLE.z), from);
    fireLaser(f.lasers, from, shipForward(s, dir), s.speed + LASER_SPEED);
  }
  stepLasers(f.lasers, dt);

  if (surface && f.planet) {
    const p = f.planet;
    const floor = terrainHeight(p, s.pos.x, s.pos.z) + SURFACE_CLEARANCE;
    if (s.pos.y < floor) {
      s.pos.y = floor;
      s.pitch = Math.max(s.pitch, 0.15);
    }
    // turn back at the edge of the map
    if (Math.abs(s.pos.x) > SURFACE_EDGE || Math.abs(s.pos.z) > SURFACE_EDGE) {
      s.pos.x = clamp(s.pos.x, -SURFACE_EDGE, SURFACE_EDGE);
      s.pos.z = clamp(s.pos.z, -SURFACE_EDGE, SURFACE_EDGE);
      s.yaw += Math.PI * dt;
    }
    const aliens = f.aliens.get(p.name) ?? [];
    f.zapped += stepAliens(aliens, p, s.pos, f.lasers, t, dt, f.rng, tick.zaps);
    if (s.pos.y > LEAVE_HEIGHT) tick.event = 'leave';
    return tick;
  }

  f.dockCooldown -= dt;
  const landing = readSpace(f);
  if (landing) {
    f.planet = landing;
    tick.event = 'land';
  } else if (f.dockCooldown <= 0 && f.dockDist < DOCK_RANGE) tick.event = 'dock';
  return tick;
}

/** Updates the space readouts, and returns the first planet the ship is close enough to land on. */
function readSpace(f: Flight): Planet | null {
  const pos = f.ship.pos;
  let landing: Planet | null = null;
  f.nearestDist = Infinity;
  for (const p of PLANETS) {
    const d = distance(pos, p.pos) - p.r;
    if (d < f.nearestDist) {
      f.nearestDist = d;
      f.nearest = p;
    }
    if (d < LANDING_RANGE && !landing) landing = p;
  }
  f.dockDist = Infinity;
  for (const d of RING_DOCKS) f.dockDist = Math.min(f.dockDist, distance(pos, d));
  return landing;
}

/** Height of the ship above the ground, on a surface. */
export function altitude(f: Flight): number {
  return f.planet ? f.ship.pos.y - terrainHeight(f.planet, f.ship.pos.x, f.ship.pos.z) : 0;
}

/** True when the ship is high enough over a planet that the HUD should tell the pilot to keep climbing. */
export const climbingOut = (f: Flight): boolean => f.phase === 'surface' && f.ship.pos.y > CLIMB_WARNING;
