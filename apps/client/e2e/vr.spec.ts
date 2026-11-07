import { createRequire } from 'node:module';
import type { Page } from '@playwright/test';
import { ARM_LOCO } from '@saber-side/shared';
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
async function bootDebug(page: Page, query = '') {
  await page.goto(`/?debug${query}`);
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

/** Where a controller (or tracked hand) is, in the room (meters). */
function place(page: Page, hand: 'left' | 'right', at: XYZ, turn?: { x: number; y: number; z: number; w: number }) {
  return page.evaluate(
    ([h, p, q]) => {
      // biome-ignore lint/suspicious/noExplicitAny: IWER test hook
      const quest = (window as any).__quest;
      const input = quest.primaryInputMode === 'hand' ? quest.hands[h as string] : quest.controllers[h as string];
      input.position.set(p.x, p.y, p.z);
      if (q) input.quaternion.set(q.x, q.y, q.z, q.w);
    },
    [hand, at, turn ?? null] as const,
  );
}

interface XYZ {
  x: number;
  y: number;
  z: number;
}

/**
 * Where your hand goes in the room for the robot's long arm to reach a point: in the robot's world (`toPlay` first),
 * or already in the room.
 */
function handFor(page: Page, p: XYZ, from: 'world' | 'room' = 'world') {
  return page.evaluate(
    ([q, f]) => {
      // biome-ignore lint/suspicious/noExplicitAny: debug hook exposed by the legacy game
      const { vr } = (window as any).__saber;
      return vr.debug.handFor(f === 'world' ? vr.debug.toPlay(q) : q) as XYZ;
    },
    [p, from] as const,
  );
}

/** A point beside the robot (in its core's frame, scene units), and where your hand goes for its hand to reach it. */
function besideRobot(page: Page, local: XYZ) {
  return page.evaluate((p) => {
    // biome-ignore lint/suspicious/noExplicitAny: debug hook exposed by the legacy game
    const { bot, vr } = (window as any).__saber;
    bot.root.updateMatrixWorld(true);
    const world = bot.core.localToWorld(bot.core.position.clone().set(p.x, p.y, p.z));
    return { world: { x: world.x, y: world.y, z: world.z }, room: vr.debug.handFor(vr.debug.toPlay(world)) as XYZ };
  }, local);
}

/** The robot's arms and head as drawn (and as friends are sent them), and where its hands' grips are. */
function readBody(page: Page) {
  return page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: debug hook exposed by the legacy game
    const { bot, vr } = (window as any).__saber;
    bot.root.updateMatrixWorld(true);
    // biome-ignore lint/suspicious/noExplicitAny: three.js objects from the page
    const grips = bot.arms.map((a: any) => {
      const p = a.wrist.localToWorld(bot.grip.position.clone());
      return { x: p.x, y: p.y, z: p.z };
    });
    return {
      // biome-ignore lint/suspicious/noExplicitAny: three.js objects from the page
      arms: bot.arms.map((a: any) => ({ ...a.cur })) as Record<string, number>[],
      grips: grips as XYZ[],
      /** How far each of the robot's grips is from where its long arm should put it, in the room (meters). */
      misses: grips.map((g: XYZ, i: number) => {
        const r = vr.debug.toPlay(g);
        const h = vr.debug.hands[i].reach;
        return Math.hypot(r.x - h.x, r.y - h.y, r.z - h.z);
      }) as number[],
      head: { x: bot.head.rotation.x, y: bot.head.rotation.y } as { x: number; y: number },
      // biome-ignore lint/suspicious/noExplicitAny: debug hook
      tracked: vr.debug.hands.map((h: any) => h.tracked) as boolean[],
      pulses: [...vr.debug.pulses] as string[],
    };
  });
}

/** One of the items on the weapon table (and in the robot's hand): where it is, and its state. */
function readItem(page: Page, name: string) {
  return page.evaluate((n) => {
    // biome-ignore lint/suspicious/noExplicitAny: debug hook exposed by the legacy game
    const { items, bot } = (window as any).__saber;
    // biome-ignore lint/suspicious/noExplicitAny: legacy item
    const it = items.find((i: any) => i.name === n);
    const p = it.group.getWorldPosition(it.group.position.clone());
    const hand =
      it.group.parent === bot.grip ? bot.arms.findIndex((a: { wrist: unknown }) => a.wrist === bot.grip.parent) : -1;
    return {
      at: { x: p.x, y: p.y, z: p.z } as XYZ,
      state: it.state as string,
      /** Which of the robot's arms holds it (0 left, 1 right), or -1. */
      hand,
      target: (it.target ?? 0) as number,
      bites: (it.bites ?? 0) as number,
    };
  }, name);
}

/** Parks the robot in front of the weapon table, facing it, before entering VR (so the view faces it too). */
async function parkAtTable(page: Page) {
  await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: debug hook exposed by the legacy game
    const { st, bot } = (window as any).__saber;
    // the table is at x = -4, z = -3 (1.2 deep): stand 1.45 in front of it, facing -z
    bot.root.position.set(-4.5, 0, -1.45);
    st.yaw = Math.PI;
    st.vel = 0;
  });
  await advance(page, 300);
}

const gap = (a: XYZ, b: XYZ) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** How long each of the robot's arms is, against how it was built (as friends are sent it). */
function armReach(page: Page) {
  return page.evaluate(
    () =>
      // biome-ignore lint/suspicious/noExplicitAny: debug hook exposed by the legacy game
      (window as any).__saber.bot.arms.map((a: { reach: number }) => a.reach) as number[],
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

  // as in Gorilla Tag, your arms are the only way to get about: the left stick doesn't drive
  await stick(page, 'left', 0, -1);
  await advance(page, 600);
  await stick(page, 'left', 0, 0);
  await advance(page, 100);
  const still = await readState(page);
  expect(Math.hypot(still.robot.x - start.robot.x, still.robot.z - start.robot.z)).toBeLessThan(0.01);

  // with arm walking turned off, the left stick pushed forward drives where you're looking (straight ahead: the way
  // the robot faced)
  await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: debug hook exposed by the legacy game
    (window as any).__saber.vr.debug.comfort.armWalking = false;
  });
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

