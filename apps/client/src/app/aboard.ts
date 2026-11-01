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
import { type StatusLine, showStationStatus, showWho, type Who } from '../ui/station-status';
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
  const whoEl = document.getElementById('who') ?? document.createElement('span');
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

  const status = (line: StatusLine) => {
    showStationStatus(statusEl, line, me?.name, {
      comeAboard: () => arrival.show(welcome()),
      playHere: () => credentials && board(credentials),
    });
    showWho(whoEl, line.kind === 'aboard' ? who() : undefined);
  };

  /** Who this seat is, for the HUD, once the station has shown it. */
  function who(): Who | undefined {
    if (!room || !me) return undefined;
    if (!me.player) return { guest: me.name };
    // The station sends the username as saved; until it does (or from an older station), the name typed to log in.
    const player = garage?.player ?? credentials?.login?.name ?? device.username ?? '';
    return { player, robot: me.name };
  }

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
    onLogin: (name, pin) => board({ login: { name, pin } }),
    preview: () => createRobotPreview(legacy.robotKit),
    onDismiss: () => {
      if (!link) status({ kind: 'ashore' });
    },
    owner: (key) => ownerApi(server, key),
    ownerKey: {
      get: () => device.ownerKey,
      set: (key) => {
        device.ownerKey = key;
      },
    },
  });

  // Driving into the Bot Maker: rebuild the robot this seat pilots, or (not aboard) come aboard.
  onDoorway(insideBotMaker, {
    open: () => {
      const build = me && readBuild(me);
      // A registered player's robots: pilot one, rebuild this one, or buy another. A guest just rebuilds theirs.
      if (link && me?.player && garage) arrival.show({ kind: 'garage', garage, piloting: me.robot });
      else if (link && me && build) arrival.show({ kind: 'build', rebuild: { name: me.name, build } });
      else arrival.show(welcome());
    },
    isOpen: () => arrival.open,
  });
  // Driving into the Robot Registry: register, or log in.
  onDoorway(insideRegistry, {
    open: () => {
      if (link && me) arrival.show({ kind: 'registry', guest: !me.player, name: me.player ? me.name : undefined });
      else arrival.show(welcome());
    },
    isOpen: () => arrival.open,
  });

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
          // Remember the username as saved, to fill in the login form next time.
          if (notice.player) device.username = notice.player;
          if (room && me) showWho(whoEl, who());
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
    if (s.kind === 'replaced') link = undefined;
    status(s);
  }

  arrival.show(welcome());
  status({ kind: 'ashore' });
}

/** A seat's robot build, from its synced entry. */
function readBuild(entry: AboardView): RobotBuild | undefined {
  try {
    return cleanRobotBuild(JSON.parse(entry.build));
  } catch {
    return undefined;
  }
}
