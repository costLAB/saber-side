import * as THREE from 'three';
import { makeCanvas } from '../render/textures';

// The robot: a rusty ball-bodied bot with a big red eye. Built from primitives, moved unchanged from the legacy game
// (where it was the one and only `bot`). Building it is now a function, so the game can draw any number of robots.

const TAU = Math.PI * 2;

/** The materials a robot is built from. Each robot can bring its own `shell` and `head` to wear its own paint. */
export interface RobotMaterials {
  shell: THREE.Material;
  head: THREE.Material;
  limb: THREE.Material;
  band: THREE.Material;
  drive: THREE.Material;
  metal: THREE.Material;
  dark: THREE.Material;
  tip: THREE.Material;
  lens: THREE.Material;
  core: THREE.Material;
  led: THREE.Material;
}

/** The helpers a robot is built with (the legacy game's, so everything casts and glows the same way). */
export interface RobotKit {
  materials: RobotMaterials;
  mesh(geo: THREE.BufferGeometry, mat: THREE.Material, cast?: boolean): THREE.Mesh;
  glow(color: number, size: number, opacity?: number): THREE.Sprite;
  toTex(c: HTMLCanvasElement, srgb: boolean): THREE.Texture;
}

/** One arm: shoulder, elbow, and wrist joints, fingers, and the current pose the animation eases toward. */
export interface RobotArm {
  s: number;
  cur: { ab: number; sw: number; el: number; ez: number; wr: number; wz: number; curl: number };
  shoulder: THREE.Group;
  elbow: THREE.Group;
  wrist: THREE.Group;
  fingers: { root: THREE.Group; joint: THREE.Group; spread: number }[];
  thumb: THREE.Group;
}

/** The parts the animation moves. `root` is where the robot stands; everything else hangs off it. */
export interface Robot {
  root: THREE.Group;
  lean: THREE.Group;
  squash: THREE.Group;
  spinner: THREE.Group;
  core: THREE.Group;
  drive: THREE.Mesh;
  head: THREE.Group;
  ledGlow: THREE.Sprite;
  eyeCore: THREE.Mesh;
  eyeGlow: THREE.Sprite;
  eyeHot: THREE.Sprite;
  /** Only robots built with `eyeLight` have one: point lights are costly, so remote robots will go without. */
  eyeLight?: THREE.PointLight;
  arms: RobotArm[];
  /** In the left fist: whatever the robot holds is parented here, pointing along the grip's +y. */
  grip: THREE.Group;
  swooshMat: THREE.MeshBasicMaterial;
  swoosh: THREE.Group;
  saberTrailMat: THREE.MeshBasicMaterial;
}

/** Places obj on a sphere of radius r: lat up from the equator, lon from +z toward +x; obj's +z faces outward. */
export function onSphere<T extends THREE.Object3D>(obj: T, r: number, lat: number, lon: number): T {
  obj.position.set(r * Math.cos(lat) * Math.sin(lon), r * Math.sin(lat), r * Math.cos(lat) * Math.cos(lon));
  obj.rotation.set(-lat, lon, 0, 'YXZ');
  return obj;
}

const Cyl = (a: number, b: number, h: number, s = 20) => new THREE.CylinderGeometry(a, b, h, s);
const Sph = (r: number, w = 20, h = 14) => new THREE.SphereGeometry(r, w, h);
const zCyl = (a: number, b: number, h: number, s = 24) => {
  const g = Cyl(a, b, h, s);
  g.rotateX(Math.PI / 2);
  return g;
};