test('a Quest player’s hands move the robot’s arms, and the headset turns its head', async ({ page, errors }, info) => {
  test.skip(info.project.name === 'ipad', 'one profile is enough');
  await withQuest(page);
  await bootDebug(page);
  await enterVr(page);
  const before = await readBody(page);
  expect(before.tracked).toEqual([true, true]);
  // in VR the robot's arms are long, and friends are sent how long
  expect(await armReach(page)).toEqual([ARM_LOCO.armLength, ARM_LOCO.armLength]);

  // the right controller out in front of the robot's right shoulder (its right is -x), at chest height
  const ahead = await besideRobot(page, { x: -0.6, y: 0.1, z: 0.75 });
  await place(page, 'right', ahead.room);
  await advance(page, 200);
  const reached = await readBody(page);
  // the robot's right hand is at yours (its grip sits a couple of centimeters toward its palm), and its arm swung forward (sw went down) to get it there
  expect(reached.misses[1]).toBeLessThan(0.05);
  expect(gap(reached.grips[1] as XYZ, ahead.world)).toBeLessThan(0.3);
  expect(reached.arms[1]?.sw).toBeLessThan((before.arms[1]?.sw ?? 0) - 0.2);

  // up high, out to the side: the hand follows
  const high = await besideRobot(page, { x: -1.4, y: 0.9, z: 0.3 });
  await place(page, 'right', high.room);
  await advance(page, 200);
  const raised = await readBody(page);
  expect(raised.misses[1]).toBeLessThan(0.05);
  expect(gap(raised.grips[1] as XYZ, high.world)).toBeLessThan(0.3);
  expect(raised.arms[1]?.ab).toBeGreaterThan(1);

  // far out of reach: the arm stretches toward it, and the hand gets as near as it can
  const far = await besideRobot(page, { x: -0.93, y: 0.22, z: 4 });
  await place(page, 'right', far.room);
  await advance(page, 200);
  const stretched = await readBody(page);
  const shoulder = await besideRobot(page, { x: -0.93, y: 0.22, z: 0.03 });
  expect(gap(stretched.grips[1] as XYZ, far.world)).toBeLessThan(gap(shoulder.world, far.world) - 1.1);

  // the left hand drives the left arm the same way, mirrored
  const left = await besideRobot(page, { x: 0.6, y: 0.1, z: 0.75 });
  await place(page, 'left', left.room);
  await advance(page, 200);
  const both = await readBody(page);
  expect(both.misses[0]).toBeLessThan(0.05);
  expect(gap(both.grips[0] as XYZ, left.world)).toBeLessThan(0.3);

  // turning your head to the left turns the robot's head left (a positive y turn), and looking down tilts it down
  await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: IWER test hook
    const quest = (window as any).__quest;
    const a = 0.5;
    const b = 0.3;
    // yaw left by a, then pitch down by b (YXZ)
    const cy = Math.cos(a / 2);
    const sy = Math.sin(a / 2);
    const cx = Math.cos(-b / 2);
    const sx = Math.sin(-b / 2);
    quest.quaternion.set(sx * cy, sy * cx, -sx * sy, cx * cy);
  });
  await advance(page, 200);
  const looked = await readBody(page);
  expect(looked.head.y).toBeCloseTo(0.5, 1);
  expect(looked.head.x).toBeCloseTo(0.3, 1);
  expect(errors).toEqual([]);
});

/**
 * Counts how often each part of the robot gets drawn from here on: its wheel, body, and head (everything on its core
 * but the arms), and its arms. Culling is turned off on the counted meshes, so a part counts whenever it's visible.
 */
function countDraws(page: Page) {
  return page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: debug hook exposed by the legacy game
    const { bot } = (window as any).__saber;
    // biome-ignore lint/suspicious/noExplicitAny: debug hook
    const w = window as any;
    w.__drawn = { body: 0, arms: 0 };
    // biome-ignore lint/suspicious/noExplicitAny: three.js objects from the page
    const shoulders = new Set(bot.arms.map((a: any) => a.shoulder));
    // biome-ignore lint/suspicious/noExplicitAny: three.js objects from the page
    for (const part of bot.core.children as any[]) {
      if (part === bot.grip) continue;
      const key = shoulders.has(part) ? 'arms' : 'body';
      // biome-ignore lint/suspicious/noExplicitAny: three.js objects from the page
      part.traverse((o: any) => {
        if (!o.isMesh) return;
        o.frustumCulled = false;
        o.onBeforeRender = () => {
          w.__drawn[key]++;
        };
      });
    }
  });
}

function drawn(page: Page) {
  // biome-ignore lint/suspicious/noExplicitAny: debug hook
  return page.evaluate(() => ({ ...(window as any).__drawn }) as { body: number; arms: number });
}

test('in VR you see only your robot’s arms, and the whole robot is still there for everyone else', async ({
  page,
  errors,
}, info) => {
  test.skip(info.project.name === 'ipad', 'one profile is enough');
  await withQuest(page);
  await bootDebug(page);
  await countDraws(page);
  await advance(page, 100);
  // flat, the chase camera draws the whole robot
  const flat = await drawn(page);
  expect(flat.body).toBeGreaterThan(0);
  expect(flat.arms).toBeGreaterThan(0);

  await enterVr(page);
  await countDraws(page);
  await advance(page, 200);
  // in the headset, the arms are drawn and the head, body, and wheel aren't
  const inVr = await drawn(page);
  expect(inVr.arms).toBeGreaterThan(0);
  expect(inVr.body).toBe(0);
  // between frames every part is visible again, so the pose friends are sent (and the Selfie) is the whole robot
  const hidden = await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: debug hook exposed by the legacy game
    const { bot } = (window as any).__saber;
    let n = 0;
    // biome-ignore lint/suspicious/noExplicitAny: three.js objects from the page
    for (const part of bot.core.children as any[]) if (!part.visible) n++;
    return n;
  });
  expect(hidden).toBe(0);

  // leaving VR draws the whole robot again
  await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: debug hook exposed by the legacy game
    (window as any).__saber.vr.leave();
  });
  await expect
    .poll(async () => {
      await advance(page, 33);
      // biome-ignore lint/suspicious/noExplicitAny: debug hook exposed by the legacy game
      return page.evaluate(() => (window as any).__saber.vr.presenting);
    })
    .toBe(false);
  await countDraws(page);
  await advance(page, 100);
  expect((await drawn(page)).body).toBeGreaterThan(0);
  // and the arms are as built again
  expect(await armReach(page)).toEqual([1, 1]);
  expect(errors).toEqual([]);
});

/** The Selfie's mini-me: open or not, its turn and tilt, where it floats, and whether it's drawn. */
function readMini(page: Page) {
  return page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: debug hook exposed by the legacy game
    const { vr, bot, items } = (window as any).__saber;
    const mini = vr.debug.mini;
    const r = mini.robot;
    const head = vr.debug.camera.position;
    return {
      open: mini.open as boolean,
      selfieOpen: vr.selfieOpen as boolean,
      turn: mini.orbit.turn as number,
      tilt: mini.orbit.tilt as number,
      at: { x: mini.at.x, y: mini.at.y, z: mini.at.z } as XYZ,
      /** How far in front of your eyes it floats (meters). */
      ahead: Math.hypot(mini.at.x - head.x, mini.at.z - head.z),
      shown: !!r && r.root.visible && r.root.parent !== null,
      /** Its left arm's shoulder turn, against your robot's. */
      arm: r ? [r.arms[0].shoulder.quaternion.angleTo(bot.arms[0].shoulder.quaternion)] : [],
      view: vr.debug.view as number,
      // biome-ignore lint/suspicious/noExplicitAny: legacy item
      held: items.filter((i: any) => i.group.parent === bot.grip).length as number,
    };
  });
}

