import { cleanRobotName, isPin, ROBOT_COLORS, ROBOT_NAME_MAX, type RobotCard } from '@saber-side/shared';
import { ApiFailure, type RosterApi } from '../net/roster-api';
import './roster.css';

/** What the roster screen can show. Each view can carry an error to show (say, "Wrong PIN" after a join). */
export type RosterView =
  | { kind: 'list'; robots?: RobotCard[]; error?: string }
  | { kind: 'new'; error?: string }
  | { kind: 'pin'; robot: RobotCard; error?: string }
  | { kind: 'owner-key'; error?: string }
  | { kind: 'owner'; key: string; error?: string };

export interface RosterHandlers {
  /** A robot was picked (or just made). The PIN is whatever was typed, checked by the server on join. */
  onPick(robot: RobotCard, pin?: string): void;
  /** "Just look around": play without coming aboard. */
  onDismiss(): void;
  ownerKey: { get(): string | undefined; set(key: string | undefined): void };
}

export interface RosterPicker {
  show(view?: RosterView): void;
  hide(): void;
  readonly open: boolean;
}

type Child = Node | string | false | undefined;

/** A tiny element builder. Text always goes in as text, never HTML, since robot names are typed by players. */
function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const c of children) if (c) el.append(c);
  return el;
}

function button(label: Child, cls: string, onClick: () => void, type: 'button' | 'submit' = 'button') {
  const b = h('button', { type, class: cls }, label);
  if (type === 'button') b.addEventListener('click', onClick);
  return b;
}

const paint = (hex: string) => h('span', { class: 'paint', style: `--paint: ${hex}`, 'aria-hidden': 'true' });

const message = (e: unknown) => (e instanceof ApiFailure ? e.message : 'Something went wrong. Try again.');

/**
 * The "Who's playing?" sheet over the game: pick your robot, make a new one, type a PIN, or (for owners) tidy the
 * roster. It stops key presses from reaching the game, so typing a name doesn't drive the robot around.
 */
