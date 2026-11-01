import type { Room } from '@colyseus/sdk';
import {
  type AboardView,
  cleanRobotBuild,
  JOIN_REFUSED,
  MESSAGE,
  type RobotBuild,
  type StationView,
} from '@saber-side/shared';
import { legacy } from '../legacy/game.js';
import { ownerApi } from '../net/owner-api';
import { type Credentials, linkToStation, type StationStatus } from '../net/station-link';
import { createArrival } from '../ui/arrival';
import { createRobotPreview } from '../ui/robot-preview';
import { type StatusLine, showStationStatus } from '../ui/station-status';
import { atBotMaker } from './at-bot-maker';
import { device } from './device';
import { createPresence } from './presence';

/**
 * Coming aboard (docs/initiatives/players-and-robots.md): **Play** builds a robot and comes aboard as a guest, with
 * an auto-generated name and nothing saved. **Log in** comes aboard as a registered player's robot. Once the station
 * lets the seat in, the robot is assembled from its parts and rolls out of the Bot Maker onto the promenade. Driving
 * back into the Bot Maker opens the builder, to rebuild it.
 *
 * A guest's build is kept for as long as the page is open, so a restart brings the same robot back (as a new guest).
 * The device remembers the last username, never the PIN. The game stays playable behind all of this.
 */
export function comeAboard(server: string, statusEl: HTMLElement) {
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

  const status = (line: StatusLine) =>
    showStationStatus(statusEl, line, me?.name, {
      comeAboard: () => arrival.show(welcome()),
      playHere: () => credentials && board(credentials),
    });

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
      legacy.setRobotBuild(build);
      legacy.rollOutOfBotMaker();
    },
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
  atBotMaker({
    open: () => {
      const build = me && readBuild(me);
      if (link && me && build) arrival.show({ kind: 'build', rebuild: { name: me.name, build } });
      else arrival.show(welcome());
    },
    isOpen: () => arrival.open,
  });

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
        legacy.setRobotBuild(build);
        legacy.rollOutOfBotMaker();
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
