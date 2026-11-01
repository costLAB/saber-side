import { HUB_L, type XYZ } from '../ring-space.ts';

/**
 * Coming aboard: a freshly built robot is fired out of the hub's -x end cap, along the axis, into zero g. It starts
 * inside the hub's padding (the robot keeps 2.4 units off the walls) and drifts to a stop near the middle.
 */
export const HUB_SPAWN: { readonly pos: Readonly<XYZ>; readonly speed: number } = {
  pos: { x: -(HUB_L / 2 - 2.4), y: 0, z: 0 },
  speed: 12,
};
