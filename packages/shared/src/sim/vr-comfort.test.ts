import { describe, expect, it } from 'vitest';
import { DEFAULT_COMFORT, parseComfort, SMOOTH_TURN_RATE, smoothTurn, vignetteAmount } from './vr-comfort.ts';

describe('VR comfort settings', () => {
  it('reads saved settings, keeping only what’s valid', () => {
    expect(parseComfort(null)).toEqual(DEFAULT_COMFORT);
    expect(parseComfort({ turning: 'smooth', vignette: 2, seated: true, armWalking: false })).toEqual({
      turning: 'smooth',
      vignette: 1,
      seated: true,
      armWalking: false,
    });
    expect(parseComfort({ turning: 'spin', vignette: 'lots', seated: 1 })).toEqual(DEFAULT_COMFORT);
  });

  it('turns smoothly with the stick past the dead zone, right turning right', () => {
    expect(smoothTurn(0, 0.2, 1)).toBe(0);
    expect(smoothTurn(0, 1, 0.5)).toBeCloseTo(-SMOOTH_TURN_RATE * 0.5);
    expect(smoothTurn(0, -1, 0.5)).toBeCloseTo(SMOOTH_TURN_RATE * 0.5);
  });

  it('closes the vignette in while moving fast or turning, scaled by the setting', () => {
    expect(vignetteAmount(1, 0, 0)).toBe(0);
    expect(vignetteAmount(1, 20, 0)).toBe(1);
    expect(vignetteAmount(0.5, 20, 0)).toBe(0.5);
    expect(vignetteAmount(1, 0, 3)).toBe(1);
    expect(vignetteAmount(0, 20, 3)).toBe(0);
  });
});
