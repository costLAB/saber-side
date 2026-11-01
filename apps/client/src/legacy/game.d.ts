import type { RobotBuild } from '@saber-side/shared';
import type * as THREE from 'three';
import type { Robot, RobotKit } from '../avatar/robot';
import type { DrawTexFn } from '../render/kit';

/** What the legacy game script hands to the new modules. */
export declare const legacy: {
  /** The materials and helpers robots are built with, so other views (the builder's preview) draw them the same. */
  robotKit: RobotKit;
  /** Rebuilds the player's robot from these parts, wherever it is. */
  setRobotBuild(build: RobotBuild): void;
  /** Fires the player's robot out of the hub's end cap into zero g (unless it's out flying a ship). */
  launchIntoHub(): void;
  /** The scene, the player's own robot, and what it takes to build more robots. */
  world: { scene: THREE.Scene; bot: Robot; kit: RobotKit; drawTex: DrawTexFn };
  /** Called every frame after the game updates and before it draws, with the frame time in seconds. */
  frameHooks: ((dt: number) => void)[];
};
