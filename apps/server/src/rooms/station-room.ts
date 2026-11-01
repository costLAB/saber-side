import { type Client, CloseCode, type Deferred, Room, ServerError } from '@colyseus/core';
import { type FieldBuilder, type SchemaType, schema, t } from '@colyseus/schema';
import {
  type BotMakerAnswer,
  buildColor,
  CLOSED,
  cleanRobotBuild,
  type Garage,
  guestName,
  JOIN_REFUSED,
  type JoinRequest,
  MESSAGE,
  type NewRobot,
  NOTICE,
  nextGuestNumber,
  type Pilot,
  POSE,
  type PoseKind,
  PROTOCOL_VERSION,
  type RegistryAnswer,
  type Rename,
  ROBOTS_PER_PLAYER,
  type RobotBuild,
  readPose,
  robotPrice,
  SHARDS_PER_CC,
  type SignIn,
  STATION_CAPACITY,
  type WalletNotice,
} from '@saber-side/shared';
import { type Ledger, playerAccount, SYSTEM } from '../ledger.ts';
import { ownerRobot, type Players, type RobotRecord } from '../players.ts';

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
    /** The registered player, or empty for a guest. */
    player: t.string(),
    robot: t.string(),
    name: t.string(),
    color: t.string(),
    /** The robot's parts and paint (RobotBuild as JSON). */
    build: t.string(),
    ...Object.fromEntries(POSE.map(([name, kind]) => [name, POSE_FIELD[kind]()])),
  },
  'Aboard',
);
export type Aboard = SchemaType<typeof Aboard>;
export const StationState = schema({ name: t.string(), aboard: t.number(), players: t.map(Aboard) }, 'StationState');
export type StationState = SchemaType<typeof StationState>;

/** How long a dropped player's seat is held while their device reconnects (a Wi-Fi blip, an iPad waking up). */
export const RECONNECT_SECONDS = 30;

/** How long a returning player's join waits for their old seat to be let go before it tries for a seat anyway. */
const RELEASE_WAIT_MS = 3000;

/** What the HTTP side (the owner panel) can ask of the live room. */
export interface StationControl {
  /** Disconnects whoever is playing as this player, with a CLOSED code so their game doesn't rejoin by itself. */
  kickPlayer(playerId: string, code: number): void;
  /** Disconnects whoever is piloting this robot. */
  kickRobot(robotId: string, code: number): void;
  /** Shows a renamed or rebuilt robot's new look to everyone aboard. */
  refreshRobot(robot: RobotRecord): void;
  /** Tells a player's seat (if they're aboard) their balance and robots, after the owner panel changed them. */
  playerChanged(playerId: string): void;
}

export interface StationRoomDeps {
  name: string;
  players: Players;
  ledger: Ledger;
  /** Told whenever the number of players aboard changes (the health check reports it). */
  onAboardChange(aboard: number): void;
  /** Handed the room once it exists. */
  onReady(control: StationControl): void;
}

/** Who a seat is: a guest with the robot they built, or a registered player and the robot they pilot. */
type Auth = { guest: RobotBuild } | { player: string; robot: string };

const refuse = (code: number, message: string) => new ServerError(code, message);

/**
 * The one shared station. The server creates it at boot and never disposes it, and clients use `join` rather than
 * `joinOrCreate`: when it's full, an 11th player must be told so, not handed a second, empty station.
 *
 * A seat is one connection, piloting one robot. Guests are held only here, in memory: their robot is made up when they
 * join and gone when they leave. Registered players have one seat each: coming aboard from a second device takes over
 * from the first.
 */
