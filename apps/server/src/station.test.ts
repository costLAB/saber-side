import { mkdtempSync, rmSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CLOSED,
  classicBuild,
  JOIN_REFUSED,
  MESSAGE,
  NOTICE,
  PIN_TRIES,
  POSE,
  PROTOCOL_VERSION,
  type RobotCard,
  type RosterResponse,
  STATION_CAPACITY,
  STATION_ROOM,
} from '@saber-side/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { api, boot, comeAboard, health, leaveCode, makeRobot, refusal, until } from './test-helpers.ts';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('station server', () => {
  it('answers the health check', async () => {
    const server = await boot();
    const h = await health(server);
    expect(h).toMatchObject({ ok: true, protocol: PROTOCOL_VERSION, station: 'Ring Seven', aboard: 0 });
    expect(h.capacity).toBe(STATION_CAPACITY);
    expect(Date.parse(h.since)).not.toBeNaN();
  });

  it('lets robots aboard and shows everyone who is here', async () => {
    const server = await boot();
    const zed = await makeRobot(server, { name: 'Zed', color: '#8fc4f2' });
    const a = await comeAboard(server, { robot: zed.id });
    const b = await comeAboard(server);
    await until(() => a.state.aboard === 2, 'both players to be counted');
    expect(a.state.name).toBe('Ring Seven');
    expect(a.state.players.get(a.sessionId)).toMatchObject({ robot: zed.id, name: 'Zed', color: '#8fc4f2' });
    expect(JSON.parse(a.state.players.get(a.sessionId)?.build ?? '')).toEqual(classicBuild('#8fc4f2'));
    expect(a.state.players.size).toBe(2);
    expect((await health(server)).aboard).toBe(2);

    await b.leave();
    await until(() => a.state.aboard === 1 && a.state.players.size === 1, 'the count to drop');
    expect((await health(server)).aboard).toBe(1);
  });

  it('turns away a client built for another protocol version, without using a seat', async () => {
    const server = await boot();
    expect(await refusal(comeAboard(server, { protocol: PROTOCOL_VERSION + 1 }))).toBe(JOIN_REFUSED.outdated);
    expect(await refusal(comeAboard(server, { protocol: 0 }))).toBe(JOIN_REFUSED.outdated);
    expect((await health(server)).aboard).toBe(0);
  });

  it('turns away robots that are not on the roster', async () => {
    const server = await boot();
    expect(await refusal(comeAboard(server, { robot: 'nobody' }))).toBe(JOIN_REFUSED.unknownRobot);
  });

  it('tells the next player the station is full instead of opening a second one', async () => {
    const server = await boot();
    const players = [];
    for (let i = 0; i < STATION_CAPACITY; i++) players.push(await comeAboard(server));
    expect(await refusal(comeAboard(server))).toBe(JOIN_REFUSED.full);
    expect((await health(server)).aboard).toBe(STATION_CAPACITY);

    // Once someone leaves, the seat opens up again.
    await players[0]?.leave();
    await until(async () => (await health(server)).aboard === STATION_CAPACITY - 1, 'a seat to open');
    await comeAboard(server);
  });

  it('asks for the PIN of a robot that has one, and locks it after too many wrong tries', async () => {
    const server = await boot();
    const mia = await makeRobot(server, { name: 'Mia', pin: '4321' });
    expect(mia.pin).toBe(true);
    expect(await refusal(comeAboard(server, { robot: mia.id }))).toBe(JOIN_REFUSED.wrongPin);
    for (let i = 1; i < PIN_TRIES; i++) {
      expect(await refusal(comeAboard(server, { robot: mia.id, pin: '0000' }))).toBe(JOIN_REFUSED.wrongPin);
    }
    expect(await refusal(comeAboard(server, { robot: mia.id, pin: '0000' }))).toBe(JOIN_REFUSED.pinLocked);
    // Locked means locked: even the right PIN waits out the minute.
    expect(await refusal(comeAboard(server, { robot: mia.id, pin: '4321' }))).toBe(JOIN_REFUSED.pinLocked);
  });

  it('lets the right PIN in', async () => {
    const server = await boot();
    const mia = await makeRobot(server, { name: 'Mia', pin: '4321' });
    const room = await comeAboard(server, { robot: mia.id, pin: '4321' });
    await until(() => room.state.aboard === 1, 'Mia to be aboard');
  });

  it('hands a robot over when it comes aboard from a second device', async () => {
    const server = await boot();
    const zed = await makeRobot(server, { name: 'Zed' });
    const ipad = await comeAboard(server, { robot: zed.id });
    const ipadLeft = leaveCode(ipad);
    const quest = await comeAboard(server, { robot: zed.id });
    expect(await ipadLeft).toBe(CLOSED.replaced);
    await until(() => quest.state.aboard === 1, 'only one Zed aboard');
    expect([...quest.state.players.values()].map((p) => p.name)).toEqual(['Zed']);
  });

  it('lets a reloaded page take over the seat its old self left held', async () => {
    const server = await boot();
    const zed = await makeRobot(server, { name: 'Zed' });
    const before = await comeAboard(server, { robot: zed.id });
    await until(async () => (await health(server)).aboard === 1, 'Zed to be aboard');
    // A reload drops the socket without saying goodbye, so the server holds Zed's seat in case it reconnects.
    before.reconnection.enabled = false;
    await before.leave(false);
    const after = await comeAboard(server, { robot: zed.id });
    await until(() => after.state.aboard === 1, 'the held seat to be let go');
    expect([...after.state.players.keys()]).toEqual([after.sessionId]);
  });

  it("passes each robot's pose on to everyone else, and ignores malformed ones", async () => {
    const server = await boot();
    const a = await comeAboard(server);
    const b = await comeAboard(server);
    const pose = POSE.map(([, kind], i) => (kind === 'flag' ? 1 : kind === 'position' ? 100 + i : 0.25));
    a.send(MESSAGE.pose, pose);
    const seen = () => b.state.players?.get(a.sessionId) as unknown as Record<string, number | boolean>;
    await until(() => seen()?.px === 100, "a's pose to reach b");
    expect(seen()).toMatchObject({ px: 100, py: 101, pz: 102, shown: true });
    expect(seen().qx as number).toBeCloseTo(0.25, 3);
    expect(seen().drive as number).toBeCloseTo(0.25, 3);

    for (const bad of [[1, 2, 3], 'nope', [...pose.slice(1), Number.NaN], pose.map(() => 1e9)])
      a.send(MESSAGE.pose, bad);
    a.send(
      MESSAGE.pose,
      pose.map((v, i) => (i === 0 ? 7 : v)),
    );
    await until(() => seen()?.px === 7, 'the next good pose');
    expect(seen().py).toBe(101);
  });

  it('keeps the station and its roster across a restart, and tells players it is restarting', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'saber-station-'));
    dirs.push(dir);
    const env = { DATABASE_PATH: join(dir, 'station.db') };

    const first = await boot(env);
    const since = (await health(first)).since;
    const zed = await makeRobot(first, { name: 'Zed', color: '#93dfb1', pin: '1234' });
    const player = await comeAboard(first, { robot: zed.id, pin: '1234' });
    let notice = false;
    player.onMessage(NOTICE.restarting, () => {
      notice = true;
    });
    const left = leaveCode(player);
    await first.stop();
    expect(notice).toBe(true);
    expect(await left).toBe(4001); // CloseCode.SERVER_SHUTDOWN

    const second = await boot(env);
    expect((await health(second)).since).toBe(since);
    expect((await api<RosterResponse>(second, 'GET', '/roster')).body.robots).toEqual([zed]);
    await comeAboard(second, { robot: zed.id, pin: '1234' });
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

    // The roster API refuses other sites outright, and answers the game's own pages with CORS headers.
    const roster = await api(server, 'GET', '/roster', undefined, { Origin: site });
    expect(roster.headers.get('access-control-allow-origin')).toBe(site);
    expect((await api(server, 'GET', '/roster', undefined, { Origin: 'https://evil.example' })).status).toBe(403);
    const made = await api(server, 'POST', '/robots', { name: 'Sneaky', color: '#ffffff' }, { Origin: 'https://x.y' });
    expect(made.status).toBe(403);

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

