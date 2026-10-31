import { type Client, CloseCode, matchMaker, Room, ServerError } from '@colyseus/core';
import { type SchemaType, schema, t } from '@colyseus/schema';
import {
  JOIN_REFUSED,
  type JoinRequest,
  NOTICE,
  PROTOCOL_VERSION,
  STATION_CAPACITY,
  STATION_ROOM,
} from '@saber-side/shared';

/** Synced to every client (they decode it by reflection, so the client has no copy of this). See `StationView`. */
export const StationState = schema({ name: t.string(), aboard: t.number() }, 'StationState');
export type StationState = SchemaType<typeof StationState>;

/** How long a dropped player's seat is held while their device reconnects (a Wi-Fi blip, an iPad waking up). */
export const RECONNECT_SECONDS = 30;

export interface StationRoomDeps {
  name: string;
  /** Told whenever the number of players aboard changes (the health check reports it). */
  onAboardChange(aboard: number): void;
}

/**
 * The one shared station. The server creates it at boot and never disposes it, and clients use `join` rather than
 * `joinOrCreate`: when it's full, an 11th player must be told so, not handed a second, empty station.
 */
export function defineStationRoom(deps: StationRoomDeps) {
  return class StationRoom extends Room<{ state: StationState }> {
    override maxClients = STATION_CAPACITY;
    override autoDispose = false;
    override state = new StationState();

    /** Runs before a seat is reserved, so a refused client never takes a seat. */
    static override async onAuth(_token: string, options: Partial<JoinRequest> | undefined) {
      if (options?.protocol !== PROTOCOL_VERSION) {
        throw new ServerError(JOIN_REFUSED.outdated, 'Saber Side was updated. Reload to come aboard.');
      }
      // A friendly message for the common case. The real cap is maxClients: if two players race for the last seat,
      // the loser's join fails with Colyseus's "no rooms found", which the client also reads as full.
      const [station] = await matchMaker.query({ name: STATION_ROOM });
      if (station?.locked) throw new ServerError(JOIN_REFUSED.full, 'Station full, try again soon.');
      return true;
    }

    override onCreate() {
      this.state.name = deps.name;
    }

    override onJoin() {
      this.countAboard();
    }

    override onDrop(client: Client) {
      this.allowReconnection(client, RECONNECT_SECONDS);
    }

    override onLeave() {
      this.countAboard();
    }

    /** A deploy or restart: say so, so clients show "restarting" and rejoin the new process instead of erroring. */
    override onBeforeShutdown() {
      this.broadcast(NOTICE.restarting);
      this.disconnect(CloseCode.SERVER_SHUTDOWN).catch(() => {});
    }

    private countAboard() {
      this.state.aboard = this.clients.length;
      deps.onAboardChange(this.clients.length);
    }
  };
}
