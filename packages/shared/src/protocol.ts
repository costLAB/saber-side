import type { PoseField } from './pose.ts';

// The contract between the game client and the station server.
//
// The client is served by Netlify and the server runs on Render, and they deploy separately: for a minute or so after a
// merge, one can be newer than the other. Bump PROTOCOL_VERSION whenever a change would make an older client misread
// the server (or the reverse). The server then turns older clients away with JOIN_REFUSED.outdated, and they offer a
// reload instead of half-working.

import type { RobotBuild } from './content/robot-parts.ts';

// History: 1 = the station server; 2 = joining as a robot from the roster; 3 = robots see each other (pose.ts);
// 4 = robots built from parts; 5 = guests and logins (players own robots).
export const PROTOCOL_VERSION = 5;

/** The one room. The whole friend group shares a single station. */
export const STATION_ROOM = 'station';

/** At most this many players aboard at once. The next one is told the station is full. */
export const STATION_CAPACITY = 10;

/** Comes aboard as a guest: a robot built from these parts, held only while the page is open. */
export interface GuestJoin {
  build: RobotBuild;
}

/** Comes aboard as a registered player, piloting the robot they piloted last. */
export interface LoginJoin {
  name: string;
  pin: string;
}

/** What a client sends when it asks to come aboard: exactly one of `guest` or `login`. */
export interface JoinRequest {
  protocol: number;
  guest?: GuestJoin;
  login?: LoginJoin;
}

/**
 * Why the server turned a join away. Matchmaking is an HTTP request and the code doubles as its HTTP status, so these
 * are HTTP statuses that Colyseus doesn't use itself (its own matchmaking errors are 520-526).
 */
export const JOIN_REFUSED = {
  /** 426 Upgrade Required: the client is older or newer than the server, so reload to match. */
  outdated: 426,
  /** 423 Locked: every seat is taken (Colyseus locks a room when it's full). */
  full: 423,
  /** 400: a guest's robot isn't buildable (no wheel, or parts and paint not on the list). */
  badRobot: 400,
  /** 401: that username and PIN don't match (the same answer for an unknown username, so names can't be probed). */
  wrongPin: 401,
  /** 429: too many wrong PINs in a row; that username is locked for a while. */
  pinLocked: 429,
} as const;

/** Why the server closed a player's connection on purpose. The client doesn't rejoin after these by itself. */
export const CLOSED = {
  /** The same player came aboard from another device, which took over. */
  replaced: 4100,
  /** The owner removed this player, or the robot it was piloting. */
  removed: 4101,
} as const;

/** A saved robot, as the owner panel sees it. */
export interface OwnerRobot {
  id: string;
  name: string;
  /** One of ROBOT_COLORS: the robot's main paint (see buildColor). */
  color: string;
  build: RobotBuild;
}

/** A registered player, as the owner panel sees it (`GET /api/owner/players`). Never their PIN. */
export interface OwnerPlayer {
  id: string;
  name: string;
  /** An owner reset their PIN; the next PIN they log in with becomes their new one. */
  pinReset: boolean;
  robots: OwnerRobot[];
}

/** The body of an error from the owner endpoints. */
export interface ApiError {
  error: string;
}

/** Someone aboard right now (keyed by session in StationView.players), with their robot's latest pose. */
export type AboardView = {
  /** The registered player, or empty for a guest. */
  player: string;
  /** The robot being piloted (a guest's is made up for the visit). */
  robot: string;
  name: string;
  color: string;
  /** The robot's RobotBuild, as JSON, so everyone aboard can draw it. */
  build: string;
} & { [K in PoseField]: K extends 'shown' ? boolean : number };

/** The synced station state, as the client sees it. */
export interface StationView {
  name: string;
  aboard: number;
  players: Map<string, AboardView>;
}

/** Messages a client sends. */
export const MESSAGE = {
  /** This device's robot pose (a PoseMessage), a few times a second. */
  pose: 'pose',
  /** New parts and paint for the robot this seat pilots (a RobotBuild), from the Bot Maker. */
  rebuild: 'rebuild',
} as const;

/** Messages the server sends to everyone aboard. */
export const NOTICE = {
  /** The server is shutting down for a deploy or restart and will be back in a moment. */
  restarting: 'restarting',
} as const;

/** `GET /healthz`: what the host's health check and the uptime monitor see. */
export interface StationHealth {
  ok: true;
  protocol: number;
  station: string;
  /** When the station's database was created. It stays the same across restarts and deploys. */
  since: string;
  aboard: number;
  capacity: number;
}