describe('roster API', () => {
  it('lists robots by name and never shows PINs', async () => {
    const server = await boot();
    await makeRobot(server, { name: 'zoe' });
    await makeRobot(server, { name: 'Abe', pin: '9999' });
    const res = await api<RosterResponse>(server, 'GET', '/roster');
    expect(res.body.protocol).toBe(PROTOCOL_VERSION);
    expect(res.body.robots.map((r) => [r.name, r.pin])).toEqual([
      ['Abe', true],
      ['zoe', false],
    ]);
    expect(JSON.stringify(res.body)).not.toContain('9999');
  });

  it('explains what is wrong with a new robot', async () => {
    const server = await boot();
    await makeRobot(server, { name: 'Zed' });
    const make = (body: object) => api<{ error: string }>(server, 'POST', '/robots', body);
    expect(await make({ name: 'zed', color: '#ffffff' })).toMatchObject({ status: 409 });
    expect(await make({ name: '', color: '#ffffff' })).toMatchObject({ status: 400 });
    expect(await make({ name: 'Ok', color: '#123456' })).toMatchObject({ status: 400 });
    expect(await make({ name: 'Ok', color: '#ffffff', pin: '12' })).toMatchObject({ status: 400 });
    expect((await make({ name: 'Ok', color: '#ffffff', pin: '12' })).body.error).toMatch(/4 digits/);
  });
});

