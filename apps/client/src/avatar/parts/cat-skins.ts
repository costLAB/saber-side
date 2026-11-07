import type * as THREE from 'three';
import { makeCanvas } from '../../render/textures';
import { CAT, type CatSkin } from './cat-look';
import type { RobotKit } from './kit';

// Snatch's skins, drawn in code like every robot skin, in model units: the face, the back and sides of the head, the
// belly, and the eyes. Each is a layer of details over the fur, clear wherever the fur shows (cat-look.ts), so paint
// can change the fur under them. Drawn once and shared by every cat.

/** The head skin's frame: x across ±HU, y up ±HV, projected from the front. */
const HU = 1.6;
const HV = 1.0;
const FW = 1024;
const FH = 640;

type Pt = readonly [number, number];
type Ctx = CanvasRenderingContext2D;

/** Draws in model units on a canvas that spans x ±HU and y ±HV. */
function pen(g: Ctx, w: number, h: number) {
  const X = (x: number) => (x / (2 * HU) + 0.5) * w;
  const Y = (y: number) => (0.5 - y / (2 * HV)) * h;
  const S = (d: number) => (d / (2 * HU)) * w;
  /** A smooth closed shape through the points. */
  function blob(pts: readonly Pt[]) {
    const P = pts.map(([x, y]) => [X(x), Y(y)] as const);
    const mid = (a: readonly number[], b: readonly number[]) => [
      ((a[0] ?? 0) + (b[0] ?? 0)) / 2,
      ((a[1] ?? 0) + (b[1] ?? 0)) / 2,
    ];
    g.beginPath();
    let m = mid(P[P.length - 1] ?? [0, 0], P[0] ?? [0, 0]);
    g.moveTo(m[0] ?? 0, m[1] ?? 0);
    P.forEach((c, i) => {
      m = mid(c, P[(i + 1) % P.length] ?? c);
      g.quadraticCurveTo(c[0], c[1], m[0] ?? 0, m[1] ?? 0);
    });
    g.closePath();
  }
  /** A tapered stripe from `a` (its wide end) to the point `b`, bowed sideways by `bend`. */
  function stripe(a: Pt, b: Pt, wide: number, bend = 0) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    const nx = -dy / len;
    const ny = dx / len;
    const cx = (a[0] + b[0]) / 2 + nx * bend;
    const cy = (a[1] + b[1]) / 2 + ny * bend;
    g.beginPath();
    g.moveTo(X(a[0] + nx * wide), Y(a[1] + ny * wide));
    g.quadraticCurveTo(X(cx + nx * wide * 0.6), Y(cy + ny * wide * 0.6), X(b[0]), Y(b[1]));
    g.quadraticCurveTo(X(cx - nx * wide * 0.6), Y(cy - ny * wide * 0.6), X(a[0] - nx * wide), Y(a[1] - ny * wide));
    g.closePath();
    g.fill();
  }
  function line(pts: readonly Pt[], width: number, color: string) {
    g.strokeStyle = color;
    g.lineWidth = S(width);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    pts.forEach(([x, y], i) => {
      if (i) g.lineTo(X(x), Y(y));
      else g.moveTo(X(x), Y(y));
    });
    g.stroke();
  }
  return { X, Y, S, blob, stripe, line };
}

