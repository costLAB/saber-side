import { Client, ErrorCode, MatchMakeError, type Room } from '@colyseus/sdk';
import { CLOSED, JOIN_REFUSED, NOTICE, PROTOCOL_VERSION, STATION_ROOM, type StationView } from '@saber-side/shared';

export type StationStatus =
  | { kind: 'connecting' }
  | { kind: 'aboard'; aboard: number }
  /** The server said it was shutting down (a deploy); we're waiting for it to come back. */
  | { kind: 'restarting' }
  | { kind: 'full' }
  /** This page is older or newer than the server. Only a reload fixes that, so we stop trying. */
  | { kind: 'outdated' }
  | { kind: 'unreachable' }
  /** The server won't take this robot as given (wrong PIN, locked, not on the roster). We stop and ask again. */
  | { kind: 'refused'; code: number; message: string }
  /** The same robot came aboard from another device. We stop, so the two devices don't keep taking turns. */
  | { kind: 'replaced' }
  /** The owner removed this robot. */
  | { kind: 'removed' };

/** Who this device is coming aboard as. */
export interface Credentials {
  robot: string;
  pin?: string;
}

/** Waits between join attempts. The game stays playable alone in the meantime. */
const RETRY_MS = [1000, 2000, 5000, 10_000, 20_000, 30_000];

const REFUSALS: readonly number[] = [JOIN_REFUSED.unknownRobot, JOIN_REFUSED.wrongPin, JOIN_REFUSED.pinLocked];

/**
 * Keeps this device aboard the station: joins, rejoins after drops and server restarts, and reports what's happening.
 * Colyseus's own reconnection covers short drops (the server holds the seat for 30 s). This loop covers the rest: a
 * restart (deploys create a new room, so we join again rather than reconnect), a full station, or a server that's
 * still waking up.
 */
export function linkToStation(
  url: string,
  credentials: Credentials,
  onStatus: (status: StationStatus) => void,
  onRoom: (room: Room<unknown, StationView> | undefined) => void = () => {},
): { stop(): void } {
  const client = new Client(url);
  let stopped = false;
  let attempt = 0;
  let restarting = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let leave: (() => void) | undefined;

  const retry = (status: StationStatus) => {
    onStatus(status);
    timer = setTimeout(join, RETRY_MS[Math.min(attempt++, RETRY_MS.length - 1)]);
  };
  const halt = (status: StationStatus) => {
    stopped = true;
    onStatus(status);
  };

  async function join() {
    if (stopped) return;
    if (attempt === 0 && !restarting) onStatus({ kind: 'connecting' });
    try {
      const room = await client.join<StationView>(STATION_ROOM, { protocol: PROTOCOL_VERSION, ...credentials });
      if (stopped) {
        room.leave();
        return;
      }
      attempt = 0;
      restarting = false;
      leave = () => room.leave();
      onRoom(room);
      room.onStateChange((state) => onStatus({ kind: 'aboard', aboard: state.aboard }));
      room.onMessage(NOTICE.restarting, () => {
        restarting = true;
        onStatus({ kind: 'restarting' });
      });
      room.onDrop(() => onStatus({ kind: 'connecting' }));
      room.onReconnect(() => onStatus({ kind: 'aboard', aboard: room.state.aboard }));
      room.onLeave((code) => {
        leave = undefined;
        onRoom(undefined);
        if (stopped) return;
        if (code === CLOSED.replaced) halt({ kind: 'replaced' });
        else if (code === CLOSED.removed) halt({ kind: 'removed' });
        else retry(restarting ? { kind: 'restarting' } : { kind: 'connecting' });
      });
    } catch (e) {
      if (stopped) return;
      if (e instanceof MatchMakeError && e.code === JOIN_REFUSED.outdated) return halt({ kind: 'outdated' });
      if (e instanceof MatchMakeError && REFUSALS.includes(e.code)) {
        return halt({ kind: 'refused', code: e.code, message: e.message });
      }
      // "No rooms found" also means full: two players raced for the last seat and this one lost.
      const full =
        e instanceof MatchMakeError &&
        (e.code === JOIN_REFUSED.full || e.code === ErrorCode.MATCHMAKE_INVALID_CRITERIA);
      retry(full ? { kind: 'full' } : restarting ? { kind: 'restarting' } : { kind: 'unreachable' });
    }
  }

  join();
  return {
    /** Leaves the station (if aboard) and stops trying. */
    stop() {
      stopped = true;
      clearTimeout(timer);
      leave?.();
      onRoom(undefined);
    },
  };
}
