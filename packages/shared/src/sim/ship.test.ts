import { describe, expect, it } from 'vitest';
import { HUB_CRADLES, type HubCradle } from '../content/space';
import { HUB_L } from '../ring-space';
import { Vec3 } from '../vec3';
import {
  airlockOpen,
  BOOST,
  CRUISE_SPACE,
  CRUISE_SURFACE,
  LAUNCH_TIME,
  launchPosition,
  makeShip,
  NO_INPUT,
  PITCH_LIMIT,
  ROLL_TIME,
  type ShipInput,
  shipForward,
  shipToWorld,
  steerShip,
} from './ship';

const fly = (input: Partial<ShipInput>, seconds: number, surface = false, ship = makeShip()) => {
  for (let t = 0; t < seconds; t += 1 / 60) steerShip(ship, { ...NO_INPUT, ...input }, 1 / 60, surface);
  return ship;
};

describe('ship heading', () => {
  it('points along +z, turns toward +x with yaw, and noses up with pitch', () => {
    const s = makeShip();
    expect(shipForward(s, new Vec3())).toEqual(new Vec3(0, 0, 1));
    s.yaw = Math.PI / 2;
    const f = shipForward(s, new Vec3());
    expect(f.x).toBeCloseTo(1, 9);
    expect(f.z).toBeCloseTo(0, 9);
    s.pitch = 0.5;
    expect(shipForward(s, new Vec3()).y).toBeCloseTo(Math.sin(0.5), 9);
  });

  it('maps the body frame to world the same way the nose points, at any roll', () => {
    const s = makeShip();
    for (const [yaw, pitch, roll] of [
      [0, 0, 0],
      [1.2, -0.4, 2],
      [-2.5, 1.1, -0.7],
    ] as const) {
      Object.assign(s, { yaw, pitch, roll });
      s.pos.set(10, -4, 3);
      const nose = shipToWorld(s, new Vec3(0, 0, 1), new Vec3());
      const f = shipForward(s, new Vec3());
      expect(nose.x - 10).toBeCloseTo(f.x, 9);
      expect(nose.y + 4).toBeCloseTo(f.y, 9);
      expect(nose.z - 3).toBeCloseTo(f.z, 9);
      // rotation keeps lengths
      const wing = shipToWorld(s, new Vec3(2.4, 0, 0), new Vec3());
      expect(Math.hypot(wing.x - 10, wing.y + 4, wing.z - 3)).toBeCloseTo(2.4, 9);
    }
  });

  it('rolls the wings about the nose', () => {
    const s = makeShip();
    s.roll = Math.PI / 2;
    const wing = shipToWorld(s, new Vec3(1, 0, 0), new Vec3());
    expect(wing.x).toBeCloseTo(0, 9);
    expect(wing.y).toBeCloseTo(1, 9);
  });
});

describe('steerShip', () => {
  it('speeds up to cruise, boosts to 5×, and brakes to a stop in space', () => {
    expect(fly({}, 8).speed).toBeCloseTo(CRUISE_SPACE, 0);
    expect(fly({ boost: true }, 8).speed).toBeCloseTo(CRUISE_SPACE * BOOST, -1);
    const s = fly({}, 8);
    expect(fly({ brake: true }, 6, false, s).speed).toBeLessThan(0.1);
  });

  it('cruises slower over a planet and brakes to a hover', () => {
    expect(fly({}, 8, true).speed).toBeCloseTo(CRUISE_SURFACE, 0);
    expect(fly({ brake: true }, 8, true).speed).toBeCloseTo(8, 1);
  });

  it('moves along its nose', () => {
    const s = makeShip();
    s.speed = CRUISE_SPACE;
    s.yaw = Math.PI / 2;
    fly({}, 1, false, s);
    expect(s.pos.x).toBeGreaterThan(100);
    expect(Math.abs(s.pos.z)).toBeLessThan(1e-6);
  });

  it('limits pitch, and levels out on a surface when the pilot lets go', () => {
    expect(fly({ pitch: 1 }, 3).pitch).toBe(PITCH_LIMIT);
    const s = fly({ pitch: 1 }, 0.5, true);
    const up = s.pitch;
    fly({}, 2, true, s);
    expect(s.pitch).toBeLessThan(up * 0.4);
    const space = fly({ pitch: 1 }, 0.5);
    fly({}, 2, false, space);
    expect(space.pitch).toBeCloseTo(up, 9);
  });

  it('banks into turns and does a full barrel roll', () => {
    expect(fly({ turn: 1 }, 2).roll).toBeCloseTo(-0.6, 3);
    const s = makeShip();
    steerShip(s, { ...NO_INPUT, roll: true }, 1 / 60, false);
    fly({}, ROLL_TIME / 2, false, s);
    expect(s.roll).toBeGreaterThan(1);
    fly({}, ROLL_TIME, false, s);
    expect(s.rollT).toBe(-1);
    expect(s.roll).toBeCloseTo(0, 9);
  });
});

describe('launch', () => {
  const c = HUB_CRADLES[0] as HubCradle;

  it('starts in the cradle and ends outside the hub, past its airlock', () => {
    expect(launchPosition(c, 0, new Vec3())).toEqual(new Vec3(c.pos.x, c.pos.y, c.pos.z));
    const mid = launchPosition(c, 1.4, new Vec3());
    expect(mid).toEqual(new Vec3(c.end * 6, 0, 0));
    const end = launchPosition(c, LAUNCH_TIME, new Vec3());
    expect(end.x * c.end).toBeGreaterThan(HUB_L / 2);
  });

  it('launches every ship out of its own end of the hub', () => {
    for (const k of HUB_CRADLES) expect(Math.sign(launchPosition(k, LAUNCH_TIME, new Vec3()).x)).toBe(k.end);
  });

  it('opens the airlock while the ship slides to the axis', () => {
    expect(airlockOpen(0)).toBe(0);
    expect(airlockOpen(0.8)).toBeGreaterThan(0);
    expect(airlockOpen(1.3)).toBe(1);
  });
});
