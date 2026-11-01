import { request } from 'node:http';
import {
  CLOSED,
  classicBuild,
  JOIN_REFUSED,
  MESSAGE,
  NOTICE,
  type OwnerPlayer,
  type OwnerRobot,
  PIN_TRIES,
  POSE,
  PROTOCOL_VERSION,
  STATION_CAPACITY,
  STATION_ROOM,
} from '@saber-side/shared';
import { describe, expect, it } from 'vitest';
import { api, boot, comeAboard, health, leaveCode, logIn, refusal, seeded, until } from './test-helpers.ts';

const visor = { ...classicBuild(), head: { part: 'visor', paint: '#8fc4f2' } } as const;
const others = (room: { sessionId: string; state: { players: Map<string, { name: string }> } }) =>
  [...room.state.players.entries()].filter(([id]) => id !== room.sessionId).map(([, p]) => p.name);

describe('station server', () => {
  it('answers the health check', async () => {
    const server = await boot();
    const h = await health(server);
    expect(h).toMatchObject({ ok: true, protocol: PROTOCOL_VERSION, station: 'Ring Seven', aboard: 0 });
    expect(h.capacity).toBe(STATION_CAPACITY);
    expect(Date.parse(h.since)).not.toBeNaN();
  });

  it('lets guests aboard with their own robot and a name of their own, and shows everyone who is here', async () => {
    const server = await boot();
    const a = await comeAboard(server, { guest: { build: visor } });
    const b = await comeAboard(server);
    await until(() => a.state.aboard === 2, 'both players to be counted');
    expect(a.state.name).toBe('Ring Seven');
    expect(a.state.players.get(a.sessionId)).toMatchObject({ player: '', name: 'Bot 1', color: '#8fc4f2' });
    expect(JSON.parse(a.state.players.get(a.sessionId)?.build ?? '')).toEqual(visor);
    expect(a.state.players.get(b.sessionId)?.name).toBe('Bot 2');
    expect((await health(server)).aboard).toBe(2);

    // The lowest free number goes to the next guest.
    await a.leave();
    await until(() => b.state.aboard === 1 && b.state.players.size === 1, 'the count to drop');
    const c = await comeAboard(server);
    await until(() => c.state.players?.get(c.sessionId)?.name === 'Bot 1', 'the new guest to be Bot 1');
  });

  it('turns away a client built for another protocol version, without using a seat', async () => {
    const server = await boot();
    expect(await refusal(comeAboard(server, { protocol: PROTOCOL_VERSION + 1 }))).toBe(JOIN_REFUSED.outdated);
    expect(await refusal(comeAboard(server, { protocol: 0 }))).toBe(JOIN_REFUSED.outdated);
    expect((await health(server)).aboard).toBe(0);
  });

  it('turns away a guest robot that cannot be built', async () => {
    const server = await boot();
    const noWheel = { ...classicBuild(), mobility: null } as never;
    expect(await refusal(comeAboard(server, { guest: { build: noWheel } }))).toBe(JOIN_REFUSED.badRobot);
    expect(await refusal(comeAboard(server, {}))).toBe(JOIN_REFUSED.badRobot);
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

  it('logs a player in as their robot, with the same answer for a wrong PIN and an unknown name', async () => {
    const server = await boot(seeded({ name: 'Mia', pin: '4321', build: visor }));
    expect(await refusal(logIn(server, 'Mia', '0000'))).toBe(JOIN_REFUSED.wrongPin);
    expect(await refusal(logIn(server, 'Nobody', '4321'))).toBe(JOIN_REFUSED.wrongPin);
    expect(await refusal(logIn(server, 'Mia', ''))).toBe(JOIN_REFUSED.wrongPin);
    const room = await logIn(server, 'mia', '4321');
    await until(() => room.state.aboard === 1, 'Mia to be aboard');
    const me = room.state.players.get(room.sessionId);
    expect(me).toMatchObject({ name: 'Mia', color: '#8fc4f2' });
    expect(me?.player).not.toBe('');
    expect(JSON.parse(me?.build ?? '')).toEqual(visor);
  });

  it('locks a username after too many wrong PINs', async () => {
    const server = await boot(seeded({ name: 'Mia', pin: '4321' }));
    for (let i = 1; i < PIN_TRIES; i++) expect(await refusal(logIn(server, 'Mia', '0000'))).toBe(JOIN_REFUSED.wrongPin);
    expect(await refusal(logIn(server, 'Mia', '0000'))).toBe(JOIN_REFUSED.pinLocked);
    // Locked means locked: even the right PIN waits it out.
    expect(await refusal(logIn(server, 'Mia', '4321'))).toBe(JOIN_REFUSED.pinLocked);
  });

  it('gives each player one seat: a second device takes over from the first', async () => {
    const server = await boot(seeded({ name: 'Zed', pin: '1111' }));
    const ipad = await logIn(server, 'Zed', '1111');
    const ipadLeft = leaveCode(ipad);
    const quest = await logIn(server, 'Zed', '1111');
    expect(await ipadLeft).toBe(CLOSED.replaced);
    await until(() => quest.state.aboard === 1, 'only one Zed aboard');
    expect([...quest.state.players.values()].map((p) => p.name)).toEqual(['Zed']);
  });

  it('lets a reloaded page take over the seat its old self left held', async () => {
    const server = await boot(seeded({ name: 'Zed', pin: '1111' }));
    const before = await logIn(server, 'Zed', '1111');
    await until(async () => (await health(server)).aboard === 1, 'Zed to be aboard');
    // A reload drops the socket without saying goodbye, so the server holds Zed's seat in case it reconnects.
    before.reconnection.enabled = false;
    await before.leave(false);
    const after = await logIn(server, 'Zed', '1111');
    await until(() => after.state.aboard === 1, 'the held seat to be let go');
    expect([...after.state.players.keys()]).toEqual([after.sessionId]);
  });

  it("lets a player take over their own seat on a full station, but doesn't let a newcomer in", async () => {
    const server = await boot(seeded({ name: 'Zed', pin: '1111' }, { name: 'Mia', pin: '2222' }));
    const zed = await logIn(server, 'Zed', '1111');
    for (let i = 1; i < STATION_CAPACITY; i++) await comeAboard(server);
    await until(async () => (await health(server)).aboard === STATION_CAPACITY, 'the station to fill');
    expect(await refusal(comeAboard(server))).toBe(JOIN_REFUSED.full);
    // A full station is said before the PIN is checked, so it doesn't use up Mia's tries.
    for (let i = 0; i < PIN_TRIES + 1; i++) expect(await refusal(logIn(server, 'Mia', '0000'))).toBe(JOIN_REFUSED.full);

    // Zed's page reloads: the old seat is held, and the station is full, but it's Zed's own seat.
    zed.reconnection.enabled = false;
    await zed.leave(false);
    const again = await logIn(server, 'Zed', '1111');
    await until(() => again.state.aboard === STATION_CAPACITY, 'Zed back in the same seat count');
    expect(others(again)).not.toContain('Zed');
    expect(again.state.players.get(again.sessionId)?.name).toBe('Zed');
  });

  it('saves a player rebuilding their robot at the Bot Maker, and shows guests their rebuild', async () => {
    const env = seeded({ name: 'Mia', pin: '4321' });
    const server = await boot(env);
    const mia = await logIn(server, 'Mia', '4321');
    const guest = await comeAboard(server);
    mia.send(MESSAGE.rebuild, visor);
    guest.send(MESSAGE.rebuild, visor);
    guest.send(MESSAGE.rebuild, { mobility: null }); // not buildable: ignored
    const seen = (id: string) => JSON.parse(mia.state.players.get(id)?.build ?? 'null');
    await until(() => seen(mia.sessionId)?.head?.part === 'visor', "Mia's rebuild to show");
    await until(() => seen(guest.sessionId)?.head?.part === 'visor', "the guest's rebuild to show");
    expect(mia.state.players.get(mia.sessionId)?.color).toBe('#8fc4f2');

    // Saved: it comes back next time.
    await mia.leave();
    const again = await logIn(server, 'Mia', '4321');
    await until(() => again.state.players?.get(again.sessionId)?.name === 'Mia', 'Mia to be back');
    expect(JSON.parse(again.state.players.get(again.sessionId)?.build ?? '')).toEqual(visor);
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

  it('keeps the station and its players across a restart, forgets guests, and tells players it is restarting', async () => {
    const env = seeded({ name: 'Mia', pin: '1234' });
    const first = await boot(env);
    const since = (await health(first)).since;
    const player = await logIn(first, 'Mia', '1234');
    await comeAboard(first);
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
    const back = await logIn(second, 'Mia', '1234');
    await until(() => back.state.aboard === 1, 'Mia to be back');
    expect(back.state.players.get(back.sessionId)?.name).toBe('Mia');
  });

  it('only lets pages from the allowed origins join', async () => {
    const site = 'https://saber-side.netlify.app';
    const server = await boot({ ALLOWED_ORIGINS: `${site}, https://*--saber-side.netlify.app`, ADMIN_KEY: 'k' });
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

    // The owner API refuses other sites outright, and answers the game's own pages with CORS headers.
    const owner = { Authorization: 'Bearer k' };
    const check = await api(server, 'GET', '/owner/check', undefined, { ...owner, Origin: site });
    expect(check.headers.get('access-control-allow-origin')).toBe(site);
    expect((await api(server, 'GET', '/owner/check', undefined, { ...owner, Origin: 'https://x.y' })).status).toBe(403);

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

  it('has no public list of players or robots', async () => {
    const server = await boot(seeded({ name: 'Mia', pin: '4321' }));
    expect((await api(server, 'GET', '/roster')).status).toBe(404);
    expect((await api(server, 'POST', '/robots', { name: 'Sneaky' })).status).toBe(404);
  });
});

describe('owner panel', () => {
  const key = 'test-owner-key';
  const owner = { Authorization: `Bearer ${key}` };
  const list = async (server: Awaited<ReturnType<typeof boot>>) =>
    (await api<OwnerPlayer[]>(server, 'GET', '/owner/players', undefined, owner)).body;

  it('is off without ADMIN_KEY, and refuses the wrong key', async () => {
    const off = await boot();
    expect((await api(off, 'GET', '/owner/check', undefined, owner)).status).toBe(403);
    const on = await boot({ ADMIN_KEY: key });
    expect((await api(on, 'GET', '/owner/check', undefined, { Authorization: 'Bearer nope' })).status).toBe(401);
    expect((await api(on, 'GET', '/owner/check')).status).toBe(401);
    expect((await api(on, 'GET', '/owner/players')).status).toBe(401);
    expect((await api(on, 'GET', '/owner/check', undefined, owner)).status).toBe(204);
  });

  it('lists players and their robots, never their PINs, and not guests', async () => {
    const server = await boot({
      ADMIN_KEY: key,
      ...seeded({ name: 'zoe', pin: '9999' }, { name: 'Abe', pin: '1234' }),
    });
    await comeAboard(server);
    const players = await list(server);
    expect(players.map((p) => [p.name, p.pinReset, p.robots.map((r) => r.name)])).toEqual([
      ['Abe', false, ['Abe']],
      ['zoe', false, ['zoe']],
    ]);
    expect(JSON.stringify(players)).not.toMatch(/9999|scrypt/);
  });

  it('renames a robot, and everyone aboard sees the new name', async () => {
    const server = await boot({ ADMIN_KEY: key, ...seeded({ name: 'Zed', pin: '1111' }) });
    const room = await logIn(server, 'Zed', '1111');
    const robot = (await list(server))[0]?.robots[0] as OwnerRobot;
    const res = await api<OwnerRobot>(server, 'POST', `/owner/robots/${robot.id}/rename`, { name: 'Zedd' }, owner);
    expect(res).toMatchObject({ status: 200, body: { name: 'Zedd' } });
    await until(() => room.state.players.get(room.sessionId)?.name === 'Zedd', 'the new name to sync');
    expect((await api(server, 'POST', `/owner/robots/${robot.id}/rename`, { name: 'Bot 9' }, owner)).status).toBe(400);
  });

  it('renames a player, who then logs in with the new name', async () => {
    const server = await boot({ ADMIN_KEY: key, ...seeded({ name: 'Zed', pin: '1111' }) });
    const zed = (await list(server))[0] as OwnerPlayer;
    expect((await api(server, 'POST', `/owner/players/${zed.id}/rename`, { name: 'Zack' }, owner)).status).toBe(200);
    expect(await refusal(logIn(server, 'Zed', '1111'))).toBe(JOIN_REFUSED.wrongPin);
    await logIn(server, 'Zack', '1111');
  });

  it('resets a forgotten PIN, and the next one typed becomes the new PIN', async () => {
    const server = await boot({ ADMIN_KEY: key, ...seeded({ name: 'Mia', pin: '4321' }) });
    const mia = (await list(server))[0] as OwnerPlayer;
    expect((await api(server, 'POST', `/owner/players/${mia.id}/reset-pin`, {}, owner)).status).toBe(200);
    expect((await list(server))[0]?.pinReset).toBe(true);
    const room = await logIn(server, 'Mia', '8642');
    await room.leave();
    expect(await refusal(logIn(server, 'Mia', '4321'))).toBe(JOIN_REFUSED.wrongPin);
    await logIn(server, 'Mia', '8642');
  });

  it('removes a player, sending them back to the arrival screen', async () => {
    const server = await boot({ ADMIN_KEY: key, ...seeded({ name: 'Zed', pin: '1111' }) });
    const room = await logIn(server, 'Zed', '1111');
    const left = leaveCode(room);
    const zed = (await list(server))[0] as OwnerPlayer;
    expect((await api(server, 'DELETE', `/owner/players/${zed.id}`, undefined, owner)).status).toBe(204);
    expect(await left).toBe(CLOSED.removed);
    expect(await list(server)).toEqual([]);
    expect(await refusal(logIn(server, 'Zed', '1111'))).toBe(JOIN_REFUSED.wrongPin);
  });

  it("keeps a player's only robot", async () => {
    const server = await boot({ ADMIN_KEY: key, ...seeded({ name: 'Zed', pin: '1111' }) });
    const robot = (await list(server))[0]?.robots[0] as OwnerRobot;
    const res = await api<{ error: string }>(server, 'DELETE', `/owner/robots/${robot.id}`, undefined, owner);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/only robot/);
  });
});
