import * as THREE from 'three';
import type { DrawTexFn } from './kit';

/**
 * A floating name tag that stays the same size on screen and draws over everything, for labeling things that are
 * far away (planets, the ring). It's redrawn once the display font loads.
 */
export function textLabel(drawTex: DrawTexFn, text: string, color: string): THREE.Sprite {
  const paint = (g: CanvasRenderingContext2D, w: number, h: number) => {
    g.clearRect(0, 0, w, h);
    g.font = '700 46px "Chakra Petch", "Arial Narrow", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = 'rgba(10,12,18,0.55)';
    g.fillRect(0, 0, w, h);
    g.fillStyle = color;
    g.fillText(text, w / 2, 50);
  };
  const tex = drawTex(512, 96, paint);
  document.fonts?.ready.then(() => {
    const c = tex.image as HTMLCanvasElement;
    const g = c.getContext('2d');
    if (!g) return;
    paint(g, c.width, c.height);
    tex.needsUpdate = true;
  });
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, sizeAttenuation: false }),
  );
  sprite.scale.set(0.26, 0.05, 1);
  sprite.renderOrder = 10;
  return sprite;
}