export function defineStationRoom(deps: StationRoomDeps) {
  /** The live room, once created. */
  let live: StationRoom | undefined;

  /** A player's balance and robots go to their own seat only: other players never see them. */
  const sendPlayer = (client: Client, playerId: string) => {
    const wallet: WalletNotice = { shards: deps.ledger.balance(playerAccount(playerId)) };
    client.send(NOTICE.wallet, wallet);
    const robots = deps.players.robotsOf(playerId);
    const garage: Garage = {
      player: deps.players.player(playerId)?.name,
      robots: robots.map(ownerRobot),
      nextPrice: robotPrice(robots.length) ?? null,
    };
    client.send(NOTICE.garage, garage);
  };

  class StationRoom extends Room<{ state: StationState }> {
    override maxClients = STATION_CAPACITY;
    override autoDispose = false;
    override state = new StationState();
    /** Seats held for players who dropped (by session), in case they reconnect. */
    readonly #held = new Map<string, Deferred<Client>>();

    /** Runs before a seat is reserved, so a refused client never takes a seat. */
    static override async onAuth(_token: string, options: Partial<JoinRequest> | undefined): Promise<Auth> {
      if (options?.protocol !== PROTOCOL_VERSION) {
        throw refuse(JOIN_REFUSED.outdated, 'Saber Side was updated. Reload to come aboard.');
      }
      const full = () => refuse(JOIN_REFUSED.full, 'Station full, try again soon.');
      const login = options.login;
      if (login && typeof login === 'object') {
        const name = String(login.name ?? '');
        // A full station is said first, so it doesn't use up PIN tries, unless this player is aboard already: then
        // they're taking over their own seat, which frees one. (The real cap is maxClients: if two players race for
        // the last seat, the loser's join fails with "no rooms found", which the client also reads as full.)
        if (live?.locked && !live.hasSeat(deps.players.idByName(name))) throw full();
        const result = deps.players.login(name, typeof login.pin === 'string' ? login.pin : undefined);
        if (!result.ok && result.why === 'locked') {
          throw refuse(JOIN_REFUSED.pinLocked, 'Too many wrong PINs. Wait a while and try again.');
        }
        if (!result.ok) {
          throw refuse(JOIN_REFUSED.wrongPin, login.pin ? "That username and PIN don't match." : 'Enter your PIN.');
        }
        await live?.releasePlayer(result.player.id);
        return { player: result.player.id, robot: result.robot.id };
      }
      if (live?.locked) throw full();
      const build = cleanRobotBuild(options.guest?.build);
      if (!build) throw refuse(JOIN_REFUSED.badRobot, 'That robot needs a wheel, and parts and paint from the list.');
      return { guest: build };
    }

    override onCreate() {
      live = this;
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
      // New parts and paint from the Bot Maker. A guest's live only here; a player's robot is saved.
      this.onMessage(MESSAGE.rebuild, (client, msg: unknown) => {
        const aboard = this.state.players.get(client.sessionId);
        if (!aboard) return;
        if (!aboard.player) {
          const build = cleanRobotBuild(msg);
          if (build) show(aboard, { name: aboard.name, color: buildColor(build), build });
          return;
        }
        const result = deps.players.rebuild(aboard.robot, msg);
        if (result.ok) {
          show(aboard, result.value);
          sendPlayer(client, aboard.player);
        }
      });
      // The Robot Registry. A guest registers: their robot (as built) is saved under a new player, and the seat becomes
      // that player's. Anyone logs in: the seat switches to that player and the robot they piloted last. The robot
      // stays where it stands. Like other requests, the server doesn't check where it stands (movement is client-owned).
      this.onMessage(MESSAGE.register, (client, msg: unknown) => {
        const aboard = this.state.players.get(client.sessionId);
        if (!aboard) return;
        const { name, pin } = signIn(msg);
        if (aboard.player) return answer(client, { ok: false, error: "You're registered already." });
        let build: unknown;
        try {
          build = JSON.parse(aboard.build);
        } catch {
          build = undefined;
        }
        const made = deps.players.register(name, pin, build);
        if (!made.ok) return answer(client, { ok: false, error: made.error });
        this.#seat(client, aboard, made.value.player.id, made.value.robot);
        answer(client, { ok: true, name: made.value.player.name });
      });
      // The Bot Maker, for registered players: build another robot (the first is free, then each costs more, up to
      // ROBOTS_PER_PLAYER) and pilot it, or pilot one they already own. Either way the seat is kept.
      this.onMessage(MESSAGE.build, (client, msg: unknown) => {
        const aboard = this.state.players.get(client.sessionId);
        if (!aboard) return;
        const playerId = aboard.player;
        if (!playerId)
          return built(client, { ok: false, error: 'Register at the Robot Registry to keep more robots.' });
        const m = (msg && typeof msg === 'object' ? msg : {}) as Partial<Record<keyof NewRobot, unknown>>;
        // The price, the payment, and the robot, all in one transaction: two taps can't buy one robot twice, and a
        // robot is never made without its payment.
        const made = deps.ledger.atomically(() => {
          const price = robotPrice(deps.players.robotsOf(playerId).length);
          if (price === undefined) return refused(409, `You can keep ${ROBOTS_PER_PLAYER} robots.`);
          if (price > 0) {
            const paid = deps.ledger.transfer({
              from: playerAccount(playerId),
              to: SYSTEM.botMaker,
              shards: price,
              reason: 'robot',
            });
            if (!paid.ok) return refused(409, `A new robot costs ${price / SHARDS_PER_CC} CC. You don't have enough.`);
          }
          return deps.players.addRobot(playerId, String(m.name ?? ''), m.build);
        });
        if (!made.ok) return built(client, { ok: false, error: made.error });
        this.#pilot(client, aboard, made.value);
        built(client, { ok: true });
      });
      this.onMessage(MESSAGE.pilot, (client, msg: unknown) => {
        const aboard = this.state.players.get(client.sessionId);
        if (!aboard) return;
        const id = (msg && typeof msg === 'object' ? (msg as Partial<Pilot>).robot : undefined) ?? '';
        const robot = typeof id === 'string' ? deps.players.robot(id) : undefined;
        if (!aboard.player || !robot || robot.playerId !== aboard.player) {
          return built(client, { ok: false, error: "That isn't one of your robots." });
        }
        this.#pilot(client, aboard, robot);
        built(client, { ok: true });
      });
      // The Bot Maker: a registered player renames the robot they pilot, under the same rules as the owner panel (unique
      // ignoring case, not a guest's "Bot 7"). Everyone aboard sees the new name.
      this.onMessage(MESSAGE.rename, (client, msg: unknown) => {
        const aboard = this.state.players.get(client.sessionId);
        if (!aboard) return;
        if (!aboard.player)
          return built(client, { ok: false, error: 'Register at the Robot Registry to name your robot.' });
        const name = msg && typeof msg === 'object' ? (msg as Partial<Rename>).name : undefined;
        const result = deps.players.renameRobot(aboard.robot, typeof name === 'string' ? name : '');
        if (!result.ok) return built(client, { ok: false, error: result.error });
        // Every seat piloting it (only this one, with one seat per player) shows the new name.
        this.state.players.forEach((a) => {
          if (a.player && a.robot === result.value.id) show(a, result.value);
        });
        sendPlayer(client, aboard.player);
        built(client, { ok: true });
      });
      this.onMessage(MESSAGE.login, (client, msg: unknown) => {
        const aboard = this.state.players.get(client.sessionId);
        if (!aboard) return;
        const { name, pin } = signIn(msg);
        const result = deps.players.login(name, pin);
        if (!result.ok) {
          const error =
            result.why === 'locked'
              ? 'Too many wrong PINs. Wait a while and try again.'
              : "That username and PIN don't match.";
          return answer(client, { ok: false, error });
        }
        // One seat per player: logging in here takes over from any other device.
        this.#release((a) => a.player === result.player.id, CLOSED.replaced, client.sessionId);
        this.#seat(client, aboard, result.player.id, result.robot);
        answer(client, { ok: true, name: result.player.name });
      });
      deps.onReady({
        kickPlayer: (playerId, code) => this.#release((a) => a.player === playerId, code),
        kickRobot: (robotId, code) => this.#release((a) => a.player !== '' && a.robot === robotId, code),
        playerChanged: (playerId) => {
          this.state.players.forEach((aboard, sessionId) => {
            const client = this.clients.find((c) => c.sessionId === sessionId);
            if (aboard.player === playerId && client) sendPlayer(client, playerId);
          });
        },
        refreshRobot: (robot) => {
          this.state.players.forEach((aboard) => {
            if (aboard.player && aboard.robot === robot.id) show(aboard, robot);
          });
        },
      });
    }

    override onJoin(client: Client) {
      const auth = client.auth as Auth;
      const aboard = new Aboard();
      if ('guest' in auth) {
        const names = [...this.state.players.values()].filter((a) => !a.player).map((a) => a.name);
        aboard.player = '';
        aboard.robot = `guest-${client.sessionId}`;
        show(aboard, { name: guestName(nextGuestNumber(names)), color: buildColor(auth.guest), build: auth.guest });
      } else {
        const robot = deps.players.robot(auth.robot);
        if (!robot) {
          client.leave(CLOSED.removed); // removed between the seat reservation and the socket connecting
          return;
        }
        // One seat per player. onAuth already let go of any other seat; this catches two devices racing.
        this.#release((a) => a.player === auth.player, CLOSED.replaced, client.sessionId);
        this.#seat(client, aboard, auth.player, robot);
      }
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

    /** Whether this registered player has a seat (connected or held). */
    hasSeat(playerId: string | undefined): boolean {
      return !!playerId && [...this.state.players.values()].some((a) => a.player === playerId);
    }

    /**
     * Lets go of a player's seat so they can take it again from another device, and waits until it's gone. That
     * matters when the station is full: their own old seat mustn't be what keeps them out.
     */
    async releasePlayer(playerId: string) {
      if (!this.hasSeat(playerId)) return;
      const theirs = (a: Aboard) => a.player === playerId;
      this.#release(theirs, CLOSED.replaced);
      const until = Date.now() + RELEASE_WAIT_MS;
      while ((this.hasSeat(playerId) || this.locked) && Date.now() < until) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        // A device that dropped just as it was told to leave (a reload races the close) goes to onDrop with its own
        // close code, and its seat is held for reconnection after all. Let go of that hold too.
        this.#letGoHeld(theirs);
      }
      // The matchmaker reads the room's listing, which catches up with the unlock a moment later.
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    /** Lets go of every seat held for reconnection that matches. */
    #letGoHeld(match: (aboard: Aboard) => boolean) {
      this.state.players.forEach((aboard, sessionId) => {
        if (match(aboard)) this.#held.get(sessionId)?.reject(false);
      });
    }

    /** Switches a player's seat to another of their robots. */
    #pilot(client: Client, aboard: Aboard, robot: RobotRecord) {
      this.#seat(client, aboard, aboard.player, robot);
    }

    /** Makes a seat a registered player's, piloting this robot, and tells it their balance and robots. */
    #seat(client: Client, aboard: Aboard, playerId: string, robot: RobotRecord) {
      aboard.player = playerId;
      aboard.robot = robot.id;
      show(aboard, robot);
      deps.players.piloted(robot.id);
      sendPlayer(client, playerId);
    }

    /** Ends every seat that matches (except `keep`): connected ones are closed, held ones let go. */
    #release(match: (aboard: Aboard) => boolean, code: number, keep?: string) {
      this.state.players.forEach((aboard, sessionId) => {
        if (!match(aboard) || sessionId === keep) return;
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
  }
  return StationRoom;
}

/** A `register` or `login` message's name and PIN, as strings whatever was sent. */
function signIn(msg: unknown): SignIn {
  const m = (msg && typeof msg === 'object' ? msg : {}) as Partial<Record<keyof SignIn, unknown>>;
  return { name: typeof m.name === 'string' ? m.name : '', pin: typeof m.pin === 'string' ? m.pin : '' };
}

function answer(client: Client, reply: RegistryAnswer) {
  client.send(NOTICE.registry, reply);
}

function built(client: Client, reply: BotMakerAnswer) {
  client.send(NOTICE.botMaker, reply);
}

const refused = (status: number, error: string) => ({ ok: false, status, error }) as const;

/** Puts a robot's name and looks on its seat, for everyone aboard to see. */
function show(aboard: Aboard, robot: { name: string; color: string; build: RobotBuild }) {
  aboard.name = robot.name;
  aboard.color = robot.color;
  aboard.build = JSON.stringify(robot.build);
}
