import * as THREE from 'three';
import { makeCanvas } from '../../render/textures';
import { CAT, catLook, INK, linear } from './cat-look';
import type { BodyMounts, PartKit, RobotKit } from './kit';
import {
  decal,
  ellipsoid,
  grooveCurve,
  type HeadShape,
  headShape,
  pressRibs,
  type Ribs,
  ribbedSurfaceAt,
  type SuperShape,
  superGeometry,
  superSurface,
  taperedTube,
} from './sketch-shapes';

// Patch, the sketchbook pumpkin, as robot parts (docs/initiatives/sketchbook-characters.md): a wide ribbed pumpkin
// head with glowing yellow eyes in dark orange sockets, an open grin with a tongue, and a curling brown stem; a ribbed
// orange bell of a body with a gray chest panel of four lit red squares; and long striped arms with dark hooked
// claws. Drawn the way Snatch and Astro are (cat-look.ts): cel-shaded on a stepped ramp, with thick outlines. Paint
// covers the orange skin and the arms' peach bands; the eyes, grin, stem, panel, and claws keep their colors.
//
// The head and body are in model units, inside groups scaled PATCH_SCALE. The arms are in the game's units, since
// their joints are the same as every other arm's.

export const PATCH_SCALE = 0.9;

/** The owner's close-up's colors, as sRGB hex. */
export const PATCH = {
  orange: '#f7861c',
  socket: '#d9600f',
  stem: '#8a4a2a',
  stemTop: '#b8764a',
  brown: '#5a3d36',
  peach: '#f7cba6',
  tan: '#e9a678',
  claw: '#4e4a4c',
  panel: '#5d595b',
  light: '#ff4a1c',
  lightCore: '#fff0c8',
  eye: '#ffe66a',
  shine: '#ffd9a8',
} as const;

// ---------- the head: a wide ribbed pumpkin ----------

/** The pumpkin: wide, a little flattened, narrower at the top than at its jaw. The same generator as every head. */
const HEAD = { a: 1.56, b: 1.02, c: 1.12, p: 2.3, taper: 0.12 } as const;
/** Ten lobes, with a groove straight down the middle of the face, as in the drawing. */
const HEAD_RIBS: Ribs = { n: 10, depth: 0.07 };
const HEAD_Y = 0.88;
const HW = 128;
const HH = 96;

const pumpkin = superSurface(HEAD);
const face = ribbedSurfaceAt(HEAD, HEAD_RIBS);

let patchShape: HeadShape | undefined;
/** The pumpkin, with its jaw in the chin under the grin. */
function patchHeadShape(): HeadShape {
  patchShape ??= headShape(HEAD, { top: -0.55, bottom: -0.88, half: 0.44 }, HW, HH, HEAD_RIBS);
  return patchShape;
}

/** The eyes' middles, and the grin's. */
const EYE = { x: 0.66, y: 0.05, socket: 0.37, glow: 0.24 } as const;
const GRIN = { cx: 0, cy: -0.34, rx: 0.31, ry: 0.18 } as const;

type Ctx = CanvasRenderingContext2D;

/** A socket: dark orange, shading deeper toward its rim, ringed in ink. */
function drawSocket(g: Ctx, w: number) {
  const R = w / 2;
  g.fillStyle = CAT.ink;
  g.beginPath();
  g.arc(R, R, R, 0, Math.PI * 2);
  g.fill();
  const fill = g.createRadialGradient(R * 0.92, R * 1.1, 0, R, R, R * 0.92);
  fill.addColorStop(0, '#f0761a');
  fill.addColorStop(0.7, PATCH.socket);
  fill.addColorStop(1, '#b4480a');
  g.fillStyle = fill;
  g.beginPath();
  g.arc(R, R, R * 0.92, 0, Math.PI * 2);
  g.fill();
}

/** A glowing eye: white-hot in the middle, yellow, then a hot orange edge, ringed thin in ink. */
function drawEye(g: Ctx, w: number) {
  const R = w / 2;
  g.fillStyle = '#3a1a08';
  g.beginPath();
  g.arc(R, R, R, 0, Math.PI * 2);
  g.fill();
  const glow = g.createRadialGradient(R, R, 0, R, R, R * 0.93);
  glow.addColorStop(0, '#fffde6');
  glow.addColorStop(0.45, '#fff3a0');
  glow.addColorStop(0.75, PATCH.eye);
  glow.addColorStop(0.92, '#ffb21e');
  glow.addColorStop(1, '#f07a10');
  g.fillStyle = glow;
  g.beginPath();
  g.arc(R, R, R * 0.93, 0, Math.PI * 2);
  g.fill();
}

