import type { PartPick } from '@saber-side/shared';
import * as THREE from 'three';
import { type BodyMounts, Cyl, flatRing, onDrum, onSphere, type PartKit, Sph, TAU, zCyl } from './kit';

// Mobility and bodies. The wheel is the one part every robot has: a drive ball in a fixed mount. Bodies sit on it and
// say where the head and arms go.
//
// The classic parts (wheel, ball) create their objects in exactly the legacy order: three r128 takes every object's id
// from Math.random, so a different order would shift the seeded effects the screenshot tests pin down.

/** Mounts on a bare wheel, for a robot built without a body. */
const BARE_WHEEL: BodyMounts = { neckY: 0.86, shoulder: [0.97, 0.12, 0], hold: [0, 0.35, 1.05] };

/** The wheel: a drive ball that rolls, peeking out of a fixed band. Returns the ball (the animation spins it). */
export function buildMobility(kit: PartKit, core: THREE.Group, pick: PartPick<'mobility'>): THREE.Mesh {
  const { materials: M, mesh, tint } = kit;
  // rolling drive ball
  const drive = mesh(new THREE.SphereGeometry(0.95, 40, 28), tint(M.drive, pick.paint, 2.2));
  core.add(drive);
  // the fixed band it rolls in
  core.add(mesh(new THREE.SphereGeometry(0.985, 64, 12, 0, TAU, 2.12, 0.5), tint(M.band, pick.paint, 1.6)));
  return drive;
}

export interface BuiltBody {
  mounts: BodyMounts;
  /** The blinking chest LED's glow, for bodies that have one. */
  ledGlow?: THREE.Sprite;
}

export function buildBody(kit: PartKit, core: THREE.Group, pick: PartPick<'body'> | null): BuiltBody {
  if (!pick) return { mounts: BARE_WHEEL };
  switch (pick.part) {
    case 'ball':
      return ball(kit, core, pick.paint);
    case 'barrel':
      return barrel(kit, core, pick.paint);
    case 'crate':
      return crate(kit, core, pick.paint);
  }
}

/** A small panel of controls, with the blinking LED: the classic chest panel's parts, for the other bodies. */
function ledPanel(kit: PartKit, parent: THREE.Object3D, w: number, h: number): THREE.Sprite {
  const { materials: M, mesh, glow } = kit;
  const recess = mesh(new THREE.BoxGeometry(w, h, 0.03), M.dark);
  parent.add(recess);
  const led = mesh(Sph(0.05, 16, 12), M.led);
  led.position.set(-w * 0.28, h * 0.22, 0.03);
  parent.add(led);
  const ledGlow = glow(0xff3a1a, 0.38, 0.9);
  ledGlow.position.set(-w * 0.28, h * 0.22, 0.09);
  parent.add(ledGlow);
  for (let i = 0; i < 3; i++) {
    const sl = mesh(new THREE.BoxGeometry(w * 0.4, 0.022, 0.035), M.metal);
    sl.position.set(w * 0.18, h * 0.25 - i * 0.05, 0.02);
    parent.add(sl);
  }
  const knob = mesh(zCyl(0.05, 0.055, 0.06), M.metal);
  knob.position.set(-w * 0.28, -h * 0.22, 0.03);
  parent.add(knob);
  return ledGlow;
}

function socket(kit: PartKit, parent: THREE.Object3D) {
  const { materials: M, mesh } = kit;
  parent.add(mesh(new THREE.TorusGeometry(0.19, 0.04, 10, 28), M.metal));
  parent.add(mesh(zCyl(0.17, 0.17, 0.06), M.dark));
}

