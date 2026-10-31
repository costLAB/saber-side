import { describe, expect, it } from 'vitest';
import { HUB_CRADLES, type HubCradle, LEAVE_HEIGHT, PLANETS, type Planet, RING_DOCKS } from '../content/space';
import { HALF_L, type XYZ } from '../ring-space';
import { distance, Vec3 } from '../vec3';
import type { Alien } from './aliens';
import {
  altitude,
  board,
  DOCK_COOLDOWN,
  dock,
  enterSpace,
  type Flight,
  type FlightEvent,
  landOn,
  leaveSurface,
  makeFlight,
  stepFlight,
} from './flight';
import { aimShip, NO_INPUT, type ShipInput } from './ship';

const DT = 1 / 60;
const earth = PLANETS[0] as Planet;
const cradle = HUB_CRADLES[0] as HubCradle;

/** Steps until an event fires (or `seconds` run out) and returns it. */
function until(f: Flight, seconds: number, input: Partial<ShipInput> = {}): FlightEvent | null {
  for (let t = 0; t < seconds; t += DT) {
    const { event } = stepFlight(f, { ...NO_INPUT, ...input }, DT, t);
    if (event) return event;
  }
  return null;
}

function aimAt(f: Flight, target: XYZ) {
  const p = f.ship.pos;
  aimShip(f.ship, new Vec3(target.x - p.x, target.y - p.y, target.z - p.z));
}

describe('a trip out of the hub', () => {
  it('launches through the airlock into space, off the end of the ring', () => {
    const f = makeFlight();
    expect(until(f, 1)).toBeNull();
    board(f, cradle);
    expect(f.phase).toBe('launch');
    expect(until(f, 2)).toBeNull();
    expect(until(f, 1)).toBe('launched');
    enterSpace(f);
    expect(f.phase).toBe('space');
    expect(f.ship.pos.x).toBe(cradle.end * (HALF_L + 30));
    // heading away from the ring
    const before = f.ship.pos.x;
    until(f, 0.5);
    expect((f.ship.pos.x - before) * cradle.end).toBeGreaterThan(0);
  });

  it("doesn't dock straight back after launch", () => {
    const f = makeFlight();
    board(f, cradle);
    enterSpace(f);
    f.ship.speed = 0;
    expect(f.dockDist).toBeLessThan(45);
    expect(until(f, DOCK_COOLDOWN - 0.1, { brake: true })).toBeNull();
    expect(until(f, 0.3, { brake: true })).toBe('dock');
  });

  it('lands on a planet it flies into, lands low over the surface, and remembers where it came from', () => {
    const f = makeFlight();
    board(f, cradle);
    enterSpace(f);
    f.ship.pos.set(earth.pos.x - earth.r - 200, earth.pos.y, earth.pos.z);
    aimAt(f, earth.pos);
    expect(f.nearest).toBe(earth);
    expect(until(f, 5)).toBe('land');
    expect(f.planet).toBe(earth);
    landOn(f, earth);
    expect(f.phase).toBe('surface');
    expect(f.exitDir.x).toBeLessThan(-0.99);
    expect(f.aliens.get('EARTH')).toHaveLength(34);
    expect(altitude(f)).toBeGreaterThan(150);
  });

  it('keeps the ship above the ground', () => {
    const f = makeFlight();
    board(f, cradle);
    landOn(f, earth);
    f.ship.pitch = -1.2;
    until(f, 10, { pitch: -1 });
    expect(altitude(f)).toBeGreaterThanOrEqual(4 - 1e-9);
    expect(f.phase).toBe('surface');
  });

  it('zaps aliens with the wing guns', () => {
    const f = makeFlight();
    board(f, cradle);
    landOn(f, earth);
    stepFlight(f, NO_INPUT, DT, 0);
    const target = (f.aliens.get('EARTH') as Alien[])[0] as Alien;
    // hover 30 units out from the alien, above and behind it, and aim at it
    const hit = new Vec3(target.pos.x, target.pos.y + 3.3, target.pos.z);
    f.ship.pos.set(hit.x, hit.y + 20, hit.z - 22);
    aimAt(f, hit);
    let zaps = 0;
    for (let t = 0; t < 0.5; t += DT) zaps += stepFlight(f, { ...NO_INPUT, fire: true }, DT, t).zaps.length;
    expect(zaps).toBeGreaterThanOrEqual(1);
    expect(f.zapped).toBe(zaps);
    expect(target.alive).toBe(false);
  });

  it('climbs out of a planet back to space, clear of it and heading away', () => {
    const f = makeFlight();
    board(f, cradle);
    enterSpace(f);
    f.ship.pos.set(earth.pos.x, earth.pos.y + earth.r + 100, earth.pos.z);
    aimAt(f, earth.pos);
    expect(until(f, 5)).toBe('land');
    landOn(f, earth);
    expect(until(f, 30, { pitch: 1, boost: true })).toBe('leave');
    expect(f.ship.pos.y).toBeGreaterThan(LEAVE_HEIGHT);
    leaveSurface(f);
    expect(f.phase).toBe('space');
    expect(f.planet).toBeNull();
    // back out above the planet, where it came in, and not landing again
    const d0 = distance(f.ship.pos, earth.pos);
    expect(d0).toBeCloseTo(earth.r + 180, 6);
    expect(f.ship.pos.y).toBeGreaterThan(earth.pos.y + earth.r);
    expect(until(f, 2)).toBeNull();
    expect(distance(f.ship.pos, earth.pos)).toBeGreaterThan(d0);
  });

  it('docks at either end of the ring', () => {
    for (const d of RING_DOCKS) {
      const f = makeFlight();
      board(f, cradle);
      enterSpace(f);
      f.dockCooldown = 0;
      f.ship.pos.set(d.x * 3, 0, 0);
      aimAt(f, d);
      expect(until(f, 10)).toBe('dock');
      dock(f);
      expect(f.phase).toBe('docked');
      expect(until(f, 1)).toBeNull();
    }
  });
});
