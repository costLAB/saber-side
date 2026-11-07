// Snatch's tail as a ragdoll: a chain of points, root to tip, moved by verlet integration on a fixed timestep
// (docs/initiatives/sketchbook-characters.md, "The cat's tail").
//
// The chain lives in world space, so it trails behind as the robot rolls, turns, jumps, squashes, and spins. Its root
// is held at the tail's mount, and every point is pulled toward where the rest pose puts it, stiffly at the root and
// softly at the tip: the tail's muscle. A free tail's muscle carries its own weight, so a robot that stands still
// settles into exactly the rest pose (the curl it was drawn with). A held tail goes limp, so it hangs from its root
// to the hand that holds it, under gravity, and the rest dangles past the hand. Let go, its muscle comes back and it
// swings home.
//
// Each step it keeps every segment its length, bends no joint further than a limit, stays out of the body, and stays
// above the floor. It's cosmetic: every client runs it from the robot's pose, so it's plain numbers (no scene graph)
// and has no randomness, which keeps the screenshot tests deterministic.

/** A point as three numbers. */
export type Point3 = readonly [number, number, number];

/** A tail's shape, in its mount's frame (the units of whatever it's drawn in). */
export interface TailShape {
  /** The rest pose: the chain's points, root first. */
  rest: readonly Point3[];
  /** The tube's radius, to keep it this far above the floor. */
  radius: number;
  /** The body it can't pass through, as a sphere. */
  body: { center: Point3; radius: number };
}

/** The solver's rates. Times are seconds; per-step numbers are for one fixed step. */
export const TAIL_CHAIN = {
  /** The fixed timestep. */
  step: 1 / 60,
  /** At most this many steps in one frame; a slower frame lets the tail fall behind rather than cost more. */
  maxSteps: 4,
  /** Constraint passes per step. */
  iterations: 8,
  /** Gravity, in world units per second squared (the game's own). */
  gravity: 28,
  /** How much of its speed each point loses per step. */
  damping: 0.05,
  /** The pull toward the rest pose per step, at the root and at the tip (scaled by the muscle). */
  stiffRoot: 0.3,
  stiffTip: 0.035,
  /** How far each joint can bend past its bend in the rest pose, in radians. */
  bend: 0.75,
  /** How much muscle a held tail keeps, so it doesn't hang dead. */
  limp: 0.08,
  /** How fast muscle comes and goes, per second. */
  recover: 2.5,
  /** A mount that jumps this far in one frame (a lift ride, a respawn) puts the tail back at rest. */
  snap: 8,
} as const;

/** A point of the chain pinned in the world: held by a hand. */
export interface TailPin {
  /** Which point (1 to the tip; the root can't be held). */
  segment: number;
  x: number;
  y: number;
  z: number;
}

/** What the chain follows each frame. */
export interface TailInput {
  /** The mount's world matrix, column-major (three's `Matrix4.elements`): rest pose to world. */
  mount: ArrayLike<number>;
  /** The floor's height in the world. -Infinity for none. */
  floorY: number;
  /** Where a hand holds it, if one does. */
  pin: TailPin | null;
}

export interface TailChain {
  readonly shape: TailShape;
  /** How many points. */
  readonly count: number;
  /** The points now, in the world: x, y, z for each, root first. */
  readonly pos: Float64Array;
  /** The points a step ago (verlet keeps velocity as the difference). */
  readonly prev: Float64Array;
  /** 1 holds the rest pose, down to TAIL_CHAIN.limp while held. */
  muscle: number;
  /** Time not yet stepped. */
  carry: number;
  /** Each point's distance from the body's center at rest, in mount units: never pushed out further than that. */
  readonly restReach: Float64Array;
  /** Each joint's bend limit (radians), the rest pose's bend there plus TAIL_CHAIN.bend. */
  readonly bendLimit: Float64Array;
  /** Scratch: where the rest pose puts each point in the world this step, and the segment lengths there. */
  readonly target: Float64Array;
  readonly length: Float64Array;
}

