import type { PartPick } from '@saber-side/shared';
import * as THREE from 'three';
import { type BodyMounts, Cyl, flatRing, type PartKit, Sph } from './kit';

// Arms. Every pair has the same joints (shoulder, elbow, wrist, fingers, thumb), so one animation poses them all.
// What the robot holds goes in the left hand's grip; a robot without arms carries it in front of its body.

/** One arm: its joints, and the pose the animation eases toward. */
export interface RobotArm {
  /** 1 for the left arm (+x), -1 for the right. */
  s: number;
  cur: { ab: number; sw: number; el: number; ez: number; wr: number; wz: number; curl: number };
  shoulder: THREE.Group;
  elbow: THREE.Group;
  wrist: THREE.Group;
  fingers: { root: THREE.Group; joint: THREE.Group; spread: number }[];
  thumb: THREE.Group;
}

export interface BuiltArms {
  arms: RobotArm[];
  /** Whatever the robot holds is parented here, pointing along the grip's +y. */
  grip: THREE.Group;
}

export function buildArms(kit: PartKit, core: THREE.Group, pick: PartPick<'arms'> | null, at: BodyMounts): BuiltArms {
  if (!pick) {
    const grip = new THREE.Group();
    grip.position.set(...at.hold);
    core.add(grip);
    return { arms: [], grip };
  }
  const arm = { grabber, pincer, noodle }[pick.part];
  const limb = kit.tint(kit.materials.limb, pick.paint);
  const arms = [1, -1].map((s) => {
    const cur = { ab: 0.35, sw: 0, el: 0.45, ez: 0, wr: 0, wz: 0, curl: 0.3 };
    const shoulder = new THREE.Group();
    shoulder.position.set(s * at.shoulder[0], at.shoulder[1], at.shoulder[2]);
    core.add(shoulder);
    return { s, cur, shoulder, ...arm(kit, limb, shoulder, s) };
  });
  const grip = new THREE.Group();
  const [gx, gy, gz] = GRIP[pick.part];
  grip.position.set(gx, gy, gz);
  (arms[0] as RobotArm).wrist.add(grip);
  return { arms, grip };
}

/** Where each kind of hand holds things, in its wrist's frame. */
const GRIP = { grabber: [0, -0.24, 0.05], pincer: [0, -0.26, 0.05], noodle: [0, -0.12, 0.1] } as const;

type Joints = Omit<RobotArm, 's' | 'cur' | 'shoulder'>;