test('Selfie in VR opens a mini-me that the stick and a hand turn', async ({ page, errors }, info) => {
  test.skip(info.project.name === 'ipad', 'one profile is enough');
  await withQuest(page);
  await bootDebug(page);
  await parkAtTable(page);
  await enterVr(page);
  expect((await readMini(page)).open).toBe(false);

  // pressing the right stick in opens it, half a meter in front of your eyes, posed like your robot
  await button(page, 'right', 'thumbstick', 1);
  await advance(page, 100);
  await button(page, 'right', 'thumbstick', 0);
  await advance(page, 100);
  const open = await readMini(page);
  expect(open.open).toBe(true);
  expect(open.selfieOpen).toBe(true);
  expect(open.shown).toBe(true);
  expect(open.ahead).toBeCloseTo(0.5, 1);
  expect(open.arm[0]).toBeLessThan(1e-3);

  // the right stick spins it, and doesn't snap-turn your view
  await stick(page, 'right', 1, 0);
  await advance(page, 500);
  await stick(page, 'right', 0, 0);
  await advance(page, 100);
  const spun = await readMini(page);
  expect(spun.turn).toBeGreaterThan(open.turn + 0.5);
  expect(spun.view).toBeCloseTo(open.view, 5);

  // a hand gripping it turns it with the hand, and the grip doesn't reach the game: the robot keeps the saber it
  // holds in its left hand (gripping thin air with the hand that holds it would drop it)
  const onMini = await handFor(page, open.at, 'room');
  await place(page, 'left', onMini);
  await advance(page, 100);
  const holding = (await readMini(page)).held;
  expect(holding).toBe(1);
  await button(page, 'left', 'squeeze', 1);
  await advance(page, 100);
  // turn the hand a quarter turn to the left
  const a = Math.PI / 4;
  await place(page, 'left', onMini, { x: 0, y: Math.sin(a), z: 0, w: Math.cos(a) });
  await advance(page, 100);
  const twisted = await readMini(page);
  expect(twisted.turn - spun.turn).toBeCloseTo(Math.PI / 2, 1);
  await button(page, 'left', 'squeeze', 0);
  await advance(page, 100);
  expect((await readMini(page)).held).toBe(holding);

  // pressing the right stick in again puts it away
  await button(page, 'right', 'thumbstick', 1);
  await advance(page, 100);
  await button(page, 'right', 'thumbstick', 0);
  await advance(page, 100);
  const shut = await readMini(page);
  expect(shut.open).toBe(false);
  expect(shut.shown).toBe(false);
  expect(errors).toEqual([]);
});

test('grip near the saber picks it up in that hand, and the trigger switches it off and on', async ({
  page,
  errors,
}, info) => {
  test.skip(info.project.name === 'ipad', 'one profile is enough');
  await withQuest(page);
  await bootDebug(page);
  await parkAtTable(page);
  await enterVr(page);

  const saber = await readItem(page, 'blue saber');
  expect(saber.state).toBe('loose');
  // reach for it with the right hand and squeeze
  const room = await handFor(page, saber.at);
  await place(page, 'right', room);
  await advance(page, 200);
  await button(page, 'right', 'squeeze', 1);
  await advance(page, 100);
  await button(page, 'right', 'squeeze', 0);
  await advance(page, 200);
  const held = await readItem(page, 'blue saber');
  expect(held.state).toBe('held');
  expect(held.hand).toBe(1);
  // it lights up in your hand (as it does when G picks it up), with a buzz for picking it up and a hum while lit
  expect(held.target).toBe(1);
  const body = await readBody(page);
  expect(body.pulses).toContain('right:pickUp');
  expect(body.pulses).toContain('right:saberHum');
  // it sits in the robot's hand, which is as near your hand as its arm reaches
  expect(gap(held.at, body.grips[1] as XYZ)).toBeLessThan(0.05);

  // the trigger switches it off, and on again
  await button(page, 'right', 'trigger', 1);
  await advance(page, 100);
  await button(page, 'right', 'trigger', 0);
  await advance(page, 100);
  expect((await readItem(page, 'blue saber')).target).toBe(0);
  await button(page, 'right', 'trigger', 1);
  await advance(page, 100);
  await button(page, 'right', 'trigger', 0);
  await advance(page, 100);
  expect((await readItem(page, 'blue saber')).target).toBe(1);

  // an empty left hand gripping thin air doesn't make the right hand let go
  await button(page, 'left', 'squeeze', 1);
  await advance(page, 100);
  await button(page, 'left', 'squeeze', 0);
  await advance(page, 100);
  expect((await readItem(page, 'blue saber')).state).toBe('held');

  // gripping again with the right hand, away from the table, drops it
  const away = await besideRobot(page, { x: -1.2, y: -0.3, z: 0.3 });
  await place(page, 'right', away.room);
  await advance(page, 200);
  await button(page, 'right', 'squeeze', 1);
  await advance(page, 100);
  await button(page, 'right', 'squeeze', 0);
  await advance(page, 100);
  expect((await readItem(page, 'blue saber')).state).toBe('loose');
  expect((await readBody(page)).pulses).toContain('right:drop');
  expect(errors).toEqual([]);
});

test('a carrot brought up to your mouth gets eaten, and a blaster kicks', async ({ page, errors }, info) => {
  test.skip(info.project.name === 'ipad', 'one profile is enough');
  await withQuest(page);
  await bootDebug(page);
  await parkAtTable(page);
  await enterVr(page);
  const toRoom = (p: XYZ) => handFor(page, p);
  const squeeze = async (hand: 'left' | 'right') => {
    await button(page, hand, 'squeeze', 1);
    await advance(page, 100);
    await button(page, hand, 'squeeze', 0);
    await advance(page, 100);
  };

  // the right hand picks up the blaster; holding the trigger fires, and each shot kicks
  const blaster = await readItem(page, 'blaster');
  await place(page, 'right', await toRoom(blaster.at));
  await advance(page, 200);
  await squeeze('right');
  expect((await readItem(page, 'blaster')).hand).toBe(1);
  await button(page, 'right', 'trigger', 1);
  await advance(page, 400);
  await button(page, 'right', 'trigger', 0);
  expect((await readBody(page)).pulses).toContain('right:blasterKick');

  // then swaps it for the carrot
  const carrot = await readItem(page, 'carrot');
  await place(page, 'right', await toRoom(carrot.at));
  await advance(page, 200);
  await squeeze('right');
  const inHand = await readItem(page, 'carrot');
  expect(inHand.hand).toBe(1);
  expect(inHand.bites).toBe(0);

  // up to the mouth, just below your eyes: it takes bites while it's there
  const head = await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: IWER test hook
    const p = (window as any).__quest.position;
    return { x: p.x, y: p.y, z: p.z };
  });
  await place(page, 'right', { x: head.x, y: head.y - 0.1, z: head.z - 0.15 });
  await advance(page, 1200);
  expect((await readItem(page, 'carrot')).bites).toBeGreaterThanOrEqual(1);
  expect(errors).toEqual([]);
});