/** A tail chain at rest on its mount. */
export function createTailChain(shape: TailShape, mount: ArrayLike<number>): TailChain {
  const count = shape.rest.length;
  if (count < 3) throw new Error('a tail needs at least three points');
  const restReach = new Float64Array(count);
  const [cx, cy, cz] = shape.body.center;
  shape.rest.forEach(([x, y, z], i) => {
    restReach[i] = Math.hypot(x - cx, y - cy, z - cz);
  });
  const bendLimit = new Float64Array(count);
  for (let i = 1; i < count - 1; i++) {
    const a = shape.rest[i - 1] as Point3;
    const b = shape.rest[i] as Point3;
    const c = shape.rest[i + 1] as Point3;
    bendLimit[i] = angleBetween(b[0] - a[0], b[1] - a[1], b[2] - a[2], c[0] - b[0], c[1] - b[1], c[2] - b[2]);
    bendLimit[i] = Math.min(Math.PI, (bendLimit[i] as number) + TAIL_CHAIN.bend);
  }
  const chain: TailChain = {
    shape,
    count,
    pos: new Float64Array(count * 3),
    prev: new Float64Array(count * 3),
    muscle: 1,
    carry: 0,
    restReach,
    bendLimit,
    target: new Float64Array(count * 3),
    length: new Float64Array(count - 1),
  };
  resetTailChain(chain, mount);
  return chain;
}

/** Puts the chain back in its rest pose on the mount, still. A mount that isn't a real matrix yet is ignored. */
export function resetTailChain(chain: TailChain, mount: ArrayLike<number>) {
  if (!finite(mount)) {
    // Nowhere yet: the first real mount puts it at rest (stepTailChain's teleport check never passes a NaN).
    chain.pos.fill(Number.NaN);
    return;
  }
  targets(chain, mount);
  chain.pos.set(chain.target);
  chain.prev.set(chain.target);
  chain.muscle = 1;
  chain.carry = 0;
}

/** Moves the chain on by `dt` seconds, in fixed steps. */
export function stepTailChain(chain: TailChain, dt: number, input: TailInput) {
  const { mount } = input;
  const m = TAIL_CHAIN;
  // A robot not posed yet (its pose numbers still unset) has no mount to follow: wait for one.
  if (!finite(mount)) return;
  // A teleport: nothing to trail from. (Nor is there from a chain made before its mount was real.)
  const jump = Math.hypot(
    (mount[12] as number) - (chain.pos[0] as number),
    (mount[13] as number) - (chain.pos[1] as number),
    (mount[14] as number) - (chain.pos[2] as number),
  );
  if (!(jump <= m.snap + (chain.restReach[0] as number) * scaleOf(mount))) resetTailChain(chain, mount);
  const pin = input.pin && input.pin.segment >= 1 && input.pin.segment < chain.count ? input.pin : null;
  chain.carry = Math.min(chain.carry + Math.max(0, dt), m.step * m.maxSteps);
  while (chain.carry >= m.step - 1e-9) {
    chain.carry -= m.step;
    const want = pin ? m.limp : 1;
    const ease = Math.min(1, m.recover * m.step);
    chain.muscle += (want - chain.muscle) * ease;
    if (Math.abs(chain.muscle - want) < 1e-6) chain.muscle = want;
    once(chain, input, pin);
  }
}

/**
 * How far past its slack a held tail is pulled: the straight line from root to hand, less the chain's length along
 * to the held point. 0 when it's slack or not held. In world units.
 */
export function tailStretch(chain: TailChain, input: TailInput): number {
  const pin = input.pin;
  if (!pin || pin.segment < 1 || pin.segment >= chain.count) return 0;
  targets(chain, input.mount);
  let along = 0;
  for (let i = 0; i < pin.segment; i++) along += chain.length[i] as number;
  const t = chain.target;
  const d = Math.hypot(pin.x - (t[0] as number), pin.y - (t[1] as number), pin.z - (t[2] as number));
  return Math.max(0, d - along);
}

/** One point of the chain, in the world. */
export function tailPoint(chain: TailChain, i: number): [number, number, number] {
  return [chain.pos[i * 3] as number, chain.pos[i * 3 + 1] as number, chain.pos[i * 3 + 2] as number];
}

// ---------- inside ----------