/** The grin: a wide open D, ink black, with an orange tongue at its bottom; clear around it. */
function drawGrin(g: Ctx, w: number, h: number) {
  const mouth = () => {
    g.beginPath();
    g.moveTo(w * 0.06, h * 0.12);
    g.quadraticCurveTo(w * 0.5, h * 0.3, w * 0.94, h * 0.12);
    g.bezierCurveTo(w * 0.94, h * 0.75, w * 0.7, h * 0.96, w * 0.5, h * 0.96);
    g.bezierCurveTo(w * 0.3, h * 0.96, w * 0.06, h * 0.75, w * 0.06, h * 0.12);
    g.closePath();
  };
  g.fillStyle = '#1b0f0c';
  mouth();
  g.fill();
  g.save();
  mouth();
  g.clip();
  g.fillStyle = '#f2733a';
  g.beginPath();
  g.ellipse(w * 0.52, h * 0.98, w * 0.27, h * 0.36, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#f9a06e';
  g.beginPath();
  g.ellipse(w * 0.48, h * 0.78, w * 0.1, h * 0.06, -0.2, 0, Math.PI * 2);
  g.fill();
  g.restore();
  g.lineJoin = 'round';
  g.strokeStyle = CAT.ink;
  g.lineWidth = w * 0.04;
  mouth();
  g.stroke();
}

interface PatchSkins {
  socket: THREE.Texture;
  eye: THREE.Texture;
  grin: THREE.Texture;
}

const skinCache = new WeakMap<RobotKit['materials'], PatchSkins>();
/** Patch's pictures, drawn once and shared by every Patch. */
function patchSkins(kit: RobotKit): PatchSkins {
  let skins = skinCache.get(kit.materials);
  if (!skins) {
    const draw = (w: number, h: number, f: (g: Ctx, w: number, h: number) => void) => {
      const c = makeCanvas(w, h);
      f(c.getContext('2d') as Ctx, w, h);
      return kit.toTex(c, true);
    };
    skins = {
      socket: draw(256, 256, drawSocket),
      eye: draw(256, 256, drawEye),
      grin: draw(384, 216, drawGrin),
    };
    skinCache.set(kit.materials, skins);
  }
  return skins;
}

/** Thin ink lines down the grooves, between `y0` and `y1`, on a ribbed shape: the drawing's lines between the lobes. */
function grooveLines(
  kit: PartKit,
  parent: THREE.Object3D,
  S: SuperShape,
  ribs: Ribs,
  y0: number,
  y1: number,
  width: number,
) {
  const ink = new THREE.MeshBasicMaterial({ color: linear(CAT.ink) });
  for (let k = 0; k < ribs.n; k++) {
    parent.add(kit.mesh(new THREE.TubeGeometry(grooveCurve(S, ribs, k, y0, y1), 32, width, 5, false), ink, false));
  }
}

export interface BuiltPatchHead {
  head: THREE.Group;
  jaw: { hinge: THREE.Group; open: number; amount: number };
}

/** Patch's pumpkin, on a neck at `neckY` (the pumpkin sits right on the body, as in the drawing). */
export function patchHead(kit: PartKit, core: THREE.Group, paint: string, neckY: number): BuiltPatchHead {
  const look = catLook(kit, paint);
  const { mesh } = kit;
  const skins = patchSkins(kit);
  const neck = new THREE.Group();
  neck.position.y = neckY;
  core.add(neck);
  const head = new THREE.Group();
  head.position.y = 0.1;
  neck.add(head);
  const skull = new THREE.Group();
  skull.position.y = HEAD_Y;
  skull.scale.setScalar(PATCH_SCALE);
  head.add(skull);

  const shape = patchHeadShape();
  const skin = look.fur(PATCH.orange);
  skull.add(look.ink(mesh(shape.kept, skin), INK.thick, shape.full));
  grooveLines(kit, skull, HEAD, HEAD_RIBS, -0.86 * HEAD.b, 0.86 * HEAD.b, 0.011);
  // The jaw swings down from a hinge across its top back corners, and the dark of the mouth sits behind it.
  const hinge = new THREE.Group();
  hinge.position.copy(shape.hinge);
  skull.add(hinge);
  const jaw = mesh(shape.jaw, skin);
  jaw.position.copy(shape.hinge).negate();
  hinge.add(jaw);
  const mouth = mesh(ellipsoid(0.36, 0.14, 0.24, 20, 14), kit.materials.dark, false);
  mouth.position.copy(shape.mouth);
  skull.add(mouth);

  // the eyes: glowing discs in dark sockets. Glows are unlit, not lights (D9).
  const eyeMat = new THREE.MeshBasicMaterial({ map: skins.eye });
  const socketMat = look.painted(skins.socket);
  for (const side of [1, -1] as const) {
    const cx = side * EYE.x;
    skull.add(
      mesh(
        decal(face, { cx, cy: EYE.y, rx: EYE.socket, ry: EYE.socket }, () => 0.012),
        socketMat,
        false,
      ),
    );
    const eye = { cx, cy: EYE.y, rx: EYE.glow, ry: EYE.glow };
    skull.add(
      mesh(
        decal(face, eye, (t) => 0.03 + 0.035 * (1 - t * t)),
        eyeMat,
        false,
      ),
    );
    // a soft halo, which stays put (the legacy eye animation is the classic eye's)
    const halo = kit.glow(0xffb43a, 0.8, 0.5);
    const mid = face(cx, EYE.y);
    halo.position.copy(mid.p).addScaledVector(mid.n, 0.12);
    skull.add(halo);
  }

  // the grin, laid on the face above the jaw
  const grinMat = look.painted(skins.grin);
  grinMat.alphaTest = 0.5;
  skull.add(
    mesh(
      decal(face, { ...GRIN, n: 2 }, () => 0.014, 12, 48),
      grinMat,
      false,
    ),
  );

  // the stem: brown, curling over to one side, with a lighter cut end
  const top = pumpkin.topY(0, 0);
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, top - 0.12, 0),
    new THREE.Vector3(0.02, top + 0.2, -0.02),
    new THREE.Vector3(0.12, top + 0.46, -0.04),
    new THREE.Vector3(0.3, top + 0.62, -0.05),
  ]);
  const stem = look.ink(mesh(taperedTube(curve, 0.15, 0.1, 20, 14), look.toon(PATCH.stem)), INK.thin);
  skull.add(stem);
  const end = curve.getPointAt(1);
  const tangent = curve.getTangentAt(1);
  const cap = look.ink(mesh(new THREE.CircleGeometry(0.1, 20), look.toon(PATCH.stemTop)), INK.thin * 0.6);
  cap.position.copy(end);
  cap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent);
  skull.add(cap);

  return { head, jaw: { hinge, open: 0.45, amount: 0 } };
}

