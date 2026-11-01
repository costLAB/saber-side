import type * as THREE from 'three';
import type { Robot, RobotKit } from '../avatar/robot';
import type { DrawTexFn } from '../render/kit';

/** What the legacy game script hands to the new modules. */
export declare const legacy: {
  /** Tints the robot's painted shell and head; `#ffffff` is the original look. */
  setRobotPaint(hex: string): void;
  /** The scene, the player's own robot, and what it takes to build more robots. */
  world: { scene: THREE.Scene; bot: Robot; kit: RobotKit; drawTex: DrawTexFn };
  /** Called every frame after the game updates and before it draws, with the frame time in seconds. */
  frameHooks: ((dt: number) => void)[];
};
