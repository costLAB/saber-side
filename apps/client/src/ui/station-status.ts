import type { StationStatus } from '../net/station-link';

/** The station line can also say we're not aboard (the roster was dismissed, or our robot was refused or removed). */
export type StatusLine = StationStatus | { kind: 'ashore' };

export interface StatusActions {
  /** Open the roster to play as someone else. */
  switchRobot(): void;
  /** Open the roster after "Just look around". */
  comeAboard(): void;
  /** Take the robot back from the other device. */
  playHere(): void;
}

/** Status line under the title. The game works alone whatever it says, so it stays small and calm. */
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
  el.hidden = false;
  el.dataset.state = status.kind;
  el.replaceChildren();
  switch (status.kind) {
    case 'connecting':
      el.append('Station · connecting…');
      break;
    case 'aboard':
      el.append(`Station · online · ${status.aboard} aboard`);
      if (robotName) el.append(` · as ${robotName} `, action('Switch', actions.switchRobot));
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
      el.append(`Playing as ${robotName ?? 'this robot'} on another device · `, action('Play here', actions.playHere));
      break;
    case 'ashore':
    case 'refused':
    case 'removed':
      el.append('Station · not aboard · ', action('Come aboard', actions.comeAboard));
      break;
  }
}