// ---------- the body: a ribbed orange bell with a chest panel ----------

/** Where the body's bottom sits, above the wheel's middle. On the small roller, it comes down to just off the floor. */
const BODY_Y = 0.55;
/** The bell: rounder at the bottom, narrowing to the top, with the head's lobes. */
const BODY = { a: 0.8, b: 0.62, c: 0.72, p: 2.3, taper: 0.28 } as const;
const BODY_RIBS: Ribs = { n: 10, depth: 0.05 };

const onBody = (x: number, y: number, z: number): [number, number, number] => [
  x * PATCH_SCALE,
  BODY_Y + y * PATCH_SCALE,
  z * PATCH_SCALE,
];

/** A small box with rounded corners, from the shared generator. */
const softBox = (a: number, b: number, c: number) => superGeometry({ a, b, c, p: 5, taper: 0 }, 32, 24);

export interface BuiltPatchBody {
  mounts: BodyMounts;
  /** The chest lights' halo. */
  ledGlow: THREE.Sprite;
}

export function patchBody(kit: PartKit, core: THREE.Group, paint: string): BuiltPatchBody {
  const look = catLook(kit, paint);
  const { mesh } = kit;
  const body = new THREE.Group();
  body.position.y = BODY_Y;
  body.scale.setScalar(PATCH_SCALE);
  core.add(body);
  const bell = new THREE.Group();
  bell.position.y = BODY.b;
  body.add(bell);
  const shape = pressRibs(superGeometry(BODY, 64, 48), BODY, BODY_RIBS);
  bell.add(look.ink(mesh(shape, look.fur(PATCH.orange)), INK.thick));
  grooveLines(kit, bell, BODY, BODY_RIBS, -0.85 * BODY.b, 0.85 * BODY.b, 0.01);

  // the chest panel: gray, with four lit red squares
  const front = ribbedSurfaceAt(BODY, BODY_RIBS);
  const panelY = 0.02;
  const at = front(0, panelY);
  const panel = new THREE.Group();
  panel.position.copy(at.p).addScaledVector(at.n, 0.02);
  panel.position.z += 0.03;
  bell.add(panel);
  panel.add(look.ink(mesh(softBox(0.27, 0.22, 0.05), look.toon(PATCH.panel)), INK.thin));
  const lit = new THREE.MeshBasicMaterial({ color: linear(PATCH.light) });
  const hot = new THREE.MeshBasicMaterial({ color: linear(PATCH.lightCore) });
  for (const x of [-1, 1]) {
    for (const y of [-1, 1]) {
      const sq = look.ink(mesh(softBox(0.06, 0.06, 0.03), lit, false), INK.thin * 0.5);
      sq.position.set(x * 0.12, y * 0.095, 0.05);
      panel.add(sq);
      const core0 = mesh(softBox(0.032, 0.032, 0.02), hot, false);
      core0.position.z = 0.02;
      sq.add(core0);
    }
  }
  const ledGlow = kit.glow(0xff5a2a, 0.6, 0.4);
  ledGlow.position.z = 0.12;
  panel.add(ledGlow);

  const shoulderY = 0.92;
  const sx = pumpkinSide(shoulderY - BODY.b);
  return {
    ledGlow,
    mounts: {
      neckY: BODY_Y + (2 * BODY.b - 0.04) * PATCH_SCALE,
      bottom: BODY_Y,
      shoulder: onBody(sx + 0.12, shoulderY, 0),
      hold: onBody(0, 0.5, 1.1),
      // The mouth hatch, for a robot with no head, sits high on the chest above the panel.
      mouth: { position: onBody(0, 1.0, 0.5), lat: 0.5, lon: 0, w: 0.28, h: 0.16 },
    },
  };
}

