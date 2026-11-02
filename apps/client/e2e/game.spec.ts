import type { Page } from '@playwright/test';
import { CARROT_BEDS, classicBuild, type Flight, PLANETS, type Planet, RING_DOCKS } from '@saber-side/shared';
import { REAL_OFF } from '../src/render/ring/bend';
import { advance, boot, expect, hold, snap, test } from './fixtures';

/** The part of the `?debug` hook these tests use. */
interface SaberDebug {
  st: { mode: string; boardNext: unknown };
  lifts: unknown[];
  bot: { root: { visible: boolean; position: { set(x: number, y: number, z: number): unknown } } };
  ships: { state: Flight };
}

/** Just the robot's head, in the close-up. */
const HEAD = { x: 470, y: 80, width: 340, height: 260 };
/** The whole robot, in the close-up. */
const ROBOT = { x: 400, y: 70, width: 480, height: 620 };

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

test('paint cures from a sheer coat to full color, on the bent floor and in real space', async ({
  page,
  errors,
}, info) => {
  test.skip(info.project.name === 'ipad', 'one profile is enough');
  await closeUp(page);
  // biome-ignore lint/suspicious/noExplicitAny: debug hook exposed by the legacy game
  const saber = await page.evaluateHandle(() => (window as any).__saber);
  const coat = (cure: number) =>
    saber.evaluate((s, value) => {
      s.bot.coat.value = value;
    }, cure);
  // An Ocean-blue robot (shell and head painted; offline, nothing else sets its coat).
  await saber.evaluate((s, build) => s.legacy.setRobotBuild(build), classicBuild('#5d97d8'));
  await coat(0.1);
  await advance(page, 300);
  await snap(page, 'coat-10.png', ROBOT);
  await coat(0.5);
  await snap(page, 'coat-50.png', ROBOT);
  await coat(1);
  await snap(page, 'coat-100.png', ROBOT);

  // Up lift 1 into the hub, where things are drawn unbent: the coat still shows through the bend's patch.
  await coat(0.1);
  await saber.evaluate((s) => {
    s.st.boardNext = s.lifts[0];
  });
  await advance(page, 9500);
  await expect(page.locator('#where')).toHaveText('Ring Seven · Hub');
  await advance(page, 3000);
  await snap(page, 'coat-hub.png');
  expect(await saber.evaluate((s) => s.bot.coat.value)).toBe(0.1);
  expect(errors).toEqual([]);
});

test('fully cured paint is exactly the color picked, with none of the skin showing', async ({ page, errors }, info) => {
  test.skip(info.project.name === 'ipad', 'one profile is enough');
  await page.goto('/?debug');
  await advance(page, 300);
  // biome-ignore lint/suspicious/noExplicitAny: debug hook exposed by the legacy game
  const saber = await page.evaluateHandle(() => (window as any).__saber);
  await saber.evaluate((s, build) => s.legacy.setRobotBuild(build), classicBuild('#5d97d8'));
  await advance(page, 100);

  /**
   * Draws a flat panel of the robot's painted shell, face on, filling a small canvas of its own, and reads its pixels
   * back. The light is neutral: white ambient light alone (`flat`), or with a white light from straight ahead too,
   * which picks out any bump (`lit`). sRGB output with no tone mapping, so under the flat light a pixel is the albedo.
   */
  type Panel = { mean: number[]; range: number; pixels: number[] };
  const panel = (cure: number, light: 'flat' | 'lit', bare = false): Promise<Panel> =>
    saber.evaluate(
      (s, o) => {
        const THREE = s.THREE;
        let painted: { userData: { coat?: string }; clone(): unknown } | undefined;
        s.bot.root.traverse((m: { material?: { userData: { coat?: string }; clone(): unknown } }) => {
          if (!painted && m.material?.userData.coat === '#5d97d8') painted = m.material;
        });
        if (!painted) throw new Error('no painted part');
        const N = 64;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = N;
        const renderer = new THREE.WebGLRenderer({ canvas, preserveDrawingBuffer: true });
        renderer.outputEncoding = THREE.sRGBEncoding;
        const scene = new THREE.Scene();
        scene.add(new THREE.AmbientLight(0xffffff, o.light === 'flat' ? 1 : 0.4));
        if (o.light === 'lit') {
          const sun = new THREE.DirectionalLight(0xffffff, 0.6);
          sun.position.set(0, 0, 1);
          scene.add(sun);
        }
        // A copy of a coat has no patches: it's the bare skin. The coat itself is bent like the rest of the robot, so
        // that panel is parked in real space (REAL_OFF up), which the bend draws as-is, back down at the camera.
        const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), o.bare ? painted.clone() : painted);
        if (!o.bare) quad.position.y = o.real;
        quad.frustumCulled = false;
        scene.add(quad);
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
        camera.position.z = 2;
        const before = s.bot.coat.value;
        s.bot.coat.value = o.cure;
        window.__draw = true;
        renderer.render(scene, camera);
        window.__draw = false;
        s.bot.coat.value = before;
        const gl = renderer.getContext();
        const px = new Uint8Array(N * N * 4);
        gl.readPixels(0, 0, N, N, gl.RGBA, gl.UNSIGNED_BYTE, px);
        renderer.dispose();
        const pixels = [...px].filter((_, i) => i % 4 !== 3);
        const mean = [0, 1, 2].map((c) => pixels.filter((_, i) => i % 3 === c).reduce((a, b) => a + b, 0) / (N * N));
        let range = 0;
        for (let c = 0; c < 3; c++) {
          const ch = pixels.filter((_, i) => i % 3 === c);
          range = Math.max(range, Math.max(...ch) - Math.min(...ch));
        }
        return { mean, range, pixels };
      },
      { cure, light, bare, real: REAL_OFF },
    );

  // Fully cured: every pixel is the paint (0x5d, 0x97, 0xd8), with no texture, bump, or finish variation across it.
  const flat = await panel(1, 'flat');
  for (const [i, want] of [0x5d, 0x97, 0xd8].entries()) expect(Math.abs((flat.mean[i] ?? 0) - want)).toBeLessThan(2);
  expect(flat.range).toBeLessThanOrEqual(2);
  expect((await panel(1, 'lit')).range).toBeLessThanOrEqual(2);

  // Halfway: in between, with the skin still showing.
  const half = await panel(0.5, 'lit');
  expect(half.range).toBeGreaterThan(4);

  // Bare (cure 0): exactly the skin, seams and grime and bump and all.
  const skin = await panel(0, 'lit', true);
  const bare = await panel(0, 'lit');
  expect(skin.range).toBeGreaterThan(20);
  expect(Math.max(...bare.pixels.map((p, i) => Math.abs(p - (skin.pixels[i] ?? 0))))).toBeLessThanOrEqual(1);
  expect(half.range).toBeLessThan(skin.range);
  expect(errors).toEqual([]);
});

