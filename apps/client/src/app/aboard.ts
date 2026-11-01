import { classicBuild, JOIN_REFUSED, PROTOCOL_VERSION, type RobotCard } from '@saber-side/shared';
import { legacy } from '../legacy/game.js';
import { ApiFailure, rosterApi } from '../net/roster-api';
import { linkToStation, type StationStatus } from '../net/station-link';
import { createRobotPreview } from '../ui/robot-preview';
import { createRosterPicker, type RosterView } from '../ui/roster-picker';
import { type StatusLine, showStationStatus } from '../ui/station-status';
import { device } from './device';
import { createPresence } from './presence';
import { switchAtBotMaker } from './switch-robot';

const ROSTER_RETRY_MS = [1000, 2000, 5000, 10_000, 20_000, 30_000];

/**
 * Coming aboard: load the roster, pick (or build) a robot, and keep this device aboard as it. Once the station lets
 * it in, the robot is assembled from its parts and rolls out of the Bot Maker onto the promenade. Driving back into
 * the Bot Maker opens the roster again, to switch robots.
 *
 * A device remembers the robot it last played, so the next visit goes straight aboard. Robots with a PIN always ask
 * for it, since siblings often share a device. The game stays playable behind all of this.
 */
export function comeAboard(server: string, statusEl: HTMLElement) {
  const api = rosterApi(server);
  // Other players' robots, kept in step with the station while this device is aboard.
  const presence = createPresence(legacy.world);
  legacy.frameHooks.push((dt) => presence.frame(dt));
  if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { __presence: presence });
  let link: { stop(): void } | undefined;
  let robot: RobotCard | undefined;
  let pin: string | undefined;
  /** Whether this pick has spawned yet. Rejoining after a drop or a restart doesn't fire it into the hub again. */
  let spawned = false;

  const status = (line: StatusLine) =>
    showStationStatus(statusEl, line, robot?.name, {
      comeAboard: () => picker.show(),
      playHere: () => robot && board(robot, pin),
    });

  const picker = createRosterPicker(api, {
    onPick: (picked, typedPin) => board(picked, typedPin),
    preview: () => createRobotPreview(legacy.robotKit),
    onDismiss: () => {
      if (!link) status({ kind: 'ashore' });
    },
    ownerKey: {
      get: () => device.ownerKey,
      set: (key) => {
        device.ownerKey = key;
      },
    },
  });

  switchAtBotMaker({ open: () => picker.show(), isOpen: () => picker.open });

  function board(picked: RobotCard, typedPin?: string) {
    link?.stop();
    picker.hide();
    robot = picked;
    pin = typedPin;
    spawned = false;
    link = linkToStation(
      server,
      { robot: picked.id, pin: typedPin },
      (s) => onLink(picked, s),
      (room) => {
        presence.attach(room);
        room?.onStateChange(() => presence.sync());
      },
    );
  }

  function onLink(picked: RobotCard, s: StationStatus) {
    if (s.kind === 'aboard') {
      device.robot = picked.id;
      if (!spawned) {
        spawned = true;
        legacy.setRobotBuild(picked.build ?? classicBuild(picked.color));
        legacy.rollOutOfBotMaker();
      }
    }
    if (s.kind === 'refused' || s.kind === 'removed') {
      link = undefined;
      let view: RosterView = { kind: 'list', error: s.kind === 'removed' ? 'An owner removed that robot.' : s.message };
      if (s.kind === 'refused' && s.code === JOIN_REFUSED.unknownRobot) device.robot = undefined;
      else if (s.kind === 'refused' && picked.pin) view = { kind: 'pin', robot: picked, error: s.message };
      if (s.kind === 'removed') device.robot = undefined;
      picker.show(view);
    }
    if (s.kind === 'replaced') link = undefined;
    status(s);
  }

  async function welcome(attempt = 0) {
    status({ kind: 'connecting' });
    try {
      const { protocol, robots } = await api.roster();
      if (protocol !== PROTOCOL_VERSION) return status({ kind: 'outdated' });
      const remembered = robots.find((r) => r.id === device.robot);
      if (remembered && !remembered.pin) board(remembered);
      else picker.show(remembered ? { kind: 'pin', robot: remembered } : { kind: 'list', robots });
    } catch (e) {
      // An old server without the roster API answers 404: that's a version mismatch, not an outage.
      if (e instanceof ApiFailure && e.status === 404) return status({ kind: 'outdated' });
      status({ kind: 'unreachable' });
      setTimeout(() => welcome(attempt + 1), ROSTER_RETRY_MS[Math.min(attempt, ROSTER_RETRY_MS.length - 1)]);
    }
  }

  welcome();
}
