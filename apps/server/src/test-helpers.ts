// Shared by the server tests: boots the real server (src/index.ts) as a child process and talks to it the way the game
// does, over HTTP for the roster and matchmaking, then a WebSocket per player.
import { type ChildProcess, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client, MatchMakeError, type Room } from '@colyseus/sdk';
import {
  classicBuild,
  type JoinRequest,
  NOTICE,
  PROTOCOL_VERSION,
  type RegistryAnswer,
  type RobotBuild,
  STATION_ROOM,
  type StationHealth,
  type StationView,
} from '@saber-side/shared';
import { afterEach } from 'vitest';
import { openDatabase } from './db.ts';
import { Players } from './players.ts';

export interface Booted {
  base: string;
  proc: ChildProcess;
  stop(): Promise<void>;
}

const running: Booted[] = [];
const rooms: Room[] = [];
const dirs: string[] = [];

afterEach(async () => {
  // leave() only resolves for a room that's still open; players already gone (or on a stopped server) are skipped.
  for (const room of rooms.splice(0)) if (room.connection.isOpen) await room.leave();
  for (const server of running.splice(0)) await server.stop();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A station database file that lives until the test ends, for restarts and for players saved before boot. */
export function stationFile(): string {
  const dir = mkdtempSync(join(tmpdir(), 'saber-station-'));
  dirs.push(dir);
  return join(dir, 'station.db');
}

export interface SeedPlayer {
  name: string;
  pin: string;
  build?: RobotBuild;
}

/** Saves players (each with one robot named after them) before the server boots, and returns its environment. */
export function seeded(...players: SeedPlayer[]): { DATABASE_PATH: string } {
  const path = stationFile();
  const db = openDatabase(path);
  const store = new Players(db);
  for (const p of players) {
    const made = store.register(p.name, p.pin, p.build ?? classicBuild());
    if (!made.ok) throw new Error(made.error);
  }
  db.close();
  return { DATABASE_PATH: path };
}

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
  const json = res.headers.get('content-type')?.includes('json');
  return { status: res.status, body: (text && json ? JSON.parse(text) : undefined) as T, headers: res.headers };
}

/** Joins the station: as a guest with the classic robot unless told otherwise. */
export async function comeAboard(
  server: Booted,
  join: Partial<JoinRequest> = { guest: { build: classicBuild() } },
): Promise<Room<unknown, StationView>> {
  const room = await new Client(server.base).join<StationView>(STATION_ROOM, { protocol: PROTOCOL_VERSION, ...join });
  rooms.push(room);
  return room;
}

/** Joins as a registered player. */
export function logIn(server: Booted, name: string, pin: string) {
  return comeAboard(server, { login: { name, pin } });
}

/** Sends a Registry request (register or login) and waits for the station's answer. */
export function ask(room: Room, type: string, signIn: { name: string; pin: string }): Promise<RegistryAnswer> {
  const answered = new Promise<RegistryAnswer>((resolve) => {
    const stop = room.onMessage(NOTICE.registry, (reply: RegistryAnswer) => {
      stop();
      resolve(reply);
    });
  });
  room.send(type, signIn);
  return answered;
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
