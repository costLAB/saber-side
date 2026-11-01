import { type Flight, PLANETS, type Planet, RING_DOCKS } from '@saber-side/shared';
import { advance, boot, expect, hold, snap, test } from './fixtures';

/** The part of the `?debug` hook these tests use. */
interface SaberDebug {
  st: { mode: string; boardNext: unknown };
  lifts: unknown[];
  bot: { root: { visible: boolean; position: { set(x: number, y: number, z: number): unknown } } };
  ships: { state: Flight };
}

test('spawn view', async ({ page, errors }, info) => {
  await boot(page, 1500);
  await snap(page, 'spawn.png');
  // The top-left panel names where you are (and, online, shows the station status). Nothing at the top right.
  await expect(page.locator('.hud.tl')).toHaveText('Ring Seven');
  await expect(page.locator('h1, #spec, #aliens')).toHaveCount(0);
  await expect(page.locator('.hud.tr, #reset')).toHaveCount(0);
  if (info.project.name === 'macbook') await expect(page.locator('#keysbox .keys')).toBeVisible();
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
    ['ArrowDown', 500],
  ];
  for (const [key, ms] of steps) {
    await hold(page, key, ms);
    await advance(page, 100);
  }
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

test('flying a ship out of the hub, to a planet and back', async ({ page, errors }, info) => {
  test.skip(info.project.name === 'ipad', 'keyboard flying is covered on the MacBook profile');
  await page.goto('/?debug');
  await page.evaluate(() => document.fonts.ready);
  await advance(page, 300);
  const saber = await page.evaluateHandle(() => (window as unknown as { __saber: SaberDebug }).__saber);
  const where = page.locator('#where');
  const settled = () => expect(page.locator('#flash')).toHaveCSS('opacity', '0');

  // up lift 1 to the hub, then over to the first ship
  await saber.evaluate((s) => {
    s.st.boardNext = s.lifts[0];
  });
  await advance(page, 9500);
  await expect(where).toHaveText('Ring Seven · Hub');
  await saber.evaluate((s) => s.bot.root.position.set(12, 5, 0));
  await advance(page, 100);
  await expect(page.locator('#prompt')).toContainText('Board the ship');

  // board it and launch through the airlock
  await hold(page, 'g', 70);
  await expect(where).toHaveText('Ring Seven · Airlock');
  await advance(page, 1300);
  await snap(page, 'launch.png');
  await advance(page, 1700);
  await expect(where).toHaveText('Space');
  await advance(page, 1000);
  await settled();
  await snap(page, 'space.png');

  // fly into Earth
  await saber.evaluate((s, earth) => {
    const ship = s.ships.state.ship;
    ship.pos.set(earth.pos.x - earth.r - 150, earth.pos.y, earth.pos.z);
    ship.yaw = Math.PI / 2;
    ship.pitch = 0;
  }, PLANETS[0] as Planet);
  await advance(page, 2000);
  await expect(where).toHaveText('Earth');
  await settled();
  await snap(page, 'planet.png');

  // swoop at an alien and zap it
  await saber.evaluate((s) => {
    const f = s.ships.state;
    const alien = f.aliens.get('EARTH')?.find((a) => a.alive);
    if (!alien) throw new Error('no aliens on Earth');
    const hit = { x: alien.pos.x, y: alien.pos.y + 3.3, z: alien.pos.z };
    f.ship.pos.set(hit.x, hit.y + 20, hit.z - 22);
    f.ship.yaw = 0;
    f.ship.pitch = Math.atan2(-20, 22);
  });
  await hold(page, 'f', 600);
  expect(await saber.evaluate((s) => s.ships.state.zapped)).toBeGreaterThan(0);

  // climb out to space, then fly into the ring's dock
  await saber.evaluate((s) => {
    s.ships.state.ship.pos.y = 600;
  });
  await advance(page, 1000);
  await expect(where).toHaveText('Space');
  await saber.evaluate((s, dockX) => {
    const f = s.ships.state;
    f.dockCooldown = 0;
    f.ship.pos.set(dockX + 40, 0, 0);
    f.ship.yaw = -Math.PI / 2;
    f.ship.pitch = 0;
  }, RING_DOCKS[0]?.x ?? 0);
  await advance(page, 1500);
  await expect(where).toHaveText('Ring Seven · Hub');
  expect(await saber.evaluate((s) => [s.st.mode, s.bot.root.visible, s.ships.state.phase])).toEqual([
    'hub',
    true,
    'docked',
  ]);
  expect(errors).toEqual([]);
});
