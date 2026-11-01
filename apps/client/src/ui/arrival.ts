import {
  ccToShards,
  classicBuild,
  cleanRobotName,
  isGuestName,
  isPin,
  type LedgerEntry,
  ORIGINAL_PAINT,
  type OwnerPlayer,
  PART_SLOTS,
  type PartSlot,
  REQUIRED_SLOTS,
  ROBOT_COLORS,
  ROBOT_NAME_MAX,
  ROBOT_PARTS,
  type RobotBuild,
  walletText,
} from '@saber-side/shared';
import { ApiFailure, type OwnerApi } from '../net/owner-api';
import type { RobotPreview } from './robot-preview';
import './arrival.css';

/** What the arrival sheet can show. Each view can carry an error to show (say, a wrong PIN after a join). */
export type ArrivalView =
  /** Play, or log in. `name` fills in the username. */
  | { kind: 'welcome'; name?: string; error?: string }
  /** The robot builder: a new guest's robot, or new parts for the robot being piloted (at the Bot Maker). */
  | { kind: 'build'; rebuild?: { name: string; build: RobotBuild }; error?: string }
  /** The Robot Registry's kiosk: register (guests), or log in. `name` is the registered player's. */
  | { kind: 'registry'; guest: boolean; name?: string; error?: string }
  | { kind: 'owner-key'; error?: string }
  | { kind: 'owner'; key: string; error?: string }
  /** One player's ledger, with a Reverse button on each entry. */
  | { kind: 'ledger'; key: string; player: OwnerPlayer; error?: string };

export interface ArrivalHandlers {
  /** Play as a guest. Returns the build to come aboard with, or undefined to open the builder first. */
  onPlay(): RobotBuild | undefined;
  /** A guest's robot is built: come aboard with it. */
  onBuilt(build: RobotBuild): void;
  /** New parts for the robot being piloted. */
  onRebuilt(build: RobotBuild): void;
  /** Log in. The server checks the PIN when the seat joins. */
  onLogin(name: string, pin: string): void;
  /** At the Registry: register this guest. Resolves with an error to show, or nothing once it worked. */
  onRegister(name: string, pin: string): Promise<string | undefined>;
  /** At the Registry: log this seat in as a player. Resolves with an error to show, or nothing once it worked. */
  onSignIn(name: string, pin: string): Promise<string | undefined>;
  /** "Just look around": play without coming aboard (or, from the builder, keep the robot as it is). */
  onDismiss(): void;
  /** A turntable for the robot builder, if this device can draw one. */
  preview?(): RobotPreview | undefined;
  /** The owner panel's API, for a key. */
  owner(key: string): OwnerApi;
  ownerKey: { get(): string | undefined; set(key: string | undefined): void };
}

