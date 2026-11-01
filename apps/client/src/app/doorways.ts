import { legacy } from '../legacy/game.js';

export interface DoorwayHandlers {
  /** Opens the building's sheet. */
  open(): void;
  /** Whether a sheet is already showing. */
  isOpen(): boolean;
}

/**
 * A building you visit by driving in through its door: the Bot Maker (rebuild your robot) and the Robot Registry
 * (register, or log in). Its sheet opens once per visit, so the robot has to drive back out before it opens again. A
 * new robot starts inside the Bot Maker, and a player may close a sheet to just look around, and neither should have
 * it pop straight back up.
 */
export function onDoorway(inside: (x: number, z: number) => boolean, { open, isOpen }: DoorwayHandlers) {
  let armed = false;
  legacy.frameHooks.push(() => {
    const at = legacy.drivingOnFloor();
    if (!at) return;
    if (!inside(at.x, at.z)) armed = true;
    else if (armed && !isOpen()) {
      armed = false;
      // The sheet stops key presses reaching the game, key-ups included, so a held key would stay down behind it.
      legacy.releaseKeys();
      open();
    }
  });
}
