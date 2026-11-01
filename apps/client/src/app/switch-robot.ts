import { insideBotMaker } from '@saber-side/shared';
import { legacy } from '../legacy/game.js';

export interface SwitchHandlers {
  /** Opens the roster, where the player picks another robot or builds a new one. */
  open(): void;
  /** Whether the roster is already showing. */
  isOpen(): boolean;
}

/**
 * Switching robots: driving in through the Bot Maker's door opens the roster. It opens once per visit, so the robot
 * has to drive back out before it opens again. A new robot starts inside the shop, and so does one whose player
 * closed the roster to just look around, and neither should have it pop straight back up.
 */
export function switchAtBotMaker({ open, isOpen }: SwitchHandlers) {
  let armed = false;
  legacy.frameHooks.push(() => {
    const at = legacy.drivingOnFloor();
    if (!at) return;
    if (!insideBotMaker(at.x, at.z)) armed = true;
    else if (armed && !isOpen()) {
      armed = false;
      // The roster stops key presses reaching the game, key-ups included, so a held key would stay down behind it.
      legacy.releaseKeys();
      open();
    }
  });
}