test('tracked hands pose the arms, a fist grabs, and a pinch uses', async ({ page, errors }, info) => {
  test.skip(info.project.name === 'ipad', 'one profile is enough');
  await withQuest(page);
  await bootDebug(page);
  await parkAtTable(page);
  await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: IWER test hook
    const quest = (window as any).__quest;
    quest.primaryInputMode = 'hand';
    // IWER's hands know relaxed, pinch, and point; a fist is the point pose with the index finger curled too
    for (const side of ['left', 'right']) {
      const hand = quest.hands[side];
      const key = Object.getOwnPropertySymbols(hand).find((k) => k.description === '@iwer/xr-hand-input');
      if (!key) throw new Error('no IWER hand state');
      const poses = hand[key].poses;
      const fist = structuredClone(poses.point);
      for (const j of ['metacarpal', 'phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'])
        fist.jointTransforms[`index-finger-${j}`] = structuredClone(fist.jointTransforms[`middle-finger-${j}`]);
      poses.fist = fist;
    }
  });
  await enterVr(page);
  expect((await readBody(page)).tracked).toEqual([true, true]);

  // the hand moves the arm, as a controller does
  const ahead = await besideRobot(page, { x: -0.6, y: 0.1, z: 0.75 });
  await place(page, 'right', ahead.room);
  await advance(page, 200);
  const posed = await readBody(page);
  expect(posed.misses[1]).toBeLessThan(0.05);
  expect(gap(posed.grips[1] as XYZ, ahead.world)).toBeLessThan(0.6);

  // a fist near the saber picks it up
  const saber = await readItem(page, 'blue saber');
  const room = await handFor(page, saber.at);
  await place(page, 'right', room);
  await advance(page, 200);
  const pose = (id: string) =>
    page.evaluate((p) => {
      // biome-ignore lint/suspicious/noExplicitAny: IWER test hook
      (window as any).__quest.hands.right.poseId = p;
    }, id);
  await pose('fist');
  await advance(page, 200);
  const held = await readItem(page, 'blue saber');
  expect(held.state).toBe('held');
  expect(held.hand).toBe(1);
  expect(held.target).toBe(1);
  await pose('default');
  await advance(page, 200);
  expect((await readItem(page, 'blue saber')).state).toBe('held');

  // a pinch switches it off
  await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: IWER test hook
    (window as any).__quest.hands.right.updatePinchValue(1);
  });
  await advance(page, 200);
  await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: IWER test hook
    (window as any).__quest.hands.right.updatePinchValue(0);
  });
  await advance(page, 200);
  expect((await readItem(page, 'blue saber')).target).toBe(0);
  expect(errors).toEqual([]);
});

/** Where the robot is on the floor strip, how high it's jumped, the view, and how far it is along where you look. */
function readWalk(page: Page) {
  return page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: debug hook exposed by the legacy game
    const { st, bot, vr } = (window as any).__saber;
    const p = bot.root.position;
    const view = vr.debug.view as number;
    return {
      x: p.x as number,
      z: p.z as number,
      y: st.y as number,
      view,
      /** How far along the way the play space faces (the view's heading on the strip). */
      ahead: (p.x * Math.sin(view) + p.z * Math.cos(view)) as number,
      scale: vr.debug.scale as number,
      vignette: vr.debug.vignette as number,
      pulses: [...vr.debug.pulses] as string[],
    };
  });
}

/** Moves both controllers together from one place to another in the room, a frame at a time. */
async function sweep(page: Page, from: XYZ, to: XYZ, frames: number, ms = 14) {
  for (let i = 0; i <= frames; i++) {
    const t = i / frames;
    const at = (dx: number) => ({
      x: from.x + (to.x - from.x) * t + dx,
      y: from.y + (to.y - from.y) * t,
      z: from.z + (to.z - from.z) * t,
    });
    await place(page, 'left', at(-0.2));
    await place(page, 'right', at(0.2));
    await advance(page, ms);
  }
}

/** How far each hand's grip sits from its controller's own position, as the controllers are turned now (meters). */
function gripOffsets(page: Page) {
  return page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: debug and IWER test hooks
    const { vr } = (window as any).__saber;
    // biome-ignore lint/suspicious/noExplicitAny: IWER test hook
    const quest = (window as any).__quest;
    return (['left', 'right'] as const).map((side, i) => {
      const c = quest.controllers[side].position;
      const g = vr.debug.hands[i].pos;
      return { x: g.x - c.x, y: g.y - c.y, z: g.z - c.z };
    }) as XYZ[];
  });
}

/**
 * Moves both hands together a frame at a time, so the robot's long arms put them from one place to another in the room
 * (each hand 0.3 m to its side of it). `grips` are the controllers' grip offsets (`gripOffsets`), which the stretch
 * would make a few centimeters into a few more.
 */
async function reachSweep(page: Page, grips: XYZ[], from: XYZ, to: XYZ, frames: number, ms = 14) {
  for (let i = 0; i <= frames; i++) {
    const t = i / frames;
    const at = (dx: number) => ({
      x: from.x + (to.x - from.x) * t + dx,
      y: from.y + (to.y - from.y) * t,
      z: from.z + (to.z - from.z) * t,
    });
    for (const [k, side] of (['left', 'right'] as const).entries()) {
      const h = await handFor(page, at(k ? 0.3 : -0.3), 'room');
      const g = grips[k] as XYZ;
      await place(page, side, { x: h.x - g.x, y: h.y - g.y, z: h.z - g.z });
    }
    await advance(page, ms);
  }
}

test('long arms hold on to the floor: pull to move, push down to rise, let go to fling and jump', async ({
  page,
  errors,
}, info) => {
  test.skip(info.project.name === 'ipad', 'one profile is enough');
  await withQuest(page);
  await bootDebug(page);
  await enterVr(page);
  const { scale } = await readWalk(page);
  // how high a robot's hand resting on the floor is, in your room (the robot on the floor)
  const floor = ARM_LOCO.handRest / scale;
  const grips = await gripOffsets(page);
  const walk = (from: XYZ, to: XYZ, frames: number, ms?: number) => reachSweep(page, grips, from, to, frames, ms);
  // hands up at your sides: nothing moves
  await walk({ x: 0, y: 1.1, z: -0.5 }, { x: 0, y: 1.1, z: 0.2 }, 10);
  const start = await readWalk(page);
  await advance(page, 300);
  expect((await readWalk(page)).ahead).toBeCloseTo(start.ahead, 3);

  // both hands down on the floor in front, pulled slowly back toward you: the robot goes forward by as much, and its
  // hands stay on the floor where they landed
  const ahead = { x: 0, y: floor - 0.005, z: -0.6 };
  await walk(ahead, ahead, 2);
  expect((await readWalk(page)).pulses).toContain('left:floorTouch');
  const down = await readWalk(page);
  const landed = await readBody(page);
  await walk(ahead, { ...ahead, z: 0.1 }, 25, 40);
  const pushed = await readWalk(page);
  expect(pushed.ahead - down.ahead).toBeCloseTo(0.7 * scale, 1);
  expect(pushed.y).toBeLessThan(0.05);
  const after = await readBody(page);
  for (const i of [0, 1]) {
    expect(gap(after.grips[i] as XYZ, landed.grips[i] as XYZ)).toBeLessThan(0.1);
    expect(after.grips[i]?.y).toBeCloseTo(ARM_LOCO.handRest, 1);
  }
  // lifting the hands slowly leaves the robot where it is
  await walk({ ...ahead, z: 0.1 }, { x: 0, y: 1.1, z: 0.1 }, 1, 200);
  const still = await readWalk(page);
  await advance(page, 500);
  expect((await readWalk(page)).ahead - still.ahead).toBeLessThan(0.05);

  // a quick pull and letting go flings it: it keeps going, then slows to a stop (and with no vignette, as in Gorilla
  // Tag, the view stays clear)
  await walk(ahead, ahead, 2);
  await walk(ahead, { ...ahead, z: 0.1 }, 6);
  await walk({ x: 0, y: 1.1, z: 0.1 }, { x: 0, y: 1.1, z: 0.1 }, 1);
  const letGo = await readWalk(page);
  await advance(page, 100);
  expect((await readWalk(page)).vignette).toBe(0);
  await advance(page, 200);
  const gliding = await readWalk(page);
  expect(gliding.ahead - letGo.ahead).toBeGreaterThan(0.5);
  await advance(page, 5000);
  const stopped = await readWalk(page);
  await advance(page, 500);
  expect((await readWalk(page)).ahead).toBeCloseTo(stopped.ahead, 2);
  expect((await readWalk(page)).vignette).toBe(0);

  // the hands can't go through the floor: pushing them down into it lifts the robot instead, and they stay on it
  const top = { x: 0, y: floor - 0.005, z: -0.5 };
  const high = { x: 0, y: 1.1, z: -0.5 };
  await walk(top, top, 2);
  await walk(top, { ...top, y: floor - 0.3 }, 3);
  const lifted = await readWalk(page);
  expect(lifted.y).toBeCloseTo(0.3 * scale, 1);
  for (const g of (await readBody(page)).grips) expect(g.y).toBeCloseTo(ARM_LOCO.handRest, 1);
  // and letting go after a hard shove jumps: up, then back down to the floor
  await walk(high, high, 1);
  expect((await readWalk(page)).y).toBeGreaterThan(lifted.y + 0.1);
  await advance(page, 1500);
  expect((await readWalk(page)).y).toBe(0);

  // pushing down further than its arms reach lifts it no higher than they hold it, still with its hands on the floor
  await walk(top, top, 2);
  await walk(top, { ...top, y: floor - 1.2 }, 18);
  expect((await readWalk(page)).y).toBeLessThan(0.3 * scale + 0.5);
  for (const g of (await readBody(page)).grips) expect(g.y).toBeCloseTo(ARM_LOCO.handRest, 1);
  // letting go up there drops it back on the floor
  await walk(high, high, 1);
  await advance(page, 1500);
  expect((await readWalk(page)).y).toBe(0);
  expect(errors).toEqual([]);
});