/** One fixed step. */
function once(chain: TailChain, input: TailInput, pin: TailPin | null) {
  const m = TAIL_CHAIN;
  const { pos, prev, count } = chain;
  const t = targets(chain, input.mount);
  const mount = input.mount;
  // Gravity pulls down the mount's own up axis (the robot's frame on the ring floor). Muscle carries its share.
  const ux = mount[4] as number;
  const uy = mount[5] as number;
  const uz = mount[6] as number;
  const ul = Math.hypot(ux, uy, uz) || 1;
  const g = (m.gravity * (1 - chain.muscle) * m.step * m.step) / ul;
  for (let i = 1; i < count; i++) {
    const k = i * 3;
    const stiff = (m.stiffRoot + (m.stiffTip - m.stiffRoot) * ((i - 1) / (count - 2))) * chain.muscle;
    for (let a = 0; a < 3; a++) {
      const p = pos[k + a] as number;
      const v = (p - (prev[k + a] as number)) * (1 - m.damping);
      prev[k + a] = p;
      const down = a === 0 ? -ux * g : a === 1 ? -uy * g : -uz * g;
      const moved = p + v + down;
      pos[k + a] = moved + ((t[k + a] as number) - moved) * stiff;
    }
  }
  for (let it = 0; it < m.iterations; it++) {
    hold(chain, pin);
    lengths(chain, pin);
    bends(chain, pin);
    collide(chain, input, pin);
  }
  hold(chain, pin);
  // A last pass of lengths, then the body and floor have the final say: a tail a little stretched beats one through
  // the body.
  lengths(chain, pin);
  collide(chain, input, pin);
}

/** Pins the root to the mount and the held point to the hand. */
function hold(chain: TailChain, pin: TailPin | null) {
  const { pos, prev, target } = chain;
  for (let a = 0; a < 3; a++) {
    pos[a] = target[a] as number;
    prev[a] = target[a] as number;
  }
  if (pin) {
    const k = pin.segment * 3;
    pos[k] = pin.x;
    pos[k + 1] = pin.y;
    pos[k + 2] = pin.z;
  }
}

/** Keeps every segment its length. The root and a held point don't move; the rest share the correction. */
function lengths(chain: TailChain, pin: TailPin | null) {
  const { pos, count, length } = chain;
  for (let i = 0; i < count - 1; i++) {
    const wa = i === 0 || pin?.segment === i ? 0 : 1;
    const wb = pin?.segment === i + 1 ? 0 : 1;
    if (wa + wb === 0) continue;
    const a = i * 3;
    const b = a + 3;
    const dx = (pos[b] as number) - (pos[a] as number);
    const dy = (pos[b + 1] as number) - (pos[a + 1] as number);
    const dz = (pos[b + 2] as number) - (pos[a + 2] as number);
    const d = Math.hypot(dx, dy, dz);
    if (d < 1e-9) continue;
    const f = (d - (length[i] as number)) / d / (wa + wb);
    pos[a] = (pos[a] as number) + dx * f * wa;
    pos[a + 1] = (pos[a + 1] as number) + dy * f * wa;
    pos[a + 2] = (pos[a + 2] as number) + dz * f * wa;
    pos[b] = (pos[b] as number) - dx * f * wb;
    pos[b + 1] = (pos[b + 1] as number) - dy * f * wb;
    pos[b + 2] = (pos[b + 2] as number) - dz * f * wb;
  }
}

/** Bends no joint past its limit: the next point is turned back into the cone the limit allows. */
function bends(chain: TailChain, pin: TailPin | null) {
  const { pos, count, bendLimit } = chain;
  for (let i = 1; i < count - 1; i++) {
    if (pin?.segment === i + 1) continue;
    const a = (i - 1) * 3;
    const b = i * 3;
    const c = b + 3;
    const ax = (pos[b] as number) - (pos[a] as number);
    const ay = (pos[b + 1] as number) - (pos[a + 1] as number);
    const az = (pos[b + 2] as number) - (pos[a + 2] as number);
    const bx = (pos[c] as number) - (pos[b] as number);
    const by = (pos[c + 1] as number) - (pos[b + 1] as number);
    const bz = (pos[c + 2] as number) - (pos[b + 2] as number);
    const la = Math.hypot(ax, ay, az);
    const lb = Math.hypot(bx, by, bz);
    if (la < 1e-9 || lb < 1e-9) continue;
    const limit = bendLimit[i] as number;
    const cos = (ax * bx + ay * by + az * bz) / (la * lb);
    if (cos >= Math.cos(limit)) continue;
    // the part of b at right angles to a, as a unit
    const nax = ax / la;
    const nay = ay / la;
    const naz = az / la;
    const along = (bx * nax + by * nay + bz * naz) / lb;
    let px = bx / lb - nax * along;
    let py = by / lb - nay * along;
    let pz = bz / lb - naz * along;
    const lp = Math.hypot(px, py, pz);
    if (lp < 1e-9) {
      // folded straight back: any side will do, so take one at right angles to a and the up axis, or x
      px = -naz;
      py = 0;
      pz = nax;
      const l2 = Math.hypot(px, pz);
      if (l2 < 1e-9) {
        px = 1;
        pz = 0;
      } else {
        px /= l2;
        pz /= l2;
      }
    } else {
      px /= lp;
      py /= lp;
      pz /= lp;
    }
    const cl = Math.cos(limit);
    const sl = Math.sin(limit);
    pos[c] = (pos[b] as number) + (nax * cl + px * sl) * lb;
    pos[c + 1] = (pos[b + 1] as number) + (nay * cl + py * sl) * lb;
    pos[c + 2] = (pos[b + 2] as number) + (naz * cl + pz * sl) * lb;
  }
}

