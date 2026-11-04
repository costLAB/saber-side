import { describe, expect, it } from 'vitest';
import { CIRC } from '../ring-space.ts';
import { insideRoadmapHut, ROADMAP_HUT } from './roadmap-hut.ts';
import { insideRegistry, ROBOT_REGISTRY } from './spawn.ts';

describe('insideRoadmapHut', () => {
  const H = ROADMAP_HUT;
  const mid = (H.front + H.back) / 2;

  it('counts the middle of the hut, on every lap of the ring', () => {
    expect(insideRoadmapHut(mid, H.z)).toBe(true);
    expect(insideRoadmapHut(mid, H.z - CIRC)).toBe(true);
  });

  it("doesn't count the park outside, or the doorway itself", () => {
    expect(insideRoadmapHut(H.front + 2, H.z)).toBe(false);
    expect(insideRoadmapHut(H.front - 0.5, H.z)).toBe(false);
    expect(insideRoadmapHut(H.front - 1.5, H.z)).toBe(true);
    expect(insideRoadmapHut(mid, H.z + H.width / 2 + 0.1)).toBe(false);
  });

  it('stands behind the Robot Registry, out past the promenade, inside its clearing', () => {
    expect(H.front).toBeLessThan(ROBOT_REGISTRY.back - 10);
    expect(H.front).toBeLessThan(-46);
    expect(insideRegistry(mid, H.z)).toBe(false);
    const C = H.clearing;
    for (const [x, z] of [
      [H.front, H.z - H.width / 2],
      [H.back, H.z + H.width / 2],
    ] as const)
      expect(Math.hypot(x - C.x, z - C.z)).toBeLessThan(C.r - 3);
  });
});
