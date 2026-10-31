// The contract between the game client and the station server.
//
// The client is served by Netlify and the server runs on Render, and they deploy separately: for a minute or so after a
// merge, one can be newer than the other. Bump PROTOCOL_VERSION whenever a change would make an older client misread
// the server (or the reverse). The server then turns older clients away with JOIN_REFUSED.outdated, and they offer a
// reload instead of half-working.

export const PROTOCOL_VERSION = 1;

/** The one room. The whole friend group shares a single station. */
export const STATION_ROOM = 'station';

/** At most this many players aboard at once. The next one is told the station is full. */
export const STATION_CAPACITY = 10;

/** What a client sends when it asks to come aboard. */
export interface JoinRequest {
  protocol: number;
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
} as const;

/** The synced station state, as the client sees it. */
export interface StationView {
  name: string;
  aboard: number;
}

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
