// Lights for glowing things, on a budget (plan decision D9): every point light costs every lit pixel on the screen,
// and a Quest can afford only a few. So sabers glow by their own emissive core and glow shells, and only a fixed pool
// of lights (SABER_LIGHTS) lights the floor around them: the nearest lit sabers get one each, and the rest go without.
// Shops will display many sabers; the cost stays the same.

/** How many lights the sabers share, however many there are. */
export const SABER_LIGHTS = 2;

/** A light this dim (or dimmer) isn't worth a light from the pool. */
export const LIGHT_MIN = 0.02;

/**
 * Which sources get the pool's lights: the brightest-enough ones nearest the viewer, at most `n`, nearest first.
 * `levels` and `dists` are per source.
 */
export function pickLit(levels: readonly number[], dists: readonly number[], n: number): number[] {
  return levels
    .map((level, i) => ({ i, level, d: dists[i] ?? Number.POSITIVE_INFINITY }))
    .filter((s) => s.level > LIGHT_MIN)
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .slice(0, n)
    .map((s) => s.i);
}

/**
 * Keeps lights where they are when they can: given which source each light is on (or -1) and the sources picked,
 * returns each light's source (or -1 for a light that goes dark). A light stays on its source while that's still
 * picked, so lights don't swap round between frames.
 */
export function assignLights(current: readonly number[], picked: readonly number[]): number[] {
  const left = picked.filter((p) => !current.includes(p));
  return current.map((c) => (picked.includes(c) ? c : (left.shift() ?? -1)));
}
