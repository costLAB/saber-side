import { Client, ErrorCode, MatchMakeError } from '@colyseus/sdk';
import { JOIN_REFUSED, NOTICE, PROTOCOL_VERSION, STATION_ROOM, type StationView } from '@saber-side/shared';

export type StationStatus =
  | { kind: 'connecting' }
  | { kind: 'aboard'; aboard: number }
  /** The server said it was shutting down (a deploy); we're waiting for it to come back. */
  | { kind: 'restarting' }
  | { kind: 'full' }
  /** This page is older or newer than the server. Only a reload fixes that, so we stop trying. */
  | { kind: 'outdated' }
  | { kind: 'unreachable' };

/** Waits between join attempts. The game stays playable alone in the meantime. */
const RETRY_MS = [1000, 2000, 5000, 10_000, 20_000, 30_000];

/**
 * Keeps this device aboard the station: joins, rejoins after drops and server restarts, and reports what's happening.
 * Colyseus's own reconnection covers short drops (the server holds the seat for 30 s). This loop covers the rest: a
 * restart (deploys create a new room, so we join again rather than reconnect), a full station, or a server that's
 * still waking up.
 */
export function linkToStation(url: string, onStatus: (status: StationStatus) => void): { stop(): void } {
  const client = new Client(url);
  let stopped = false;
  let attempt = 0;
  let restarting = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const retry = (status: StationStatus) => {
    onStatus(status);
    timer = setTimeout(join, RETRY_MS[Math.min(attempt++, RETRY_MS.length - 1)]);
  };

  async function join() {
    if (stopped) return;
    if (attempt === 0 && !restarting) onStatus({ kind: 'connecting' });
    try {
      const room = await client.join<StationView>(STATION_ROOM, { protocol: PROTOCOL_VERSION });
      if (stopped) {
        room.leave();
        return;
      }
      attempt = 0;
      restarting = false;
      room.onStateChange((state) => onStatus({ kind: 'aboard', aboard: state.aboard }));
      room.onMessage(NOTICE.restarting, () => {
        restarting = true;
        onStatus({ kind: 'restarting' });
      });
      room.onDrop(() => onStatus({ kind: 'connecting' }));
      room.onReconnect(() => onStatus({ kind: 'aboard', aboard: room.state.aboard }));
      room.onLeave(() => {
        if (!stopped) retry(restarting ? { kind: 'restarting' } : { kind: 'connecting' });
      });
    } catch (e) {
      if (stopped) return;
      if (e instanceof MatchMakeError && e.code === JOIN_REFUSED.outdated) {
        onStatus({ kind: 'outdated' });
        return;
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
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}