/** Puts one controller where the robot's long arm puts its grip at a point in the room (`grips` from gripOffsets). */
async function reachTo(page: Page, grips: XYZ[], side: 'left' | 'right', room: XYZ) {
  const h = await handFor(page, room, 'room');
  const g = grips[side === 'left' ? 0 : 1] as XYZ;
  await place(page, side, { x: h.x - g.x, y: h.y - g.y, z: h.z - g.z });
}

/** Moves the robot's hands from one place in the room to another, a frame at a time (null leaves a hand be). */
async function reachAlong(page: Page, grips: XYZ[], moves: { left?: [XYZ, XYZ]; right?: [XYZ, XYZ] }, frames: number) {
  for (let i = 0; i <= frames; i++) {
    const t = i / frames;
    for (const side of ['left', 'right'] as const) {
      const m = moves[side];
      if (!m) continue;
      const [a, b] = m;
      await reachTo(page, grips, side, {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        z: a.z + (b.z - a.z) * t,
      });
    }
    await advance(page, 14);
  }
}

/** Where a point in the robot's world is in your room (meters). */
function toRoom(page: Page, world: XYZ) {
  // biome-ignore lint/suspicious/noExplicitAny: debug hook exposed by the legacy game
  return page.evaluate((w) => (window as any).__saber.vr.debug.toPlay(w) as XYZ, world);
}

const down = (p: XYZ, d: number) => ({ ...p, y: p.y - d });
const nearer = (p: XYZ, d: number) => ({ ...p, z: p.z + d });

test('long arms climb what they hold on to: a hand pulled down a lamp post lifts the robot up it', async ({
  page,
  errors,
}, info) => {
  test.skip(info.project.name === 'ipad', 'one profile is enough');
  await withQuest(page);
  await bootDebug(page);
  // stand facing the nearest lamp post, a little way from it
  const post = await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: debug hook exposed by the legacy game
    const { vr, bot, st } = (window as any).__saber;
    const p = bot.root.position;
    const posts = (vr.debug.solids as { x: number; z: number; r?: number; top?: number }[][])
      .flat()
      .filter((c) => c.r === 0.3 && (c.top ?? 0) > 5)
      .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
    const at = posts[0] as { x: number; z: number; r: number };
    bot.root.position.set(at.x, 0, at.z + 1.3);
    st.yaw = Math.PI;
    st.vel = 0;
    return at;
  });
  await advance(page, 300);
  await enterVr(page);
  const grips = await gripOffsets(page);
  const { scale } = await readWalk(page);

  // the left hand up out of the way; the right reaches in to the post's near side and takes hold
  await reachTo(page, grips, 'left', { x: -0.6, y: 1.5, z: 0.2 });
  const on = await toRoom(page, { x: post.x, y: 1.5, z: post.z + post.r + ARM_LOCO.handRest - 0.02 });
  await reachAlong(page, grips, { right: [nearer(on, 0.2), on] }, 4);
  expect((await readBody(page)).pulses).toContain('right:floorTouch');
  const held = await readBody(page);

  // pulled down the post: the robot climbs it, and its hand stays where it holds
  await reachAlong(page, grips, { right: [on, down(on, 0.5)] }, 10);
  const climbed = await readWalk(page);
  expect(climbed.y).toBeCloseTo(0.5 * scale, 1);
  expect(gap((await readBody(page)).grips[1] as XYZ, held.grips[1] as XYZ)).toBeLessThan(0.1);
  // and hangs there while the hand holds on
  await advance(page, 500);
  expect((await readWalk(page)).y).toBeCloseTo(climbed.y, 2);

  // pulling the hand back off the post lets go, and the robot drops to the floor
  await reachAlong(page, grips, { right: [down(on, 0.5), nearer(down(on, 0.5), 0.4)] }, 3);
  await advance(page, 1500);
  expect((await readWalk(page)).y).toBe(0);
  expect(errors).toEqual([]);
});

test('a Quest player climbs onto the weapon table and stands on it', async ({ page, errors }, info) => {
  test.skip(info.project.name === 'ipad', 'one profile is enough');
  await withQuest(page);
  await bootDebug(page);
  await parkAtTable(page);
  await enterVr(page);
  const grips = await gripOffsets(page);
  const { scale } = await readWalk(page);
  // both hands onto the tabletop, near its front edge (the table is at x = -4, z = -3, 0.95 high; you face it)
  const top = 0.95 + ARM_LOCO.handRest - 0.01;
  const left = await toRoom(page, { x: -4.9, y: top, z: -2.55 });
  const right = await toRoom(page, { x: -4.1, y: top, z: -2.55 });
  await reachAlong(page, grips, { left: [down(left, -0.1), left], right: [down(right, -0.1), right] }, 3);
  expect((await readBody(page)).pulses).toContain('left:floorTouch');

  // pushing down on it lifts the robot above the tabletop...
  const lift = 1.1 / scale;
  await reachAlong(page, grips, { left: [left, down(left, lift)], right: [right, down(right, lift)] }, 12);
  const raised = await readWalk(page);
  expect(raised.y).toBeGreaterThan(1);
  // ...pulling back toward you draws it over the table...
  const pull = 0.5;
  await reachAlong(
    page,
    grips,
    {
      left: [down(left, lift), nearer(down(left, lift), pull)],
      right: [down(right, lift), nearer(down(right, lift), pull)],
    },
    12,
  );
  const over = await readWalk(page);
  expect(over.z).toBeLessThan(-2.1);
  // ...and letting go, it settles onto the tabletop and stands there
  await advance(page, 200);
  await reachAlong(page, grips, { left: [left, down(left, -0.6)], right: [right, down(right, -0.6)] }, 1);
  await advance(page, 1000);
  const standing = await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: debug hook exposed by the legacy game
    const { st } = (window as any).__saber;
    return { y: st.y as number, grounded: st.grounded as boolean };
  });
  expect(standing.y).toBeCloseTo(0.95, 2);
  expect(standing.grounded).toBe(true);
  expect(errors).toEqual([]);
});

