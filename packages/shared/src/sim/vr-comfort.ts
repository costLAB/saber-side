import { clamp, smooth } from '../math.ts';
import { STICK_DEADZONE, wrapAngle } from './vr-rig.ts';

// VR comfort settings (docs/initiatives/quest-vr.md, PRs 5 and 10): how the right stick turns you, how strongly the
// view closes in while you move (not at all to start with, as in Gorilla Tag), seated mode, and whether your arms walk
// you along the floor or the left stick drives. They're set on the flat page
// for now (ui/vr-comfort.ts), and on the wrist panel once it exists, and kept in the browser.

export type Turning = 'snap' | 'smooth';

export interface Comfort {
  turning: Turning;
  /** How strongly the edges of the view darken while you move or turn: 0 (never, as in Gorilla Tag) to 1. */
  vignette: number;
  /** Sitting down: stepping and leaning don't move the robot, and your hands find the floor at your lap. */
  seated: boolean;
  /**
   * Your arms walk the robot, Gorilla Tag style, and the left stick doesn't (shared/sim/arm-locomotion.ts). Off, the
   * left stick drives it instead, and your hands push nothing.
   */
  armWalking: boolean;
}

export const DEFAULT_COMFORT: Comfort = { turning: 'snap', vignette: 0, seated: false, armWalking: true };

/** The vignette strengths the settings offer. */
export const VIGNETTE_STEPS = { off: 0, low: 0.5, high: 1 } as const;

/** Smooth turning turns the view this fast at full stick (radians per second). */
export const SMOOTH_TURN_RATE = 2.2;

/** Reads saved settings, keeping only what's valid and filling in the rest. */
export function parseComfort(raw: unknown): Comfort {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof Comfort, unknown>>;
  return {
    turning: o.turning === 'smooth' || o.turning === 'snap' ? o.turning : DEFAULT_COMFORT.turning,
    vignette:
      typeof o.vignette === 'number' && Number.isFinite(o.vignette)
        ? clamp(o.vignette, 0, 1)
        : DEFAULT_COMFORT.vignette,
    seated: typeof o.seated === 'boolean' ? o.seated : DEFAULT_COMFORT.seated,
    armWalking: typeof o.armWalking === 'boolean' ? o.armWalking : DEFAULT_COMFORT.armWalking,
  };
}

/** Smooth turning: the view turns with the stick's x (right turns right), past the dead zone. */
export function smoothTurn(view: number, x: number, dt: number): number {
  if (Math.abs(x) < STICK_DEADZONE) return view;
  const push = (Math.abs(x) - STICK_DEADZONE) / (1 - STICK_DEADZONE);
  return wrapAngle(view - Math.sign(x) * push * SMOOTH_TURN_RATE * dt);
}

/**
 * How dark the vignette is (0 to 1): it closes in as you move faster than a walk across the floor (`speed`, in scene
 * units per second) or as the view turns (`turnRate`, radians per second), scaled by the setting.
 */
export function vignetteAmount(strength: number, speed: number, turnRate: number): number {
  const moving = smooth(1.5, 7, speed);
  const turning = smooth(0.4, 2, Math.abs(turnRate));
  return clamp(strength, 0, 1) * Math.max(moving, turning);
}