export interface ArrivalSheet {
  show(view?: ArrivalView): void;
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
 * The sheet over the game when a player arrives: one big **Play** (a guest: build a robot and roll out), and a quieter
 * **Log in** for registered players. It also holds the robot builder, which the Bot Maker opens to rebuild a robot,
 * and the owner panel. It stops key presses from reaching the game, so typing a name doesn't drive the robot around.
 */
export function createArrival(handlers: ArrivalHandlers): ArrivalSheet {
  const body = h('div', { class: 'view' });
  const root = h(
    'div',
    { class: 'arrival', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'arrival-title', hidden: '' },
    h('div', { class: 'sheet' }, h('div', { class: 'eyebrow' }, 'Ring Seven · Saber Side'), body),
  );
  for (const type of ['keydown', 'keyup', 'keypress'] as const) {
    root.addEventListener(type, (e) => {
      e.stopPropagation();
      if (type === 'keydown' && (e as KeyboardEvent).key === 'Escape') back();
    });
  }
  document.body.append(root);
  const sheet = root.firstElementChild as HTMLElement;
  let current: ArrivalView = { kind: 'welcome' };
  let preview: RobotPreview | undefined;

  function back() {
    if (current.kind === 'welcome' || current.kind === 'registry' || (current.kind === 'build' && current.rebuild)) {
      dismiss();
    } else show({ kind: 'welcome' });
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

  function show(view: ArrivalView = { kind: 'welcome' }) {
    current = view;
    root.hidden = false;
    endPreview();
    sheet.classList.toggle('wide', view.kind === 'build');
    body.replaceChildren(...render(view));
    const focus = view.kind === 'welcome' ? '.play' : 'input:not([type=radio])';
    body.querySelector<HTMLElement>(focus)?.focus();
  }

  function title(text: string) {
    return h('h2', { id: 'arrival-title' }, text);
  }

  function error(text?: string) {
    return h('p', { class: 'error', role: 'alert' }, text ?? '');
  }

  function render(view: ArrivalView): Node[] {
    switch (view.kind) {
      case 'welcome':
        return renderWelcome(view.name, view.error);
      case 'build':
        return renderBuild(view.rebuild, view.error);
      case 'registry':
        return renderRegistry(view.guest, view.name, view.error);
      case 'owner-key':
        return renderOwnerKey(view.error);
      case 'owner':
        return renderOwner(view.key, view.error);
      case 'ledger':
        return renderLedger(view.key, view.player, view.error);
    }
  }

  const textInput = (name: string, autocomplete: string) =>
    h('input', {
      type: 'text',
      name,
      maxlength: String(ROBOT_NAME_MAX),
      autocomplete,
      autocapitalize: 'words',
      spellcheck: 'false',
      enterkeyhint: 'next',
    });
  const pinInput = (name: string, autocomplete: string) =>
    h('input', { type: 'password', name, inputmode: 'numeric', maxlength: '4', autocomplete });

  /**
   * The login form: a username and a PIN. `submit` gets them once they look right, and returns an error to show (or
   * nothing, when the answer comes later, as a join's does).
   */
  function loginForm(
    lastName: string | undefined,
    err: string | undefined,
    submit: (name: string, pin: string) => Promise<string | undefined> | undefined,
  ) {
    const name = textInput('username', 'username');
    name.value = lastName ?? '';
    const pin = pinInput('pin', 'current-password');
    const err$ = error(err);
    const go = button('Log in', 'ghost', () => {}, 'submit');
    const form = h('form', { class: 'login' }, h('label', {}, 'Username', name), h('label', {}, 'PIN', pin), go, err$);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!cleanRobotName(name.value)) {
        err$.textContent = 'Type your username.';
        return;
      }
      if (!isPin(pin.value)) {
        err$.textContent = 'Your PIN is 4 digits.';
        return;
      }
      go.disabled = true;
      err$.textContent = (await submit(name.value, pin.value)) ?? '';
      go.disabled = false;
    });
    return form;
  }

  function renderWelcome(lastName?: string, err?: string): Node[] {
    const play = button('Play', 'primary play', () => {
      const build = handlers.onPlay();
      if (!build) show({ kind: 'build' });
    });
    const login = loginForm(lastName, err, (name, pin) => {
      handlers.onLogin(name, pin);
      return undefined;
    });
    return [
      title('Welcome aboard'),
      h('p', {}, 'Build a robot and roll out onto the station. No sign-up needed.'),
      play,
      h('div', { class: 'or' }, 'Already registered?'),
      login,
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
  }

  function renderRegistry(guest: boolean, name: string | undefined, err?: string): Node[] {
    const leave = h('div', { class: 'foot' }, button('Leave', 'link', dismiss));
    const login = loginForm(name, guest ? undefined : err, async (n, pin) => {
      const failed = await handlers.onSignIn(n, pin);
      if (!failed) hide();
      return failed;
    });
    if (!guest) {
      return [
        title('Robot Registry'),
        h('p', {}, `You're registered as ${name}. Log in as someone else on this device:`),
        login,
        leave,
      ];
    }
    const user = textInput('new-username', 'username');
    const pin = pinInput('new-pin', 'new-password');
    const again = pinInput('new-pin-again', 'new-password');
    const err$ = error(err);
    const go = button('Register', 'primary', () => {}, 'submit');
    const form = h(
      'form',
      {},
      h('label', {}, 'Pick a username', user),
      h('label', {}, 'Pick a 4-digit PIN', pin),
      h('label', {}, 'PIN again', again),
      err$,
      h('div', { class: 'actions' }, go),
    );
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const clean = cleanRobotName(user.value);
      if (!clean) {
        err$.textContent = 'Pick a username of 1 to 16 letters or numbers.';
        return;
      }
      if (isGuestName(clean)) {
        err$.textContent = 'Names like "Bot 7" are for guests. Pick another.';
        return;
      }
      if (!isPin(pin.value)) {
        err$.textContent = 'A PIN is exactly 4 digits.';
        return;
      }
      if (pin.value !== again.value) {
        err$.textContent = "The two PINs don't match.";
        return;
      }
      go.disabled = true;
      const failed = await handlers.onRegister(clean, pin.value);
      go.disabled = false;
      if (failed) err$.textContent = failed;
      else hide();
    });
    return [
      title('Robot Registry'),
      h(
        'p',
        {},
        'Register to keep your robot and open your Cyber Crystal wallet. Pick a username and a PIN, and log in with them on any device. Keep your PIN secret.',
      ),
      form,
      h('div', { class: 'or' }, 'Already registered?'),
      login,
      leave,
    ];
  }

  function renderBuild(rebuild: { name: string; build: RobotBuild } | undefined, err?: string): Node[] {
    const parts = renderParts(rebuild?.build ?? classicBuild());
    const err$ = error(err);
    const form = h(
      'form',
      {},
      parts.node,
      err$,
      h(
        'div',
        { class: 'actions' },
        button(rebuild ? 'Keep it' : 'Back', 'ghost', back),
        button('Roll out', 'primary', () => {}, 'submit'),
      ),
    );
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const build = parts.read();
      if (!build.mobility) {
        err$.textContent = 'Every robot needs a wheel to roll on.';
        return;
      }
      hide();
      if (rebuild) handlers.onRebuilt(build);
      else handlers.onBuilt(build);
    });
    return [title(rebuild ? `Rebuild ${rebuild.name}` : 'Build your robot'), form];
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

  function renderOwnerKey(err?: string): Node[] {
    const key = h('input', { type: 'password', name: 'key', autocomplete: 'off', 'aria-label': 'Owner key' });
    const err$ = error(err);
    const form = h(
      'form',
      {},
      h(
        'p',
        {},
        'Owners can rename players and robots, reset a forgotten PIN, or remove them. The key is ADMIN_KEY on Render.',
      ),
      h('label', {}, 'Owner key', key),
      err$,
      h(
        'div',
        { class: 'actions' },
        button('Back', 'ghost', () => show({ kind: 'welcome' })),
        button('Unlock', 'primary', () => {}, 'submit'),
      ),
    );
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await handlers.owner(key.value).check();
        handlers.ownerKey.set(key.value);
        show({ kind: 'owner', key: key.value });
      } catch (e) {
        err$.textContent = message(e);
      }
    });
    return [title('Owner panel'), form];
  }

  function renderOwner(key: string, err?: string): Node[] {
    const owner = handlers.owner(key);
    const list = h('div', {}, h('p', {}, 'Loading players…'));
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
    const rename = (what: string, current: string, run: (name: string) => Promise<unknown>) =>
      button('Rename', '', () => {
        const name = prompt(`New name for ${what} ${current}`, current);
        if (name !== null) act(() => run(name));
      });
    const playerRows = (player: OwnerPlayer) => [
      h(
        'div',
        { class: 'owner-row', 'data-player': player.id },
        h(
          'span',
          { class: 'name' },
          player.name,
          player.pinReset && h('span', { class: 'need' }, ' · new PIN next login'),
          h('span', { class: 'shards' }, walletText(player.shards)),
        ),
        button('Grant', '', () => {
          const typed = prompt(`How many CC for ${player.name}? (Negative takes them away.)`, '1');
          if (typed === null) return;
          const shards = ccToShards(Number(typed));
          if (!shards) err$.textContent = 'Type an amount of CC, like 5 or 0.25.';
          else act(() => owner.grant(player.id, shards));
        }),
        button('Ledger', '', () => show({ kind: 'ledger', key, player })),
        rename('player', player.name, (name) => owner.renamePlayer(player.id, name)),
        button('Reset PIN', '', () => {
          if (confirm(`Reset ${player.name}'s PIN? The next PIN they log in with becomes their new one.`))
            act(() => owner.resetPin(player.id));
        }),
        button('Remove', '', () => {
          if (confirm(`Remove ${player.name} and all their robots?`)) act(() => owner.removePlayer(player.id));
        }),
      ),
      ...player.robots.map((robot) =>
        h(
          'div',
          { class: 'owner-row robot-row', 'data-robot': robot.id },
          h('span', { class: 'name' }, h('span', { class: 'dot', style: `--paint: ${robot.color}` }), robot.name),
          rename('robot', robot.name, (name) => owner.renameRobot(robot.id, name)),
          player.robots.length > 1 &&
            button('Remove', '', () => {
              if (confirm(`Remove the robot ${robot.name}?`)) act(() => owner.removeRobot(robot.id));
            }),
        ),
      ),
    ];
    owner.players().then(
      (players) =>
        list.replaceChildren(
          ...(players.length ? [] : [h('p', {}, 'No registered players yet.')]),
          ...players.flatMap(playerRows),
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
        button('Back', 'link', () => show({ kind: 'welcome' })),
        button('Lock this device', 'link', () => {
          handlers.ownerKey.set(undefined);
          show({ kind: 'welcome' });
        }),
      ),
    ];
  }

  function renderLedger(key: string, player: OwnerPlayer, err?: string): Node[] {
    const owner = handlers.owner(key);
    const list = h('div', {}, h('p', {}, 'Loading the ledger…'));
    const err$ = error(err);
    const account = `player:${player.id}`;
    const reverse = (entry: LedgerEntry) =>
      button('Reverse', '', async () => {
        try {
          await owner.reverse(entry.id);
          show({ kind: 'ledger', key, player });
        } catch (e) {
          err$.textContent = message(e);
        }
      });
    const row = (entry: LedgerEntry) => {
      const into = entry.to === account;
      const other = (into ? entry.from : entry.to).startsWith('player:') ? 'a player' : into ? entry.from : entry.to;
      return h(
        'div',
        { class: 'owner-row', 'data-entry': String(entry.id) },
        h(
          'span',
          { class: 'name' },
          `${into ? '+' : '−'}${walletText(entry.shards)}`,
          h('span', { class: 'need' }, ` ${entry.reason} · ${into ? 'from' : 'to'} ${other}`),
        ),
        entry.reversed ? h('span', { class: 'need' }, 'reversed') : entry.reason !== 'reversal' && reverse(entry),
      );
    };
    owner.ledger(player.id).then(
      (entries) =>
        list.replaceChildren(
          ...(entries.length ? [] : [h('p', {}, 'No entries yet: everyone starts with nothing.')]),
          ...entries.map(row),
        ),
      (e) => list.replaceChildren(error(message(e))),
    );
    return [
      title(`${player.name}'s ledger`),
      err$,
      list,
      h(
        'div',
        { class: 'foot' },
        button('Back', 'link', () => show({ kind: 'owner', key })),
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
