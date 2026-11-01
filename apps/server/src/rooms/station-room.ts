import { type Client, CloseCode, type Deferred, matchMaker, Room, ServerError } from '@colyseus/core';
import { type FieldBuilder, type SchemaType, schema, t } from '@colyseus/schema';
import {
  CLOSED,
  JOIN_REFUSED,
  type JoinRequest,
  MESSAGE,
  NOTICE,
  POSE,
  type PoseKind,
  PROTOCOL_VERSION,
  type RobotCard,
  readPose,
  STATION_CAPACITY,
  STATION_ROOM,
} from '@saber-side/shared';
import type { Roster } from '../roster.ts';

// Synced to every client. They decode it by reflection, so the client has no copy of these (see StationView).

/** How each kind of pose number is stored: as small as it can be without the robot looking jittery. */
const POSE_FIELD: Record<PoseKind, () => FieldBuilder<number> | FieldBuilder<boolean>> = {
  position: () => t.float32(),
  unit: () => t.quantized({ min: -1, max: 1 }),
  angle: () => t.quantized({ min: -Math.PI, max: Math.PI }),
  turn: () => t.quantized({ min: 0, max: Math.PI * 2, mode: 'wrap' }),
  scale: () => t.quantized({ min: 0, max: 3 }),
  flag: () => t.boolean(),
};

export const Aboard = schema(
  {
    robot: t.string(),
    name: t.string(),
    color: t.string(),
    ...Object.fromEntries(POSE.map(([name, kind]) => [name, POSE_FIELD[kind]()])),
  },
  'Aboard',
);
export type Aboard = SchemaType<typeof Aboard>;
export const StationState = schema({ name: t.string(), aboard: t.number(), players: t.map(Aboard) }, 'StationState');
export type StationState = SchemaType<typeof StationState>;

/** How long a dropped player's seat is held while their device reconnects (a Wi-Fi blip, an iPad waking up). */
export const RECONNECT_SECONDS = 30;

/** What the HTTP side (the owner panel) can ask of the live room. */
export interface StationControl {
  /** Disconnects whoever is playing as this robot, with a CLOSED code so their game doesn't rejoin by itself. */
  kickRobot(robotId: string, code: number): void;
  /** Shows a renamed or repainted robot's new look to everyone aboard. */
  refreshRobot(robot: RobotCard): void;
}

export interface StationRoomDeps {
  name: string;
  roster: Roster;
  /** Told whenever the number of players aboard changes (the health check reports it). */
  onAboardChange(aboard: number): void;
  /** Handed the room once it exists. */
  onReady(control: StationControl): void;
}

interface Auth {
  robot: string;
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
    /** Seats held for players who dropped (by session), in case they reconnect. */
    readonly #held = new Map<string, Deferred<Client>>();

    /** Runs before a seat is reserved, so a refused client never takes a seat. */
    static override async onAuth(_token: string, options: Partial<JoinRequest> | undefined): Promise<Auth> {
      if (options?.protocol !== PROTOCOL_VERSION) {
        throw new ServerError(JOIN_REFUSED.outdated, 'Saber Side was updated. Reload to come aboard.');
      }
      const robot = typeof options.robot === 'string' ? deps.roster.get(options.robot) : undefined;
      if (!robot) throw new ServerError(JOIN_REFUSED.unknownRobot, "That robot isn't on the roster any more.");
      // A friendly message for the common case. The real cap is maxClients: if two players race for the last seat,
      // the loser's join fails with Colyseus's "no rooms found", which the client also reads as full. This comes
      // before the PIN so a full station doesn't use up PIN tries.
      const [station] = await matchMaker.query({ name: STATION_ROOM });
      if (station?.locked) throw new ServerError(JOIN_REFUSED.full, 'Station full, try again soon.');
      const pin = deps.roster.checkPin(robot.id, typeof options.pin === 'string' ? options.pin : undefined);
      if (pin === 'locked') {
        throw new ServerError(JOIN_REFUSED.pinLocked, 'Too many wrong PINs. Wait a minute and try again.');
      }
      if (pin === 'wrong') throw new ServerError(JOIN_REFUSED.wrongPin, options.pin ? 'Wrong PIN.' : 'Enter the PIN.');
      return { robot: robot.id };
    }

    override onCreate() {
      this.state.name = deps.name;
      // Each device reports its own robot's pose; anything malformed is ignored. Colyseus passes on only what changed.
      this.onMessage(MESSAGE.pose, (client, msg: unknown) => {
        const pose = readPose(msg);
        const aboard = this.state.players.get(client.sessionId) as Record<string, unknown> | undefined;
        if (!pose || !aboard) return;
        POSE.forEach(([name, kind], i) => {
          aboard[name] = kind === 'flag' ? (pose[i] as number) > 0.5 : pose[i];
        });
      });
      deps.onReady({
        kickRobot: (robotId, code) => this.#release(robotId, code),
        refreshRobot: (robot) => {
          this.state.players.forEach((aboard) => {
            if (aboard.robot === robot.id) {
              aboard.name = robot.name;
              aboard.color = robot.color;
            }
          });
        },
      });
    }

    override onJoin(client: Client) {
      const robot = deps.roster.get((client.auth as Auth).robot);
      if (!robot) {
        client.leave(CLOSED.removed); // removed between the seat reservation and the socket connecting
        return;
      }
      // One robot, one body: coming aboard from the Quest takes over from the iPad, and a reloaded page takes over
      // the seat its old self left held.
      this.#release(robot.id, CLOSED.replaced, client.sessionId);
      const aboard = new Aboard();
      aboard.robot = robot.id;
      aboard.name = robot.name;
      aboard.color = robot.color;
      this.state.players.set(client.sessionId, aboard);
      this.#countAboard();
    }

    override onDrop(client: Client, code?: number) {
      // Hold the seat for an accidental drop. A close the server chose (another device took over, the owner removed
      // the robot) isn't coming back, so it goes straight on to onLeave.
      if (code === CLOSED.replaced || code === CLOSED.removed) return;
      const hold = this.allowReconnection(client, RECONNECT_SECONDS);
      this.#held.set(client.sessionId, hold);
      const done = () => this.#held.delete(client.sessionId);
      hold.then(done, done);
    }

    override onLeave(client: Client) {
      this.state.players.delete(client.sessionId);
      this.#countAboard();
    }

    /** A deploy or restart: say so, so clients show "restarting" and rejoin the new process instead of erroring. */
    override onBeforeShutdown() {
      this.broadcast(NOTICE.restarting);
      this.disconnect(CloseCode.SERVER_SHUTDOWN).catch(() => {});
    }

    /** Ends every session playing as this robot (except `keep`): connected ones are closed, held seats let go. */
    #release(robotId: string, code: number, keep?: string) {
      this.state.players.forEach((aboard, sessionId) => {
        if (aboard.robot !== robotId || sessionId === keep) return;
        const held = this.#held.get(sessionId);
        if (held)
          held.reject(false); // Colyseus then runs onLeave for it
        else this.clients.find((c) => c.sessionId === sessionId)?.leave(code);
      });
    }

    #countAboard() {
      this.state.aboard = this.state.players.size;
      deps.onAboardChange(this.state.players.size);
    }
  };
}
