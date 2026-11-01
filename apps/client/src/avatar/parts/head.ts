import type { PartPick } from '@saber-side/shared';
import * as THREE from 'three';
import { cutJaw, type Jaw } from './jaw';
import { Cyl, flatRing, onSphere, type PartKit, Sph, TAU, zCyl } from './kit';

// Heads. Each sits on a neck at the body's neck mount, inside a `head` group the animation turns and bobs. Heads with
// an eye hand back its glowing parts, so the animation can pulse them and make the eye glance about. Every head has a
// jaw that swings open to eat (parts/jaw.ts).

export interface BuiltHead {
  /** Turned and bobbed by the animation (an empty group when there's no head). */
  head: THREE.Group;
  eyeCore?: THREE.Mesh;
  eyeGlow?: THREE.Sprite;
  eyeHot?: THREE.Sprite;
  eyeLight?: THREE.PointLight;
  /** The mouth. Missing only when there's no head (the body has a hatch instead). */
  jaw?: Jaw;
}

export function buildHead(
  kit: PartKit,
  core: THREE.Group,
  pick: PartPick<'head'> | null,
  neckY: number,
  eyeLight: boolean,
): BuiltHead {
  if (!pick) return { head: new THREE.Group() };
  switch (pick.part) {
    case 'dome':
      return dome(kit, core, pick.paint, neckY, eyeLight);
    case 'visor':
      return visor(kit, core, pick.paint, neckY, eyeLight);
    case 'stalk':
      return stalk(kit, core, pick.paint, neckY, eyeLight);
  }
}

/** The red eye's light. Point lights are costly, so only the player's own robot has one. */
function light(z: number) {
  const l = new THREE.PointLight(0xff2a10, 1.2, 3.2, 2);
  l.position.z = z;
  return l;
}

