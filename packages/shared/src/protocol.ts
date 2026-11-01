import type { PoseField } from './pose.ts';

// The contract between the game client and the station server.
//
// The client and the server are separate Render services that deploy separately: for a minute or so after a merge,
// one can be newer than the other. Bump PROTOCOL_VERSION whenever a change would make an older client misread
// the server (or the reverse). The server then turns older clients away with JOIN_REFUSED.outdated, and they offer a
// reload instead of half-working.

import type { RobotBuild } from './content/robot-parts.ts';
import type { StationSettings } from './sim/paint-cure.ts';

// History: 1 = the station server; 2 = joining as a robot from the roster; 3 = robots see each other (pose.ts);
// 4 = robots built from parts; 5 = guests and logins (players own robots); 6 = the Robot Registry;
// 7 = the Cyber Crystal wallet; 8 = several robots per player; 9 = renaming your robot at the Bot Maker;
// 10 = robots open their mouths to eat (the `jaw` pose field); 11 = paint that cures (each robot's `cure`, and the
// station's `paintCure` setting).
export const PROTOCOL_VERSION = 11;

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
  /** How cured its paint is, in percent (sim/paint-cure.ts). */
  cure: number;
}

/** A registered player, as the owner panel sees it (`GET /api/owner/players`). Never their PIN. */
export interface OwnerPlayer {
  id: string;
  name: string;
  /** An owner reset their PIN; the next PIN they log in with becomes their new one. */
  pinReset: boolean;
  /** Their Cyber Crystal balance, in shards. */
  shards: number;
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
  /** How cured the robot's paint is, in percent, so everyone draws its coat the same (sim/paint-cure.ts). */
  cure: number;
} & { [K in PoseField]: K extends 'shown' ? boolean : number };

/** The synced station state, as the client sees it. */
export interface StationView {
  name: string;
  aboard: number;
  /** The station setting: paint cures by eating carrots. Off, every coat is drawn fully cured. */
  paintCure: boolean;
  players: Map<string, AboardView>;
}

/** Messages a client sends. */
export const MESSAGE = {
  /** This device's robot pose (a PoseMessage), a few times a second. */
  pose: 'pose',
  /** New parts and paint for the robot this seat pilots (a RobotBuild), from the Bot Maker. */
  rebuild: 'rebuild',
  /** At the Robot Registry, a guest signs up (a SignIn): their robot is saved under a new player. */
  register: 'register',
  /** At the Robot Registry, log in (a SignIn): the seat switches to that player and their robot. */
  login: 'login',
  /** At the Bot Maker, a registered player builds another robot (a NewRobot), paying for it, and pilots it. */
  build: 'build',
  /** At the Bot Maker, pilot another of this player's robots (a Pilot), keeping the seat. */
  pilot: 'pilot',
  /** At the Bot Maker, a registered player renames the robot this seat pilots (a Rename), keeping the seat. */
  rename: 'rename',
} as const;

/** What `build` carries: the new robot's name and parts. */
export interface NewRobot {
  name: string;
  build: RobotBuild;
}

/** What `pilot` carries. */
export interface Pilot {
  robot: string;
}

/** What `rename` carries: the robot's new name (the same rules as every robot name, and not a guest's "Bot 7"). */
export interface Rename {
  name: string;
}

/** The server's answer to `build`, `pilot`, or `rename`, sent to that seat alone (NOTICE.botMaker). */
export type BotMakerAnswer = { ok: true } | { ok: false; error: string };

/** A registered player's robots, sent to their seat alone (NOTICE.garage) whenever they change. */
export interface Garage {
  /**
   * The player's username, as saved, for the HUD. Optional so a client keeps working with a station from before it
   * was added (it then shows the name typed to log in).
   */
  player?: string;
  robots: OwnerRobot[];
  /** What the next robot costs, in shards (see robotPrice), or null when they have as many as they can keep. */
  nextPrice: number | null;
  /** Whether paint cures on this station (else the roster shows no cure). Optional for an older station. */
  paintCure?: boolean;
}

/** What `register` and `login` carry. */
export interface SignIn {
  name: string;
  pin: string;
}

/** The server's answer to `register` or `login`, sent to that seat alone (NOTICE.registry). */
export type RegistryAnswer = { ok: true; name: string } | { ok: false; error: string };

/** Messages the server sends. */
export const NOTICE = {
  /** To everyone: the server is shutting down for a deploy or restart and will be back in a moment. */
  restarting: 'restarting',
  /** To one seat: how its `register` or `login` went (a RegistryAnswer). */
  registry: 'registry',
  /** To a registered player's seat: their balance (a WalletNotice), on joining and whenever it changes. */
  wallet: 'wallet',
  /** To a registered player's seat: their robots (a Garage), on joining and whenever they change. */
  garage: 'garage',
  /** To one seat: how its `build`, `pilot`, or `rename` went (a BotMakerAnswer). */
  botMaker: 'botMaker',
} as const;

/** A registered player's Cyber Crystal balance, in shards. It's theirs alone: other players never see it. */
export interface WalletNotice {
  shards: number;
}

/** One ledger entry, as the owner panel sees it (`GET /api/owner/players/:id/ledger`). */
export interface LedgerEntry {
  id: number;
  ts: string;
  /** An account: `player:<id>`, or a system account such as `owner`, `removed`, or `bot_maker`. */
  from: string;
  to: string;
  shards: number;
  reason: string;
  /** What it refers to: for a reversal, the entry it reverses. */
  ref: string | null;
  /** Whether a later entry reversed this one. */
  reversed: boolean;
}

/** The station's settings, as the owner panel reads and changes them (`/api/owner/settings`). */
export type OwnerSettings = StationSettings;

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