/** A flat arc ribbon (for the spin-attack swooshes). */
function arcGeo(r0: number, r1: number, a0: number, a1: number, seg: number) {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const f = i / seg;
    const a = a0 + (a1 - a0) * f;
    const c = Math.cos(a);
    const s = -Math.sin(a);
    pos.push(c * r0, 0, s * r0, c * r1, 0, s * r1);
    uv.push(f, 0, f, 1);
  }
  for (let i = 0; i < seg; i++) {
    const k = i * 2;
    idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setIndex(idx);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/**
 * Builds a robot. Objects are created in exactly the legacy order: three r128 takes every object's id from
 * Math.random, so a different order would shift the seeded effects the screenshot tests pin down.
 */
export function buildRobot(kit: RobotKit, opts: { eyeLight?: boolean } = {}): Robot {
  const { materials: M, mesh, glow } = kit;
  const root = new THREE.Group();
  const lean = new THREE.Group();
  root.add(lean);
  const squash = new THREE.Group();
  lean.add(squash);
  const spinner = new THREE.Group();
  squash.add(spinner);
  const core = new THREE.Group();
  core.position.y = 0.95;
  spinner.add(core);

  // rolling drive ball peeking out underneath
  const drive = mesh(new THREE.SphereGeometry(0.95, 40, 28), M.drive);
  core.add(drive);
  // fixed lower band + upper shell
  core.add(mesh(new THREE.SphereGeometry(0.985, 64, 12, 0, TAU, 2.12, 0.5), M.band));
  core.add(mesh(new THREE.SphereGeometry(1, 64, 44, 0, TAU, 0, 2.16), M.shell));
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
    const ring = mesh(new THREE.TorusGeometry(0.19, 0.04, 10, 28), M.metal);
    sock.add(ring);
    sock.add(mesh(zCyl(0.17, 0.17, 0.06), M.dark));
  }

  // neck + head
  const neck = new THREE.Group();
  neck.position.y = 0.9;
  core.add(neck);
  const nc = mesh(Cyl(0.22, 0.26, 0.18), M.metal);
  nc.position.y = 0.05;
  neck.add(nc);
  const head = new THREE.Group();
  head.position.y = 0.1;
  neck.add(head);
  const HY = 0.68;
  const skull = mesh(new THREE.SphereGeometry(0.8, 64, 44), M.head);
  skull.scale.y = 0.9;
  skull.position.y = HY;
  head.add(skull);
  const under = mesh(Cyl(0.44, 0.38, 0.1, 32), M.dark);
  under.position.y = 0.04;
  head.add(under);
  const underRing = mesh(new THREE.TorusGeometry(0.5, 0.03, 8, 40), M.metal);
  underRing.rotation.x = Math.PI / 2;
  underRing.position.y = 0.1;
  head.add(underRing);

  // the big red eye
  const eye = onSphere(new THREE.Group(), 0.7, 0.13, 0);
  eye.position.y += HY;
  head.add(eye);
  eye.add(mesh(zCyl(0.36, 0.38, 0.2, 40), M.dark));
  const er1 = mesh(new THREE.TorusGeometry(0.33, 0.05, 14, 48), M.metal);
  er1.position.z = 0.1;
  eye.add(er1);
  const er2 = mesh(new THREE.TorusGeometry(0.255, 0.025, 10, 40), M.dark);
  er2.position.z = 0.11;
  eye.add(er2);
  const lensG = new THREE.SphereGeometry(0.25, 40, 20, 0, TAU, 0, Math.PI / 2);
  lensG.rotateX(Math.PI / 2);
  const lens = mesh(lensG, M.lens, false);
  lens.scale.z = 0.45;
  lens.position.z = 0.08;
  eye.add(lens);
  const eyeCore = mesh(Sph(0.06, 16, 12), M.core, false);
  eyeCore.position.z = 0.17;
  eye.add(eyeCore);
  const eyeGlow = glow(0xff2a10, 0.75, 0.75);
  eyeGlow.position.z = 0.22;
  eye.add(eyeGlow);
  const eyeHot = glow(0xff6a4a, 0.2, 0.9);
  eyeHot.position.z = 0.2;
  eye.add(eyeHot);
  const spec = new THREE.Mesh(
    Sph(0.03, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }),
  );
  spec.scale.set(1.4, 0.8, 0.4);
  spec.position.set(0.09, 0.1, 0.17);
  eye.add(spec);
  let eyeLight: THREE.PointLight | undefined;
  if (opts.eyeLight) {
    eyeLight = new THREE.PointLight(0xff2a10, 1.2, 3.2, 2);
    eyeLight.position.z = 0.5;
    eye.add(eyeLight);
  }

  // ear discs
  for (const s of [1, -1]) {
    const ear = onSphere(new THREE.Group(), 0.7, 0.02, (s * Math.PI) / 2);
    ear.position.y += HY;
    head.add(ear);
    ear.add(mesh(zCyl(0.27, 0.29, 0.16, 32), M.dark));
    const r1 = mesh(new THREE.TorusGeometry(0.25, 0.04, 10, 36), M.metal);
    r1.position.z = 0.08;
    ear.add(r1);
    const disc = mesh(zCyl(0.17, 0.17, 0.04, 28), M.metal);
    disc.position.z = 0.08;
    ear.add(disc);
    const nub = mesh(zCyl(0.05, 0.06, 0.06, 16), M.dark);
    nub.position.z = 0.11;
    ear.add(nub);
  }
  // little screws dotted on the head
  for (const [lat, lon] of [
    [0.75, 0.6],
    [0.6, -0.9],
    [0.35, 2.4],
    [-0.25, 0.55],
    [-0.3, -0.6],
    [0.95, 2.9],
  ] as const) {
    const sc = onSphere(mesh(Sph(0.022, 8, 6), M.metal, false), 0.79, lat, lon);
    sc.position.y = sc.position.y * 0.9 + HY;
    head.add(sc);
  }

  // arms
  const arms = [1, -1].map((s): RobotArm => {
    const cur = { ab: 0.35, sw: 0, el: 0.45, ez: 0, wr: 0, wz: 0, curl: 0.3 };
    const shoulder = new THREE.Group();
    shoulder.position.set(s * 0.93, 0.22, 0.03);
    core.add(shoulder);
    shoulder.add(mesh(Sph(0.15, 20, 14), M.metal));
    const cuff = mesh(Cyl(0.1, 0.1, 0.06, 16), M.dark);
    cuff.position.y = -0.12;
    shoulder.add(cuff);
    const up = mesh(Cyl(0.095, 0.09, 0.26, 16), M.limb);
    up.position.y = -0.27;
    shoulder.add(up);
    const elbow = new THREE.Group();
    elbow.position.y = -0.44;
    shoulder.add(elbow);
    elbow.add(mesh(Sph(0.11, 18, 12), M.metal));
    const c2 = mesh(Cyl(0.12, 0.12, 0.05, 16), M.dark);
    c2.position.y = -0.09;
    elbow.add(c2);
    const fore = mesh(Cyl(0.12, 0.13, 0.27, 16), M.limb);
    fore.position.y = -0.25;
    elbow.add(fore);
    const c3 = mesh(Cyl(0.11, 0.11, 0.05, 16), M.dark);
    c3.position.y = -0.41;
    elbow.add(c3);
    const wrist = new THREE.Group();
    wrist.position.y = -0.45;
    wrist.scale.setScalar(1.2);
    elbow.add(wrist);
    const wj = mesh(Cyl(0.06, 0.06, 0.07, 12), M.metal);
    wj.position.y = -0.02;
    wrist.add(wj);
    const palm = mesh(new THREE.BoxGeometry(0.2, 0.17, 0.11), M.limb);
    palm.position.y = -0.13;
    wrist.add(palm);
    const fingers = [-0.05, 0.05].map((fx, i) => {
      const froot = new THREE.Group();
      froot.position.set(fx, -0.22, 0);
      wrist.add(froot);
      froot.add(mesh(Sph(0.032, 10, 8), M.metal));
      const seg = mesh(Cyl(0.028, 0.03, 0.08, 10), M.limb);
      seg.position.y = -0.05;
      froot.add(seg);
      const joint = new THREE.Group();
      joint.position.y = -0.1;
      froot.add(joint);
      joint.add(mesh(Sph(0.028, 10, 8), M.metal));
      const t = mesh(Cyl(0.034, 0.032, 0.07, 10), M.tip);
      t.position.y = -0.05;
      joint.add(t);
      const cap = mesh(Sph(0.034, 10, 8), M.tip);
      cap.position.y = -0.085;
      joint.add(cap);
      return { root: froot, joint, spread: (i - 0.5) * 0.2 };
    });
    const thumb = new THREE.Group();
    thumb.position.set(s * 0.1, -0.12, 0.03);
    wrist.add(thumb);
    thumb.add(mesh(Sph(0.03, 10, 8), M.metal));
    const ts = mesh(Cyl(0.03, 0.032, 0.08, 10), M.limb);
    ts.position.y = -0.05;
    thumb.add(ts);
    const tt = mesh(Sph(0.036, 10, 8), M.tip);
    tt.position.y = -0.1;
    tt.scale.y = 1.3;
    thumb.add(tt);
    return { s, cur, shoulder, elbow, wrist, fingers, thumb };
  });

  // grip in the left fist: whatever the robot holds is parented here, pointing along the grip's +y
  const grip = new THREE.Group();
  grip.position.set(0, -0.24, 0.05);
  (arms[0] as RobotArm).wrist.add(grip);

  // spin-attack swooshes ride on the spinner
  const sc = makeCanvas(256, 32);
  const sg = sc.getContext('2d') as CanvasRenderingContext2D;
  const hg = sg.createLinearGradient(0, 0, 256, 0);
  hg.addColorStop(0, 'rgba(255,255,255,0)');
  hg.addColorStop(1, 'rgba(255,255,255,1)');
  sg.fillStyle = hg;
  sg.fillRect(0, 0, 256, 32);
  sg.globalCompositeOperation = 'destination-in';
  const vg = sg.createLinearGradient(0, 0, 0, 32);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(0.8, 'rgba(0,0,0,1)');
  vg.addColorStop(1, 'rgba(0,0,0,0.2)');
  sg.fillStyle = vg;
  sg.fillRect(0, 0, 256, 32);
  const swooshTex = kit.toTex(sc, true);
  const swooshMat = new THREE.MeshBasicMaterial({
    map: swooshTex,
    color: 0xffa865,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const swoosh = new THREE.Group();
  swoosh.position.y = 1.17;
  spinner.add(swoosh);
  for (const off of [0, Math.PI]) {
    const a = new THREE.Mesh(arcGeo(1.0, 2.15, -2.4, 0, 48), swooshMat);
    a.rotation.y = off;
    swoosh.add(a);
    const b = new THREE.Mesh(arcGeo(1.6, 2.05, -1.5, 0, 32), swooshMat);
    b.rotation.y = off;
    b.position.y = 0.12;
    swoosh.add(b);
  }
  const saberTrailMat = new THREE.MeshBasicMaterial({
    map: swooshTex,
    color: 0xff3020,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  swoosh.add(new THREE.Mesh(arcGeo(2.3, 3.7, -2.2, 0, 48), saberTrailMat));

  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).material === swooshMat) {
      o.castShadow = false;
      o.receiveShadow = false;
    }
  });

  return {
    root,
    lean,
    squash,
    spinner,
    core,
    drive,
    head,
    ledGlow,
    eyeCore,
    eyeGlow,
    eyeHot,
    eyeLight,
    arms,
    grip,
    swooshMat,
    swoosh,
    saberTrailMat,
  };
}

/** Turns an arm's pose numbers (`arm.cur`) into joint rotations, exactly as the legacy animation does. */
export function applyArmPose(arm: RobotArm) {
  const c = arm.cur;
  const s = arm.s;
  arm.shoulder.rotation.set(c.sw, 0, s * c.ab);
  arm.elbow.rotation.set(-c.el, 0, c.ez);
  arm.wrist.rotation.set(c.wr, 0, s * c.wz);
  for (const f of arm.fingers) {
    f.root.rotation.set(-c.curl * 1.1, 0, f.spread * (1 - c.curl));
    f.joint.rotation.x = -c.curl * 1.4;
  }
  arm.thumb.rotation.set(-c.curl * 0.9, 0, s * (0.5 - c.curl * 0.35));
}
