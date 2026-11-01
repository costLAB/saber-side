import { request } from 'node:http';
import {
  type BotMakerAnswer,
  CLOSED,
  classicBuild,
  JOIN_REFUSED,
  type LedgerEntry,
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
import {
  api,
  ask,
  boot,
  botMaker,
  comeAboard,
  garage,
  health,
  leaveCode,
  logIn,
  refusal,
  seeded,
  until,
  wallet,
} from './test-helpers.ts';

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
    const site = 'https://saber-side.onrender.com';
    const server = await boot({ ALLOWED_ORIGINS: `${site}, https://saber-side-pr-*.onrender.com`, ADMIN_KEY: 'k' });
    const matchmake = (origin: string) =>
      fetch(`${server.base}/matchmake/join/${STATION_ROOM}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: origin },
        body: JSON.stringify({ protocol: PROTOCOL_VERSION }),
      });
    expect((await matchmake(site)).headers.get('access-control-allow-origin')).toBe(site);
    const preview = 'https://saber-side-pr-7.onrender.com';
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

describe('the Robot Registry', () => {
  it('registers a guest: their robot is saved under the new player, and the seat becomes theirs', async () => {
    const server = await boot();
    const guest = await comeAboard(server, { guest: { build: visor } });
    await until(() => guest.state.players?.get(guest.sessionId)?.name === 'Bot 1', 'the guest to be aboard');
    expect(await ask(guest, MESSAGE.register, { name: 'Mia', pin: '4321' })).toEqual({ ok: true, name: 'Mia' });
    const me = () => guest.state.players.get(guest.sessionId);
    await until(() => me()?.name === 'Mia', 'the seat to be renamed');
    expect(me()?.player).not.toBe('');
    expect(JSON.parse(me()?.build ?? '')).toEqual(visor);

    // Registered once is enough, and the name is Mia's now.
    expect(await ask(guest, MESSAGE.register, { name: 'Mia2', pin: '4321' })).toMatchObject({ ok: false });
    const other = await comeAboard(server);
    expect(await ask(other, MESSAGE.register, { name: 'mia', pin: '1111' })).toMatchObject({ ok: false });
    expect(await ask(other, MESSAGE.register, { name: 'Bot 5', pin: '1111' })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/guests/),
    });
    expect(await ask(other, MESSAGE.register, { name: 'Kai', pin: '12' })).toMatchObject({ ok: false });

    // Saved: Mia logs in from another visit and gets the same robot.
    await guest.leave();
    const again = await logIn(server, 'Mia', '4321');
    await until(() => again.state.players?.get(again.sessionId)?.name === 'Mia', 'Mia to be back');
    expect(JSON.parse(again.state.players.get(again.sessionId)?.build ?? '')).toEqual(visor);
  });

  it('opens a wallet when a guest registers, and sends a balance to whoever logs in there', async () => {
    const server = await boot();
    const guest = await comeAboard(server);
    const seen = wallet(guest);
    await ask(guest, MESSAGE.register, { name: 'Kai', pin: '2468' });
    await until(() => seen.length === 1, 'the new wallet');
    expect(seen).toEqual([0]);
  });

  it("logs a guest in: the seat switches to that player's robot, and their other device lets go", async () => {
    const server = await boot(seeded({ name: 'Zed', pin: '1111', build: visor }));
    const ipad = await logIn(server, 'Zed', '1111');
    const ipadLeft = leaveCode(ipad);
    const guest = await comeAboard(server);
    expect(await ask(guest, MESSAGE.login, { name: 'Zed', pin: '0000' })).toEqual({
      ok: false,
      error: "That username and PIN don't match.",
    });
    expect(await ask(guest, MESSAGE.login, { name: 'zed', pin: '1111' })).toEqual({ ok: true, name: 'Zed' });
    expect(await ipadLeft).toBe(CLOSED.replaced);
    await until(() => guest.state.aboard === 1, 'one seat for Zed');
    const me = guest.state.players.get(guest.sessionId);
    expect(me?.name).toBe('Zed');
    expect(JSON.parse(me?.build ?? '')).toEqual(visor);
  });

  it('locks a username after too many wrong PINs at the Registry too', async () => {
    const server = await boot(seeded({ name: 'Zed', pin: '1111' }));
    const guest = await comeAboard(server);
    for (let i = 0; i < PIN_TRIES; i++) await ask(guest, MESSAGE.login, { name: 'Zed', pin: '0000' });
    expect(await ask(guest, MESSAGE.login, { name: 'Zed', pin: '1111' })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/wrong PIN/i),
    });
  });
});

describe('several robots per player', () => {
  const key = 'test-owner-key';
  const owner = { Authorization: `Bearer ${key}` };
  const grant = async (server: Awaited<ReturnType<typeof boot>>, cc: number) => {
    const [player] = (await api<OwnerPlayer[]>(server, 'GET', '/owner/players', undefined, owner)).body;
    await api(server, 'POST', `/owner/players/${player?.id}/grant`, { shards: cc * 100 }, owner);
  };
  const stalk = { ...classicBuild(), head: { part: 'stalk', paint: '#b5e06a' } } as const;

  it('sells a second robot for 10 CC, pilots it in the same seat, and switches back', async () => {
    const server = await boot({ ADMIN_KEY: key, ...seeded({ name: 'Mia', pin: '4321' }) });
    const room = await logIn(server, 'Mia', '4321');
    const balance = wallet(room);
    const robots = garage(room);
    await until(() => robots.length > 0, "Mia's garage");
    expect(robots.at(-1)).toMatchObject({ robots: [{ name: 'Mia' }], nextPrice: 1000 });

    // Not enough crystals: refused, and nothing charged or made.
    expect(await botMaker(room, MESSAGE.build, { name: 'Sprout', build: stalk })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/costs 10 CC/),
    });
    await grant(server, 15);
    await until(() => balance.at(-1) === 1500, 'the grant');
    expect(await botMaker(room, MESSAGE.build, { name: 'Bot 2', build: stalk })).toMatchObject({ ok: false });
    expect(await botMaker(room, MESSAGE.build, { name: 'Sprout', build: stalk })).toEqual({ ok: true });
    await until(() => balance.at(-1) === 500, 'the payment');
    const me = () => room.state.players.get(room.sessionId);
    await until(() => me()?.name === 'Sprout', 'the seat to pilot Sprout');
    expect(JSON.parse(me()?.build ?? '')).toEqual(stalk);
    expect(room.state.aboard).toBe(1);
    expect(robots.at(-1)?.robots.map((r) => r.name)).toEqual(['Sprout', 'Mia']);
    expect(robots.at(-1)?.nextPrice).toBe(2000);

    // Pilot the first one again, in the same seat. The next login comes aboard as whichever was piloted last.
    const first = robots.at(-1)?.robots.find((r) => r.name === 'Mia');
    expect(await botMaker(room, MESSAGE.pilot, { robot: first?.id })).toEqual({ ok: true });
    await until(() => me()?.name === 'Mia', 'the seat to pilot Mia again');
    await room.leave();
    const again = await logIn(server, 'Mia', '4321');
    await until(() => again.state.players?.get(again.sessionId)?.name === 'Mia', 'Mia, piloted last');
  });

  it('keeps five robots at most, for 100 CC in all, and buys one robot for two quick taps', async () => {
    const server = await boot({ ADMIN_KEY: key, ...seeded({ name: 'Zed', pin: '1111' }) });
    const room = await logIn(server, 'Zed', '1111');
    const balance = wallet(room);
    const robots = garage(room);
    await grant(server, 10);
    await until(() => balance.at(-1) === 1000, 'the grant');
    // Two taps with enough for one: one robot, one refusal.
    const taps: BotMakerAnswer[] = [];
    room.onMessage(NOTICE.botMaker, (a: BotMakerAnswer) => taps.push(a));
    room.send(MESSAGE.build, { name: 'Two', build: stalk });
    room.send(MESSAGE.build, { name: 'Twin', build: stalk });
    await until(() => taps.length === 2, 'both answers');
    expect(taps.filter((t) => t.ok)).toHaveLength(1);
    await until(() => robots.at(-1)?.robots.length === 2, 'two robots');

    await grant(server, 90);
    for (const name of ['Three', 'Four', 'Five']) {
      expect(await botMaker(room, MESSAGE.build, { name, build: stalk })).toEqual({ ok: true });
    }
    await until(() => robots.at(-1)?.robots.length === 5, 'five robots');
    expect(robots.at(-1)?.nextPrice).toBeNull();
    await until(() => balance.at(-1) === 0, 'every crystal spent');
    expect(await botMaker(room, MESSAGE.build, { name: 'Six', build: stalk })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/keep 5/),
    });
  });

  it("doesn't sell guests robots, or let anyone pilot someone else's", async () => {
    const server = await boot(seeded({ name: 'Mia', pin: '4321' }, { name: 'Zed', pin: '1111' }));
    const guest = await comeAboard(server);
    expect(await botMaker(guest, MESSAGE.build, { name: 'Sprout', build: stalk })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/Register/),
    });
    const zed = await logIn(server, 'Zed', '1111');
    const zedRobots = garage(zed);
    await until(() => zedRobots.length > 0, "Zed's garage");
    const mia = await logIn(server, 'Mia', '4321');
    expect(await botMaker(mia, MESSAGE.pilot, { robot: zedRobots[0]?.robots[0]?.id })).toMatchObject({ ok: false });
    expect(await botMaker(guest, MESSAGE.pilot, { robot: zedRobots[0]?.robots[0]?.id })).toMatchObject({ ok: false });
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

  it("grants crystals, tells the player's seat alone, and reverses a grant", async () => {
    const server = await boot({ ADMIN_KEY: key, ...seeded({ name: 'Mia', pin: '4321' }) });
    const room = await logIn(server, 'Mia', '4321');
    const seen = wallet(room);
    const guest = await comeAboard(server);
    const guestSeen = wallet(guest);
    await until(() => seen.length > 0, "Mia's balance on joining");
    expect(seen).toEqual([0]);
    const mia = (await list(server))[0] as OwnerPlayer;
    expect(mia.shards).toBe(0);

    const grant = await api<LedgerEntry>(server, 'POST', `/owner/players/${mia.id}/grant`, { shards: 1245 }, owner);
    expect(grant).toMatchObject({ status: 200, body: { to: `player:${mia.id}`, shards: 1245, reason: 'grant' } });
    await until(() => seen.at(-1) === 1245, 'the new balance to reach Mia');
    expect((await list(server))[0]?.shards).toBe(1245);
    // Taking away more than she has is refused whole.
    const tooMuch = await api(server, 'POST', `/owner/players/${mia.id}/grant`, { shards: -2000 }, owner);
    expect(tooMuch.status).toBe(409);

    const reversed = await api(server, 'POST', `/owner/ledger/${grant.body.id}/reverse`, {}, owner);
    expect(reversed.status).toBe(200);
    await until(() => seen.at(-1) === 0, 'the reversal to reach Mia');
    const entries = (await api<LedgerEntry[]>(server, 'GET', `/owner/players/${mia.id}/ledger`, undefined, owner)).body;
    expect(entries.map((e) => [e.reason, e.reversed])).toEqual([
      ['reversal', false],
      ['grant', true],
    ]);
    expect(guestSeen).toEqual([]);
  });

  it("posts a removed player's balance to the removed account", async () => {
    const server = await boot({
      ADMIN_KEY: key,
      ...seeded({ name: 'Mia', pin: '4321' }, { name: 'Zed', pin: '1111' }),
    });
    const [mia, zed] = (await list(server)) as OwnerPlayer[];
    await api(server, 'POST', `/owner/players/${mia?.id}/grant`, { shards: 500 }, owner);
    await api(server, 'POST', `/owner/players/${zed?.id}/grant`, { shards: 300 }, owner);
    expect((await api(server, 'DELETE', `/owner/players/${mia?.id}`, undefined, owner)).status).toBe(204);
    const entries = (await api<LedgerEntry[]>(server, 'GET', `/owner/players/${mia?.id}/ledger`, undefined, owner))
      .body;
    expect(entries[0]).toMatchObject({ to: 'removed', shards: 500, reason: 'removed' });
    expect((await list(server)).map((p) => [p.name, p.shards])).toEqual([['Zed', 300]]);
  });
});
