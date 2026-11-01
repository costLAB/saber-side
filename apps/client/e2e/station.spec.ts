import { Client } from '@colyseus/sdk';
import type { Page } from '@playwright/test';
import {
  BOT_MAKER,
  classicBuild,
  MESSAGE,
  POSE,
  PROTOCOL_VERSION,
  ROBOT_REGISTRY,
  STATION_ROOM,
  type StationView,
} from '@saber-side/shared';
import { advance, boot, expect, hold, test } from './fixtures';
import { OWNER_KEY, STATION_PORT } from './ports';

// Coming aboard the station through the arrival screen, against a real station server (started by
// playwright.config.ts). It lives for the whole run, so names typed here are made fresh.

const STATION = `http://localhost:${STATION_PORT}`;
const fresh = (prefix: string) => `${prefix}${Date.now() % 1_000_000}`;

async function online(page: Page) {
  await page.addInitScript((url) => {
    window.SABER_SERVER = url;
  }, STATION);
}

/**
 * Matchmaking and the socket are real network traffic, so they need real time to pass. This polls in real time while
 * the paused game clock ticks along a frame at a time.
 */
function eventually<T>(page: Page, read: () => Promise<T>) {
  return expect.poll(
    async () => {
      await advance(page, 33);
      return read();
    },
    { timeout: 30_000 },
  );
}

async function saber<T>(page: Page, read: string): Promise<T> {
  // biome-ignore lint/suspicious/noExplicitAny: debug hook exposed by the legacy game
  return page.evaluate((expr) => new Function('s', `return ${expr}`)((window as any).__saber), read);
}

/** Taps Play, keeps the classic robot, and rolls out as a guest. Returns the guest's name. */
async function playAsGuest(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Play' }).click();
  await page.getByRole('button', { name: 'Roll out' }).click();
  await eventually(page, () => page.locator('#station').textContent()).toMatch(/online · \d+ aboard · as Bot \d+/);
  return (/as (Bot \d+)/.exec((await page.locator('#station').textContent()) ?? '') as RegExpExecArray)[1] as string;
}

/** Puts the robot in the walkway in front of a building's door and drives in through it. */
async function driveInto(page: Page, building: { front: number; z: number }) {
  await page.evaluate(
    ({ x, z }) => {
      // biome-ignore lint/suspicious/noExplicitAny: debug hook exposed by the legacy game
      const s = (window as any).__saber;
      s.bot.root.position.x = x;
      s.bot.root.position.z = z;
      s.st.yaw = -Math.PI / 2;
    },
    { x: building.front + 6, z: building.z },
  );
  await advance(page, 100);
  await hold(page, 'ArrowUp', 2000);
}

/** The owner panel's API on the throwaway station. */
const owner = { Authorization: `Bearer ${OWNER_KEY}` };

