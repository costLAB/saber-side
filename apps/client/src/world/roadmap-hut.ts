import { ROADMAP_HUT } from '@saber-side/shared';
import * as THREE from 'three';
import type { BotMakerKit, Collider } from './bot-maker';

// The Roadmap hut: a little planning hut in the park behind the Robot Registry (level data in @saber-side/shared
// content/roadmap-hut.ts). Navy boards, a pitched rust roof, a ROADMAP sign over the door, and inside, a board on the
// back wall with three columns of cards (done, next, later). Driving in opens the Roadmap (app/roadmap-hut.ts).
//
// Like the Registry, it lives on the floor strip and is bent onto the ring with everything else.

const NAVY = 0x2c3e57;
const RUST = 0xb85a26;
const TRIM = 0x1d2733;
const CARDS = [0x7fc46a, 0xe0b23a, 0x9a8f82];

export function buildRoadmapHut(kit: BotMakerKit): { root: THREE.Group; colliders: Collider[] } {
  const H = ROADMAP_HUT;
  const root = new THREE.Group();
  const wall = new THREE.MeshStandardMaterial({ color: NAVY, roughness: 0.85, metalness: 0.05 });
  const roof = new THREE.MeshStandardMaterial({ color: RUST, roughness: 0.7, metalness: 0.15 });
  const trim = new THREE.MeshStandardMaterial({ color: TRIM, roughness: 0.6, metalness: 0.3 });
  const floor = new THREE.MeshStandardMaterial({ color: 0x5a5149, roughness: 0.95, metalness: 0.05 });
  const box = (mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    m.position.set(x, y, z);
    root.add(m);
    return m;
  };

  const depth = H.front - H.back;
  const cx = (H.front + H.back) / 2;
  const z0 = H.z - H.width / 2;
  const z1 = H.z + H.width / 2;
  const T = 0.35; // wall thickness
  const dz = H.door.width / 2;
  const jamb = (H.width / 2 - dz) / 2;

  // floor and walls, with the doorway left open
  box(floor, cx, 0.05, H.z, depth, 0.1, H.width);
  box(wall, H.back + T / 2, H.height / 2, H.z, T, H.height, H.width);
  for (const z of [z0 + T / 2, z1 - T / 2]) box(wall, cx, H.height / 2, z, depth, H.height, T);
  for (const s of [-1, 1]) box(wall, H.front - T / 2, H.height / 2, H.z + s * (dz + jamb), T, H.height, jamb * 2);
  box(wall, H.front - T / 2, (H.height + H.door.height) / 2, H.z, T, H.height - H.door.height, H.door.width);
  box(trim, cx, 0.25, H.z, depth + 0.1, 0.5, H.width + 0.1);

  // a pitched roof, its ridge running front to back, and gable ends to close it
  const pitch = 0.55;
  const half = H.width / 2 + 0.5;
  const slope = half / Math.cos(pitch);
  const rise = Math.tan(pitch) * (H.width / 2);
  for (const s of [-1, 1]) {
    const panel = box(roof, cx, H.height + rise / 2 + 0.1, H.z + (s * half) / 2, depth + 0.8, 0.22, slope);
    panel.rotation.x = s * pitch;
  }
  const triangle = new THREE.Shape([
    new THREE.Vector2(-H.width / 2, 0),
    new THREE.Vector2(H.width / 2, 0),
    new THREE.Vector2(0, rise),
  ]);
  const gableGeo = new THREE.ExtrudeGeometry(triangle, { depth: T, bevelEnabled: false });
  for (const x of [H.front - T, H.back]) {
    // the triangle stands in the shape's x-y plane and is extruded along z; a quarter turn points that along x
    const gable = new THREE.Mesh(gableGeo, wall);
    gable.rotation.y = Math.PI / 2;
    gable.position.set(x, H.height, H.z);
    root.add(gable);
  }

  // the sign over the door, a lamp along its top, and a little beacon on the ridge to spot it through the trees
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(4.6, 1),
    kit.makeSign(512, 112, 'ROADMAP', "WHAT'S NEXT", TRIM, 0xe0b23a, 62),
  );
  sign.position.set(H.front + 0.05, H.door.height + 0.42, H.z);
  sign.rotation.y = Math.PI / 2;
  root.add(sign);
  box(kit.lamp, H.front + 0.1, H.door.height - 0.05, H.z, 0.1, 0.1, H.door.width);
  const beacon = kit.glow(0xe0b23a, 1.6, 0.7);
  beacon.position.set(H.front - 0.2, H.height + rise + 0.6, H.z);
  root.add(beacon);

  // inside: the board on the back wall, three columns of cards (done, next, later), and a lamp over it
  const boardX = H.back + T + 0.06;
  box(trim, boardX, 2.1, H.z, 0.08, 2.2, H.width - 2);
  CARDS.forEach((color, col) => {
    const mat = new THREE.MeshBasicMaterial({ color });
    const z = H.z + (col - 1) * 1.55;
    const n = 4 - col;
    for (let i = 0; i < n; i++) box(mat, boardX + 0.06, 2.85 - i * 0.48, z, 0.04, 0.34, 1.2);
  });
  box(kit.lamp, cx, H.height - 0.3, H.z, 0.3, 0.06, H.width - 2);

  const colliders: Collider[] = [
    { x: H.back + T / 2, z: H.z, hw: T / 2 + 0.05, hd: H.width / 2 },
    { x: cx, z: z0 + T / 2, hw: depth / 2, hd: T / 2 + 0.05 },
    { x: cx, z: z1 - T / 2, hw: depth / 2, hd: T / 2 + 0.05 },
    ...[-1, 1].map((s) => ({ x: H.front - T / 2, z: H.z + s * (dz + jamb), hw: T / 2 + 0.05, hd: jamb })),
  ];
  return { root, colliders };
}