/** How far out the bell's side is at height y (from its middle), at its widest lobe. */
function pumpkinSide(y: number): number {
  return superSurface(BODY).sideX(y, 0, 1);
}

// ---------- the arms: long, striped, with hooked claws ----------

/** Patch's arms, in the joints every arm has (parts/arms.ts): brown at the shoulder, then peach and tan bands. */
export function patchArm(kit: PartKit, shoulder: THREE.Group, s: number, paint: string) {
  const look = catLook(kit, paint);
  const { mesh } = kit;
  const brown = look.toon(PATCH.brown);
  const peach = look.fur(PATCH.peach);
  const tan = look.toon(PATCH.tan);
  const claw = look.toon(PATCH.claw);
  const ink = INK.thick * 0.6;
  const bands: THREE.Object3D[] = [];
  const band = (parent: THREE.Object3D, y0: number, y1: number, r: number, mat: THREE.Material) => {
    const m = look.ink(mesh(new THREE.CapsuleGeometry(r, y0 - y1, 6, 16), mat), ink);
    m.position.y = (y0 + y1) / 2;
    parent.add(m);
    bands.push(m);
  };
  band(shoulder, 0.02, -0.17, 0.12, brown);
  band(shoulder, -0.17, -0.35, 0.11, peach);
  const elbow = new THREE.Group();
  elbow.position.y = -0.36;
  shoulder.add(elbow);
  band(elbow, 0.02, -0.08, 0.12, tan);
  band(elbow, -0.08, -0.28, 0.11, peach);
  band(elbow, -0.28, -0.34, 0.12, tan);
  const wrist = new THREE.Group();
  wrist.position.y = -0.36;
  elbow.add(wrist);
  const palm = look.ink(mesh(ellipsoid(0.13, 0.1, 0.12, 20, 14), claw), ink);
  palm.position.y = -0.05;
  wrist.add(palm);

  // Three dark claws in a row across the hand, each hooking in toward the body, outer one biggest.
  const hook = (R: number, r0: number) => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 12; i++) {
      const t = (i / 12) * 2.5;
      pts.push(new THREE.Vector3(-s * R * (1 - Math.cos(t)), -R * Math.sin(t), 0));
    }
    return taperedTube(new THREE.CatmullRomCurve3(pts), r0, r0 * 0.45, 16, 10);
  };
  const fingers = (
    [
      [0.1, 0.15, 0.058, 0.25],
      [0, 0.125, 0.052, 0],
    ] as const
  ).map(([fx, R, r0, spread]) => {
    const root = new THREE.Group();
    root.position.set(s * fx, -0.12, 0.02);
    wrist.add(root);
    root.add(look.ink(mesh(hook(R, r0), claw), INK.thin));
    root.add(look.ink(mesh(new THREE.SphereGeometry(r0, 12, 10), claw), INK.thin));
    const joint = new THREE.Group();
    joint.position.set(-s * R, -R, 0);
    root.add(joint);
    return { root, joint, spread: s * spread };
  });
  const thumb = new THREE.Group();
  thumb.position.set(-s * 0.09, -0.1, 0.02);
  wrist.add(thumb);
  thumb.add(look.ink(mesh(hook(0.09, 0.046), claw), INK.thin));
  return { elbow, wrist, fingers, thumb, bands };
}

/** Where a claw holds things, in its wrist's frame: inside the hooks. */
export const PATCH_GRIP = [0, -0.26, 0.06] as const;
