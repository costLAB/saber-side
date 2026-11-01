import { classicBuild, type RobotBuild } from '@saber-side/shared';
import * as THREE from 'three';
import { makeCanvas } from '../render/textures';
import { type BuiltArms, buildArms, type RobotArm } from './parts/arms';
import { buildBody, buildMobility } from './parts/body';
import { buildHead } from './parts/head';
import { bodyHatch, type Jaw, setJaw } from './parts/jaw';
import { type BodyMounts, type PartKit, partKit, type RobotKit } from './parts/kit';

// A robot, put together from parts (packages/shared content/robot-parts.ts): a wheel, then a body, a head, and arms,
// each in its own paint. The classic rusty ball-bodied bot with the big red eye is one build among the rest; its parts
// were moved unchanged from the legacy game (where it was the one and only `bot`).

export type { RobotArm } from './parts/arms';
export type { Jaw } from './parts/jaw';
export type { RobotKit, RobotMaterials } from './parts/kit';

/** The parts the animation moves. `root` is where the robot stands; everything else hangs off it. */
export interface Robot {
  /** What it was built from. */
  build: RobotBuild;
  root: THREE.Group;
  lean: THREE.Group;
  squash: THREE.Group;
  spinner: THREE.Group;
  core: THREE.Group;
  /** The wheel's drive ball, which spins as the robot rolls. */
  drive: THREE.Mesh;
  /** Turned by the animation. Empty on a robot with no head. */
  head: THREE.Group;
  /** The body's blinking LED, if it has one. */
  ledGlow?: THREE.Sprite;
  /** The eye's parts, if the head has one. */
  eyeCore?: THREE.Mesh;
  eyeGlow?: THREE.Sprite;
  eyeHot?: THREE.Sprite;
  /** Only robots built with `eyeLight` have one: point lights are costly, so remote robots will go without. */
  eyeLight?: THREE.PointLight;
  /** The mouth it eats with: the head's jaw, or a hatch on the body when there's no head. */
  jaw: Jaw;
  /** Empty on a robot with no arms. */
  arms: RobotArm[];
  /** In the left fist (or in front of an armless body): whatever the robot holds is parented here, along +y. */
  grip: THREE.Group;
  swooshMat: THREE.MeshBasicMaterial;
  swoosh: THREE.Group;
  saberTrailMat: THREE.MeshBasicMaterial;
}

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
 * Builds a robot from its parts, in slot order: wheel, body, head, arms. Objects are created in exactly the legacy
 * order for the classic build: three r128 takes every object's id from Math.random, so a different order would shift
 * the seeded effects the screenshot tests pin down.
 */
export function buildRobot(
  kit: RobotKit,
  build: RobotBuild = classicBuild(),
  opts: { eyeLight?: boolean } = {},
): Robot {
  const parts = partKit(kit);
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

  const drive = buildMobility(parts, core, build.mobility);
  const body = buildBody(parts, core, build.body);
  const head = buildHead(parts, core, build.head, body.mounts.neckY, !!opts.eyeLight);
  const { arms, grip }: BuiltArms = buildArms(parts, core, build.arms, body.mounts);
  const jaw = head.jaw ?? hatch(parts, core, body.mounts.mouth);

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
    build,
    root,
    lean,
    squash,
    spinner,
    core,
    drive,
    head: head.head,
    eyeCore: head.eyeCore,
    eyeGlow: head.eyeGlow,
    eyeHot: head.eyeHot,
    eyeLight: head.eyeLight,
    ledGlow: body.ledGlow,
    jaw,
    arms,
    grip,
    swooshMat,
    swoosh,
    saberTrailMat,
  };
}

/** A robot with no head eats through a hatch on the front of its body (or on top of a bare wheel). */
function hatch(kit: PartKit, core: THREE.Group, at: BodyMounts['mouth']): Jaw {
  const mount = new THREE.Group();
  mount.position.set(...at.position);
  mount.rotation.set(-at.lat, at.lon, 0, 'YXZ');
  core.add(mount);
  return bodyHatch(kit, mount, at.w, at.h);
}

/** Opens a robot's mouth this far: 0 shut, 1 wide open. */
export function openMouth(robot: Robot, amount: number) {
  setJaw(robot.jaw, amount);
}

/** Eases the arms into the relaxed pose the animation starts from (for a robot that isn't animated, like a preview). */
export function restPose(robot: Robot) {
  for (const A of robot.arms) {
    Object.assign(A.cur, { ab: 0.36, sw: 0.06, el: 0.45, ez: 0, wr: 0.1, wz: 0, curl: 0.3 });
    applyArmPose(A);
  }
}

/**
 * Frees a robot's GPU resources once it's gone. Shared materials (and their textures) belong to the kit and stay;
 * its own geometry, tinted copies, and swoosh materials go.
 */
export function disposeRobot(robot: Robot, shared: Iterable<THREE.Material>) {
  const keep = new Set(shared);
  const materials = new Set<THREE.Material>();
  robot.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.geometry.dispose();
    const mat = (o as THREE.Mesh | THREE.Sprite).material;
    if (mat) for (const x of Array.isArray(mat) ? mat : [mat]) if (!keep.has(x)) materials.add(x);
  });
  for (const m of materials) m.dispose();
  robot.swooshMat.map?.dispose();
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