/** The classic jointed arms with two fingers and a thumb, moved unchanged from the legacy robot. */
function grabber(kit: PartKit, limb: THREE.Material, shoulder: THREE.Group, s: number): Joints {
  const { materials: M, mesh } = kit;
  shoulder.add(mesh(Sph(0.15, 20, 14), M.metal));
  const cuff = mesh(Cyl(0.1, 0.1, 0.06, 16), M.dark);
  cuff.position.y = -0.12;
  shoulder.add(cuff);
  const up = mesh(Cyl(0.095, 0.09, 0.26, 16), limb);
  up.position.y = -0.27;
  shoulder.add(up);
  const elbow = new THREE.Group();
  elbow.position.y = -0.44;
  shoulder.add(elbow);
  elbow.add(mesh(Sph(0.11, 18, 12), M.metal));
  const c2 = mesh(Cyl(0.12, 0.12, 0.05, 16), M.dark);
  c2.position.y = -0.09;
  elbow.add(c2);
  const fore = mesh(Cyl(0.12, 0.13, 0.27, 16), limb);
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
  const palm = mesh(new THREE.BoxGeometry(0.2, 0.17, 0.11), limb);
  palm.position.y = -0.13;
  wrist.add(palm);
  const fingers = [-0.05, 0.05].map((fx, i) => {
    const froot = new THREE.Group();
    froot.position.set(fx, -0.22, 0);
    wrist.add(froot);
    froot.add(mesh(Sph(0.032, 10, 8), M.metal));
    const seg = mesh(Cyl(0.028, 0.03, 0.08, 10), limb);
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
  const ts = mesh(Cyl(0.03, 0.032, 0.08, 10), limb);
  ts.position.y = -0.05;
  thumb.add(ts);
  const tt = mesh(Sph(0.036, 10, 8), M.tip);
  tt.position.y = -0.1;
  tt.scale.y = 1.3;
  thumb.add(tt);
  return { elbow, wrist, fingers, thumb };
}

/** Chunky arms ending in a two-jawed claw. */
function pincer(kit: PartKit, limb: THREE.Material, shoulder: THREE.Group, s: number): Joints {
  const { materials: M, mesh } = kit;
  shoulder.add(mesh(Sph(0.17, 20, 14), M.metal));
  const up = mesh(new THREE.BoxGeometry(0.2, 0.3, 0.2), limb);
  up.position.y = -0.26;
  shoulder.add(up);
  for (const y of [-0.13, -0.39]) {
    const strap = mesh(new THREE.BoxGeometry(0.23, 0.035, 0.23), M.dark);
    strap.position.y = y;
    shoulder.add(strap);
  }
  const elbow = new THREE.Group();
  elbow.position.y = -0.47;
  shoulder.add(elbow);
  elbow.add(mesh(Sph(0.12, 18, 12), M.metal));
  const fore = mesh(Cyl(0.15, 0.11, 0.32, 16), limb);
  fore.position.y = -0.24;
  elbow.add(fore);
  const cuff = mesh(Cyl(0.12, 0.12, 0.06, 16), M.dark);
  cuff.position.y = -0.42;
  elbow.add(cuff);
  const wrist = new THREE.Group();
  wrist.position.y = -0.46;
  wrist.scale.setScalar(1.15);
  elbow.add(wrist);
  const base = mesh(new THREE.BoxGeometry(0.24, 0.1, 0.15), M.metal);
  base.position.y = -0.05;
  wrist.add(base);
  const fingers = [-1, 1].map((side) => {
    const root = new THREE.Group();
    root.position.set(side * 0.08, -0.1, 0);
    wrist.add(root);
    root.add(mesh(Sph(0.035, 10, 8), M.dark));
    const jaw = mesh(new THREE.BoxGeometry(0.05, 0.16, 0.09), limb);
    jaw.position.set(side * 0.02, -0.08, 0);
    jaw.rotation.z = side * 0.25;
    root.add(jaw);
    const joint = new THREE.Group();
    joint.position.set(side * 0.03, -0.16, 0);
    root.add(joint);
    const tip = mesh(new THREE.ConeGeometry(0.045, 0.13, 6), M.tip);
    tip.rotation.z = Math.PI - side * 0.6;
    tip.position.set(-side * 0.025, -0.04, 0);
    joint.add(tip);
    return { root, joint, spread: side * 0.45 };
  });
  // the claw has no thumb, but the animation still needs one to pose
  const thumb = new THREE.Group();
  thumb.position.set(s * 0.12, -0.05, 0);
  wrist.add(thumb);
  thumb.add(mesh(Sph(0.025, 8, 6), M.metal, false));
  return { elbow, wrist, fingers, thumb };
}

/** Long, bendy hose arms with ball hands. */
function noodle(kit: PartKit, limb: THREE.Material, shoulder: THREE.Group, _s: number): Joints {
  const { materials: M, mesh } = kit;
  shoulder.add(mesh(Sph(0.12, 18, 12), M.metal));
  const ribs = (parent: THREE.Group) => {
    const hose = mesh(Cyl(0.05, 0.05, 0.4, 10), limb);
    hose.position.y = -0.22;
    parent.add(hose);
    for (let i = 0; i < 4; i++) {
      const rib = mesh(flatRing(0.055, 0.015, 14), M.dark);
      rib.position.y = -0.07 - i * 0.1;
      parent.add(rib);
    }
  };
  ribs(shoulder);
  const elbow = new THREE.Group();
  elbow.position.y = -0.44;
  shoulder.add(elbow);
  elbow.add(mesh(Sph(0.075, 14, 10), M.metal));
  ribs(elbow);
  const wrist = new THREE.Group();
  wrist.position.y = -0.46;
  elbow.add(wrist);
  const hand = mesh(Sph(0.12, 18, 12), limb);
  hand.position.y = -0.08;
  wrist.add(hand);
  const knuckle = mesh(flatRing(0.1, 0.022, 20), M.dark);
  knuckle.position.y = -0.04;
  wrist.add(knuckle);
  // ball hands: no fingers, and a thumb with nothing on it
  const thumb = new THREE.Group();
  wrist.add(thumb);
  return { elbow, wrist, fingers: [], thumb };
}
