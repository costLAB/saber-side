import { insideBotMaker } from '@saber-side/shared';
import { legacy } from '../legacy/game.js';

export interface BotMakerHandlers {
  /** Opens the Bot Maker's sheet: the builder, to rebuild the robot (or, not aboard, the arrival screen). */
  open(): void;
  /** Whether a sheet is already showing. */
  isOpen(): boolean;
}

/**
 * Visiting the Bot Maker: driving in through its door opens the robot builder. It opens once per visit, so the robot
 * has to drive back out before it opens again. A new robot starts inside the shop, and so does one whose player
 * closed the builder to keep their robot as it is, and neither should have it pop straight back up.
 */
export function atBotMaker({ open, isOpen }: BotMakerHandlers) {
  let armed = false;
  legacy.frameHooks.push(() => {
    const at = legacy.drivingOnFloor();
    if (!at) return;
    if (!insideBotMaker(at.x, at.z)) armed = true;
    else if (armed && !isOpen()) {
      armed = false;
      // The sheet stops key presses reaching the game, key-ups included, so a held key would stay down behind it.
      legacy.releaseKeys();
      open();
    }
  });
}
