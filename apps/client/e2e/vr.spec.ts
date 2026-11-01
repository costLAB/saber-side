import { createRequire } from 'node:module';
import type { Page } from '@playwright/test';
import { advance, expect, test } from './fixtures';

// VR on a Meta Quest, through IWER (Meta's WebXR emulation runtime): it stands in for a Quest 3 and its controllers,
// so the session, the rig, and the controls run in headless Chromium. It can't tell us how it feels or how fast it
// runs on a real headset; the manual checklist in docs/initiatives/quest-vr.md covers that.

const iwer = createRequire(import.meta.url).resolve('iwer/build/iwer.min.js');

/** Puts an emulated Quest 3 in the page before the game loads, as `window.__quest`. */
async function withQuest(page: Page) {
  await page.addInitScript({ path: iwer });
  await page.addInitScript(() => {
    // biome-ignore lint/suspicious/noExplicitAny: IWER's UMD build, loaded just above
    const IWER = (window as any).IWER;
    const quest = new IWER.XRDevice(IWER.metaQuest3);
    // Chromium has a WebXR runtime of its own (with no headset), so the emulated one has to replace it
    quest.installRuntime({ forceInstall: true });
    // biome-ignore lint/suspicious/noExplicitAny: test hook
    (window as any).__quest = quest;
  });
}

/** Loads the game with the debug hook and lets it settle. */
async function bootDebug(page: Page) {
  await page.goto('/?debug');
  await page.evaluate(() => document.fonts.ready);
  await advance(page, 1000);
}

/** Taps Enter VR and waits for the headset's session to start. */
async function enterVr(page: Page) {
  const button = page.locator('#enter-vr');
  await expect(button).toBeVisible();
  await button.click();
  await expect
    .poll(async () => {
      await advance(page, 33);
      // biome-ignore lint/suspicious/noExplicitAny: debug hook exposed by the legacy game
      return page.evaluate(() => (window as any).__saber.vr.presenting);
    })
    .toBe(true);
  // a few headset frames, so the rig has measured the player
  await advance(page, 300);
}

/** What the tests read back from the game and the headset. */
function readState(page: Page) {
  return page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: debug hook exposed by the legacy game
    const { st, bot, vr } = (window as any).__saber;
    const R = 315 * (3.35 / 4); // R_IN: the floor's radius (shared/ring-space.ts)
    const p = bot.root.position;
    // where the robot's eye line is drawn: straight above its wheel at the eye's height (the view stays on the robot's
    // center line, so turning the robot doesn't swing it round), bent onto the ring the way the shader does it
    const eyeHeight = bot.root.worldToLocal((bot.eyeCore ?? bot.head).getWorldPosition(p.clone())).y;
    const th = -p.z / R;
    const r = R - (st.y + eyeHeight);
    const drawn = { x: p.x, y: -r * Math.cos(th), z: -r * Math.sin(th) };
    const e = vr.debug.camera.matrixWorld.elements;
    // which way the headset looks, against the way the robot faces on the bent floor
    const f = Math.hypot(e[8], e[9], e[10]);
    const tz = -p.z / R;
    const fx = Math.sin(st.yaw);
    const fy = -Math.cos(st.yaw) * Math.sin(tz);
    const fz = Math.cos(st.yaw) * Math.cos(tz);
    const lookDot = -(e[8] * fx + e[9] * fy + e[10] * fz) / f;
    return {
      lookDot,
      mode: st.mode as string,
      yaw: st.yaw as number,
      y: st.y as number,
      robot: { x: p.x as number, z: p.z as number },
      view: vr.debug.view as number,
      scale: vr.debug.scale as number,
      eyeGap: Math.hypot(e[12] - drawn.x, e[13] - drawn.y, e[14] - drawn.z),
      presenting: vr.presenting as boolean,
    };
  });
}

/** Pushes a controller's thumbstick (x right, y down), or lets it go with (0, 0). */
function stick(page: Page, hand: 'left' | 'right', x: number, y: number) {
  return page.evaluate(
    // biome-ignore lint/suspicious/noExplicitAny: IWER test hook
    ([h, sx, sy]) => (window as any).__quest.controllers[h as string].updateAxes('thumbstick', sx, sy),
    [hand, x, y] as const,
  );
}

/** Presses or releases a controller button ('a-button', 'squeeze', 'trigger', ...). */
function button(page: Page, hand: 'left' | 'right', id: string, value: number) {
  return page.evaluate(
    // biome-ignore lint/suspicious/noExplicitAny: IWER test hook
    ([h, b, v]) => (window as any).__quest.controllers[h as string].updateButtonValue(b, v),
    [hand, id, value] as const,
  );
}

test('the Enter VR button stays hidden without a headset', async ({ page, errors }, info) => {
  test.skip(info.project.name === 'ipad', 'one profile is enough');
  await bootDebug(page);
  await expect(page.locator('#enter-vr')).toBeHidden();
  expect(errors).toEqual([]);
});

test('a Quest player sees through the robot eye and drives with the controllers', async ({ page, errors }, info) => {
  test.skip(info.project.name === 'ipad', 'one profile is enough');
  await withQuest(page);
  await bootDebug(page);
  await enterVr(page);

  // first person: the headset is at the robot's eye, bent onto the ring, and scaled to the robot's height
  const start = await readState(page);
  expect(start.mode).toBe('floor');
  expect(start.scale).toBeGreaterThan(1);
  expect(start.eyeGap).toBeLessThan(0.25);
  // looking straight ahead in the room looks the way the robot faces, level with the floor under it
  expect(start.lookDot).toBeGreaterThan(0.99);

  // the left stick pushed forward drives where you're looking (straight ahead: the way the robot faced)
  await stick(page, 'left', 0, -1);
  await advance(page, 1200);
  await stick(page, 'left', 0, 0);
  await advance(page, 600);
  const driven = await readState(page);
  const along =
    (driven.robot.x - start.robot.x) * Math.sin(start.yaw) + (driven.robot.z - start.robot.z) * Math.cos(start.yaw);
  expect(along).toBeGreaterThan(3);
  // and the view rode along with it, still level with the floor where it is now
  expect(driven.eyeGap).toBeLessThan(0.25);
  expect(driven.lookDot).toBeGreaterThan(0.99);

  // the right stick snap-turns the view a quarter of the way round to the right, once per push
  await stick(page, 'right', 1, 0);
  await advance(page, 300);
  await stick(page, 'right', 0, 0);
  await advance(page, 100);
  const turned = await readState(page);
  const snapped = Math.atan2(Math.sin(turned.view - driven.view), Math.cos(turned.view - driven.view));
  expect(snapped).toBeCloseTo(-Math.PI / 4, 3);

  // A jumps, through the same action the space bar presses
  await button(page, 'right', 'a-button', 1);
  await advance(page, 200);
  const jumped = await readState(page);
  await button(page, 'right', 'a-button', 0);
  expect(jumped.y).toBeGreaterThan(0.3);
  await advance(page, 1200);

  // grip and trigger run without trouble (pick up, use)
  for (const id of ['squeeze', 'trigger', 'squeeze']) {
    await button(page, 'right', id, 1);
    await advance(page, 100);
    await button(page, 'right', id, 0);
    await advance(page, 100);
  }

  // leaving VR goes back to the flat game
  await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: debug hook exposed by the legacy game
    (window as any).__saber.vr.leave();
  });
  await expect
    .poll(async () => {
      await advance(page, 33);
      return (await readState(page)).presenting;
    })
    .toBe(false);
  await advance(page, 300);
  expect(errors).toEqual([]);
});