describe('owner panel', () => {
  const key = 'test-owner-key';
  const owner = { Authorization: `Bearer ${key}` };

  it('is off without ADMIN_KEY, and refuses the wrong key', async () => {
    const off = await boot();
    expect((await api(off, 'GET', '/owner/check', undefined, owner)).status).toBe(403);
    const on = await boot({ ADMIN_KEY: key });
    expect((await api(on, 'GET', '/owner/check', undefined, { Authorization: 'Bearer nope' })).status).toBe(401);
    expect((await api(on, 'GET', '/owner/check')).status).toBe(401);
    expect((await api(on, 'GET', '/owner/check', undefined, owner)).status).toBe(204);
  });

  it('renames a robot, and everyone aboard sees the new name', async () => {
    const server = await boot({ ADMIN_KEY: key });
    const zed = await makeRobot(server, { name: 'Zed' });
    const room = await comeAboard(server, { robot: zed.id });
    const res = await api<RobotCard>(server, 'POST', `/owner/robots/${zed.id}/rename`, { name: 'Zedd' }, owner);
    expect(res).toMatchObject({ status: 200, body: { name: 'Zedd' } });
    await until(() => room.state.players.get(room.sessionId)?.name === 'Zedd', 'the new name to sync');
  });

  it('clears a forgotten PIN', async () => {
    const server = await boot({ ADMIN_KEY: key });
    const mia = await makeRobot(server, { name: 'Mia', pin: '4321' });
    const res = await api<RobotCard>(server, 'POST', `/owner/robots/${mia.id}/clear-pin`, undefined, owner);
    expect(res.body.pin).toBe(false);
    await comeAboard(server, { robot: mia.id });
  });

  it('removes a robot, sending its player back to the roster', async () => {
    const server = await boot({ ADMIN_KEY: key });
    const zed = await makeRobot(server, { name: 'Zed' });
    const room = await comeAboard(server, { robot: zed.id });
    const left = leaveCode(room);
    expect((await api(server, 'DELETE', `/owner/robots/${zed.id}`, undefined, owner)).status).toBe(204);
    expect(await left).toBe(CLOSED.removed);
    expect((await api<RosterResponse>(server, 'GET', '/roster')).body.robots).toEqual([]);
    expect(await refusal(comeAboard(server, { robot: zed.id }))).toBe(JOIN_REFUSED.unknownRobot);
  });
});
