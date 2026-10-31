import { advance, boot, expect, hold, snap, test } from './fixtures';

test('spawn view', async ({ page, errors }) => {
  await boot(page, 1500);
  await snap(page, 'spawn.png');
  expect(errors).toEqual([]);
});

test('rolling and turning', async ({ page, errors }, info) => {
  test.skip(info.project.name === 'ipad', 'keyboard driving is covered on the MacBook profile');
  await boot(page);
  await page.locator('#stage canvas').click();
  await hold(page, 'ArrowUp', 2000);
  await hold(page, 'ArrowLeft', 700);
  await advance(page, 1500);
  await snap(page, 'rolled.png');
  expect(errors).toEqual([]);
});

test('every action runs without errors', async ({ page, errors }, info) => {
  test.skip(info.project.name === 'ipad', 'keyboard actions are covered on the MacBook profile');
  await boot(page);
  await page.locator('#stage canvas').click();
  const steps: [string, number][] = [
    ['ArrowUp', 800],
    ['Shift', 50],
    ['ArrowRight', 300],
    ['x', 100],
    ['Space', 100],
    ['g', 70],
    ['f', 70],
    ['f', 70],
    ['g', 70],
    ['q', 200],
    ['e', 200],
    ['Minus', 100],
    ['Equal', 100],
    ['c', 70],
    ['r', 70],
    ['ArrowDown', 500],
  ];
  for (const [key, ms] of steps) {
    await hold(page, key, ms);
    await advance(page, 100);
  }
  await expect(page.locator('#score')).toContainText('/');
  expect(errors).toEqual([]);
});

test('touch controls on iPad', async ({ page, errors }, info) => {
  test.skip(info.project.name !== 'ipad', 'touch layout only');
  await boot(page, 1500);
  await expect(page.locator('#touch')).toBeVisible();
  const forward = page.locator('#touch [data-k="up"]');
  const box = await forward.boundingBox();
  if (!box) throw new Error('forward button not laid out');
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await advance(page, 1000);
  await snap(page, 'touch.png');
  expect(errors).toEqual([]);
});

test('simulation is deterministic', async ({ page, errors }, info) => {
  test.skip(info.project.name === 'ipad', 'one profile is enough');
  const run = async () => {
    await page.goto('/?debug');
    await page.evaluate(() => document.fonts.ready);
    await advance(page, 500);
    await hold(page, 'ArrowUp', 1500);
    await hold(page, 'ArrowLeft', 500);
    await hold(page, 'x', 100);
    await advance(page, 800);
    return page.evaluate(() => {
      // biome-ignore lint/suspicious/noExplicitAny: debug hook exposed by the legacy game
      const s = (window as any).__saber;
      const p = s.bot.root.position;
      const c = s.camera.position;
      return [s.clock.elapsedTime, p.x, p.y, p.z, s.st.yaw, s.st.vel, c.x, c.y, c.z];
    });
  };
  const first = await run();
  const second = await run();
  expect(second).toEqual(first);
  expect(first[3]).toBeGreaterThan(5); // it actually rolled forward
  expect(errors).toEqual([]);
});