/** The classic big-eyed dome, moved unchanged from the legacy robot. */
function dome(kit: PartKit, core: THREE.Group, paint: string, neckY: number, withLight: boolean): BuiltHead {
  const { materials: M, mesh, glow, tint } = kit;
  // neck + head
  const neck = new THREE.Group();
  neck.position.y = neckY;
  core.add(neck);
  const nc = mesh(Cyl(0.22, 0.26, 0.18), M.metal);
  nc.position.y = 0.05;
  neck.add(nc);
  const head = new THREE.Group();
  head.position.y = 0.1;
  neck.add(head);
  const HY = 0.68;
  const skull = mesh(new THREE.SphereGeometry(0.8, 64, 44), tint(M.head, paint));
  skull.scale.y = 0.9;
  skull.position.y = HY;
  head.add(skull);
  // The jaw: the front of the skull below the panel seam under the eye (the texture's seam at v = 0.63, about 23°
  // below the equator, falls on row 28 of 44), 22 of the 64 columns wide (about 120°), swinging down about 35°.
  const jaw = cutJaw(kit, skull, { rows: [28, 38], cols: [5, 27] }, THREE.MathUtils.degToRad(35));
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
  if (withLight) {
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
  return { head, eyeCore, eyeGlow, eyeHot, eyeLight, jaw };
}

/** A rounded helmet with a glowing slot visor and an antenna. */
function visor(kit: PartKit, core: THREE.Group, paint: string, neckY: number, withLight: boolean): BuiltHead {
  const { materials: M, mesh, glow, tint } = kit;
  const neck = new THREE.Group();
  neck.position.y = neckY;
  core.add(neck);
  const nc = mesh(Cyl(0.22, 0.26, 0.18), M.metal);
  nc.position.y = 0.05;
  neck.add(nc);
  const head = new THREE.Group();
  head.position.y = 0.1;
  neck.add(head);
  const HY = 0.52;
  const helmet = mesh(Sph(0.62, 48, 32), tint(M.head, paint));
  helmet.scale.set(1.12, 0.78, 0.98);
  helmet.position.y = HY;
  head.add(helmet);
  // The jaw: the chin below the brim (row 20 of 32 sits under the brim's ring), 16 of 48 columns wide.
  const jaw = cutJaw(kit, helmet, { rows: [20, 28], cols: [4, 20] }, THREE.MathUtils.degToRad(30));
  const crest = mesh(new THREE.BoxGeometry(0.16, 0.08, 1.0), tint(M.head, paint));
  crest.position.y = HY + 0.47;
  head.add(crest);
  const under = mesh(Cyl(0.44, 0.38, 0.1, 32), M.dark);
  under.position.y = 0.06;
  head.add(under);
  const brim = mesh(flatRing(0.66, 0.035, 56), M.metal);
  brim.scale.set(1.05, 1, 0.92);
  brim.position.y = HY - 0.16;
  head.add(brim);

  // the visor: a dark band across the face with a glowing slot in it
  const face = new THREE.Group();
  face.position.set(0, HY + 0.04, 0.5);
  head.add(face);
  face.add(mesh(new THREE.BoxGeometry(0.98, 0.26, 0.24), M.dark));
  for (const y of [-0.14, 0.14]) {
    const edge = mesh(new THREE.BoxGeometry(1.02, 0.04, 0.26), M.metal);
    edge.position.y = y;
    face.add(edge);
  }
  const slot = mesh(new THREE.BoxGeometry(0.82, 0.08, 0.06), M.lens, false);
  slot.position.z = 0.11;
  face.add(slot);
  const eyeCore = mesh(new THREE.BoxGeometry(0.14, 0.06, 0.04), M.core, false);
  eyeCore.position.z = 0.14;
  face.add(eyeCore);
  const eyeGlow = glow(0xff2a10, 0.7, 0.75);
  eyeGlow.position.z = 0.2;
  face.add(eyeGlow);
  const eyeHot = glow(0xff6a4a, 0.22, 0.9);
  eyeHot.position.z = 0.18;
  face.add(eyeHot);
  const eyeLight = withLight ? light(0.45) : undefined;
  if (eyeLight) face.add(eyeLight);

  // ear bolts and an antenna
  for (const s of [1, -1]) {
    const ear = new THREE.Group();
    ear.position.set(s * 0.68, HY, 0);
    ear.rotation.y = (s * Math.PI) / 2;
    head.add(ear);
    ear.add(mesh(zCyl(0.17, 0.19, 0.1, 28), M.dark));
    const r1 = mesh(new THREE.TorusGeometry(0.15, 0.03, 8, 28), M.metal);
    r1.position.z = 0.05;
    ear.add(r1);
  }
  const mast = mesh(Cyl(0.018, 0.026, 0.55, 8), M.metal);
  mast.position.set(0.34, HY + 0.62, -0.18);
  head.add(mast);
  const tip = mesh(Sph(0.05, 14, 10), M.led);
  tip.position.set(0.34, HY + 0.9, -0.18);
  head.add(tip);
  const tipGlow = glow(0xff3a1a, 0.3, 0.8);
  tipGlow.position.copy(tip.position);
  head.add(tipGlow);
  return { head, eyeCore, eyeGlow, eyeHot, eyeLight, jaw };
}

/** One round eye up on a periscope stalk. The stalk sways with the head. */
function stalk(kit: PartKit, core: THREE.Group, paint: string, neckY: number, withLight: boolean): BuiltHead {
  const { materials: M, mesh, glow, tint } = kit;
  const neck = new THREE.Group();
  neck.position.y = neckY;
  core.add(neck);
  const nc = mesh(Cyl(0.2, 0.26, 0.16), M.metal);
  nc.position.y = 0.04;
  neck.add(nc);
  const head = new THREE.Group();
  head.position.y = 0.1;
  neck.add(head);
  const pole = mesh(Cyl(0.065, 0.085, 0.95, 14), M.metal);
  pole.position.y = 0.45;
  head.add(pole);
  for (const y of [0.25, 0.6]) {
    const band = mesh(flatRing(0.09, 0.028, 16), M.dark);
    band.position.y = y;
    head.add(band);
  }

  const EY = 1.18;
  const BR = 0.42;
  const ball = mesh(Sph(BR, 40, 28), tint(M.head, paint));
  ball.position.y = EY;
  head.add(ball);
  // The jaw: the ball below a new seam under the eye (row 21 of 28, 45° below the equator), 14 of 40 columns wide.
  const rows = [21, 26] as const;
  const jaw = cutJaw(kit, ball, { rows, cols: [3, 17] }, THREE.MathUtils.degToRad(45));
  const across = mesh(new THREE.TorusGeometry(BR * Math.sin((rows[0] / 28) * Math.PI) + 0.006, 0.022, 6, 40), M.metal);
  across.rotation.x = Math.PI / 2;
  across.position.y = EY + BR * Math.cos((rows[0] / 28) * Math.PI);
  head.add(across);
  // The old seam runs up over the front and back. The stretch of it on the jaw swings with the jaw.
  const a0 = Math.PI / 2 + (rows[0] / 28) * Math.PI;
  const a1 = Math.PI / 2 + (rows[1] / 28) * Math.PI;
  const seamArc = (from: number, to: number, parent: THREE.Object3D) => {
    const g = new THREE.TorusGeometry(0.425, 0.03, 8, Math.max(2, Math.round((48 * (to - from)) / TAU)), to - from);
    g.rotateZ(from);
    const m = mesh(g, M.metal);
    m.rotation.y = Math.PI / 2;
    m.position.set(0, EY, 0);
    if (parent === jaw.hinge) m.position.sub(jaw.hinge.position);
    parent.add(m);
  };
  seamArc(0, a0, head);
  seamArc(a0, a1, jaw.hinge);
  seamArc(a1, TAU, head);
  const collar = mesh(Cyl(0.16, 0.2, 0.12, 24), M.dark);
  collar.position.y = EY - 0.42;
  head.add(collar);
  const fin = mesh(new THREE.BoxGeometry(0.04, 0.2, 0.34), M.metal);
  fin.position.set(0, EY + 0.45, -0.06);
  head.add(fin);

  const eye = onSphere(new THREE.Group(), 0.36, 0.05, 0);
  eye.position.y += EY;
  head.add(eye);
  eye.add(mesh(zCyl(0.25, 0.27, 0.16, 36), M.dark));
  const er1 = mesh(new THREE.TorusGeometry(0.23, 0.035, 12, 40), M.metal);
  er1.position.z = 0.08;
  eye.add(er1);
  const lensG = new THREE.SphereGeometry(0.18, 32, 16, 0, TAU, 0, Math.PI / 2);
  lensG.rotateX(Math.PI / 2);
  const lens = mesh(lensG, M.lens, false);
  lens.scale.z = 0.45;
  lens.position.z = 0.07;
  eye.add(lens);
  const eyeCore = mesh(Sph(0.045, 14, 10), M.core, false);
  eyeCore.position.z = 0.13;
  eye.add(eyeCore);
  const eyeGlow = glow(0xff2a10, 0.55, 0.75);
  eyeGlow.position.z = 0.18;
  eye.add(eyeGlow);
  const eyeHot = glow(0xff6a4a, 0.16, 0.9);
  eyeHot.position.z = 0.16;
  eye.add(eyeHot);
  const eyeLight = withLight ? light(0.45) : undefined;
  if (eyeLight) eye.add(eyeLight);
  return { head, eyeCore, eyeGlow, eyeHot, eyeLight, jaw };
}
