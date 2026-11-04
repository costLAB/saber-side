import './roadmap-sheet.css';

export interface RoadmapSheet {
  show(): void;
  hide(): void;
  readonly open: boolean;
}

/**
 * The Roadmap over the game: roadmap.html in a frame, loaded the first time it opens, and a Close button. Escape
 * closes it, whether it's pressed on the sheet or inside the page (which posts a message, since the game can't hear
 * keys pressed in a frame). Like the arrival sheet, it stops key presses here from driving the robot.
 */
export function createRoadmapSheet(onClose: () => void): RoadmapSheet {
  const root = document.createElement('div');
  root.className = 'roadmap-sheet';
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Roadmap');
  const frame = document.createElement('div');
  frame.className = 'frame';
  const iframe = document.createElement('iframe');
  iframe.title = 'Roadmap';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'close';
  close.textContent = 'Close';
  close.addEventListener('click', () => hide());
  frame.append(iframe, close);
  root.append(frame);
  document.body.append(root);

  for (const type of ['keydown', 'keyup', 'keypress'] as const) {
    root.addEventListener(type, (e) => {
      e.stopPropagation();
      if (type === 'keydown' && (e as KeyboardEvent).key === 'Escape') hide();
    });
  }
  addEventListener('message', (e) => {
    if (e.origin === location.origin && e.source === iframe.contentWindow && e.data?.roadmap === 'close') hide();
  });

  function show() {
    if (!iframe.src) iframe.src = `${import.meta.env.BASE_URL}roadmap.html`;
    root.hidden = false;
    // Focus the page, so arrow keys and the trackpad scroll it rather than the game.
    iframe.focus();
  }

  function hide() {
    if (root.hidden) return;
    root.hidden = true;
    document.querySelector<HTMLElement>('#stage canvas')?.focus();
    onClose();
  }

  return {
    show,
    hide,
    get open() {
      return !root.hidden;
    },
  };
}
