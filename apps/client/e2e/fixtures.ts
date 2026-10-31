import { test as base, expect, type Page } from '@playwright/test';

declare global {
  interface Window {
    /** Test-only switch: WebGL draw calls are skipped unless this is true. */
    __draw?: boolean;
  }
}

/**
 * Pins everything that makes frames differ between runs:
 * - a paused fake clock (Date, timers, performance.now, requestAnimationFrame) that only moves when the test advances it
 * - a seeded Math.random
 *
 * Headless Chromium renders WebGL in software, and a full view down the ring takes seconds per frame. So the game
 * simulates every frame as usual, but WebGL draw calls are skipped except for the single frame a test captures
 * (see `snap`).
 *
 * The fixture also collects page errors so every test can assert the game never threw.
 */
export const test = base.extend<{ errors: string[] }>({
  errors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.addInitScript(() => {
      let a = 0x5eed;
      Math.random = () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      window.__draw = false;
      const draws = ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements'];
      for (const proto of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
        // biome-ignore lint/suspicious/noExplicitAny: wrapping WebGL methods by name
        const p = proto as any;
        for (const name of draws) {
          const original = p[name];
          if (typeof original !== 'function') continue;
          p[name] = function (this: unknown, ...args: unknown[]) {
            if (window.__draw) return original.apply(this, args);
          };
        }
      }
    });
    // install() alone lets fake time keep flowing in real time; pausing makes it move only when a test advances it.
    await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
    await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
    await use(errors);
  },
});

/**
 * Advances game time by `ms`, one simulated frame per 33 ms step (the game clamps each frame to 1/30 s, so this is
 * the fewest frames that still cover the full time).
 */
export async function advance(page: Page, ms: number) {
  for (let t = 0; t < ms; t += 33) await page.clock.fastForward(33);
}

/** Loads the game, waits for fonts, and lets it run for `ms` of game time. */
export async function boot(page: Page, ms = 1000) {
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  await advance(page, ms);
}

/** Holds a key for `ms` of game time. */
export async function hold(page: Page, key: string, ms: number) {
  await page.keyboard.down(key);
  await advance(page, ms);
  await page.keyboard.up(key);
}

/**
 * Renders one real frame and compares a screenshot of it with the stored baseline. This uses a single
 * `page.screenshot` rather than `toHaveScreenshot`, because the latter waits for animation frames to settle,
 * and that never happens under the frozen fake clock.
 */
export async function snap(page: Page, name: string) {
  await page.evaluate(() => {
    window.__draw = true;
  });
  await page.clock.fastForward(33);
  const image = await page.screenshot({ timeout: 60_000 });
  await page.evaluate(() => {
    window.__draw = false;
  });
  expect(image).toMatchSnapshot(name);
}

export { expect };
