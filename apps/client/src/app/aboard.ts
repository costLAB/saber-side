import type { Room } from '@colyseus/sdk';
import {
  type AboardView,
  type BotMakerAnswer,
  cleanRobotBuild,
  type Garage,
  insideBotMaker,
  insideRegistry,
  JOIN_REFUSED,
  MESSAGE,
  type NewRobot,
  NOTICE,
  type Pilot,
  type RegistryAnswer,
  type Rename,
  type RobotBuild,
  type SignIn,
  type StationView,
  type WalletNotice,
  walletText,
} from '@saber-side/shared';
import { legacy } from '../legacy/game.js';
import { ownerApi } from '../net/owner-api';
import { type Credentials, linkToStation, type StationStatus } from '../net/station-link';
import { createArrival } from '../ui/arrival';
import { createRobotPreview } from '../ui/robot-preview';
import { type StatusLine, showStationStatus } from '../ui/station-status';
import { device } from './device';
import { onDoorway } from './doorways';
import { createPresence } from './presence';

/**
 * Coming aboard (docs/initiatives/players-and-robots.md): **Play** builds a robot and comes aboard as a guest, with
 * an auto-generated name and nothing saved. **Log in** comes aboard as a registered player's robot. Once the station
 * lets the seat in, the robot is assembled from its parts and rolls out of the Bot Maker onto the promenade. Driving
 * back into the Bot Maker opens the builder, to rebuild it. Driving into the Robot Registry next door opens its kiosk:
 * a guest registers there (their robot is saved under the new player), and anyone can log in there.
 *
 * A guest's build is kept for as long as the page is open, so a restart brings the same robot back (as a new guest).
 * The device remembers the last username, never the PIN. The game stays playable behind all of this.
 */
