export const TAU = Math.PI * 2;

export const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Moves `a` toward `b` at rate `r` per second, independent of frame rate. */
export const damp = (a: number, b: number, r: number, dt: number): number => a + (b - a) * (1 - Math.exp(-r * dt));

/** Smoothstep: 0 below `a`, 1 above `b`, eased in between. */
export const smooth = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
