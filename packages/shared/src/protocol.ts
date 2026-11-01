import type { PoseField } from './pose.ts';

// The contract between the game client and the station server.
//
// The client is served by Netlify and the server runs on Render, and they deploy separately: for a minute or so after a
// merge, one can be newer than the other. Bump PROTOCOL_VERSION whenever a change would make an older client misread
// the server (or the reverse). The server then turns older clients away with JOIN_REFUSED.outdated, and they offer a
// reload instead of half-working.

// History: 1 = the station server; 2 = joining as a robot from the roster; 3 = robots see each other (pose.ts).
export const PROTOCOL_VERSION = 3;

/** The one room. The whole friend group shares a single station. */
export const STATION_ROOM = 'station';

/** At most this many players aboard at once. The next one is told the station is full. */
export const STATION_CAPACITY = 10;

/** What a client sends when it asks to come aboard. */
export interface JoinRequest {
  protocol: number;
  /** Which robot from the roster this device is playing as. */
  robot: string;
  /** Only for robots with a PIN. */
  pin?: string;
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
  /** 404: that robot isn't on the roster (the owner removed it). */
  unknownRobot: 404,
  /** 401: the robot has a PIN and this wasn't it. */
  wrongPin: 401,
  /** 429: too many wrong PINs in a row; that robot is locked for a minute. */
  pinLocked: 429,
} as const;

/** Why the server closed a player's connection on purpose. The client doesn't rejoin after these by itself. */
export const CLOSED = {
  /** The same robot came aboard from another device, which took over. */
  replaced: 4100,
  /** The owner removed this robot from the roster. */
  removed: 4101,
} as const;

/** A robot on the roster, as anyone can see it (`GET /roster`). */
export interface RobotCard {
  id: string;
  name: string;
  /** One of ROBOT_COLORS. */
  color: string;
  /** Whether joining as it needs a PIN. */
  pin: boolean;
}

export interface RosterResponse {
  protocol: number;
  robots: RobotCard[];
}

/** `POST /robots`: make a new robot. */
export interface NewRobot {
  name: string;
  color: string;
  pin?: string;
}

/** The body of an error from the roster or owner endpoints. */
export interface ApiError {
  error: string;
}

/** Someone aboard right now (keyed by session in StationView.players), with their robot's latest pose. */
export type AboardView = {
  robot: string;
  name: string;
  color: string;
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