/** The classic rusty ball, moved unchanged from the legacy robot. */
function ball(kit: PartKit, core: THREE.Group, paint: string): BuiltBody {
  const { materials: M, mesh, glow, tint } = kit;
  // upper shell
  core.add(mesh(new THREE.SphereGeometry(1, 64, 44, 0, TAU, 0, 2.16), tint(M.shell, paint)));
  const rim = (theta: number, r: number, tube: number) => {
    const t = mesh(new THREE.TorusGeometry(r * Math.sin(theta), tube, 10, 72), M.metal);
    t.rotation.x = Math.PI / 2;
    t.position.y = r * Math.cos(theta);
    core.add(t);
  };
  rim(2.14, 0.995, 0.03);
  rim(2.62, 0.975, 0.035);

  // belly hatch
  const hatch = onSphere(new THREE.Group(), 0.985, Math.PI / 2 - 2.37, 0);
  const hp = mesh(new THREE.BoxGeometry(0.36, 0.2, 0.05), M.band);
  hatch.add(hp);
  const hf = mesh(new THREE.BoxGeometry(0.4, 0.24, 0.03), M.dark);
  hf.position.z = -0.01;
  hatch.add(hf);
  const hh = mesh(new THREE.BoxGeometry(0.12, 0.03, 0.04), M.metal);
  hh.position.set(0, 0.05, 0.03);
  hatch.add(hh);
  core.add(hatch);

  // chest control panel
  const panel = onSphere(new THREE.Group(), 0.86, 0.04, 0);
  core.add(panel);
  const frame = mesh(new THREE.BoxGeometry(0.78, 0.66, 0.28), M.metal);
  frame.position.z = -0.02;
  panel.add(frame);
  const plate = mesh(new THREE.BoxGeometry(0.7, 0.58, 0.3), M.limb);
  panel.add(plate);
  const F = 0.15;
  const recess = mesh(new THREE.BoxGeometry(0.26, 0.22, 0.02), M.dark);
  recess.position.set(-0.17, 0.13, F);
  panel.add(recess);
  const led = mesh(Sph(0.055, 16, 12), M.led);
  led.position.set(-0.17, 0.13, F + 0.02);
  panel.add(led);
  const ledGlow = glow(0xff3a1a, 0.42, 0.9);
  ledGlow.position.set(-0.17, 0.13, F + 0.08);
  panel.add(ledGlow);
  const swb = mesh(new THREE.BoxGeometry(0.26, 0.2, 0.02), M.dark);
  swb.position.set(0.15, 0.13, F);
  panel.add(swb);
  for (const x of [0.1, 0.2]) {
    const sw = mesh(new THREE.BoxGeometry(0.06, 0.12, 0.06), M.limb);
    sw.position.set(x, 0.13, F + 0.03);
    sw.rotation.x = x < 0.15 ? 0.25 : -0.2;
    panel.add(sw);
  }
  for (let i = 0; i < 5; i++) {
    const sl = mesh(new THREE.BoxGeometry(0.22, 0.022, 0.035), M.dark);
    sl.position.set(-0.15, -0.05 - i * 0.042, F + 0.005);
    panel.add(sl);
  }
  const knobBase = mesh(zCyl(0.085, 0.085, 0.03), M.dark);
  knobBase.position.set(0.15, -0.12, F + 0.01);
  panel.add(knobBase);
  const knob = mesh(zCyl(0.06, 0.065, 0.07), M.metal);
  knob.position.set(0.15, -0.12, F + 0.04);
  panel.add(knob);
  for (const [x, y] of [
    [-0.31, 0.25],
    [0.31, 0.25],
    [-0.31, -0.25],
    [0.31, -0.25],
  ] as const) {
    const sc = mesh(Sph(0.018, 8, 6), M.metal, false);
    sc.position.set(x, y, F);
    panel.add(sc);
  }

  // side port + slot
  const port = onSphere(new THREE.Group(), 0.99, -0.02, 0.8);
  core.add(port);
  port.add(mesh(zCyl(0.075, 0.075, 0.05), M.dark));
  const portRing = mesh(new THREE.TorusGeometry(0.08, 0.015, 8, 24), M.metal);
  portRing.position.z = 0.02;
  port.add(portRing);
  const slot = onSphere(new THREE.Group(), 0.985, -0.08, -0.85);
  core.add(slot);
  slot.add(mesh(new THREE.BoxGeometry(0.2, 0.08, 0.06), M.metal));
  const slotIn = mesh(new THREE.BoxGeometry(0.16, 0.035, 0.07), M.dark);
  slot.add(slotIn);

  // shoulder sockets
  for (const s of [1, -1]) {
    const sock = onSphere(new THREE.Group(), 0.94, 0.22, (s * Math.PI) / 2);
    core.add(sock);
    socket(kit, sock);
  }

  return { mounts: { neckY: 0.9, shoulder: [0.93, 0.22, 0.03], hold: [0, 0.3, 1.1] }, ledGlow };
}

/** An upright drum with hoops, riding on the wheel. */
function barrel(kit: PartKit, core: THREE.Group, paint: string): BuiltBody {
  const { materials: M, mesh } = kit;
  const shell = shellPaint(kit, paint);
  const drum = mesh(new THREE.CylinderGeometry(0.9, 0.98, 1.3, 48, 1, true), shell);
  drum.position.y = 0.45;
  core.add(drum);
  const lid = mesh(Cyl(0.9, 0.9, 0.06, 48), M.metal);
  lid.position.y = 1.1;
  core.add(lid);
  const cap = mesh(Cyl(0.55, 0.68, 0.1, 40), M.dark);
  cap.position.y = 1.16;
  core.add(cap);
  for (const [y, r] of [
    [-0.18, 0.985],
    [0.45, 0.945],
    [1.06, 0.91],
  ] as const) {
    const hoop = mesh(flatRing(r, 0.04, 64), M.metal);
    hoop.position.y = y;
    core.add(hoop);
  }
  // a vent and the LED panel on the front, a hatch on the back
  const vent = onDrum(new THREE.Group(), 0.94, 0.12, -0.42);
  core.add(vent);
  vent.add(mesh(new THREE.BoxGeometry(0.34, 0.36, 0.03), M.dark));
  for (let i = 0; i < 5; i++) {
    const sl = mesh(new THREE.BoxGeometry(0.28, 0.03, 0.05), M.limb);
    sl.position.set(0, 0.13 - i * 0.065, 0.02);
    vent.add(sl);
  }
  const front = onDrum(new THREE.Group(), 0.94, 0.75, 0.25);
  core.add(front);
  const ledGlow = ledPanel(kit, front, 0.42, 0.34);
  const back = onDrum(new THREE.Group(), 0.94, 0.3, Math.PI);
  core.add(back);
  back.add(mesh(new THREE.BoxGeometry(0.5, 0.6, 0.04), M.band));
  const handle = mesh(new THREE.BoxGeometry(0.16, 0.04, 0.06), M.metal);
  handle.position.set(0, 0.18, 0.03);
  back.add(handle);
  // rivets round the top hoop
  for (let i = 0; i < 16; i++) {
    const rv = onDrum(mesh(Sph(0.02, 8, 6), M.metal, false), 0.925, 0.86, (i / 16) * TAU);
    core.add(rv);
  }
  for (const s of [1, -1]) {
    const sock = onDrum(new THREE.Group(), 0.93, 0.62, (s * Math.PI) / 2);
    core.add(sock);
    socket(kit, sock);
  }
  return { mounts: { neckY: 1.14, shoulder: [0.98, 0.62, 0], hold: [0, 0.6, 1.2] }, ledGlow };
}

