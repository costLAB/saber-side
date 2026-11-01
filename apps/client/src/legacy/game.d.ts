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
  /** Puts the player's robot in the Bot Maker and has it roll out into the walkway (unless it's out flying a ship). */
  rollOutOfBotMaker(): void;
  /** Where the player is driving on the floor strip, or null when they aren't (rolling out, on a lift, in the hub, in a ship). */
  drivingOnFloor(): { x: number; z: number } | null;
  /** Lets go of every held key, for when a sheet opens over the game and will swallow their key-ups. */
  releaseKeys(): void;
  /** Ends the VR session, if there is one, so the flat page (and whatever sheet opens on it) can be seen. */
  leaveVr(): void;
  /** The scene, the player's own robot, and what it takes to build more robots. */
  world: { scene: THREE.Scene; bot: Robot; kit: RobotKit; drawTex: DrawTexFn };
  /** Called every frame after the game updates and before it draws, with the frame time in seconds. */
  frameHooks: ((dt: number) => void)[];
};
