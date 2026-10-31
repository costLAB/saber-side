// Shared by the server tests: boots the real server (src/index.ts) as a child process and talks to it the way the game
// does, over HTTP for the roster and matchmaking, then a WebSocket per player.
import { type ChildProcess, spawn } from 'node:child_process';
import { join } from 'node:path';
import { Client, MatchMakeError, type Room } from '@colyseus/sdk';
import {
  type JoinRequest,
  type NewRobot,
  PROTOCOL_VERSION,
  ROBOT_COLORS,
  type RobotCard,
  STATION_ROOM,
  type StationHealth,
  type StationView,
} from '@saber-side/shared';
import { afterEach } from 'vitest';

export interface Booted {
  base: string;
  proc: ChildProcess;
  stop(): Promise<void>;
}

const running: Booted[] = [];
const rooms: Room[] = [];

afterEach(async () => {
  // leave() only resolves for a room that's still open; players already gone (or on a stopped server) are skipped.
  for (const room of rooms.splice(0)) if (room.connection.isOpen) await room.leave();
  for (const server of running.splice(0)) await server.stop();
});

export async function boot(env: Record<string, string> = {}): Promise<Booted> {
  const proc = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'src/index.ts'], {
    cwd: join(import.meta.dirname, '..'),
    env: { ...process.env, PORT: '0', DATABASE_PATH: ':memory:', ADMIN_KEY: '', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  proc.stderr?.on('data', (d) => {
    log += d;
  });
  const port = await new Promise<number>((resolve, reject) => {
    proc.stdout?.on('data', (d) => {
      log += d;
      const m = log.match(/open on port (\d+)/);
      if (m) resolve(Number(m[1]));
    });
    proc.on('exit', (code) => reject(new Error(`server exited with ${code}:\n${log}`)));
  });
  const exited = new Promise<void>((resolve) => proc.on('exit', () => resolve()));
  const booted: Booted = {
    base: `http://localhost:${port}`,
    proc,
    stop: async () => {
      if (proc.exitCode === null) proc.kill('SIGTERM');
      await exited;
    },
  };
  running.push(booted);
  return booted;
}

export async function health(server: Booted): Promise<StationHealth> {
  return (await (await fetch(`${server.base}/healthz`)).json()) as StationHealth;
}

/** Calls the server's JSON API and returns the status and parsed body. */
export async function api<T = unknown>(
  server: Booted,
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: T; headers: Headers }> {
  const res = await fetch(`${server.base}/api${path}`, {
    method,
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : undefined) as T, headers: res.headers };
}

let made = 0;
/** Puts a new robot on the roster. Names are unique, so by default each call gets a fresh one. */
export async function makeRobot(server: Booted, robot: Partial<NewRobot> = {}): Promise<RobotCard> {
  const res = await api<RobotCard>(server, 'POST', '/robots', {
    name: `Bot ${++made}`,
    color: ROBOT_COLORS[made % ROBOT_COLORS.length]?.hex,
    ...robot,
  });
  if (res.status !== 201) throw new Error(`couldn't make a robot: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

/** Joins the station as a robot (a fresh one unless given). */
export async function comeAboard(server: Booted, join: Partial<JoinRequest> = {}): Promise<Room<unknown, StationView>> {
  const robot = join.robot ?? (await makeRobot(server)).id;
  const room = await new Client(server.base).join<StationView>(STATION_ROOM, {
    protocol: PROTOCOL_VERSION,
    ...join,
    robot,
  });
  rooms.push(room);
  return room;
}

/** Expects a join to be refused and returns the refusal code. */
export function refusal(promise: Promise<unknown>): Promise<number> {
  return promise.then(
    () => {
      throw new Error('expected the join to be refused');
    },
    (e: unknown) => {
      if (!(e instanceof MatchMakeError)) throw e;
      return e.code;
    },
  );
}

export async function until(check: () => boolean | Promise<boolean>, what: string) {
  for (let i = 0; i < 100; i++) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`timed out waiting for ${what}`);
}

/** Resolves with the close code when the server closes this player's connection. */
export function leaveCode(room: Room): Promise<number> {
  return new Promise((resolve) => room.onLeave((code) => resolve(code)));
}
