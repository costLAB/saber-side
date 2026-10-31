import { TAU } from '@saber-side/shared';
import * as THREE from 'three';
import type { GlowFn } from '../render/kit';

/** One color per hub cradle. */
export const SHIP_COLORS = [0xd8d0c2, 0x7c93a0, 0xc0662a, 0x6b9a5a];

/**
 * A little saucer-winged ship, built along +z. `root` takes the heading, `body` takes the roll, and the engine
 * `flames` scale with thrust.
 */
export interface ShipModel {
  root: THREE.Group;
  body: THREE.Group;
  flames: THREE.Sprite[];
}

const zCyl = (a: number, b: number, h: number, s: number) =>
  new THREE.CylinderGeometry(a, b, h, s).rotateX(Math.PI / 2);

export function buildShip(hue: number, glow: GlowFn): ShipModel {
  const m = {
    hull: new THREE.MeshStandardMaterial({ color: hue, roughness: 0.45, metalness: 0.35 }),
    trim: new THREE.MeshStandardMaterial({ color: 0xc0662a, roughness: 0.5, metalness: 0.3 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x48413b, roughness: 0.4, metalness: 0.85 }),
    glass: new THREE.MeshStandardMaterial({
      color: 0x9fd4ff,
      roughness: 0.05,
      metalness: 0.4,
      transparent: true,
      opacity: 0.45,
    }),
    eye: new THREE.MeshBasicMaterial({ color: 0xff2a10 }),
  };
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    body.add(mesh);
    return mesh;
  };

  add(new THREE.SphereGeometry(1, 28, 18), m.hull, 0, 0, 0).scale.set(1.1, 0.75, 2.6);
  add(new THREE.BoxGeometry(0.34, 0.12, 3.4), m.trim, 0, 0.7, -0.4);
  add(new THREE.SphereGeometry(0.72, 20, 12, 0, TAU, 0, Math.PI / 2), m.glass, 0, 0.45, 0.7).scale.set(1, 0.9, 1.35);
  // the pilot: a round little alien with one red eye
  add(new THREE.SphereGeometry(0.36, 16, 12), m.hull, 0, 0.62, 0.7);
  add(new THREE.SphereGeometry(0.13, 12, 8), m.eye, 0, 0.66, 1.02);
  add(new THREE.BoxGeometry(4.8, 0.12, 1.4), m.hull, 0, -0.15, -0.5);
  for (const sx of [-1, 1]) {
    add(new THREE.BoxGeometry(0.2, 0.7, 1.3), m.trim, sx * 2.4, 0.15, -0.5);
    add(zCyl(0.36, 0.44, 1.7, 16), m.metal, sx * 1.2, -0.08, -1.9);
    add(zCyl(0.07, 0.07, 1.2, 8), m.metal, sx * 1.7, -0.2, 0.4);
  }
  add(new THREE.BoxGeometry(0.12, 1, 1.2), m.trim, 0, 0.85, -1.9).rotation.x = 0.35;
  const flames = [-1, 1].map((sx) => {
    const f = glow(0x7fc8ff, 1.2, 0.9);
    f.position.set(sx * 1.2, -0.08, -2.9);
    body.add(f);
    return f;
  });
  return { root, body, flames };
}

export function setFlames(ship: ShipModel, size: number) {
  for (const f of ship.flames) f.scale.setScalar(size);
}