export function comeAboard(server: string, statusEl: HTMLElement) {
  const walletEl = document.getElementById('wallet');
  // Other players' robots, kept in step with the station while this device is aboard.
  const presence = createPresence(legacy.world);
  legacy.frameHooks.push((dt) => presence.frame(dt));
  if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { __presence: presence });
  let link: { stop(): void } | undefined;
  let room: Room<unknown, StationView> | undefined;
  /** Who this page comes aboard as, once it has picked. */
  let credentials: Credentials | undefined;
  /** This page's guest robot, once built. */
  let guestBuild: RobotBuild | undefined;
  /** The robot this seat pilots, as the station last showed it. */
  let me: AboardView | undefined;
  /** Whether this join has spawned yet. Rejoining after a drop or a restart doesn't roll out again. */
  let spawned = false;
  /** A registered player's robots, as the station last sent them. */
  let garage: Garage | undefined;
  /** The build this device last drew its robot with (as the station spells it), to redraw when the station's differs. */
  let drawn = '';

  /** What the station line last said: why this device is (or isn't) aboard. */
  let said: StatusLine = { kind: 'ashore' };

  const status = (line: StatusLine) => {
    said = line;
    showStationStatus(statusEl, line, me?.name, me ? !me.player : false, {
      comeAboard: () => arrival.show(welcome()),
      playHere,
    });
  };
  const playHere = () => credentials && board(credentials);

  const welcome = (error?: string) => ({ kind: 'welcome' as const, name: device.username, error });

  const arrival = createArrival({
    onPlay: () => {
      if (guestBuild) board({ guest: { build: guestBuild } });
      return guestBuild;
    },
    onBuilt: (build) => {
      guestBuild = build;
      board({ guest: { build } });
    },
    onRebuilt: (build) => {
      if (credentials?.guest) {
        guestBuild = build;
        credentials = { guest: { build } };
      }
      room?.send(MESSAGE.rebuild, build);
      draw(build);
      legacy.rollOutOfBotMaker();
    },
    onRegister: async (name, pin) => signIn(MESSAGE.register, { name, pin }),
    onSignIn: async (name, pin) => signIn(MESSAGE.login, { name, pin }),
    onBuyRobot: (name, build) => atBotMaker(MESSAGE.build, { name, build }),
    onPilot: (robot) => atBotMaker(MESSAGE.pilot, { robot }),
    // A new name keeps the robot where it stands: the station shows it to everyone and sends the garage again.
    onRename: async (name) => {
      const reply = await ask<BotMakerAnswer>(MESSAGE.rename, { name } satisfies Rename, NOTICE.botMaker);
      return reply.ok ? undefined : reply.error;
    },
    onLogin: (name, pin) => board({ login: { name, pin } }),
    preview: () => createRobotPreview(legacy.robotKit),
    onDismiss: () => {
      // "Just look around" before coming aboard. A page turned away (outdated, or playing on another device) keeps
      // saying why.
      if (!link && said.kind !== 'outdated' && said.kind !== 'replaced') status({ kind: 'ashore' });
    },
    owner: (key) => ownerApi(server, key),
    ownerKey: {
      get: () => device.ownerKey,
      set: (key) => {
        device.ownerKey = key;
      },
    },
  });

  // Driving into the Bot Maker: rebuild the robot this seat pilots (a registered player picks from their garage). Not
  // aboard, it says why, rather than showing the arrival screen as if it were the builder.
  onDoorway(insideBotMaker, {
    open: () => {
      const build = aboardNow() && me && readBuild(me);
      if (me?.player && build && garage) arrival.show({ kind: 'garage', garage, piloting: me.robot });
      else if (me && build) arrival.show({ kind: 'build', rebuild: { name: me.name, build } });
      else if (guestBuild && retrying(said)) {
        // A guest whose station is away for now (a drop, a restart, a full station) still rebuilds their one robot:
        // the next join takes it aboard.
        const note = `${notAboard(said)} Your robot goes aboard as you leave it here.`;
        arrival.show({ kind: 'build', rebuild: { name: me?.name ?? 'your robot', build: guestBuild }, note });
      } else arrival.show(away('Bot Maker'));
    },
    isOpen: () => arrival.open,
  });
  // Driving into the Robot Registry: register, or log in.
  onDoorway(insideRegistry, {
    open: () => {
      if (aboardNow() && me)
        arrival.show({ kind: 'registry', guest: !me.player, name: me.player ? me.name : undefined });
      else arrival.show(away('Robot Registry'));
    },
    isOpen: () => arrival.open,
  });

  /** Whether this seat is aboard right now, with its robot known. */
  function aboardNow() {
    return !!(link && room && me);
  }

  /** A building's sheet when this device isn't aboard: why, and the one thing to do about it. */
  function away(place: string) {
    const leave = 'Leave';
    switch (said.kind) {
      case 'outdated':
        return { kind: 'notice' as const, title: place, text: notAboard(said), action: reload, leave };
      case 'replaced':
        return { kind: 'notice' as const, title: place, text: notAboard(said), action: playHereAction, leave };
      case 'ashore':
      case 'refused':
      case 'removed':
        return { kind: 'notice' as const, title: place, text: notAboard(said), action: comeAboardAction, leave };
      default:
        return { kind: 'notice' as const, title: place, text: notAboard(said), leave };
    }
  }

  const reload = { label: 'Reload', run: () => location.reload() };
  const playHereAction = { label: 'Play here', run: playHere };
  const comeAboardAction = { label: 'Come aboard', run: () => arrival.show(welcome()) };

  /** Why this device isn't aboard, in a sentence. */
  function notAboard(line: StatusLine): string {
    switch (line.kind) {
      case 'outdated':
        return 'Saber Side was updated. Reload the page to come aboard.';
      case 'replaced':
        return `You're playing as ${me?.name ?? 'you'} on another device.`;
      case 'full':
        return 'The station is full. Your game keeps trying for a seat.';
      case 'unreachable':
        return 'The station is offline. Your game keeps trying to reach it.';
      case 'restarting':
        return 'The station is restarting. It will be back in a moment.';
      case 'connecting':
      case 'aboard':
        return 'Coming aboard the station. One moment.';
      case 'removed':
        return "You're not aboard the station: an owner removed that player or robot.";
      case 'refused':
        return `You're not aboard the station: ${line.message}`;
      case 'ashore':
        return "You're not aboard the station.";
    }
  }

  /** Asks the Registry to register or log in this seat. Resolves with an error to show, or nothing once it worked. */
  async function signIn(type: string, details: SignIn): Promise<string | undefined> {
    const reply = await ask<RegistryAnswer>(type, details, NOTICE.registry);
    if (!reply.ok) return reply.error;
    // From now on this seat is that player's: rejoins after a drop or a restart log in.
    credentials = { login: { name: reply.name, pin: details.pin } };
    device.username = reply.name;
    return undefined;
  }

  /** Sends the station a request over the seat and waits for its answer (sent to this seat alone, as `notice`). */
  function ask<T extends { ok: boolean }>(
    type: string,
    body: unknown,
    notice: string,
  ): Promise<T | { ok: false; error: string }> {
    const seat = room;
    if (!seat) return Promise.resolve({ ok: false, error: "You're not aboard right now." });
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ ok: false, error: "The station didn't answer. Try again." }), 10_000);
      const stop = seat.onMessage(notice, (answer: T) => {
        clearTimeout(timer);
        stop();
        resolve(answer);
      });
      seat.send(type, body);
    });
  }

  /** At the Bot Maker: buy or switch robots, keeping the seat. The chosen robot rolls out of the Bot Maker. */
  async function atBotMaker(type: string, body: NewRobot | Pilot): Promise<string | undefined> {
    const reply = await ask<BotMakerAnswer>(type, body, NOTICE.botMaker);
    if (!reply.ok) return reply.error;
    legacy.rollOutOfBotMaker();
    return undefined;
  }

  /** The `12 ◆ 45` readout under the station line, or nothing (a guest, or not aboard). */
  function showWallet(shards: number | undefined) {
    if (!walletEl) return;
    walletEl.hidden = shards === undefined;
    walletEl.textContent = shards === undefined ? '' : walletText(shards);
    walletEl.title = shards === undefined ? '' : 'Cyber Crystals ◆ shards';
  }

  /** Draws this device's robot with these parts. */
  function draw(build: RobotBuild) {
    drawn = JSON.stringify(build);
    legacy.setRobotBuild(build);
  }

  function board(join: Credentials) {
    link?.stop();
    arrival.hide();
    credentials = join;
    me = undefined;
    spawned = false;
    link = linkToStation(
      server,
      () => credentials ?? join,
      (s) => onLink(join, s),
      (joined) => {
        room = joined;
        presence.attach(joined);
        joined?.onStateChange(() => presence.sync());
        // A registered player's balance comes to their seat alone. Guests have no wallet, so it stays hidden.
        showWallet(undefined);
        garage = undefined;
        joined?.onMessage(NOTICE.wallet, (notice: WalletNotice) => showWallet(notice.shards));
        joined?.onMessage(NOTICE.garage, (notice: Garage) => {
          garage = notice;
        });
      },
    );
  }

  function onLink(join: Credentials, s: StationStatus) {
    if (s.kind === 'aboard' && room) {
      const mine = room.state.players?.get(room.sessionId);
      if (mine) me = mine;
      const build = me && readBuild(me);
      if (me && build && !spawned) {
        spawned = true;
        if (join.login) device.username = join.login.name;
        draw(build);
        legacy.rollOutOfBotMaker();
      } else if (me && build && me.build !== drawn) {
        // The station changed this robot's looks: a login at the Registry switched robots, say. Redraw it in place.
        draw(build);
      }
    }
    if (s.kind === 'refused' || s.kind === 'removed') {
      link = undefined;
      const error = s.kind === 'removed' ? 'An owner removed that player or robot.' : s.message;
      if (s.kind === 'refused' && s.code === JOIN_REFUSED.badRobot) arrival.show({ kind: 'build', error });
      else arrival.show({ ...welcome(error), name: join.login?.name ?? device.username });
    }
    // Every halt ends the link: the page isn't aboard, and won't be until it boards again (or reloads).
    if (s.kind === 'replaced' || s.kind === 'outdated') link = undefined;
    status(s);
    // Only a reload fixes an outdated page, so say so now rather than leaving Play to fail again.
    if (s.kind === 'outdated') {
      const text = 'Reload the page to come aboard with the new version.';
      arrival.show({ kind: 'notice', title: 'Saber Side was updated', text, action: reload });
    }
  }

  arrival.show(welcome());
  status({ kind: 'ashore' });
}

/** Whether the link is still trying to come aboard (rather than stopped: outdated, refused, or replaced). */
function retrying(line: StatusLine) {
  return ['connecting', 'restarting', 'full', 'unreachable', 'aboard'].includes(line.kind);
}

/** A seat's robot build, from its synced entry. */
function readBuild(entry: AboardView): RobotBuild | undefined {
  try {
    return cleanRobotBuild(JSON.parse(entry.build));
  } catch {
    return undefined;
  }
}