test('comfort settings: seated, smooth turning, and turning arm walking off', async ({ page, errors }, info) => {
  test.skip(info.project.name === 'ipad', 'one profile is enough');
  await withQuest(page);
  await bootDebug(page);
  // the settings show on the flat page of a device that can run VR, and are kept in the browser
  const panel = page.locator('#vr-comfort');
  await expect(panel).toBeVisible();
  await panel.locator('summary').click();
  await panel.locator('input[name="vr-turning"][value="smooth"]').check();
  await panel.locator('input[name="vr-vignette"][value="0.5"]').check();
  await panel.locator('input[name="vr-seated"]').check();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('saber-side.vr-comfort') ?? '{}'))).toMatchObject({
    turning: 'smooth',
    vignette: 0.5,
    seated: true,
  });
  await enterVr(page);

  // seated: leaning to the side moves your view, not the robot
  const before = await readWalk(page);
  await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: IWER test hook
    (window as any).__quest.position.x += 0.3;
  });
  await advance(page, 300);
  const leaned = await readWalk(page);
  expect(Math.hypot(leaned.x - before.x, leaned.z - before.z)).toBeLessThan(0.01);

  // smooth turning: the right stick turns the view a little every frame, not in one snap
  await stick(page, 'right', 1, 0);
  await advance(page, 100);
  const turning = await readWalk(page);
  expect(Math.abs(turning.view - before.view)).toBeGreaterThan(0.05);
  expect(Math.abs(turning.view - before.view)).toBeLessThan(Math.PI / 4);
  expect(turning.vignette).toBeGreaterThan(0);
  await advance(page, 400);
  expect(Math.abs((await readWalk(page)).view - before.view)).toBeGreaterThan(0.6);
  await stick(page, 'right', 0, 0);

  // with arm walking off, hands on the floor push nothing
  await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: debug hook exposed by the legacy game
    (window as any).__saber.vr.debug.comfort.armWalking = false;
  });
  const off = await readWalk(page);
  await sweep(page, { x: 0.3, y: 0.3, z: -0.4 }, { x: 0.3, y: 0.3, z: 0.1 }, 20, 30);
  const after = await readWalk(page);
  expect(Math.hypot(after.x - off.x, after.z - off.z)).toBeLessThan(0.01);
  expect(errors).toEqual([]);
});

/** The wrist panel's state, and where one of its buttons is in the room. */
function readWrist(page: Page, button?: string) {
  return page.evaluate((b) => {
    // biome-ignore lint/suspicious/noExplicitAny: debug hook exposed by the legacy game
    const { vr } = (window as any).__saber;
    const w = vr.debug.wrist;
    return {
      shown: w.shown as boolean,
      page: w.page as string,
      lines: [...w.lines] as string[],
      at: (b ? w.buttonAt(b) : null) as XYZ | null,
      turning: vr.debug.comfort.turning as string,
      presenting: vr.presenting as boolean,
      selfie: vr.selfieOpen as boolean,
    };
  }, button);
}

/**
 * Turns the left controller so the back of its grip (its +y, where the wrist panel faces) points at your eyes. The
 * grip pose is tilted from the controller's own, so the tilt is measured first.
 */
async function turnWristToEyes(page: Page) {
  await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: debug and IWER test hooks
    const { THREE, vr } = (window as any).__saber;
    // biome-ignore lint/suspicious/noExplicitAny: IWER test hook
    const input = (window as any).__quest.controllers.left;
    const hand = vr.debug.hands[0];
    const qin = new THREE.Quaternion(input.quaternion.x, input.quaternion.y, input.quaternion.z, input.quaternion.w);
    const tilt = qin.clone().invert().multiply(hand.quat);
    // the panel is on the robot's wrist, where its long arm puts your hand
    const to = vr.debug.camera.position.clone().sub(hand.reach).normalize();
    const want = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), to);
    const next = want.multiply(tilt.invert());
    input.quaternion.set(next.x, next.y, next.z, next.w);
  });
}

/** Presses a wrist panel button with the right controller's fingertip, then takes the hand away. */
async function pressWrist(page: Page, id: string) {
  const { at } = await readWrist(page, id);
  if (!at) throw new Error(`no ${id} button`);
  // bring the right hand near, then nudge the controller so its fingertip (6 cm ahead of the robot's grip, where its
  // long arm puts your hand) lands on the button: the long arm's hand moves `stretch` times as far as yours
  const near = await handFor(page, { x: at.x, y: at.y, z: at.z + 0.15 }, 'room');
  await place(page, 'right', near, { x: 0, y: 0, z: 0, w: 1 });
  await advance(page, 40);
  const off = await page.evaluate((target) => {
    // biome-ignore lint/suspicious/noExplicitAny: debug hook exposed by the legacy game
    const { THREE, vr } = (window as any).__saber;
    const h = vr.debug.hands[1];
    const k = vr.debug.stretch;
    const tip = new THREE.Vector3(0, 0, -0.06).applyQuaternion(h.quat).add(h.reach);
    return { x: (target.x - tip.x) / k, y: (target.y - tip.y) / k, z: (target.z - tip.z) / k };
  }, at);
  // the controller where its fingertip is on the button, then away again (so the next press is fresh)
  const on = { x: near.x + off.x, y: near.y + off.y, z: near.z + off.z };
  await place(page, 'right', on);
  await advance(page, 60);
  await place(page, 'right', { x: on.x, y: on.y, z: on.z + 0.25 });
  await advance(page, 60);
}

