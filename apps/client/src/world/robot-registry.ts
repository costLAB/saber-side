import { ROBOT_REGISTRY } from '@saber-side/shared';
import * as THREE from 'three';
import type { BotMakerKit, Collider } from './bot-maker';

// The Robot Registry: a small civic office next to the Bot Maker (level data in @saber-side/shared content/spawn.ts),
// and the only place a guest can register. A cream building with a blue band, an open doorway, and inside, a kiosk
// with a glowing screen facing the door. Driving in opens the kiosk.
//
// Like the Bot Maker, it lives on the floor strip and is bent onto the ring with everything else, so its materials are
// plain ones the legacy game's bend pass patches.

const CREAM = 0xe6dccb;
const BLUE = 0x2f5a7a;
const TRIM = 0x23343a;
const SCREEN = 0x7fd6ff;

export function buildRobotRegistry(kit: BotMakerKit): { root: THREE.Group; colliders: Collider[] } {
  const R = ROBOT_REGISTRY;
  const root = new THREE.Group();
  const wall = new THREE.MeshStandardMaterial({ color: CREAM, roughness: 0.85, metalness: 0.05 });
  const blue = new THREE.MeshStandardMaterial({ color: BLUE, roughness: 0.6, metalness: 0.2 });
  const trim = new THREE.MeshStandardMaterial({ color: TRIM, roughness: 0.6, metalness: 0.4 });
  const floor = new THREE.MeshStandardMaterial({ color: 0x5a5650, roughness: 0.9, metalness: 0.1 });
  const screen = new THREE.MeshBasicMaterial({ color: SCREEN });
  const box = (mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    m.position.set(x, y, z);
    root.add(m);
    return m;
  };

  const depth = R.front - R.back;
  const cx = (R.front + R.back) / 2;
  const z0 = R.z - R.width / 2;
  const z1 = R.z + R.width / 2;
  const T = 0.5; // wall thickness
  const dz = R.door.width / 2;
  const jamb = (R.width / 2 - dz) / 2; // half-length of each stretch of front wall beside the door

  // floor, walls, a flat roof with a blue band round the top
  box(floor, cx, 0.05, R.z, depth, 0.1, R.width);
  box(wall, R.back + T / 2, R.height / 2, R.z, T, R.height, R.width);
  for (const z of [z0 + T / 2, z1 - T / 2]) box(wall, cx, R.height / 2, z, depth, R.height, T);
  for (const s of [-1, 1]) box(wall, R.front - T / 2, R.height / 2, R.z + s * (dz + jamb), T, R.height, jamb * 2);
  box(wall, R.front - T / 2, (R.height + R.door.height) / 2, R.z, T, R.height - R.door.height, R.door.width);
  box(blue, cx, R.height - 0.35, R.z, depth + 0.3, 0.7, R.width + 0.3);
  box(trim, cx, R.height + 0.1, R.z, depth + 0.5, 0.2, R.width + 0.5);
  box(blue, cx, 0.3, R.z, depth + 0.1, 0.6, R.width + 0.1);

  // the doorway: blue pillars either side, a step of light over it, and the sign above
  for (const s of [-1, 1]) box(blue, R.front + 0.05, R.door.height / 2, R.z + s * (dz + 0.2), 0.5, R.door.height, 0.4);
  box(kit.lamp, R.front + 0.1, R.door.height + 0.05, R.z, 0.12, 0.12, R.door.width);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(7.6, 1.5),
    kit.makeSign(512, 100, 'ROBOT REGISTRY', 'SIGN UP · LOG IN', TRIM, SCREEN, 50),
  );
  sign.position.set(R.front + 0.05, R.door.height + 1.05, R.z);
  sign.rotation.y = Math.PI / 2;
  root.add(sign);
  for (const s of [-1, 1]) box(kit.glass, R.front + 0.03, 2.4, R.z + s * (dz + jamb), 0.1, 1.8, jamb * 1.2);

  // the kiosk: a pedestal with a tilted, glowing screen facing the door, and a little beacon on top
  const kx = R.kiosk.x;
  box(trim, kx, 0.6, R.z, 0.9, 1.2, 1.4);
  const face = box(screen, kx + 0.3, 1.45, R.z, 0.08, 0.7, 1.1);
  face.rotation.z = 0.35;
  box(trim, kx, 1.45, R.z, 0.5, 0.9, 1.3).rotation.z = 0.35;
  const beacon = kit.glow(SCREEN, 1.6, 0.6);
  beacon.position.set(kx, 2.3, R.z);
  root.add(beacon);
  // a counter along the back wall, and a ceiling light
  box(blue, R.back + 1.1, 0.55, R.z, 1.2, 1.1, R.width - 3);
  box(kit.lamp, cx, R.height - 0.8, R.z, 0.4, 0.08, R.width - 3);

  // solid walls, with the doorway left open
  const colliders: Collider[] = [
    { x: R.back + T / 2, z: R.z, hw: T / 2 + 0.05, hd: R.width / 2 },
    { x: cx, z: z0 + T / 2, hw: depth / 2, hd: T / 2 + 0.05 },
    { x: cx, z: z1 - T / 2, hw: depth / 2, hd: T / 2 + 0.05 },
    ...[-1, 1].map((s) => ({ x: R.front - T / 2, z: R.z + s * (dz + jamb), hw: T / 2 + 0.05, hd: jamb })),
    // the kiosk and the counter
    { x: kx, z: R.z, hw: 0.5, hd: 0.75 },
    { x: R.back + 1.1, z: R.z, hw: 0.65, hd: (R.width - 3) / 2 },
  ];
  return { root, colliders };
}
