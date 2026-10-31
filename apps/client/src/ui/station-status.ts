import type { StationStatus } from '../net/station-link';

/** Status line under the title. The game works alone whatever it says, so it stays small and calm. */
export function showStationStatus(el: HTMLElement, status: StationStatus) {
  el.hidden = false;
  el.dataset.state = status.kind;
  switch (status.kind) {
    case 'connecting':
      el.textContent = 'Station · connecting…';
      break;
    case 'aboard':
      el.textContent = `Station · online · ${status.aboard} aboard`;
      break;
    case 'restarting':
      el.textContent = 'Station restarting · back in a moment';
      break;
    case 'full':
      el.textContent = 'Station full · trying again soon';
      break;
    case 'unreachable':
      el.textContent = 'Station offline · retrying';
      break;
    case 'outdated': {
      el.textContent = 'Saber Side was updated · ';
      const reload = document.createElement('button');
      reload.type = 'button';
      reload.textContent = 'Reload';
      reload.addEventListener('click', () => location.reload());
      el.append(reload);
      break;
    }
  }
}
