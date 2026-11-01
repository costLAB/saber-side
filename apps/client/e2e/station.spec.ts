import { Client } from '@colyseus/sdk';
import type { Page } from '@playwright/test';
import { BOT_MAKER, MESSAGE, POSE, PROTOCOL_VERSION, STATION_ROOM, type StationView } from '@saber-side/shared';
import { advance, boot, expect, test } from './fixtures';
import { STATION_PORT } from './ports';

// Coming aboard the station through the roster screen, against a real station server (started by
// playwright.config.ts). It lives for the whole run, so every robot gets a fresh name.

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

test('builds a robot from parts, rolls it out of the Bot Maker, and remembers it on the next visit', async ({
  page,
  errors,
}, info) => {
  test.skip(info.project.name === 'ipad', 'one profile is enough');
  await online(page);
  await page.goto('/?debug');
  const sheet = page.locator('.roster');
  await expect(sheet).toBeVisible();
  await expect(page.locator('#station')).toContainText('connecting');

  await page.getByRole('button', { name: '+ New robot' }).click();
  // Typing a name full of game keys (W A S D, X for spin) mustn't drive the robot around behind the sheet.
  const name = fresh('Wasdx');
  const before = await saber<number>(page, 's.bot.root.position.z');
  await page.getByLabel('Name').pressSequentially(name);
  await advance(page, 500);
  expect(await saber<number>(page, 's.bot.root.position.z')).toBe(before);
  expect(await saber<number>(page, 's.st.spin')).toBeLessThan(0);

  // Every slot starts on the classic part. Swap some, paint some, and leave the arms off.
  const slot = (name: string) => page.locator(`[data-slot=${name}]`);
  await expect(slot('mobility').locator('.chip')).toHaveText(['Single wheel']);
  await slot('body').getByText('Barrel').click();
  await slot('body').locator('label[title="Sky"]').click();
  await slot('head').getByText('Visor').click();
  await slot('arms').getByText('None').click();
  await expect(page.getByLabel('Arms paint: Sky')).toBeDisabled();
  await slot('mobility').locator('label[title="Rust"]').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Come aboard' }).click();
  await eventually(page, () => page.locator('#station').textContent()).toMatch(
    new RegExp(`online · \\d+ aboard · as ${name}`),
  );
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

  // Next visit on this device: straight aboard, no roster.
  await page.reload();
  await eventually(page, () => page.locator('#station').textContent()).toContain(`as ${name}`);
  await expect(sheet).toBeHidden();
  expect(await saber(page, 's.bot.build')).toEqual(built);
  expect(await saber<number>(page, 's.st.rollout')).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('asks for the PIN of a robot that has one', async ({ page, errors, request }, info) => {
  test.skip(info.project.name === 'ipad', 'one profile is enough');
  const name = fresh('Mia');
  const made = await request.post(`${STATION}/api/robots`, { data: { name, color: '#f4a2c8', pin: '4321' } });
  expect(made.status()).toBe(201);

  await online(page);
  await page.goto('/');
  await page.locator('.roster .robot', { hasText: name }).click();
  const pin = page.getByLabel(`${name}'s PIN`);
  await pin.fill('0000');
  await page.getByRole('dialog').getByRole('button', { name: 'Come aboard' }).click();
  await eventually(page, () => page.locator('.roster .error').textContent()).toBe('Wrong PIN.');

  await page.getByLabel(`${name}'s PIN`).fill('4321');
  await page.getByRole('dialog').getByRole('button', { name: 'Come aboard' }).click();
  await eventually(page, () => page.locator('#station').textContent()).toContain(`as ${name}`);
  // The browser logs the refused join (HTTP 401) itself; that one is expected.
  expect(errors.filter((e) => !e.includes('status of 401'))).toEqual([]);
});

test("sees another player's robot, and sends its own", async ({ page, errors, request }, info) => {
  test.skip(info.project.name === 'ipad', 'one profile is enough');
  const mine = await (
    await request.post(`${STATION}/api/robots`, { data: { name: fresh('Zed'), color: '#8fc4f2' } })
  ).json();
  const theirs = await (
    await request.post(`${STATION}/api/robots`, { data: { name: fresh('Mia'), color: '#f4a2c8' } })
  ).json();

  await online(page);
  await page.goto('/?debug');
  await page.locator('.roster .robot', { hasText: mine.name }).click();
  await eventually(page, () => page.locator('#station').textContent()).toContain(`as ${mine.name}`);

  // The other player is a bot: it joins over the network like a browser would, standing a few steps away.
  const bot = await new Client(STATION).join<StationView>(STATION_ROOM, {
    protocol: PROTOCOL_VERSION,
    robot: theirs.id,
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
  await expect(page.locator('.roster')).toHaveCount(0);
  expect(errors).toEqual([]);
});