test('the wrist panel shows when you look at your wrist, and its buttons work', async ({ page, errors }, info) => {
  test.skip(info.project.name === 'ipad', 'one profile is enough');
  await withQuest(page);
  await bootDebug(page, '&perf');
  await enterVr(page);
  const head = await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: IWER test hook
    const p = (window as any).__quest.position;
    return { x: p.x as number, y: p.y as number, z: p.z as number };
  });
  const wrist = { x: head.x - 0.05, y: head.y - 0.15, z: head.z - 0.35 };
  // the left hand held out, its back turned down: no panel
  await place(page, 'left', wrist, { x: 1, y: 0, z: 0, w: 0 });
  await advance(page, 100);
  expect((await readWrist(page)).shown).toBe(false);

  // the back of the wrist turned toward your eyes: it shows where you are and what you hold
  await turnWristToEyes(page);
  await advance(page, 100);
  const shown = await readWrist(page);
  expect(shown.shown).toBe(true);
  expect(shown.page).toBe('main');
  expect(shown.lines[0]).toBe(await page.locator('#where').textContent());
  expect(shown.lines.some((l) => l.startsWith('Holding') || l === 'Hands free')).toBe(true);
  // with ?perf, the frame rate, draw calls, and triangles
  expect(shown.lines.at(-1)).toMatch(/^\d+ fps · \d+ draws · \d+k tris$/);

  // Comfort opens its page, and Turn switches to smooth turning (and keeps it)
  await pressWrist(page, 'comfort');
  expect((await readWrist(page)).page).toBe('comfort');
  await pressWrist(page, 'turning');
  expect((await readWrist(page)).turning).toBe('smooth');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('saber-side.vr-comfort') ?? '{}').turning)).toBe(
    'smooth',
  );
  await pressWrist(page, 'back');
  expect((await readWrist(page)).page).toBe('main');

  // Selfie opens the mini-me, and Exit VR goes back to the flat page
  await pressWrist(page, 'selfie');
  expect((await readWrist(page)).selfie).toBe(true);
  await pressWrist(page, 'exit');
  await expect
    .poll(async () => {
      await advance(page, 33);
      return (await readWrist(page)).presenting;
    })
    .toBe(false);
  expect(errors).toEqual([]);
});

test('a prompt is a sign beside what it’s about, and touching it does what it says', async ({ page, errors }, info) => {
  test.skip(info.project.name === 'ipad', 'one profile is enough');
  await withQuest(page);
  await bootDebug(page);
  await parkAtTable(page);
  await enterVr(page);
  await advance(page, 100);
  const sign = await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: debug hook exposed by the legacy game
    const { vr, bot } = (window as any).__saber;
    const s = vr.debug.sign;
    const room = vr.debug.rig.worldToLocal(s.mesh.position.clone());
    return {
      text: s.text as string,
      room: { x: room.x, y: room.y, z: room.z } as XYZ,
      held: bot.grip.children.length as number,
      line: vr.debug.camera.children.find(
        (c: { name?: string; visible: boolean; isMesh?: boolean }) => c.isMesh && c.visible && c.name !== 'vignette',
      )
        ? 'shown'
        : 'hidden',
    };
  });
  // the robot stands at the weapon table: the sign offers the nearest item, and the floating line gives way to it
  expect(sign.text).toMatch(/^Grip · (Pick up|Swap for) the /);
  // it floats over the table, ahead of you, a little above your eyes
  expect(sign.room.z).toBeLessThan(-0.3);
  // touching it with a hand picks the item up (swapping what the robot held)
  const before = await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: debug hook exposed by the legacy game
    const { items, bot } = (window as any).__saber;
    // biome-ignore lint/suspicious/noExplicitAny: legacy item
    return items.find((i: any) => i.group.parent === bot.grip)?.name ?? null;
  });
  await place(page, 'right', await handFor(page, sign.room, 'room'));
  await advance(page, 200);
  const after = await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: debug hook exposed by the legacy game
    const { items, bot } = (window as any).__saber;
    // biome-ignore lint/suspicious/noExplicitAny: legacy item
    return items.find((i: any) => i.group.parent === bot.grip)?.name ?? null;
  });
  expect(after).not.toBe(before);
  expect(after).not.toBeNull();
  expect(errors).toEqual([]);
});

/** Where the robot is and how far your eyes are from its eye line, in real space (lift tubes and the hub). */
function readReal(page: Page) {
  return page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: debug hook exposed by the legacy game
    const { st, bot, vr } = (window as any).__saber;
    // your eyes sit straight above the robot's wheel at its eye's height (as on the floor), in the robot's own frame;
    // real space is parked 10000 up and drawn as-is that much lower (render/ring/bend.ts)
    bot.root.updateMatrixWorld(true);
    const local = bot.root.worldToLocal((bot.eyeCore ?? bot.head).getWorldPosition(bot.root.position.clone()));
    const eye = bot.root.localToWorld(local.set(0, local.y, 0));
    eye.y -= 10000;
    const e = vr.debug.camera.matrixWorld.elements;
    const p = bot.root.position;
    return {
      mode: st.mode as string,
      yaw: st.yaw as number,
      at: { x: p.x, y: p.y, z: p.z } as XYZ,
      eyeGap: Math.hypot(e[12] - eye.x, e[13] - eye.y, e[14] - eye.z),
      vignette: vr.debug.vignette as number,
      where: document.getElementById('where')?.textContent ?? '',
    };
  });
}

test('a Quest player rides a lift up to the hub, with the vignette, and floats there with the sticks', async ({
  page,
  errors,
}, info) => {
  test.skip(info.project.name === 'ipad', 'one profile is enough');
  await withQuest(page);
  await bootDebug(page);
  // stand at lift 1's door
  await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: debug hook exposed by the legacy game
    const { bot, lifts, st } = (window as any).__saber;
    bot.root.position.set(0, 0, lifts[0].z + 3);
    st.yaw = Math.PI;
  });
  await advance(page, 300);
  await enterVr(page);
  // the vignette is off to start with, as in Gorilla Tag; turned on, it closes in for the ride
  await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: debug hook exposed by the legacy game
    (window as any).__saber.vr.debug.comfort.vignette = 0.5;
  });
  // the prompt is a sign over the lift; gripping boards it
  // biome-ignore lint/suspicious/noExplicitAny: debug hook exposed by the legacy game
  const sign = await page.evaluate(() => (window as any).__saber.vr.debug.sign.text as string);
  expect(sign).toMatch(/^Grip · Ride lift 1 up/);
  await button(page, 'right', 'squeeze', 1);
  await advance(page, 100);
  await button(page, 'right', 'squeeze', 0);
  await advance(page, 3000);

  // halfway up: you ride in the cab, at the robot's eye, and the vignette closes in while it moves
  const riding = await readReal(page);
  expect(riding.mode).toBe('up');
  expect(riding.eyeGap).toBeLessThan(0.3);
  expect(riding.vignette).toBeGreaterThan(0.3);

  // in the hub: the ride is over, the vignette opens again, and the view still sits at the robot's eye
  await advance(page, 7000);
  const hub = await readReal(page);
  expect(hub.mode).toBe('hub');
  expect(hub.where).toBe('Ring Seven · Hub');
  expect(hub.eyeGap).toBeLessThan(0.3);
  await advance(page, 3000);
  expect((await readReal(page)).vignette).toBeLessThan(0.1);

  // the left stick pushes the robot the way it faces, and a snap turn turns the robot (it flies the way it faces)
  const before = await readReal(page);
  await stick(page, 'left', 0, -1);
  await advance(page, 1000);
  await stick(page, 'left', 0, 0);
  const floated = await readReal(page);
  expect(
    Math.hypot(floated.at.x - before.at.x, floated.at.y - before.at.y, floated.at.z - before.at.z),
  ).toBeGreaterThan(1);
  await stick(page, 'right', 1, 0);
  await advance(page, 100);
  await stick(page, 'right', 0, 0);
  await advance(page, 100);
  expect((await readReal(page)).yaw).toBeCloseTo(floated.yaw - Math.PI / 4, 3);
  expect((await readReal(page)).eyeGap).toBeLessThan(0.3);
  expect(errors).toEqual([]);
});

