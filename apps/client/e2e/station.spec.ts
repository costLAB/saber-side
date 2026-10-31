import { advance, boot, expect, test } from './fixtures';
import { STATION_PORT } from './ports';

// The HUD's station line, driven by a real station server (started by playwright.config.ts).

test('comes aboard the station when the build has a server', async ({ page, errors }, info) => {
  test.skip(info.project.name === 'ipad', 'one profile is enough');
  await page.addInitScript((url) => {
    window.SABER_SERVER = url;
  }, `http://localhost:${STATION_PORT}`);
  await page.goto('/');
  const status = page.locator('#station');
  // Matchmaking and the socket are real network traffic, so this waits in real time while the paused game clock
  // ticks along a frame at a time.
  await expect
    .poll(
      async () => {
        await advance(page, 33);
        return status.textContent();
      },
      { timeout: 30_000 },
    )
    .toBe('Station · online · 1 aboard');
  await expect(status).toHaveAttribute('data-state', 'aboard');
  expect(errors).toEqual([]);
});

test('stays single-player when the build has no server', async ({ page, errors }, info) => {
  test.skip(info.project.name === 'ipad', 'one profile is enough');
  await boot(page);
  await expect(page.locator('#station')).toBeHidden();
  expect(errors).toEqual([]);
});
