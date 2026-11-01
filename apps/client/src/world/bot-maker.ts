import { BOT_MAKER, ROBOT_COLORS } from '@saber-side/shared';
import * as THREE from 'three';
import type { GlowFn, MakeSignFn } from '../render/kit';

// The Bot Maker: the workshop new robots roll out of (level data in @saber-side/shared content/spawn.ts). It's a
// hollow building with an open bay door, so robots can drive back in to look around: an assembly gantry over a
// guide track, and shelves of spare heads and wheels along the walls.
//
// It lives on the floor strip and is bent onto the ring with everything else, so its materials are plain ones the
// legacy game's bend pass patches.

/** A flat-space obstacle, as the legacy game's `colliders` holds them. */
export type Collider = { x: number; z: number; hw: number; hd: number };

export interface BotMakerKit {
  makeSign: MakeSignFn;
  glow: GlowFn;
  steel: THREE.Material;
  glass: THREE.Material;
  lamp: THREE.Material;
  hazard: THREE.Material;
}

const WALL = 0x3f6f78;
const TRIM = 0x23343a;
const ORANGE = 0xd0702c;

export function buildBotMaker(kit: BotMakerKit): { root: THREE.Group; colliders: Collider[] } {
  const B = BOT_MAKER;
  const root = new THREE.Group();
  const wall = new THREE.MeshStandardMaterial({ color: WALL, roughness: 0.85, metalness: 0.1 });
  const trim = new THREE.MeshStandardMaterial({ color: TRIM, roughness: 0.6, metalness: 0.4 });
  const orange = new THREE.MeshStandardMaterial({ color: ORANGE, roughness: 0.55, metalness: 0.3 });
  const floor = new THREE.MeshStandardMaterial({ color: 0x4a4744, roughness: 0.9, metalness: 0.1 });
  const stripe = new THREE.MeshBasicMaterial({ color: 0xe0b23a });
  const box = (mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    m.position.set(x, y, z);
    root.add(m);
    return m;
  };
  const cyl = (mat: THREE.Material, x: number, y: number, z: number, r: number, h: number, seg = 16) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat);
    m.position.set(x, y, z);
    root.add(m);
    return m;
  };

  const depth = B.front - B.back;
  const cx = (B.front + B.back) / 2;
  const z0 = B.z - B.width / 2;
  const z1 = B.z + B.width / 2;
  const T = 0.5; // wall thickness
  const dz = B.door.width / 2;
  const jamb = (B.width / 2 - dz) / 2; // half-length of each stretch of front wall beside the door

  // floor, walls, and roof
  box(floor, cx, 0.05, B.z, depth, 0.1, B.width);
  box(wall, B.back + T / 2, B.height / 2, B.z, T, B.height, B.width);
  for (const z of [z0 + T / 2, z1 - T / 2]) box(wall, cx, B.height / 2, z, depth, B.height, T);
  for (const s of [-1, 1]) box(wall, B.front - T / 2, B.height / 2, B.z + s * (dz + jamb), T, B.height, jamb * 2);
  box(wall, B.front - T / 2, (B.height + B.door.height) / 2, B.z, T, B.height - B.door.height, B.door.width);
  box(trim, cx, B.height + 0.2, B.z, depth + 0.6, 0.4, B.width + 0.6);
  box(trim, cx, 0.35, B.z, depth + 0.1, 0.7, B.width + 0.1);
  // a saw-tooth skylight roof line, so it reads as a workshop from the walkway
  for (let i = 0; i < 3; i++) {
    const tooth = box(orange, B.back + depth * (0.2 + i * 0.3), B.height + 1.1, B.z, 0.35, 1.8, B.width - 1);
    tooth.rotation.z = -0.5;
  }

  // the bay door: hazard-striped jambs, a rolled-up shutter, and a lamp over it
  for (const s of [-1, 1]) {
    const post = box(kit.hazard, B.front + 0.05, B.door.height / 2, B.z + s * (dz + 0.2), 0.5, B.door.height, 0.4);
    post.rotation.y = Math.PI / 2;
  }
  const shutter = cyl(trim, B.front - 0.6, B.door.height + 0.35, B.z, 0.45, B.door.width + 0.4, 20);
  shutter.rotation.x = Math.PI / 2;
  box(kit.lamp, B.front + 0.1, B.door.height + 0.05, B.z, 0.12, 0.12, B.door.width);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), new THREE.MeshBasicMaterial({ color: ORANGE }));
  beacon.position.set(B.front + 0.35, B.door.height + 0.9, B.z);
  root.add(beacon);
  const beaconGlow = kit.glow(0xff8a3a, 2.2, 0.7);
  beaconGlow.position.copy(beacon.position);
  root.add(beaconGlow);

  // the sign over the door, and windows either side of it
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 2.25),
    kit.makeSign(512, 128, 'BOT MAKER', 'NEW ROBOTS ROLL OUT HERE', TRIM, ORANGE, 62),
  );
  sign.position.set(B.front + 0.05, B.door.height + 1.7, B.z);
  sign.rotation.y = Math.PI / 2;
  root.add(sign);
  for (const s of [-1, 1]) box(kit.glass, B.front + 0.03, 2.8, B.z + s * (dz + jamb), 0.1, 2.2, jamb * 1.3);

  // a guide track from the gantry out through the door, painted on the floor
  for (const s of [-1, 1]) box(stripe, cx + 1, 0.11, B.z + s * 1.6, depth - 2, 0.02, 0.18);
  for (let x = B.back + 2; x < B.front - 0.5; x += 1.4) box(trim, x, 0.105, B.z, 0.25, 0.02, 2.9);

  // the assembly gantry over the start of the track, with a jointed arm hanging from it
  const gx = B.back + 5;
  for (const s of [-1, 1]) box(kit.steel, gx, 3.6, B.z + s * 3.4, 0.45, 7.2, 0.45);
  box(orange, gx, 7.2, B.z, 0.7, 0.6, 7.4);
  box(kit.lamp, gx - 0.4, 6.85, B.z, 0.1, 0.1, 6.2);
  const arm = new THREE.Group();
  arm.position.set(gx, 6.9, B.z - 1.2);
  root.add(arm);
  const a1 = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 1.6, 12), kit.steel);
  a1.position.y = -0.8;
  arm.add(a1);
  const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), orange);
  elbow.position.y = -1.6;
  arm.add(elbow);
  const a2 = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 1.4, 12), kit.steel);
  a2.position.set(0.45, -2.15, 0);
  a2.rotation.z = 0.6;
  arm.add(a2);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.5), trim);
  head.position.set(0.85, -2.75, 0);
  arm.add(head);
  const spark = kit.glow(0xffc070, 0.9, 0.9);
  spark.position.set(0.85, -3.0, 0);
  arm.add(spark);

  // shelves of spare parts along both side walls: heads and wheels in every paint
  const parts: THREE.Material[] = ROBOT_COLORS.map(
    (c) => new THREE.MeshStandardMaterial({ color: c.hex, roughness: 0.6, metalness: 0.2 }),
  );
  let k = 0;
  for (const s of [-1, 1]) {
    const wz = B.z + s * (B.width / 2 - T - 0.6);
    for (const y of [1.1, 2.5, 3.9]) {
      box(trim, cx + 1, y, wz, depth - 5, 0.12, 1.1);
      for (let x = B.back + 4; x < B.front - 2.5; x += 1.6) {
        const mat = parts[k++ % parts.length] as THREE.Material;
        const sphere = new THREE.Mesh(new THREE.SphereGeometry(y > 3 ? 0.4 : 0.32, 16, 12), mat);
        sphere.position.set(x, y + (y > 3 ? 0.45 : 0.38), wz);
        root.add(sphere);
      }
    }
    for (const x of [B.back + 3.4, B.front - 2]) box(kit.steel, x, 2.2, wz, 0.15, 4.4, 1.1);
  }
  // ceiling lights
  for (const x of [B.back + 3, cx + 1.5, B.front - 2]) box(kit.lamp, x, B.height - 0.15, B.z, 0.4, 0.08, B.width - 3);

  // solid walls, with the doorway left open
  const colliders: Collider[] = [
    { x: B.back + T / 2, z: B.z, hw: T / 2 + 0.05, hd: B.width / 2 },
    { x: cx, z: z0 + T / 2, hw: depth / 2, hd: T / 2 + 0.05 },
    { x: cx, z: z1 - T / 2, hw: depth / 2, hd: T / 2 + 0.05 },
    ...[-1, 1].map((s) => ({ x: B.front - T / 2, z: B.z + s * (dz + jamb), hw: T / 2 + 0.05, hd: jamb })),
    // the shelves and the gantry legs
    ...[-1, 1].map((s) => ({ x: cx + 1, z: B.z + s * (B.width / 2 - T - 0.6), hw: (depth - 5) / 2, hd: 0.6 })),
    ...[-1, 1].map((s) => ({ x: gx, z: B.z + s * 3.4, hw: 0.3, hd: 0.3 })),
  ];
  return { root, colliders };
}