/** The face: the cream mask with the gray V and tabby stripes cut out of it, the mouth, and a soft shade under the chin. */
function drawFace(g: Ctx) {
  const p = pen(g, FW, FH);
  g.fillStyle = CAT.cream;
  p.blob([
    [0, 0.66],
    [0.45, 0.74],
    [0.86, 0.68],
    [1.08, 0.44],
    [1.1, 0.1],
    [1.3, -0.06],
    [1.6, -0.2],
    [1.6, -0.9],
    [0.6, -1.1],
    [-0.6, -1.1],
    [-1.6, -0.9],
    [-1.6, -0.2],
    [-1.3, -0.06],
    [-1.1, 0.1],
    [-1.08, 0.44],
    [-0.86, 0.68],
    [-0.45, 0.74],
  ]);
  g.fill();
  // The gray shows through: the V down the forehead to the nose, tabby stripes, and a stripe into each cheek's fur.
  g.globalCompositeOperation = 'destination-out';
  g.beginPath();
  g.moveTo(p.X(-0.3), p.Y(0.78));
  g.quadraticCurveTo(p.X(-0.16), p.Y(0.3), p.X(0), p.Y(-0.02));
  g.quadraticCurveTo(p.X(0.16), p.Y(0.3), p.X(0.3), p.Y(0.78));
  g.closePath();
  g.fill();
  p.stripe([-0.5, 0.8], [-0.4, 0.5], 0.05, -0.02);
  p.stripe([0.5, 0.8], [0.4, 0.5], 0.05, 0.02);
  p.stripe([-1.25, 0.3], [-0.95, 0.24], 0.06, 0.02);
  p.stripe([1.25, 0.3], [0.95, 0.24], 0.06, -0.02);
  g.globalCompositeOperation = 'source-over';
  // cream stripes in the gray cap
  g.fillStyle = CAT.cream;
  p.stripe([-0.17, 0.62], [-0.22, 0.9], 0.045, 0.02);
  p.stripe([0.0, 0.5], [0.0, 0.88], 0.05, 0);
  p.stripe([0.17, 0.62], [0.22, 0.9], 0.045, -0.02);
  // a soft shade on the cream under the chin
  g.globalCompositeOperation = 'source-atop';
  const shade = g.createLinearGradient(0, p.Y(-0.55), 0, p.Y(-0.95));
  shade.addColorStop(0, 'rgba(236,190,160,0)');
  shade.addColorStop(1, 'rgba(236,190,160,0.55)');
  g.fillStyle = shade;
  g.fillRect(0, p.Y(-0.55), FW, FH - p.Y(-0.55));
  g.globalCompositeOperation = 'source-over';
  // the mouth: a short stem from the nose, then a small frown, and a little mark on the chin
  p.line(
    [
      [0, -0.2],
      [0, -0.35],
    ],
    0.024,
    CAT.ink,
  );
  p.line(
    [
      [-0.17, -0.5],
      [-0.02, -0.36],
      [0, -0.35],
      [0.02, -0.36],
      [0.17, -0.5],
    ],
    0.024,
    CAT.ink,
  );
  g.strokeStyle = '#efb9a0';
  g.lineWidth = p.S(0.014);
  g.beginPath();
  g.moveTo(p.X(-0.045), p.Y(-0.52));
  g.quadraticCurveTo(p.X(0), p.Y(-0.49), p.X(0.045), p.Y(-0.52));
  g.stroke();
}

/** The back of the head: three cream tabby stripes over the gray (the close-up only shows the front). */
function drawBack(g: Ctx) {
  const p = pen(g, FW / 2, FH / 2);
  g.fillStyle = CAT.cream;
  p.stripe([-0.42, 0.88], [-0.32, 0.22], 0.06, -0.03);
  p.stripe([0, 0.9], [0, 0.12], 0.065, 0);
  p.stripe([0.42, 0.88], [0.32, 0.22], 0.06, 0.03);
}

/** The sides of the head, across z: the cream cheek sweeping back and down under the jaw, and two stripes. */
function drawSide(g: Ctx, w: number, h: number) {
  const X = (z: number) => (z / 2 + 0.5) * w;
  const Y = (y: number) => (0.5 - y / 2) * h;
  g.fillStyle = CAT.cream;
  g.beginPath();
  g.moveTo(X(1.05), Y(-0.1));
  g.bezierCurveTo(X(0.55), Y(-0.12), X(0.1), Y(-0.28), X(-0.25), Y(-0.62));
  g.lineTo(X(-0.45), Y(-1.05));
  g.lineTo(X(1.05), Y(-1.05));
  g.closePath();
  g.fill();
  for (const [z0, y0, z1, y1] of [
    [-0.55, 0.72, -0.05, 0.6],
    [-0.7, 0.42, -0.25, 0.36],
  ] as const) {
    g.beginPath();
    g.moveTo(X(z0), Y(y0 + 0.035));
    g.quadraticCurveTo(X((z0 + z1) / 2), Y((y0 + y1) / 2 + 0.05), X(z1), Y(y1));
    g.quadraticCurveTo(X((z0 + z1) / 2), Y((y0 + y1) / 2 - 0.02), X(z0), Y(y0 - 0.035));
    g.closePath();
    g.fill();
  }
}

/** The body's frame: x across ±BU, y up from 0 to BV (the bell's height). */
export const BU = 1.0;
export const BV = 1.3;