/** A box balanced on top of the wheel, with framed edges and a screen. */
function crate(kit: PartKit, core: THREE.Group, paint: string): BuiltBody {
  const { materials: M, mesh } = kit;
  const W = 1.8;
  const H = 1.1;
  const D = 1.6;
  const Y = 1.15;
  const box = mesh(new THREE.BoxGeometry(W, H, D), shellPaint(kit, paint));
  box.position.y = Y;
  core.add(box);
  // where it sits on the wheel
  const seat = mesh(Cyl(0.8, 0.72, 0.1, 40), M.dark);
  seat.position.y = Y - H / 2 - 0.03;
  core.add(seat);
  const collar = mesh(flatRing(0.76, 0.05, 48), M.metal);
  collar.position.y = Y - H / 2 - 0.06;
  core.add(collar);
  // framed edges
  const t = 0.07;
  for (const x of [-1, 1]) {
    for (const z of [-1, 1]) {
      const post = mesh(new THREE.BoxGeometry(t, H + t, t), M.metal);
      post.position.set((x * W) / 2, Y, (z * D) / 2);
      core.add(post);
    }
  }
  for (const y of [-1, 1]) {
    for (const z of [-1, 1]) {
      const bar = mesh(new THREE.BoxGeometry(W + t, t, t), M.metal);
      bar.position.set(0, Y + (y * H) / 2, (z * D) / 2);
      core.add(bar);
    }
    for (const x of [-1, 1]) {
      const bar = mesh(new THREE.BoxGeometry(t, t, D + t), M.metal);
      bar.position.set((x * W) / 2, Y + (y * H) / 2, 0);
      core.add(bar);
    }
  }
  // a screen and the LED panel on the front
  const face = new THREE.Group();
  face.position.set(0, Y, D / 2 + 0.01);
  core.add(face);
  const screen = mesh(new THREE.BoxGeometry(0.8, 0.5, 0.03), M.dark);
  screen.position.set(-0.3, 0.08, 0);
  face.add(screen);
  const scan = mesh(new THREE.BoxGeometry(0.66, 0.05, 0.02), M.lens, false);
  scan.position.set(-0.3, 0.08, 0.02);
  face.add(scan);
  const panel = new THREE.Group();
  panel.position.set(0.48, 0.08, 0);
  face.add(panel);
  const ledGlow = ledPanel(kit, panel, 0.4, 0.5);
  // grilles on the sides, rivets on the lid
  for (const s of [1, -1]) {
    const side = new THREE.Group();
    side.position.set((s * W) / 2 + 0.01, Y - 0.25, 0.35);
    side.rotation.y = (s * Math.PI) / 2;
    core.add(side);
    for (let i = 0; i < 4; i++) {
      const sl = mesh(new THREE.BoxGeometry(0.36, 0.035, 0.04), M.dark);
      sl.position.y = 0.1 - i * 0.07;
      side.add(sl);
    }
    const sock = new THREE.Group();
    sock.position.set((s * W) / 2 + 0.01, 1.3, 0);
    sock.rotation.y = (s * Math.PI) / 2;
    core.add(sock);
    socket(kit, sock);
  }
  for (const [x, z] of [
    [-0.7, -0.6],
    [0.7, -0.6],
    [-0.7, 0.6],
    [0.7, 0.6],
  ] as const) {
    const rv = mesh(Sph(0.03, 8, 6), M.metal, false);
    rv.position.set(x, Y + H / 2 + 0.01, z);
    core.add(rv);
  }
  return {
    mounts: { neckY: Y + H / 2 + 0.02, shoulder: [W / 2 + 0.06, 1.3, 0], hold: [0, 1.0, D / 2 + 0.3] },
    ledGlow,
  };
}

/** The body's own paint goes on the shell skin. */
function shellPaint(kit: PartKit, paint: string) {
  return kit.tint(kit.materials.shell, paint);
}