/** Out of the body (never further out than the point sits at rest), and above the floor. */
function collide(chain: TailChain, input: TailInput, pin: TailPin | null) {
  const { pos, count, shape, restReach } = chain;
  const { mount, floorY } = input;
  const s = scaleOf(mount);
  const [cx, cy, cz] = apply(mount, shape.body.center);
  const floor = floorY + shape.radius * s;
  for (let i = 1; i < count; i++) {
    if (pin?.segment === i) continue;
    const k = i * 3;
    const r = Math.min(shape.body.radius, restReach[i] as number) * s;
    const dx = (pos[k] as number) - cx;
    const dy = (pos[k + 1] as number) - cy;
    const dz = (pos[k + 2] as number) - cz;
    const d = Math.hypot(dx, dy, dz);
    if (d < r && d > 1e-9) {
      pos[k] = cx + (dx / d) * r;
      pos[k + 1] = cy + (dy / d) * r;
      pos[k + 2] = cz + (dz / d) * r;
    }
    if ((pos[k + 1] as number) < floor) pos[k + 1] = floor;
  }
}

/** Where the rest pose puts every point in the world now, and the segment lengths there (they squash with it). */
function targets(chain: TailChain, mount: ArrayLike<number>): Float64Array {
  const { target, length, shape, count } = chain;
  for (let i = 0; i < count; i++) {
    const [x, y, z] = apply(mount, shape.rest[i] as Point3);
    target[i * 3] = x;
    target[i * 3 + 1] = y;
    target[i * 3 + 2] = z;
  }
  for (let i = 0; i < count - 1; i++) {
    const a = i * 3;
    length[i] = Math.hypot(
      (target[a + 3] as number) - (target[a] as number),
      (target[a + 4] as number) - (target[a + 1] as number),
      (target[a + 5] as number) - (target[a + 2] as number),
    );
  }
  return target;
}

/** Whether every number in a matrix is a real one. */
function finite(m: ArrayLike<number>): boolean {
  for (let i = 0; i < 16; i++) if (!Number.isFinite(m[i])) return false;
  return true;
}

/** A point through a column-major 4x4 matrix. */
function apply(m: ArrayLike<number>, [x, y, z]: Point3): [number, number, number] {
  return [
    (m[0] as number) * x + (m[4] as number) * y + (m[8] as number) * z + (m[12] as number),
    (m[1] as number) * x + (m[5] as number) * y + (m[9] as number) * z + (m[13] as number),
    (m[2] as number) * x + (m[6] as number) * y + (m[10] as number) * z + (m[14] as number),
  ];
}

/** How much a matrix scales, on average over its three axes. */
function scaleOf(m: ArrayLike<number>): number {
  return Math.cbrt(
    Math.hypot(m[0] as number, m[1] as number, m[2] as number) *
      Math.hypot(m[4] as number, m[5] as number, m[6] as number) *
      Math.hypot(m[8] as number, m[9] as number, m[10] as number),
  );
}

function angleBetween(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  const la = Math.hypot(ax, ay, az);
  const lb = Math.hypot(bx, by, bz);
  if (la < 1e-9 || lb < 1e-9) return 0;
  return Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by + az * bz) / (la * lb))));
}
