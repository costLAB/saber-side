import { lerp, mulberry } from '@saber-side/shared';
import * as THREE from 'three';
import { dot } from './kit';

// Procedural textures, painted on canvases from seeded random numbers, so every run (and every machine) paints the
// same pixels. Moved unchanged from the legacy game; the screenshot tests hold them to that.

/** Options for `paintTex`: a worn, riveted enamel panel like the robot's shell. */
export interface PaintOptions {
  w?: number;
  h?: number;
  seed?: number;
  base: string;
  light: string;
  shade: string;
  /** How many soft blotches of light and shade. */
  mottle?: number;
  /** Orange paint stripes, in UV fractions. */
  stripes?: { u0: number; u1: number; v0: number; v1: number }[];
  /** Clusters of orange paint flecks, between `patchV0` and `patchV1`. */
  patches?: number;
  patchV0?: number;
  patchV1?: number;
  /** Horizontal panel seams (v) and vertical ones (u, from v0 to v1). */
  seamsV?: number[];
  seamsU?: { u: number; v0: number; v1: number }[];
  rivets?: boolean;
  /** Rust: speck clusters and how many specks. */
  clusters?: number;
  speck?: number;
  /** A grime gradient from v0 to v1. */
  grime?: [number, number];
}

const ctx = (c: HTMLCanvasElement) => c.getContext('2d') as CanvasRenderingContext2D;

