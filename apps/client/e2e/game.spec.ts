import type { Page } from '@playwright/test';
import { type Flight, PLANETS, type Planet, RING_DOCKS } from '@saber-side/shared';
import { advance, boot, expect, frame, hold, snap, test } from './fixtures';

/** The part of the `?debug` hook these tests use. */
interface SaberDebug {
  st: { mode: string; boardNext: unknown };
  lifts: unknown[];
  bot: { root: { visible: boolean; position: { set(x: number, y: number, z: number): unknown } } };
  ships: { state: Flight };
}

/** Just the robot's head, in the close-up. */
const HEAD = { x: 470, y: 80, width: 340, height: 260 };

/** The robot and the floor round it, after a jump and mid-spin: where the floor-effects test looks for its sprites. */
const FLOOR_EFFECTS = { x: 360, y: 200, width: 560, height: 580 };

/** Counts the green-tinged pixels in a PNG screenshot (decoded in the page, which can read PNGs). */
async function greenPixels(page: Page, png: Buffer) {
  return page.evaluate(async (b64) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
    const ctx = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d');
    if (!ctx) throw new Error('no 2D canvas');
    ctx.drawImage(bitmap, 0, 0);
    const d = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i] ?? 0;
      const g = d[i + 1] ?? 0;
      const b = d[i + 2] ?? 0;
      if (g > r + 10 && g > b + 10) n++;
    }
    return n;
  }, png.toString('base64'));
}

/** Stands the robot by the table with the carrot on it, and brings the camera in close on its face. */
async function closeUp(page: Page) {
  await page.goto('/?debug');
  await page.evaluate(() => document.fonts.ready);
  await advance(page, 300);
  // The hint and the "Pick up the carrot" prompt sit right over the face, and snap would mask them.
  await page.addStyleTag({ content: '#hint, #prompt { display: none !important; }' });
  await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: debug hook exposed by the legacy game
    const s = (window as any).__saber;
    s.bot.root.position.set(-3.1, 0, -1.6);
    s.st.yaw = Math.PI;
    s.cam.zoom = 0.95;
  });
  // A robot sitting still has the camera drift round to its front.
  await advance(page, 8000);
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

test('the Bot Maker and the Robot Registry next door', async ({ page, errors }, info) => {
  test.skip(info.project.name === 'ipad', 'one profile is enough');
  await page.goto('/?debug');
  await page.evaluate(() => document.fonts.ready);
  await advance(page, 300);
  // Stand out in the plaza, with the camera looking at the Registry's door and the Bot Maker beside it.
  await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: debug hook exposed by the legacy game
    const s = (window as any).__saber;
    s.bot.root.position.set(-13, 0, -6);
    // A robot sitting still has the camera drift round to its front (0.8 of a half turn), so it faces away.
    s.st.yaw = Math.atan2(-12, 13) - Math.PI * 0.8 + 0.28;
  });
  await advance(page, 8000);
  await snap(page, 'plaza-west.png');
  expect(errors).toEqual([]);
});

test('a shut mouth looks just like the head did before it had one', async ({ page, errors }, info) => {
  test.skip(info.project.name === 'ipad', 'one profile is enough');
  await closeUp(page);
  await snap(page, 'head-shut.png', HEAD);
  expect(errors).toEqual([]);
});

test('eating a carrot: three chomps and a gulp', async ({ page, errors }, info) => {
  test.skip(info.project.name === 'ipad', 'keyboard actions are covered on the MacBook profile');
  await closeUp(page);
  // biome-ignore lint/suspicious/noExplicitAny: debug hook exposed by the legacy game
  const saber = await page.evaluateHandle(() => (window as any).__saber);
  const carrot = () =>
    saber.evaluate((s) => {
      const it = s.items.find((i: { kind: string }) => i.kind === 'carrot');
      return { state: it.state as string, bites: it.bites as number };
    });
  const mouth = () =>
    saber.evaluate((s) => ({ jaw: s.bot.jaw.amount as number, hinge: s.bot.jaw.hinge.rotation.x as number }));

  await hold(page, 'g', 70);
  expect(await carrot()).toEqual({ state: 'held', bites: 0 });
  expect((await mouth()).jaw).toBe(0);

  // The first bite: the jaw swings wide open (about 35° on the big-eye dome), then snaps shut on the carrot.
  await page.keyboard.down('f');
  let widest = 0;
  while (widest < 1) {
    await advance(page, 33);
    widest = Math.max(widest, (await mouth()).jaw);
  }
  await page.keyboard.up('f');
  expect((await mouth()).hinge).toBeCloseTo((35 * Math.PI) / 180, 3);
  await snap(page, 'head-open.png', HEAD);
  await advance(page, 600);
  expect(await carrot()).toEqual({ state: 'held', bites: 1 });
  expect((await mouth()).jaw).toBe(0);

  // Two more: the last one is the gulp, with a nod, and the carrot is gone.
  await hold(page, 'f', 70);
  await advance(page, 600);
  expect(await carrot()).toEqual({ state: 'held', bites: 2 });
  await hold(page, 'f', 70);
  await advance(page, 300);
  expect((await carrot()).state).toBe('gone');
  let nod = 0;
  for (let i = 0; i < 12; i++) {
    await advance(page, 33);
    nod = Math.max(nod, await saber.evaluate((s) => s.eating.frame.nod as number));
  }
  expect(nod).toBeGreaterThan(0.1);
  await advance(page, 500);
  expect(await mouth()).toEqual({ jaw: 0, hinge: 0 });
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

test('dust, sparks and glows on the floor', async ({ page, errors }, info) => {
  test.skip(info.project.name === 'ipad', 'one profile is enough');
  await page.goto('/?debug');
  await page.evaluate(() => document.fonts.ready);
  await advance(page, 1000);
  await page.locator('#stage canvas').click();
  // Boost along the promenade (rolling dust), jump and land (a burst of dust), then spin (sparks off the fists).
  await page.keyboard.down('ArrowUp');
  await hold(page, 'Shift', 1200);
  await page.keyboard.press('Space');
  await advance(page, 900);
  await page.keyboard.up('ArrowUp');
  await page.keyboard.press('x');
  await advance(page, 250);
  // The eye glow, the sparks, and the dust round the robot are all sprites bent onto the ring.
  await snap(page, 'floor-effects.png');

  // They're faint enough that losing them all stays inside the screenshot tolerance, so check they draw at all: turn
  // every bent sprite pure green and count green pixels round the robot. (three.js r128 never gives sprite shaders
  // `viewMatrix`, so a bend that leans on it collapses every one of them.)
  const tinted = await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: debug hook exposed by the legacy game
    let scene = (window as any).__saber.bot.root;
    while (scene.parent) scene = scene.parent;
    let n = 0;
    // biome-ignore lint/suspicious/noExplicitAny: walking the three.js scene
    scene.traverseVisible((o: any) => {
      if (!o.isSprite || !o.material.userData.bent) return;
      o.material.color.set(0x00ff00);
      n++;
    });
    return n;
  });
  expect(tinted).toBeGreaterThan(10);
  const image = await frame(page, { clip: FLOOR_EFFECTS });
  expect(await greenPixels(page, image)).toBeGreaterThan(2000);
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