/** The belly: cream, darker toward the bottom, with a fine dark line round it. */
function drawBelly(g: Ctx, w: number, h: number) {
  const X = (x: number) => (x / (2 * BU) + 0.5) * w;
  const Y = (y: number) => (1 - y / BV) * h;
  const pts: Pt[] = [
    [0, 1.14],
    [0.17, 1.08],
    [0.29, 0.82],
    [0.39, 0.45],
    [0.4, 0.15],
    [0.28, 0.035],
    [-0.28, 0.035],
    [-0.4, 0.15],
    [-0.39, 0.45],
    [-0.29, 0.82],
    [-0.17, 1.08],
  ];
  const P = pts.map(([x, y]) => [X(x), Y(y)] as const);
  g.beginPath();
  let m = [((P[P.length - 1]?.[0] ?? 0) + (P[0]?.[0] ?? 0)) / 2, ((P[P.length - 1]?.[1] ?? 0) + (P[0]?.[1] ?? 0)) / 2];
  g.moveTo(m[0] ?? 0, m[1] ?? 0);
  P.forEach((c, i) => {
    const n = P[(i + 1) % P.length] ?? c;
    m = [(c[0] + n[0]) / 2, (c[1] + n[1]) / 2];
    g.quadraticCurveTo(c[0], c[1], m[0] ?? 0, m[1] ?? 0);
  });
  g.closePath();
  const fill = g.createLinearGradient(0, Y(1.1), 0, Y(0));
  fill.addColorStop(0, '#fee8cf');
  fill.addColorStop(0.6, '#fde2c4');
  fill.addColorStop(1, '#f8c9a2');
  g.fillStyle = fill;
  g.fill();
  g.strokeStyle = CAT.ink;
  g.lineWidth = (0.008 / (2 * BU)) * w;
  g.stroke();
}

/** A huge yellow eye on a black rim: an orange-gold top, a pupil looking in toward the nose, and three shines. */
function drawEye(g: Ctx, size: number, side: 1 | -1) {
  const R = size / 2;
  g.fillStyle = CAT.ink;
  g.beginPath();
  g.arc(R, R, R, 0, Math.PI * 2);
  g.fill();
  const ri = R * 0.9;
  const iris = g.createRadialGradient(R, R + ri * 0.35, 0, R, R + ri * 0.35, ri * 1.38);
  iris.addColorStop(0, '#fff7a6');
  iris.addColorStop(0.5, '#fde958');
  iris.addColorStop(0.78, '#f9d23a');
  iris.addColorStop(0.92, '#f3a923');
  iris.addColorStop(1, '#e98c17');
  g.fillStyle = iris;
  g.beginPath();
  g.arc(R, R, ri, 0, Math.PI * 2);
  g.fill();
  const rp = ri * 0.78;
  const px = R + side * ri * 0.2;
  const py = R + ri * 0.06;
  g.fillStyle = '#000';
  g.beginPath();
  g.arc(px, py, rp + R * 0.03, 0, Math.PI * 2);
  g.fill();
  const pupil = g.createRadialGradient(px - rp * 0.1, py + rp * 0.55, 0, px, py + rp * 0.2, rp * 1.1);
  pupil.addColorStop(0, '#3a2c25');
  pupil.addColorStop(0.55, '#1a1311');
  pupil.addColorStop(1, '#070505');
  g.fillStyle = pupil;
  g.beginPath();
  g.arc(px, py, rp, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#fff';
  for (const [dx, dy, r] of [
    [0.5, 0.55, 0.17],
    [-0.45, 0.55, 0.13],
    [-0.66, 0.2, 0.05],
  ] as const) {
    g.beginPath();
    g.arc(px + dx * rp, py - dy * rp, r * rp, 0, Math.PI * 2);
    g.fill();
  }
}

export interface CatSkins {
  head: CatSkin;
  body: CatSkin;
  /** The eye on the cat's right (on the left as you face it), and its left. */
  eyes: { right: THREE.Texture; left: THREE.Texture };
}

const cache = new WeakMap<RobotKit['materials'], CatSkins>();

function canvas(w: number, h: number, draw: (g: Ctx, w: number, h: number) => void) {
  const c = makeCanvas(w, h);
  draw(c.getContext('2d') as Ctx, w, h);
  return c;
}

/** Every cat's skins, drawn once for the kit that draws them. */
export function catSkins(kit: RobotKit): CatSkins {
  let skins = cache.get(kit.materials);
  if (!skins) {
    const tex = (c: HTMLCanvasElement) => kit.toTex(c, true);
    const clear = tex(canvas(4, 4, () => {}));
    skins = {
      head: {
        front: tex(canvas(FW, FH, drawFace)),
        back: tex(canvas(FW / 2, FH / 2, drawBack)),
        side: tex(canvas(512, 320, drawSide)),
        uv: [1 / (2 * HU), 1 / (2 * HV), 0.5, 0.5],
        sideUv: [0.5, 0.5, 0.5, 0.5],
        z: [-0.45, -0.05],
        sides: [0.62, 0.86],
      },
      body: {
        front: tex(canvas(384, 500, drawBelly)),
        back: clear,
        side: clear,
        uv: [1 / (2 * BU), 1 / BV, 0.5, 0],
        sideUv: [0.5, 0.5, 0.5, 0.5],
        z: [-0.1, 0.25],
        sides: [2, 3],
      },
      eyes: {
        right: tex(canvas(384, 384, (g, w) => drawEye(g, w, 1))),
        left: tex(canvas(384, 384, (g, w) => drawEye(g, w, -1))),
      },
    };
    cache.set(kit.materials, skins);
  }
  return skins;
}
