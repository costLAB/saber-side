import type * as THREE from 'three';

/**
 * Helpers the legacy game lends to new modules until they move out of `legacy/game.js` (Phase 1).
 * Each matches the function of the same name. `drawTex` already lives in `render/textures.ts`; the others are still in
 * the legacy file.
 */

/** An additive glow sprite. */
export type GlowFn = (color: number, size: number, opacity?: number) => THREE.Sprite;

/** Paints a canvas and returns it as a texture (sRGB unless `srgb` is false). The canvas is `texture.image`. */
export type DrawTexFn = (
  w: number,
  h: number,
  draw: (g: CanvasRenderingContext2D, w: number, h: number) => void,
  srgb?: boolean,
) => THREE.CanvasTexture;

/** A station sign: a main line and a smaller second line, redrawn once the display font loads. */
export type MakeSignFn = (
  w: number,
  h: number,
  main: string,
  sub: string,
  bg: number,
  accent: number,
  mainSize: number,
) => THREE.MeshStandardMaterial;

/** Fills a circle. */
export function dot(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}
