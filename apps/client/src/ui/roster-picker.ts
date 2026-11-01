import {
  classicBuild,
  cleanRobotName,
  isPin,
  ORIGINAL_PAINT,
  PART_SLOTS,
  type PartSlot,
  REQUIRED_SLOTS,
  ROBOT_COLORS,
  ROBOT_NAME_MAX,
  ROBOT_PARTS,
  type RobotBuild,
  type RobotCard,
} from '@saber-side/shared';
import { ApiFailure, type RosterApi } from '../net/roster-api';
import type { RobotPreview } from './robot-preview';
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
  /** A turntable for the robot builder, if this device can draw one. */
  preview?(): RobotPreview | undefined;
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

const paint = (hex: string) =>
  h('span', {
    class: hex === ORIGINAL_PAINT ? 'paint original' : 'paint',
    style: `--paint: ${hex}`,
    'aria-hidden': 'true',
  });

const SLOT_NAMES: Record<PartSlot, string> = { mobility: 'Mobility', body: 'Body', head: 'Head', arms: 'Arms' };

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
  const sheet = root.firstElementChild as HTMLElement;
  let current: RosterView = { kind: 'list' };
  let preview: RobotPreview | undefined;

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
    endPreview();
  }

  function endPreview() {
    preview?.dispose();
    preview = undefined;
  }

  function show(view: RosterView = { kind: 'list' }) {
    current = view;
    root.hidden = false;
    endPreview();
    sheet.classList.toggle('wide', view.kind === 'new');
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
    const parts = renderParts(classicBuild());
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
      parts.node,
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
      const build = parts.read();
      if (!build.mobility) {
        err$.textContent = 'Every robot needs a wheel to roll on.';
        return;
      }
      submit.disabled = true;
      try {
        const robot = await api.create({ name: clean, build, ...(pin.value ? { pin: pin.value } : {}) });
        handlers.onPick(robot, pin.value || undefined);
      } catch (e) {
        err$.textContent = message(e);
        submit.disabled = false;
      }
    });
    return [title('Build a robot'), form];
  }

  /**
   * The parts picker: a row of parts for each slot (mobility, body, head, arms), each with its own paint, beside a
   * turntable of the robot so far. Every slot but mobility can be left empty.
   */
  function renderParts(start: RobotBuild) {
    const slots = PART_SLOTS.map((slot) => {
      const required = REQUIRED_SLOTS.includes(slot);
      const pick = start[slot];
      const choices: [string, string][] = [
        ...(required ? [] : ([['', 'None']] as [string, string][])),
        ...ROBOT_PARTS[slot].map((p): [string, string] => [p.id, p.name]),
      ];
      const partRadios = choices.map(([id, label]) => {
        const radio = h('input', { type: 'radio', name: `part-${slot}`, value: id });
        radio.checked = (pick?.part ?? '') === id;
        return h('label', { class: 'chip' }, radio, h('span', {}, label));
      });
      const paintRadios = ROBOT_COLORS.map((c) => {
        const radio = h('input', {
          type: 'radio',
          name: `paint-${slot}`,
          value: c.hex,
          'aria-label': `${SLOT_NAMES[slot]} paint: ${c.name}`,
        });
        radio.checked = (pick?.paint ?? ORIGINAL_PAINT) === c.hex;
        return h('label', { title: c.name }, radio, paint(c.hex));
      });
      const paints = h('fieldset', { class: 'paints' }, ...paintRadios);
      return {
        slot,
        paints,
        node: h(
          'fieldset',
          { class: 'slot', 'data-slot': slot },
          h(
            'legend',
            {},
            SLOT_NAMES[slot],
            required && h('span', { class: 'need' }, slot === 'mobility' ? 'needed to roll' : 'needed'),
          ),
          h('div', { class: 'parts' }, ...partRadios),
          paints,
        ),
      };
    });
    const stage = h('div', { class: 'stage' });
    const node = h('div', { class: 'builder' }, stage, h('div', { class: 'slots' }, ...slots.map((x) => x.node)));

    const value = (name: string) => node.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)?.value ?? '';
    function read(): RobotBuild {
      const build: Record<string, { part: string; paint: string } | null> = {};
      for (const { slot } of slots) {
        const part = value(`part-${slot}`);
        build[slot] = part ? { part, paint: value(`paint-${slot}`) || ORIGINAL_PAINT } : null;
      }
      return build as unknown as RobotBuild;
    }
    function update() {
      const build = read();
      // A slot left empty has nothing to paint.
      for (const { slot, paints } of slots) paints.disabled = !build[slot];
      preview?.show(build);
    }
    node.addEventListener('change', update);

    preview = handlers.preview?.();
    if (preview) stage.append(preview.canvas);
    else stage.append(h('p', { class: 'no-preview' }, 'Pick a part for each slot.'));
    update();
    return { node, read };
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