test('plays straight away as a guest: builds a robot from parts and rolls it out of the Bot Maker', async ({
  page,
  errors,
}, info) => {
  test.skip(info.project.name === 'ipad', 'one profile is enough');
  await online(page);
  await page.goto('/?debug');
  const sheet = page.locator('.arrival');
  await expect(sheet).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Welcome aboard' })).toBeVisible();
  await expect(page.locator('#station')).toContainText('not aboard');

  // Typing in the login form, even game keys (W A S D, X for spin), mustn't drive the robot around behind the sheet.
  const before = await saber<number>(page, 's.bot.root.position.z');
  await page.getByLabel('Username').pressSequentially('Wasdx');
  await advance(page, 500);
  expect(await saber<number>(page, 's.bot.root.position.z')).toBe(before);
  expect(await saber<number>(page, 's.st.spin')).toBeLessThan(0);

  // Play opens the builder, with no name or PIN to fill in. Every slot starts on the classic part.
  await page.getByRole('button', { name: 'Play' }).click();
  await expect(page.getByRole('heading', { name: 'Build your robot' })).toBeVisible();
  await expect(sheet.getByLabel('Name')).toHaveCount(0);
  const slot = (name: string) => page.locator(`[data-slot=${name}]`);
  await expect(slot('mobility').locator('.chip')).toHaveText(['Single wheel']);
  await slot('body').getByText('Barrel').click();
  await slot('body').locator('label[title="Sky"]').click();
  await slot('head').getByText('Visor').click();
  await slot('arms').getByText('None').click();
  await expect(page.getByLabel('Arms paint: Sky')).toBeDisabled();
  await slot('mobility').locator('label[title="Rust"]').click();
  await page.getByRole('button', { name: 'Roll out' }).click();
  await eventually(page, () => page.locator('#station').textContent()).toMatch(/online · \d+ aboard · as Bot \d+/);
  await expect(sheet).toBeHidden();
  const built = {
    mobility: { part: 'wheel', paint: '#e8935a' },
    body: { part: 'barrel', paint: '#8fc4f2' },
    head: { part: 'visor', paint: '#ffffff' },
    arms: null,
  };
  expect(await saber(page, 's.bot.build')).toEqual(built);
  expect(await saber(page, 's.bot.arms.length')).toBe(0);
  // Spawning puts the new robot in the Bot Maker, and it rolls itself out through the door into the walkway.
  expect(await saber(page, 's.st.mode')).toBe('floor');
  expect(await saber<number>(page, 's.st.rollout')).toBeGreaterThan(0);
  expect(await saber<number>(page, 's.bot.root.position.x')).toBeLessThan(BOT_MAKER.front);
  await advance(page, 5000);
  expect(await saber<number>(page, 's.st.rollout')).toBe(0);
  expect(await saber<number>(page, 's.bot.root.position.x')).toBeGreaterThan(BOT_MAKER.spawn.rollToX);
  expect(await saber<number>(page, 's.bot.root.position.z')).toBeCloseTo(BOT_MAKER.z, 0);

  // Guests aren't saved: a reload is a fresh arrival, and Play builds a new robot.
  await page.reload();
  await expect(sheet).toBeVisible();
  await page.getByRole('button', { name: 'Play' }).click();
  await expect(page.getByRole('heading', { name: 'Build your robot' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('turns a wrong login away without saying whether the name exists', async ({ page, errors }, info) => {
  test.skip(info.project.name === 'ipad', 'one profile is enough');
  await online(page);
  await page.goto('/');
  const name = fresh('Nobody');
  await page.getByLabel('Username').fill(name);
  await page.getByLabel('PIN', { exact: true }).fill('12');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.locator('.arrival .error')).toHaveText('Your PIN is 4 digits.');

  await page.getByLabel('PIN', { exact: true }).fill('0000');
  await page.getByRole('button', { name: 'Log in' }).click();
  await eventually(page, () => page.locator('.arrival .error').textContent()).toBe(
    "That username and PIN don't match.",
  );
  // The form keeps the name to try again, and the device only remembers names that logged in.
  await expect(page.getByLabel('Username')).toHaveValue(name);
  expect(await page.evaluate(() => localStorage.getItem('saber-side:username'))).toBeNull();
  // The browser logs the refused join (HTTP 401) itself; that one is expected.
  expect(errors.filter((e) => !e.includes('status of 401'))).toEqual([]);
});

test('rebuilds the robot by driving back into the Bot Maker', async ({ page, errors }, info) => {
  test.skip(info.project.name === 'ipad', 'one profile is enough');
  const sheet = page.locator('.arrival');
  /** Points the robot along the walkway (into the Bot Maker, or back out of it) and drives for a few seconds. */
  const drive = async (into: boolean) => {
    await page.evaluate(
      (yaw) => {
        // biome-ignore lint/suspicious/noExplicitAny: debug hook exposed by the legacy game
        (window as any).__saber.st.yaw = yaw;
      },
      (into ? -Math.PI : Math.PI) / 2,
    );
    await hold(page, 'ArrowUp', 3000);
  };

  await online(page);
  await page.goto('/?debug');
  const name = await playAsGuest(page);
  await expect(page.locator('#station button')).toHaveCount(0);
  // Rolling out of the Bot Maker, where every robot starts, doesn't open the builder.
  await advance(page, 6000);
  expect(await saber<number>(page, 's.st.rollout')).toBe(0);
  await expect(sheet).toBeHidden();

  // Driving back in through the door does, and lets go of the key that drove it there.
  await drive(true);
  await expect(sheet).toBeVisible();
  await expect(page.getByRole('heading', { name: `Rebuild ${name}` })).toBeVisible();
  expect(await saber<number>(page, 's.bot.root.position.x')).toBeLessThan(BOT_MAKER.front);
  expect(await saber(page, 's.keys.up')).toBe(false);

  // "Keep it" keeps this robot, and the builder stays shut until the robot has left and come back.
  await page.getByRole('button', { name: 'Keep it' }).click();
  await expect(sheet).toBeHidden();
  await advance(page, 1000);
  await expect(sheet).toBeHidden();
  await expect(page.locator('#station')).toContainText(`as ${name}`);
  await drive(false);
  await expect(sheet).toBeHidden();
  expect(await saber<number>(page, 's.bot.root.position.x')).toBeGreaterThan(BOT_MAKER.front);
  await drive(true);
  await expect(sheet).toBeVisible();

  // New parts: the robot is rebuilt and rolls out of the Bot Maker again, as the same guest.
  await page.locator('[data-slot=head]').getByText('Visor').click();
  await page.getByRole('button', { name: 'Roll out' }).click();
  await expect(sheet).toBeHidden();
  expect(await saber(page, 's.bot.build.head.part')).toBe('visor');
  expect(await saber<number>(page, 's.st.rollout')).toBeGreaterThan(0);
  await expect(page.locator('#station')).toContainText(`as ${name}`);
  await advance(page, 6000);
  await expect(sheet).toBeHidden();
  expect(errors).toEqual([]);
});

test('registers at the Robot Registry, logs back in on the next visit, and buys a second robot', async ({
  page,
  errors,
  request,
}, info) => {
  test.skip(info.project.name === 'ipad', 'one profile is enough');
  const sheet = page.locator('.arrival');
  await online(page);
  await page.goto('/?debug');
  await page.getByRole('button', { name: 'Play' }).click();
  await page.locator('[data-slot=head]').getByText('Stalk eye').click();
  await page.getByRole('button', { name: 'Roll out' }).click();
  await eventually(page, () => page.locator('#station').textContent()).toContain('Register at the Robot Registry');
  // Guests have no wallet.
  await expect(page.locator('#wallet')).toBeHidden();
  await advance(page, 6000);

  // Drive in through the Registry's door, next to the Bot Maker.
  await driveInto(page, ROBOT_REGISTRY);
  await expect(sheet).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Robot Registry' })).toBeVisible();

  const name = fresh('Kai');
  await page.getByLabel('Pick a username').fill(name);
  await page.getByLabel('Pick a 4-digit PIN').fill('1357');
  await page.getByLabel('PIN again').fill('1375');
  await page.getByRole('button', { name: 'Register' }).click();
  await expect(sheet.locator('.error').first()).toHaveText("The two PINs don't match.");
  await page.getByLabel('PIN again').fill('1357');
  await page.getByRole('button', { name: 'Register' }).click();
  await expect(sheet).toBeHidden();
  await eventually(page, () => page.locator('#station').textContent()).toContain(`as ${name}`);
  await expect(page.locator('#station')).not.toContainText('Register');
  // Registering opens a Cyber Crystal wallet, which starts with nothing.
  await eventually(page, () => page.locator('#wallet').textContent()).toBe('0 ◆ 00');

  // An owner grants crystals, and the HUD shows the new balance.
  const players = (await (await request.get(`${STATION}/api/owner/players`, { headers: owner })).json()) as {
    id: string;
    name: string;
  }[];
  const me = players.find((p) => p.name === name);
  expect(me).toBeTruthy();
  const granted = await request.post(`${STATION}/api/owner/players/${me?.id}/grant`, {
    headers: owner,
    data: { shards: 1245 },
  });
  expect(granted.status()).toBe(200);
  await eventually(page, () => page.locator('#wallet').textContent()).toBe('12 ◆ 45');

  // Next visit: the login form has the username filled in, and the PIN brings the same robot back.
  await page.reload();
  await expect(page.getByLabel('Username')).toHaveValue(name);
  await page.getByLabel('PIN', { exact: true }).fill('1357');
  await page.getByRole('button', { name: 'Log in' }).click();
  await eventually(page, () => page.locator('#station').textContent()).toContain(`as ${name}`);
  expect(await saber(page, 's.bot.build.head.part')).toBe('stalk');
  await eventually(page, () => page.locator('#wallet').textContent()).toBe('12 ◆ 45');

  // At the Bot Maker: a second robot costs 10 CC. Buy one, and it rolls out instead.
  await advance(page, 6000);
  await driveInto(page, BOT_MAKER);
  await expect(page.getByRole('heading', { name: 'Bot Maker' })).toBeVisible();
  await expect(sheet.locator('.robot.here')).toContainText(name);
  await page.getByRole('button', { name: '+ New robot · 10 CC' }).click();
  const second = fresh('Sprout');
  await page.getByLabel('Name').fill(second);
  await page.locator('[data-slot=head]').getByText('Visor').click();
  await page.getByRole('button', { name: 'Buy for 10 CC' }).click();
  await expect(sheet).toBeHidden();
  await eventually(page, () => page.locator('#station').textContent()).toContain(`as ${second}`);
  await eventually(page, () => page.locator('#wallet').textContent()).toBe('2 ◆ 45');
  expect(await saber(page, 's.bot.build.head.part')).toBe('visor');
  expect(await saber<number>(page, 's.st.rollout')).toBeGreaterThan(0);

  // Back in: two robots now, and the next one costs 20 CC, which isn't affordable but is on offer. Switch back.
  await advance(page, 6000);
  await driveInto(page, BOT_MAKER);
  await expect(sheet.locator('.robots .robot[data-robot]')).toHaveCount(2);
  await expect(page.getByRole('button', { name: '+ New robot · 20 CC' })).toBeVisible();
  await sheet.locator('.robot', { hasText: name }).click();
  await expect(sheet).toBeHidden();
  await eventually(page, () => page.locator('#station').textContent()).toContain(`as ${name}`);
  await eventually(page, () => saber(page, 's.bot.build.head.part')).toBe('stalk');
  expect(errors).toEqual([]);
});

test("sees another player's robot, and sends its own", async ({ page, errors }, info) => {
  test.skip(info.project.name === 'ipad', 'one profile is enough');
  await online(page);
  await page.goto('/?debug');
  await playAsGuest(page);

  // The other player is a bot: it joins over the network like a browser would, standing a few steps away.
  const bot = await new Client(STATION).join<StationView>(STATION_ROOM, {
    protocol: PROTOCOL_VERSION,
    guest: { build: classicBuild('#f4a2c8') },
  });
  try {
    const pose = POSE.map(([name]) => ({ px: 3, pz: 6, qw: 1, squashX: 1, squashY: 1, shown: 1 })[name as 'px'] ?? 0);
    bot.send(MESSAGE.pose, pose);
    await eventually(page, () =>
      page.evaluate(() => (window as unknown as { __presence: { count: number } }).__presence.count),
    ).toBe(1);

    // And this page's robot reaches the bot, where it really is. (Let it finish rolling out of the Bot Maker first.)
    await advance(page, 6000);
    const here = await saber<number[]>(page, '[s.bot.root.position.x, s.bot.root.position.z]');
    const seen = () => {
      for (const [id, p] of bot.state.players ?? [])
        if (id !== bot.sessionId) return p as unknown as Record<string, number | boolean>;
    };
    await eventually(page, async () => seen()?.shown).toBe(true);
    expect(seen()?.px).toBeCloseTo(here[0] as number, 2);
    expect(seen()?.pz).toBeCloseTo(here[1] as number, 2);

    // When the bot leaves, its robot goes too.
    await bot.leave();
    await eventually(page, () =>
      page.evaluate(() => (window as unknown as { __presence: { count: number } }).__presence.count),
    ).toBe(0);
  } finally {
    if (bot.connection.isOpen) await bot.leave();
  }
  expect(errors).toEqual([]);
});

test('stays single-player when the build has no server', async ({ page, errors }, info) => {
  test.skip(info.project.name === 'ipad', 'one profile is enough');
  await boot(page);
  await expect(page.locator('#station')).toBeHidden();
  await expect(page.locator('.arrival')).toHaveCount(0);
  expect(errors).toEqual([]);
});
