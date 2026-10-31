// Boots the real server (src/index.ts) as a child process and talks to it the way the game does: over HTTP for
// matchmaking and the health check, then a WebSocket per player.
import { type ChildProcess, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client, MatchMakeError, type Room } from '@colyseus/sdk';
import {
  JOIN_REFUSED,
  NOTICE,
  PROTOCOL_VERSION,
  STATION_CAPACITY,
  STATION_ROOM,
  type StationHealth,
  type StationView,
} from '@saber-side/shared';
import { afterEach, describe, expect, it } from 'vitest';

interface Booted {
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

async function boot(env: Record<string, string> = {}): Promise<Booted> {
  const proc = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'src/index.ts'], {
    cwd: join(import.meta.dirname, '..'),
    env: { ...process.env, PORT: '0', DATABASE_PATH: ':memory:', ...env },
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

async function health(server: Booted): Promise<StationHealth> {
  return (await (await fetch(`${server.base}/healthz`)).json()) as StationHealth;
}

async function comeAboard(server: Booted, protocol = PROTOCOL_VERSION): Promise<Room<unknown, StationView>> {
  const room = await new Client(server.base).join<StationView>(STATION_ROOM, { protocol });
  rooms.push(room);
  return room;
}

function refusal(promise: Promise<unknown>): Promise<number> {
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

async function until(check: () => boolean | Promise<boolean>, what: string) {
  for (let i = 0; i < 100; i++) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`timed out waiting for ${what}`);
}

describe('station server', () => {
  it('answers the health check', async () => {
    const server = await boot();
    const h = await health(server);
    expect(h).toMatchObject({ ok: true, protocol: PROTOCOL_VERSION, station: 'Ring Seven', aboard: 0 });
    expect(h.capacity).toBe(STATION_CAPACITY);
    expect(Date.parse(h.since)).not.toBeNaN();
  });

  it('lets a player aboard and counts who is here', async () => {
    const server = await boot();
    const a = await comeAboard(server);
    const b = await comeAboard(server);
    await until(() => a.state.aboard === 2, 'both players to be counted');
    expect(a.state.name).toBe('Ring Seven');
    expect((await health(server)).aboard).toBe(2);

    await b.leave();
    await until(() => a.state.aboard === 1, 'the count to drop');
    expect((await health(server)).aboard).toBe(1);
  });

  it('turns away a client built for another protocol version, without using a seat', async () => {
    const server = await boot();
    expect(await refusal(comeAboard(server, PROTOCOL_VERSION + 1))).toBe(JOIN_REFUSED.outdated);
    expect(await refusal(comeAboard(server, 0))).toBe(JOIN_REFUSED.outdated);
    expect((await health(server)).aboard).toBe(0);
  });

  it('tells the next player the station is full instead of opening a second one', async () => {
    const server = await boot();
    for (let i = 0; i < STATION_CAPACITY; i++) await comeAboard(server);
    expect(await refusal(comeAboard(server))).toBe(JOIN_REFUSED.full);
    expect((await health(server)).aboard).toBe(STATION_CAPACITY);

    // Once someone leaves, the seat opens up again.
    await rooms[0]?.leave();
    await until(async () => (await health(server)).aboard === STATION_CAPACITY - 1, 'a seat to open');
    await comeAboard(server);
  });

  it('keeps the station across a restart, and tells players it is restarting', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'saber-station-'));
    dirs.push(dir);
    const env = { DATABASE_PATH: join(dir, 'station.db') };

    const first = await boot(env);
    const since = (await health(first)).since;
    const player = await comeAboard(first);
    let notice = false;
    player.onMessage(NOTICE.restarting, () => {
      notice = true;
    });
    const left = new Promise<number>((resolve) => player.onLeave((code) => resolve(code)));
    await first.stop();
    expect(notice).toBe(true);
    expect(await left).toBe(4001); // CloseCode.SERVER_SHUTDOWN

    const second = await boot(env);
    expect((await health(second)).since).toBe(since);
    await comeAboard(second);
  });

  it('only lets pages from the allowed origins join', async () => {
    const site = 'https://saber-side.netlify.app';
    const server = await boot({ ALLOWED_ORIGINS: `${site}, https://*--saber-side.netlify.app` });
    const matchmake = (origin: string) =>
      fetch(`${server.base}/matchmake/join/${STATION_ROOM}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: origin },
        body: JSON.stringify({ protocol: PROTOCOL_VERSION }),
      });
    expect((await matchmake(site)).headers.get('access-control-allow-origin')).toBe(site);
    const preview = 'https://deploy-preview-7--saber-side.netlify.app';
    expect((await matchmake(preview)).headers.get('access-control-allow-origin')).toBe(preview);
    expect((await matchmake('https://evil.example')).headers.get('access-control-allow-origin')).toBeNull();

    const upgrade = (origin: string) =>
      new Promise<number>((resolve, reject) => {
        const req = request(`${server.base}/anything`, {
          headers: {
            Connection: 'Upgrade',
            Upgrade: 'websocket',
            'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
            'Sec-WebSocket-Version': '13',
            Origin: origin,
          },
        });
        req.on('response', (res) => resolve(res.statusCode ?? 0));
        req.on('upgrade', (_res, socket) => {
          socket.destroy();
          resolve(101);
        });
        req.on('error', reject);
        req.end();
      });
    expect(await upgrade('https://evil.example')).toBe(403);
    expect(await upgrade(site)).not.toBe(403);
  });
});
