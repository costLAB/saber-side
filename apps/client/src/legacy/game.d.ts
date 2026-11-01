import type { RobotBuild } from '@saber-side/shared';
import type { RobotKit } from '../avatar/robot';

/** What the legacy game script hands to the new modules. */
export declare const legacy: {
  /** The materials and helpers robots are built with, so other views (the builder's preview) draw them the same. */
  robotKit: RobotKit;
  /** Rebuilds the player's robot from these parts, wherever it is. */
  setRobotBuild(build: RobotBuild): void;
  /** Fires the player's robot out of the hub's end cap into zero g (unless it's out flying a ship). */
  launchIntoHub(): void;
};