/** Draws `fn` at x and its horizontal wrap twins, so sphere UV seams line up. */
export function wrapX(w: number, x: number, r: number, fn: (x: number) => void) {
  fn(x);
  if (x < r) fn(x + w);
  if (x > w - r) fn(x - w);
}

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** The texture painters, sharing the renderer's best anisotropic filtering. */
export function textureKit(anisotropy: number) {
  function toTex(c: HTMLCanvasElement, srgb: boolean, repeat?: number): THREE.CanvasTexture {
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.encoding = THREE.sRGBEncoding;
    t.anisotropy = anisotropy;
    if (repeat) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repeat, repeat);
    }
    return t;
  }

  /** Paints a canvas and returns it as a texture (sRGB unless `srgb` is false). The canvas is `texture.image`. */
  function drawTex(
    w: number,
    h: number,
    draw: (g: CanvasRenderingContext2D, w: number, h: number) => void,
    srgb = true,
  ): THREE.CanvasTexture {
    const c = makeCanvas(w, h);
    draw(ctx(c), w, h);
    return toTex(c, srgb);
  }

  /** A worn enamel panel and its bump map. */
  function paintTex(o: PaintOptions): { map: THREE.CanvasTexture; bump: THREE.CanvasTexture } {
    const w = o.w || 1024;
    const h = o.h || 512;
    const R = mulberry(o.seed || 1);
    const c = makeCanvas(w, h);
    const g = ctx(c);
    const b = makeCanvas(w, h);
    const bg = ctx(b);
    g.fillStyle = o.base;
    g.fillRect(0, 0, w, h);
    bg.fillStyle = '#888';
    bg.fillRect(0, 0, w, h);

    // mottled enamel
    for (let i = 0; i < (o.mottle || 900); i++) {
      const r = 6 + R() * 48;
      const x = R() * w;
      const y = R() * h;
      g.globalAlpha = 0.035 + R() * 0.06;
      g.fillStyle = R() < 0.55 ? o.light : o.shade;
      wrapX(w, x, r, (xx) => dot(g, xx, y, r));
    }
    g.globalAlpha = 1;

    // worn orange paint stripes
    const orange = () => `rgb(${(190 + R() * 30) | 0},${(92 + R() * 26) | 0},${(34 + R() * 18) | 0})`;
    for (const s of o.stripes || []) {
      const x0 = s.u0 * w;
      const x1 = s.u1 * w;
      const y0 = s.v0 * h;
      const y1 = s.v1 * h;
      g.fillStyle = orange();
      g.globalAlpha = 0.9;
      g.fillRect(x0, y0, x1 - x0, y1 - y0);
      const per = x1 - x0 + (y1 - y0);
      for (let i = 0; i < per * 0.6; i++) {
        g.fillStyle = orange();
        g.globalAlpha = 0.5 + R() * 0.45;
        const edge = (R() * 4) | 0;
        const r = 1.5 + R() * 6;
        const x = edge < 2 ? lerp(x0, x1, R()) : (edge === 2 ? x0 : x1) + (R() - 0.5) * 8;
        const y = edge < 2 ? (edge === 0 ? y0 : y1) + (R() - 0.5) * 8 : lerp(y0, y1, R());
        dot(g, x, y, r);
      }
      // chipped to primer
      for (let i = 0; i < per * 0.12; i++) {
        g.fillStyle = R() < 0.6 ? o.base : '#8a7a68';
        g.globalAlpha = 0.5 + R() * 0.5;
        dot(g, lerp(x0, x1, R()), lerp(y0, y1, R()), 1 + R() * 5);
      }
    }
    for (let i = 0; i < (o.patches || 0); i++) {
      const cx = R() * w;
      const cy = (o.patchV0 || 0) * h + R() * ((o.patchV1 || 1) - (o.patchV0 || 0)) * h;
      const n = 20 + R() * 60;
      const sp = 8 + R() * 26;
      for (let k = 0; k < n; k++) {
        g.fillStyle = orange();
        g.globalAlpha = 0.45 + R() * 0.5;
        const r = 1.5 + R() * 6;
        const x = cx + (R() - 0.5) * sp * 2.2;
        const y = cy + (R() - 0.5) * sp;
        wrapX(w, x, r, (xx) => dot(g, xx, y, r));
      }
    }
    g.globalAlpha = 1;

    // panel seams with grime collected along them
    const seam = (x0: number, y0: number, x1: number, y1: number) => {
      g.lineCap = 'round';
      g.strokeStyle = 'rgba(52,40,32,0.12)';
      g.lineWidth = 12;
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();
      g.strokeStyle = 'rgba(48,38,32,0.9)';
      g.lineWidth = 2.4;
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();
      g.strokeStyle = 'rgba(255,250,240,0.3)';
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(x0 + 1.5, y0 + 1.5);
      g.lineTo(x1 + 1.5, y1 + 1.5);
      g.stroke();
      bg.strokeStyle = '#1a1a1a';
      bg.lineWidth = 4;
      bg.beginPath();
      bg.moveTo(x0, y0);
      bg.lineTo(x1, y1);
      bg.stroke();
    };
    const rivet = (x: number, y: number) => {
      g.fillStyle = 'rgba(40,32,28,0.9)';
      dot(g, x, y, 4.2);
      g.fillStyle = 'rgba(170,160,148,1)';
      dot(g, x - 0.6, y - 0.6, 2.6);
      bg.fillStyle = '#e0e0e0';
      dot(bg, x, y, 3.5);
    };
    for (const v of o.seamsV || []) seam(0, v * h, w, v * h);
    for (const s of o.seamsU || []) {
      seam(s.u * w, s.v0 * h, s.u * w, s.v1 * h);
      if (o.rivets) {
        rivet(s.u * w + 12, s.v0 * h + 12);
        rivet(s.u * w - 12, s.v1 * h - 12);
      }
    }

    // rust specks, clustered, with drip streaks
    const clusters = Array.from({ length: o.clusters || 50 }, (): [number, number] => [R() * w, R() * h]);
    for (const [cx, cy] of clusters) {
      if (R() < 0.5) continue;
      g.strokeStyle = 'rgba(110,58,26,0.10)';
      g.lineWidth = 1 + R() * 2;
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx + (R() - 0.5) * 6, cy + 20 + R() * 60);
      g.stroke();
    }
    const speckCols = ['#3b2a20', '#3b2a20', '#7a3e1c', '#7a3e1c', '#a5582a', '#1f1a17'];
    for (let i = 0; i < (o.speck || 12000); i++) {
      let x: number;
      let y: number;
      if (R() < 0.62) {
        const cl = clusters[(R() * clusters.length) | 0] as [number, number];
        x = cl[0] + (R() + R() + R() - 1.5) * 70;
        y = cl[1] + (R() + R() + R() - 1.5) * 50;
      } else {
        x = R() * w;
        y = R() * h;
      }
      x = (x + w) % w;
      // biome-ignore lint/style/useExponentiationOperator: kept exactly as the original so the pixels match
      const r = 0.4 + Math.pow(R(), 4) * 2.6;
      g.globalAlpha = 0.18 + R() * 0.5;
      g.fillStyle = speckCols[(R() * speckCols.length) | 0] as string;
      dot(g, x, y, r);
      if (r > 1.2) {
        bg.fillStyle = '#5c5c5c';
        dot(bg, x, y, r);
      }
    }
    g.globalAlpha = 1;

    if (o.grime) {
      const gr = g.createLinearGradient(0, o.grime[0] * h, 0, o.grime[1] * h);
      gr.addColorStop(0, 'rgba(60,46,36,0)');
      gr.addColorStop(1, 'rgba(60,46,36,0.45)');
      g.fillStyle = gr;
      g.fillRect(0, o.grime[0] * h, w, (o.grime[1] - o.grime[0]) * h);
    }
    return { map: toTex(c, true), bump: toTex(b, false) };
  }

  /** A soft white disc for additive glow sprites. */
  function glowTex(): THREE.CanvasTexture {
    const c = makeCanvas(128, 128);
    const g = ctx(c);
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    return toTex(c, true);
  }

  /** The promenade's paving: worn slabs with cracks and grit, tiled 36 times. */
  function groundTex(): THREE.CanvasTexture {
    const s = 512;
    const R = mulberry(77);
    const c = makeCanvas(s, s);
    const g = ctx(c);
    g.fillStyle = '#857d75';
    g.fillRect(0, 0, s, s);
    const wrap = (x: number, y: number, r: number, fn: (x: number, y: number) => void) => {
      for (const dx of [-s, 0, s]) {
        for (const dy of [-s, 0, s]) {
          if (Math.abs(x + dx - s / 2) < s / 2 + r && Math.abs(y + dy - s / 2) < s / 2 + r) fn(x + dx, y + dy);
        }
      }
    };
    for (let i = 0; i < 1500; i++) {
      const r = 4 + R() * 40;
      const x = R() * s;
      const y = R() * s;
      g.globalAlpha = 0.04 + R() * 0.06;
      g.fillStyle = R() < 0.5 ? '#9b938a' : '#635b54';
      wrap(x, y, r, (a, b) => dot(g, a, b, r));
    }
    for (let i = 0; i < 10; i++) {
      const r = 30 + R() * 70;
      const x = R() * s;
      const y = R() * s;
      g.globalAlpha = 0.06;
      g.fillStyle = '#4a3c30';
      wrap(x, y, r, (a, b) => dot(g, a, b, r));
    }
    g.globalAlpha = 1;
    for (let k = 0; k <= 4; k++) {
      const p = k * 128;
      g.fillStyle = 'rgba(42,36,32,0.55)';
      g.fillRect(p - 1.5, 0, 3, s);
      g.fillRect(0, p - 1.5, s, 3);
      g.fillStyle = 'rgba(200,190,176,0.18)';
      g.fillRect(p + 1.5, 0, 1.5, s);
      g.fillRect(0, p + 1.5, s, 1.5);
    }
    g.strokeStyle = 'rgba(40,34,30,0.45)';
    g.lineWidth = 1;
    for (let i = 0; i < 9; i++) {
      let x = R() * s;
      let y = R() * s;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 14; k++) {
        x += (R() - 0.5) * 18;
        y += (R() - 0.3) * 14;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    for (let i = 0; i < 9000; i++) {
      g.globalAlpha = 0.2 + R() * 0.5;
      g.fillStyle = R() < 0.5 ? '#4d433b' : '#a59c92';
      g.fillRect(R() * s, R() * s, 1 + R() * 1.5, 1 + R() * 1.5);
    }
    g.globalAlpha = 1;
    return toTex(c, true, 36);
  }

  /** A stenciled cargo crate side. */
  function crateTex(seed: number, base: string, label: string): THREE.CanvasTexture {
    const s = 256;
    const R = mulberry(seed);
    const c = makeCanvas(s, s);
    const g = ctx(c);
    g.fillStyle = base;
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 300; i++) {
      g.globalAlpha = 0.05 + R() * 0.06;
      g.fillStyle = R() < 0.5 ? '#ffffff' : '#000000';
      dot(g, R() * s, R() * s, 4 + R() * 24);
    }
    g.globalAlpha = 1;
    g.strokeStyle = 'rgba(25,20,18,0.55)';
    g.lineWidth = 16;
    g.strokeRect(8, 8, s - 16, s - 16);
    g.strokeStyle = 'rgba(255,245,230,0.18)';
    g.lineWidth = 2;
    g.strokeRect(19, 19, s - 38, s - 38);
    g.strokeStyle = 'rgba(25,20,18,0.35)';
    g.lineWidth = 2;
    g.strokeRect(34, 34, s - 68, s - 68);
    const bolts = [
      [16, 16],
      [s - 16, 16],
      [16, s - 16],
      [s - 16, s - 16],
      [s / 2, 16],
      [s / 2, s - 16],
      [16, s / 2],
      [s - 16, s / 2],
    ] as const;
    for (const [x, y] of bolts) {
      g.fillStyle = 'rgba(30,24,20,0.9)';
      dot(g, x, y, 4);
      g.fillStyle = '#b8ab9b';
      dot(g, x - 0.7, y - 0.7, 2.3);
    }
    g.font = '700 46px "Chakra Petch", "Arial Narrow", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = 'rgba(28,22,18,0.7)';
    g.fillText(label, s / 2, s / 2 - 8);
    g.font = '500 15px "IBM Plex Mono", monospace';
    g.fillText('YARD 7 · 40 KG', s / 2, s / 2 + 30);
    const flecks = ['#3b2a20', '#7a3e1c', '#a5582a', '#d8cfc2'];
    for (let i = 0; i < 3500; i++) {
      g.globalAlpha = 0.3 + R() * 0.6;
      g.fillStyle = flecks[(R() * 4) | 0] as string;
      // biome-ignore lint/style/useExponentiationOperator: kept exactly as the original so the pixels match
      dot(g, R() * s, R() * s, 0.5 + Math.pow(R(), 3) * 2.5);
    }
    g.globalAlpha = 1;
    return toTex(c, true);
  }

  return { toTex, drawTex, paintTex, glowTex, groundTex, crateTex };
}