/** Moves a controller so its grip (where it grabs from) lands on a point in the room. */
async function putHand(page: Page, hand: 'left' | 'right', target: XYZ) {
  const i = hand === 'left' ? 0 : 1;
  for (let k = 0; k < 2; k++) {
    const off = await page.evaluate(
      ([t, n]) => {
        // biome-ignore lint/suspicious/noExplicitAny: debug and IWER test hooks
        const w = window as any;
        const h = w.__saber.vr.debug.hands[n as number];
        const c = w.__quest.controllers[n === 0 ? 'left' : 'right'].position;
        const p = t as XYZ;
        return { x: c.x + p.x - h.pos.x, y: c.y + p.y - h.pos.y, z: c.z + p.z - h.pos.z };
      },
      [target, i] as const,
    );
    await place(page, hand, off);
    await advance(page, 40);
  }
}

/** The ship being flown, the cockpit's controls, and how far your eyes are from the pilot's seat. */
function readCockpit(page: Page) {
  return page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: debug hook exposed by the legacy game
    const { ships, vr, THREE } = (window as any).__saber;
    const c = vr.debug.cockpit;
    const flying = ships.cockpit();
    const e = vr.debug.camera.matrixWorld.elements;
    const seat = flying ? flying.model.body.localToWorld(new THREE.Vector3(0, 0.72, 0.7)) : null;
    const s = ships.state.ship;
    return {
      phase: ships.state.phase as string,
      pitch: s.pitch as number,
      yaw: s.yaw as number,
      speed: s.speed as number,
      seatGap: seat ? Math.hypot(e[12] - seat.x, e[13] - seat.y, e[14] - seat.z) : -1,
      stick: c.restAt('stick') as XYZ,
      throttleAt: c.restAt('throttle') as XYZ,
      throttle: c.throttle as number,
      holding: c.holding as { stick: number | null; throttle: number | null },
      pulses: [...vr.debug.pulses] as string[],
      lasers: ships.state.lasers.lasers.filter((l: { life: number }) => l.life > 0).length as number,
    };
  });
}

test('a Quest player flies a ship from the cockpit with the joystick and throttle', async ({ page, errors }, info) => {
  test.skip(info.project.name === 'ipad', 'one profile is enough');
  await withQuest(page);
  await bootDebug(page);
  // up to the hub and over to the first ship's cradle (as the flat flying test does), then into VR
  await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: debug hook exposed by the legacy game
    const s = (window as any).__saber;
    s.st.boardNext = s.lifts[0];
  });
  await advance(page, 9500);
  await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: debug hook exposed by the legacy game
    (window as any).__saber.bot.root.position.set(12, 5, 0);
  });
  await advance(page, 100);
  await enterVr(page);
  // gripping boards it, and it launches through the airlock into space
  await button(page, 'right', 'squeeze', 1);
  await advance(page, 100);
  await button(page, 'right', 'squeeze', 0);
  await advance(page, 4500);
  const seated = await readCockpit(page);
  expect(seated.phase).toBe('space');
  // you sit in the pilot's seat, and the throttle starts at cruising
  expect(seated.seatGap).toBeLessThan(0.2);
  expect(seated.throttle).toBeCloseTo(0.5);

  // grip the joystick and push it forward: the ship dives, with a buzz on taking hold
  await putHand(page, 'right', seated.stick);
  await button(page, 'right', 'squeeze', 1);
  await advance(page, 60);
  expect((await readCockpit(page)).holding.stick).toBe(1);
  expect((await readCockpit(page)).pulses).toContain('right:pickUp');
  await putHand(page, 'right', { ...seated.stick, z: seated.stick.z - 0.1 });
  await advance(page, 800);
  const dived = await readCockpit(page);
  expect(dived.pitch).toBeLessThan(seated.pitch - 0.5);

  // the trigger on the joystick fires, with a kick in that hand
  await button(page, 'right', 'trigger', 1);
  await advance(page, 300);
  const fired = await readCockpit(page);
  expect(fired.lasers).toBeGreaterThan(0);
  expect(fired.pulses).toContain('right:blasterKick');
  await button(page, 'right', 'trigger', 0);

  // letting go springs the stick back: the ship stops diving
  await button(page, 'right', 'squeeze', 0);
  await advance(page, 100);
  const freed = await readCockpit(page);
  await advance(page, 500);
  expect((await readCockpit(page)).pitch).toBeCloseTo(freed.pitch, 2);

  // grip the throttle and push it all the way forward: the ship speeds up past cruising
  await putHand(page, 'left', freed.throttleAt);
  await button(page, 'left', 'squeeze', 1);
  await advance(page, 60);
  expect((await readCockpit(page)).holding.throttle).toBe(0);
  await putHand(page, 'left', { ...freed.throttleAt, z: freed.throttleAt.z - 0.2 });
  await button(page, 'left', 'squeeze', 0);
  await advance(page, 2000);
  const fast = await readCockpit(page);
  expect(fast.throttle).toBe(1);
  expect(fast.speed).toBeGreaterThan(seated.speed * 1.8);
  expect(errors).toEqual([]);
});

/** What the headset drew last frame: draw calls and triangles, both eyes together. */
function readDrawn(page: Page) {
  return page.evaluate(
    // biome-ignore lint/suspicious/noExplicitAny: debug hook exposed by the legacy game
    () => (window as any).__saber.vr.debug.drawn as { calls: number; triangles: number },
  );
}

test('the headset only draws what’s in view, and sabers share a fixed pool of lights', async ({
  page,
  errors,
}, info) => {
  test.skip(info.project.name === 'ipad', 'one profile is enough');
  await withQuest(page);
  await bootDebug(page);
  // the sabers have no light of their own: the scene holds the same point lights however many sabers there are
  const lights = await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: debug hook exposed by the legacy game
    const { bot, items } = (window as any).__saber;
    let scene = bot.root;
    while (scene.parent) scene = scene.parent;
    let n = 0;
    // biome-ignore lint/suspicious/noExplicitAny: three.js objects from the page
    scene.traverse((o: any) => {
      if (o.isPointLight) n++;
    });
    // biome-ignore lint/suspicious/noExplicitAny: legacy item
    const onSabers = items.filter((i: any) => i.kind === 'saber' && i.blade.children.some((c: any) => c.isPointLight));
    // biome-ignore lint/suspicious/noExplicitAny: legacy item
    return { n, sabers: items.filter((i: any) => i.kind === 'saber').length, onSabers: onSabers.length };
  });
  expect(lights.onSabers).toBeLessThanOrEqual(2);

  await enterVr(page);
  await advance(page, 200);
  // at the spawn, looking down the promenade: well under the 1,430 draw calls it took when the whole ring was drawn
  // (the budget is about 150 an eye; the docs list the big meshes still to cut)
  const spawn = await readDrawn(page);
  expect(spawn.calls).toBeLessThan(700);
  expect(spawn.triangles).toBeLessThan(1_250_000);
  // turned round to face the other way, a different half of the ring is culled, and about as much is drawn
  await stick(page, 'right', 1, 0);
  await advance(page, 100);
  await stick(page, 'right', 0, 0);
  await advance(page, 100);
  await stick(page, 'right', 1, 0);
  await advance(page, 100);
  await stick(page, 'right', 0, 0);
  await advance(page, 200);
  expect((await readDrawn(page)).calls).toBeLessThan(700);
  expect(errors).toEqual([]);
});
