// Snatch's tail, as the ragdoll sees it (sim/tail-chain.ts): its rest pose, how thick it is, and the body it hangs
// off. It's in the cat body's frame, in model units (the client draws the body scaled CAT_SCALE, at y = 0.55 in the
// robot's core; apps/client/src/avatar/parts/cat.ts).

import type { TailShape } from '../sim/tail-chain.ts';

export const CAT_TAIL: TailShape = {
  // From the middle of the cat's back, along under it, and curling up behind its paw: the spline the tube is drawn
  // along, root first (inside the body) to the tip.
  rest: [
    [0.0, 0.28, -0.55],
    [-0.35, 0.235, -0.92],
    [-0.85, 0.235, -0.98],
    [-1.22, 0.36, -0.72],
    [-1.38, 0.66, -0.55],
    [-1.5, 0.92, -0.46],
    [-1.72, 1.02, -0.4],
    [-1.9, 0.9, -0.36],
    [-1.93, 0.74, -0.32],
  ],
  radius: 0.21,
  // The bell, as a ball: its middle, and about its half-width.
  body: { center: [0, 0.6, 0], radius: 0.9 },
};