test('spinning in a carrot bed kicks carrots up, to grab and eat', async ({ page, errors }, info) => {
  test.skip(info.project.name === 'ipad', 'keyboard actions are covered on the MacBook profile');
  const bed = CARROT_BEDS[0];
  if (!bed) throw new Error('no carrot beds');
  await page.goto('/?debug');
  await page.evaluate(() => document.fonts.ready);
  await advance(page, 300);
  // biome-ignore lint/suspicious/noExplicitAny: debug hook exposed by the legacy game
  const saber = await page.evaluateHandle(() => (window as any).__saber);
  type Item = { harvested?: boolean; state: string; group: { position: { x: number; z: number } } };
  const harvested = (): Promise<{ state: string; x: number; z: number }[]> =>
    saber.evaluate((s) =>
      s.items
        .filter((it: Item) => it.harvested)
        .map((it: Item) => ({ state: it.state, x: it.group.position.x, z: it.group.position.z })),
    );
  // Into the middle of the first bed, out on the farms level with the plaza.
  await saber.evaluate(
    (s, at) => {
      s.bot.root.position.set(at.x, 0, at.z);
      s.st.yaw = -Math.PI / 2;
    },
    { x: bed.x, z: bed.z },
  );
  await advance(page, 1000);
  await expect(page.locator('#prompt')).toContainText('Spin to kick up carrots');

  // A spin kicks a few carrots up into the air, and the plants they came from start growing back.
  await hold(page, 'x', 70);
  await advance(page, 200);
  const flying = await harvested();
  expect(flying.length).toBeGreaterThanOrEqual(1);
  expect(flying.length).toBeLessThanOrEqual(3);
  expect(await saber.evaluate((s) => s.harvest.growing)).toBe(flying.length);
  await snap(page, 'harvest.png');

  // They land as loose carrots. Roll onto one, grab it (swapping the saber for it), and eat it in three bites.
  await advance(page, 1500);
  const landed = (await harvested())[0];
  if (!landed) throw new Error('no carrot landed');
  await saber.evaluate((s, at) => s.bot.root.position.set(at.x, 0, at.z + 0.8), landed);
  await advance(page, 100);
  await hold(page, 'g', 70);
  expect((await harvested()).filter((c) => c.state === 'held')).toHaveLength(1);
  for (let i = 0; i < 3; i++) {
    await hold(page, 'f', 70);
    await advance(page, 1100);
  }
  // Eaten: it's gone for good (it doesn't respawn on the table), and the rest still lie there.
  expect(await harvested()).toHaveLength(flying.length - 1);
  expect((await harvested()).every((c) => c.state === 'loose')).toBe(true);

  // The beds grow back.
  await advance(page, 41_000);
  expect(await saber.evaluate((s) => s.harvest.growing)).toBe(0);
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