export function createRosterPicker(api: RosterApi, handlers: RosterHandlers): RosterPicker {
  const body = h('div', { class: 'view' });
  const root = h(
    'div',
    { class: 'roster', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'roster-title', hidden: '' },
    h('div', { class: 'sheet' }, h('div', { class: 'eyebrow' }, 'Ring Seven · roster'), body),
  );
  for (const type of ['keydown', 'keyup', 'keypress'] as const) {
    root.addEventListener(type, (e) => {
      e.stopPropagation();
      if (type === 'keydown' && (e as KeyboardEvent).key === 'Escape') back();
    });
  }
  document.body.append(root);
  let current: RosterView = { kind: 'list' };

  function back() {
    if (current.kind === 'list') dismiss();
    else show({ kind: 'list' });
  }

  function dismiss() {
    hide();
    handlers.onDismiss();
  }

  function hide() {
    root.hidden = true;
  }

  function show(view: RosterView = { kind: 'list' }) {
    current = view;
    root.hidden = false;
    body.replaceChildren(...render(view));
    body.querySelector<HTMLElement>('input:not([type=radio]), .robot')?.focus();
  }

  function title(text: string) {
    return h('h2', { id: 'roster-title' }, text);
  }

  function error(text?: string) {
    return h('p', { class: 'error', role: 'alert' }, text ?? '');
  }

  function render(view: RosterView): Node[] {
    switch (view.kind) {
      case 'list':
        return renderList(view.robots, view.error);
      case 'new':
        return renderNew(view.error);
      case 'pin':
        return renderPin(view.robot, view.error);
      case 'owner-key':
        return renderOwnerKey(view.error);
      case 'owner':
        return renderOwner(view.key, view.error);
    }
  }

  function renderList(robots: RobotCard[] | undefined, err?: string): Node[] {
    if (!robots) {
      api.roster().then(
        (r) => current.kind === 'list' && show({ kind: 'list', robots: r.robots, error: err }),
        (e) => current.kind === 'list' && show({ kind: 'list', robots: [], error: message(e) }),
      );
      return [title("Who's playing?"), h('p', {}, 'Loading the roster…')];
    }
    const cards = robots.map((robot) => {
      const card = h(
        'button',
        { type: 'button', class: 'robot', 'data-robot': robot.id },
        paint(robot.color),
        h('span', { class: 'name' }, robot.name),
        robot.pin && h('span', { class: 'lock' }, 'PIN'),
      );
      card.addEventListener('click', () => (robot.pin ? show({ kind: 'pin', robot }) : handlers.onPick(robot)));
      return card;
    });
    const nodes: (Node | false)[] = [
      title("Who's playing?"),
      robots.length === 0 && h('p', {}, 'No robots yet. Make the first one!'),
      error(err),
      h(
        'div',
        { class: 'robots' },
        ...cards,
        button('+ New robot', 'robot new', () => show({ kind: 'new' })),
      ),
      h(
        'div',
        { class: 'foot' },
        button('Just look around', 'link', dismiss),
        button('Owner', 'link', () => {
          const key = handlers.ownerKey.get();
          show(key ? { kind: 'owner', key } : { kind: 'owner-key' });
        }),
      ),
    ];
    return nodes.filter((n): n is Node => n !== false);
  }

  function renderNew(err?: string): Node[] {
    const name = h('input', {
      type: 'text',
      name: 'name',
      maxlength: String(ROBOT_NAME_MAX),
      autocomplete: 'off',
      autocapitalize: 'words',
      spellcheck: 'false',
      enterkeyhint: 'next',
    });
    const paints = ROBOT_COLORS.map((c, i) => {
      const radio = h('input', { type: 'radio', name: 'paint', value: c.hex, 'aria-label': c.name });
      if (i === 0) radio.checked = true;
      return h('label', { title: c.name }, radio, paint(c.hex));
    });
    const pin = h('input', {
      type: 'password',
      name: 'pin',
      inputmode: 'numeric',
      maxlength: '4',
      pattern: '[0-9]{4}',
      autocomplete: 'off',
      placeholder: 'none',
    });
    const err$ = error(err);
    const submit = button('Come aboard', 'primary', () => {}, 'submit');
    const form = h(
      'form',
      {},
      h('label', {}, 'Name', name),
      h('fieldset', {}, h('legend', {}, 'Paint'), h('div', { class: 'paints' }, ...paints)),
      h('label', {}, 'PIN (optional, 4 digits)', pin),
      err$,
      h(
        'div',
        { class: 'actions' },
        button('Back', 'ghost', () => show({ kind: 'list' })),
        submit,
      ),
    );
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const clean = cleanRobotName(name.value);
      if (!clean) {
        err$.textContent = 'Pick a name of 1 to 16 letters or numbers.';
        return;
      }
      if (pin.value && !isPin(pin.value)) {
        err$.textContent = 'A PIN is exactly 4 digits, or leave it empty.';
        return;
      }
      const color = form.querySelector<HTMLInputElement>('input[name=paint]:checked')?.value ?? ROBOT_COLORS[0].hex;
      submit.disabled = true;
      try {
        const robot = await api.create({ name: clean, color, ...(pin.value ? { pin: pin.value } : {}) });
        handlers.onPick(robot, pin.value || undefined);
      } catch (e) {
        err$.textContent = message(e);
        submit.disabled = false;
      }
    });
    return [title('New robot'), form];
  }

  function renderPin(robot: RobotCard, err?: string): Node[] {
    const pin = h('input', {
      type: 'password',
      name: 'pin',
      inputmode: 'numeric',
      maxlength: '4',
      autocomplete: 'off',
      'aria-label': `${robot.name}'s PIN`,
    });
    const form = h(
      'form',
      {},
      h('label', {}, `${robot.name}'s PIN`, pin),
      error(err),
      h(
        'div',
        { class: 'actions' },
        button('Back', 'ghost', () => show({ kind: 'list' })),
        button('Come aboard', 'primary', () => {}, 'submit'),
      ),
    );
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      handlers.onPick(robot, pin.value);
    });
    return [title(`Hi, ${robot.name}`), form];
  }

  function renderOwnerKey(err?: string): Node[] {
    const key = h('input', { type: 'password', name: 'key', autocomplete: 'off', 'aria-label': 'Owner key' });
    const err$ = error(err);
    const form = h(
      'form',
      {},
      h('p', {}, 'Owners can rename robots, clear a forgotten PIN, or remove a robot. The key is ADMIN_KEY on Render.'),
      h('label', {}, 'Owner key', key),
      err$,
      h(
        'div',
        { class: 'actions' },
        button('Back', 'ghost', () => show({ kind: 'list' })),
        button('Unlock', 'primary', () => {}, 'submit'),
      ),
    );
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api.owner(key.value).check();
        handlers.ownerKey.set(key.value);
        show({ kind: 'owner', key: key.value });
      } catch (e) {
        err$.textContent = message(e);
      }
    });
    return [title('Owner panel'), form];
  }

  function renderOwner(key: string, err?: string): Node[] {
    const owner = api.owner(key);
    const list = h('div', {}, h('p', {}, 'Loading the roster…'));
    const err$ = error(err);
    const act = async (work: () => Promise<unknown>) => {
      try {
        await work();
        show({ kind: 'owner', key });
      } catch (e) {
        if (e instanceof ApiFailure && e.status === 401) {
          handlers.ownerKey.set(undefined);
          show({ kind: 'owner-key', error: e.message });
        } else err$.textContent = message(e);
      }
    };
    api.roster().then(
      ({ robots }) =>
        list.replaceChildren(
          ...(robots.length ? [] : [h('p', {}, 'No robots yet.')]),
          ...robots.map((robot) =>
            h(
              'div',
              { class: 'owner-row' },
              h('span', { class: 'name' }, h('span', { class: 'dot', style: `--paint: ${robot.color}` }), robot.name),
              button('Rename', '', () => {
                const name = prompt(`New name for ${robot.name}`, robot.name);
                if (name !== null) act(() => owner.rename(robot.id, name));
              }),
              robot.pin && button('Clear PIN', '', () => act(() => owner.clearPin(robot.id))),
              button('Remove', '', () => {
                if (confirm(`Remove ${robot.name} from the roster?`)) act(() => owner.remove(robot.id));
              }),
            ),
          ),
        ),
      (e) => list.replaceChildren(error(message(e))),
    );
    return [
      title('Owner panel'),
      err$,
      list,
      h(
        'div',
        { class: 'foot' },
        button('Back', 'link', () => show({ kind: 'list' })),
        button('Lock this device', 'link', () => {
          handlers.ownerKey.set(undefined);
          show({ kind: 'list' });
        }),
      ),
    ];
  }

  return {
    show,
    hide,
    get open() {
      return !root.hidden;
    },
  };
}
