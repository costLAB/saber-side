import { cureText } from '@saber-side/shared';
import type { StationStatus } from '../net/station-link';

/** The station line can also say we're not aboard (the arrival screen was dismissed, or a join was refused or removed). */
export type StatusLine = StationStatus | { kind: 'ashore' };

export interface StatusActions {
  /** Open the arrival screen after "Just look around". */
  comeAboard(): void;
  /** Take the seat back from the other device. */
  playHere(): void;
}

/**
 * Status line under the title. The game works alone whatever it says, so it stays small and calm. (Rebuilding a robot
 * isn't here: it's done by driving into the Bot Maker.)
 *
 * The station reports its state many times a second, so the line is only rebuilt when what it says changes. Rebuilding
 * it every time would swap its buttons out from under a press, and the click would never land.
 */
export function showStationStatus(
  el: HTMLElement,
  status: StatusLine,
  robotName: string | undefined,
  actions: StatusActions,
) {
  const action = (label: string, run: () => void) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', run);
    return b;
  };
  const said = JSON.stringify([status, robotName]);
  if (!el.hidden && el.dataset.said === said) return;
  el.dataset.said = said;
  el.hidden = false;
  el.dataset.state = status.kind;
  el.replaceChildren();
  switch (status.kind) {
    case 'connecting':
      el.append('Station · connecting…');
      break;
    case 'aboard':
      // Who this seat is goes on its own line (showWho).
      el.append(`Station · online · ${status.aboard} aboard`);
      break;
    case 'restarting':
      el.append('Station restarting · back in a moment');
      break;
    case 'full':
      el.append('Station full · trying again soon');
      break;
    case 'unreachable':
      el.append('Station offline · retrying');
      break;
    case 'outdated':
      el.append(
        'Saber Side was updated · ',
        action('Reload', () => location.reload()),
      );
      break;
    case 'replaced':
      el.append(`Playing as ${robotName ?? 'you'} on another device · `, action('Play here', actions.playHere));
      break;
    case 'ashore':
    case 'refused':
    case 'removed':
      el.append('Station · not aboard · ', action('Come aboard', actions.comeAboard));
      break;
  }
}

/**
 * Who this seat is, for the HUD: a registered player and the robot they pilot, or a guest. `paint` is the robot's
 * paint cure in percent, when paint cures on this station and the robot has any paint.
 */
export type Who = ({ player: string; robot: string } | { guest: string }) & { paint?: number };

/**
 * The line above the station line saying who you're playing as: "Mia · piloting Sprout" for a registered player, or
 * "Guest · Bot 3" with a nudge to register (guests aren't saved). Hidden when this device isn't aboard.
 */
export function showWho(el: HTMLElement, who: Who | undefined) {
  const said = JSON.stringify(who ?? null);
  if (el.dataset.said === said) return;
  el.dataset.said = said;
  el.hidden = !who;
  el.replaceChildren();
  if (!who) return;
  const span = (cls: string, text: string) => {
    const s = document.createElement('span');
    s.className = cls;
    s.textContent = text;
    return s;
  };
  if ('guest' in who) {
    el.dataset.kind = 'guest';
    // Point guests at the place that saves them.
    el.append(
      span('guest', 'Guest'),
      ` · ${who.guest}`,
      span('nudge', ' · Register at the Robot Registry to keep your robot'),
    );
  } else {
    el.dataset.kind = 'player';
    el.append(`${who.player} · piloting ${who.robot}`);
  }
  if (who.paint !== undefined) el.append(span('paint', ` · ${cureText(who.paint)}`));
}
