import { describe, expect, it } from 'vitest';
import { PLANETS, type Planet, SURFACE_EDGE, terrainHeight } from '../content/space';
import type { XYZ } from '../ring-space';
import { mulberry } from '../rng';
import { Vec3 } from '../vec3';
import { ALIEN_COUNT, type Alien, HIT_HEIGHT, RESPAWN_TIME, spawnAliens, stepAliens } from './aliens';
import { fireLaser, makeLasers, stepLasers } from './lasers';

const earth = PLANETS[0] as Planet;
const DT = 1 / 60;

function run(aliens: Alien[], ship: XYZ, seconds: number, lasers = makeLasers(), rng = mulberry(9)) {
  const zaps: XYZ[] = [];
  let zapped = 0;
  for (let t = 0; t < seconds; t += DT) {
    stepLasers(lasers, DT);
    zapped += stepAliens(aliens, earth, ship, lasers, t, DT, rng, zaps);
  }
  return { zaps, zapped };
}

describe('aliens', () => {
  it('spawn the same way for the same seed, in a crowd around the landing spot', () => {
    const a = spawnAliens(mulberry(3));
    const b = spawnAliens(mulberry(3));
    expect(a).toHaveLength(ALIEN_COUNT);
    expect(a).toEqual(b);
    for (const x of a) {
      const r = Math.hypot(x.pos.x, x.pos.z);
      expect(r).toBeGreaterThanOrEqual(40);
      expect(r).toBeLessThanOrEqual(700);
    }
  });

  it('hop along the ground and stay on the map', () => {
    const aliens = spawnAliens(mulberry(4));
    run(aliens, { x: 0, y: 400, z: 0 }, 20);
    for (const a of aliens) {
      const ground = terrainHeight(earth, a.pos.x, a.pos.z);
      expect(a.pos.y).toBeGreaterThanOrEqual(ground - 1e-9);
      expect(a.pos.y).toBeLessThanOrEqual(ground + 1.2 + 1e-9);
      expect(Math.abs(a.pos.x)).toBeLessThanOrEqual(SURFACE_EDGE + 30);
    }
  });

  it('run straight away from a ship swooping low, but only hurry about under one flying high', () => {
    const make = () => {
      const [a] = spawnAliens(mulberry(5), 1) as [Alien];
      a.pos.set(30, 0, 0);
      a.tx = 30;
      a.tz = 0;
      return a;
    };
    const low = make();
    run([low], { x: 0, y: 20, z: 0 }, 1);
    expect(low.pos.x).toBeCloseTo(41, 6);
    expect(low.pos.z).toBeCloseTo(0, 9);
    const high = make();
    run([high], { x: 0, y: 200, z: 0 }, DT);
    expect(high.tz).not.toBe(0);
  });

  it('get zapped by a laser, then come back near the ship', () => {
    const [a] = spawnAliens(mulberry(6), 1) as [Alien];
    a.pos.set(0, 0, 50);
    a.tx = 0;
    a.tz = 50;
    const lasers = makeLasers();
    const ground = terrainHeight(earth, 0, 50);
    fireLaser(lasers, new Vec3(0, ground + HIT_HEIGHT, 0), new Vec3(0, 0, 1), 300);
    const ship = { x: 0, y: 300, z: 0 };
    const hit = run([a], ship, 0.5, lasers);
    expect(hit.zapped).toBe(1);
    expect(hit.zaps).toHaveLength(1);
    expect(a.alive).toBe(false);
    expect(lasers.lasers.every((l) => l.life <= 0)).toBe(true);

    ship.x = 1000;
    run([a], ship, RESPAWN_TIME + 0.1);
    expect(a.alive).toBe(true);
    const r = Math.hypot(a.pos.x - 1000, a.pos.z);
    expect(r).toBeGreaterThan(140);
    expect(r).toBeLessThan(410);
  });

  it('dodge lasers that miss', () => {
    const [a] = spawnAliens(mulberry(7), 1) as [Alien];
    a.pos.set(0, 0, 50);
    const lasers = makeLasers();
    fireLaser(lasers, new Vec3(20, 40, 0), new Vec3(0, 0, 1), 300);
    expect(run([a], { x: 0, y: 300, z: 0 }, 0.5, lasers).zapped).toBe(0);
    expect(a.alive).toBe(true);
  });
});
