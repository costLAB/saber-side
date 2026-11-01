import type { Page } from '@playwright/test';
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

test('makes a robot, comes aboard in its paint, and is remembered on the next visit', async ({
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

  await page.locator('label[title="Sky"]').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Come aboard' }).click();
  await eventually(page, () => page.locator('#station').textContent()).toMatch(
    new RegExp(`online · \\d+ aboard · as ${name}`),
  );
  await expect(sheet).toBeHidden();
  expect(await saber<string>(page, 's.paint()')).toBe('#8fc4f2');

  // Next visit on this device: straight aboard, no roster.
  await page.reload();
  await eventually(page, () => page.locator('#station').textContent()).toContain(`as ${name}`);
  await expect(sheet).toBeHidden();
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

test('stays single-player when the build has no server', async ({ page, errors }, info) => {
  test.skip(info.project.name === 'ipad', 'one profile is enough');
  await boot(page);
  await expect(page.locator('#station')).toBeHidden();
  await expect(page.locator('.roster')).toHaveCount(0);
  expect(errors).toEqual([]);
});
