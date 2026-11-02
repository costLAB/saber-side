import { SHOP_ROW, type ShopView, SPOT_SIZES, SPOTS, type Spot } from '@saber-side/shared';
import * as THREE from 'three';
import type { GlowFn } from '../render/kit';
import { makeCanvas } from '../render/textures';
import type { Collider } from './bot-maker';

// The row of shop spots on the plaza (shared content/spots.ts): storefronts across from the Bot Maker, each with an
// open door, a kiosk just inside, a counter, and empty shelves (stock comes later). A vacant spot's sign says "FOR
// LEASE"; a leased one shows its shop's name, and whether it's open. Driving in through the door opens the kiosk
// (app/aboard.ts).
//
// Like the Bot Maker, the row lives on the floor strip and is bent onto the ring with everything else.

export interface ShopRowKit {
  glow: GlowFn;
  glass: THREE.Material;
  lamp: THREE.Material;
}

export interface ShopRowScene {
  root: THREE.Group;
  colliders: Collider[];
  /** Shows what's at a spot now: a shop, or nothing (vacant). */
  show(spotId: string, shop: ShopView | undefined): void;
}

const WALL = 0xe9dfc8;
const TRIM = 0x3f4d2a;
const CARROT = 0xe0701e;
const SLATE = 0x2f3a40;
const RUST = 0x7a3b28;
const SCREEN = 0xffb36b;

const css = (hex: number) => `#${hex.toString(16).padStart(6, '0')}`;

/** What a spot's sign says, and how it looks. */
function signFor(spot: Spot, shop: ShopView | undefined) {
  if (!shop) {
    return {
      main: 'FOR LEASE',
      sub: `SPOT ${spot.name} · ${SPOT_SIZES[spot.size].toUpperCase()} · FIRST SHOP FREE`,
      bg: SLATE,
      accent: CARROT,
      glow: 0.5,
    };
  }
  const owner = `${shop.ownerName.toUpperCase()}'S SHOP`;
  if (shop.status === 'repairs')
    return { main: shop.name, sub: 'CLOSED FOR REPAIRS', bg: RUST, accent: 0xf2c14e, glow: 0.25 };
  if (!shop.open)
    return { main: shop.name, sub: `${owner} · CLOSED · BACK SOON`, bg: TRIM, accent: 0xb8b09a, glow: 0.15 };
  return { main: shop.name, sub: `${owner} · OPEN`, bg: TRIM, accent: CARROT, glow: 0.6 };
}

export function buildShopRow(kit: ShopRowKit): ShopRowScene {
  const root = new THREE.Group();
  const colliders: Collider[] = [];
  const signs = new Map<string, (shop: ShopView | undefined) => void>();
  const wall = new THREE.MeshStandardMaterial({ color: WALL, roughness: 0.85, metalness: 0.05 });
  const trim = new THREE.MeshStandardMaterial({ color: TRIM, roughness: 0.6, metalness: 0.3 });
  const floor = new THREE.MeshStandardMaterial({ color: 0x6b5a48, roughness: 0.9, metalness: 0.05 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a5d3b, roughness: 0.85 });
  const awning = new THREE.MeshStandardMaterial({ color: CARROT, roughness: 0.8 });
  const screen = new THREE.MeshBasicMaterial({ color: SCREEN });
  const { front, depth, height, door } = SHOP_ROW;
  const back = front + depth;
  const cx = (front + back) / 2;
  const T = 0.5; // wall thickness

  for (const spot of SPOTS) {
    const g = new THREE.Group();
    root.add(g);
    const box = (mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
      return m;
    };
    const { z, width } = spot;
    const z0 = z - width / 2;
    const z1 = z + width / 2;
    const dz = door.width / 2;
    const jamb = (width / 2 - dz) / 2; // half-length of each stretch of front wall beside the door

    // floor, walls (the front one with its door), a trim band round the top, and an awning
    box(floor, cx, 0.05, z, depth, 0.1, width);
    box(wall, back - T / 2, height / 2, z, T, height, width);
    for (const wz of [z0 + T / 2, z1 - T / 2]) box(wall, cx, height / 2, wz, depth, height, T);
    for (const s of [-1, 1]) box(wall, front + T / 2, height / 2, z + s * (dz + jamb), T, height, jamb * 2);
    box(wall, front + T / 2, (height + door.height) / 2, z, T, height - door.height, door.width);
    box(trim, cx, height - 0.3, z, depth + 0.3, 0.6, width + 0.3);
    box(trim, cx, 0.3, z, depth + 0.1, 0.6, width + 0.1);
    box(awning, front - 1.1, door.height + 0.55, z, 2.2, 0.12, width * 0.84).rotation.z = 0.3;
    for (const s of [-1, 1]) box(kit.glass, front - 0.03, 2.2, z + s * (dz + jamb), 0.1, 1.8, jamb * 1.3);
    box(kit.lamp, front - 0.1, door.height + 0.05, z, 0.12, 0.12, door.width);

    // inside: the kiosk by the door, a counter at the back, and shelves waiting for stock
    const kx = front + 2.4;
    const kz = z - width / 2 + 1.6;
    box(trim, kx, 0.6, kz, 0.9, 1.2, 1.2);
    box(screen, kx - 0.3, 1.45, kz, 0.08, 0.6, 0.9).rotation.z = -0.35;
    const beacon = kit.glow(SCREEN, 1.3, 0.55);
    beacon.position.set(kx, 2.2, kz);
    g.add(beacon);
    box(wood, back - 2.2, 0.55, z, 1.1, 1.1, width * 0.6);
    for (const y of [1.6, 2.6, 3.6]) box(wood, back - T - 0.35, y, z, 0.7, 0.08, width - 2);

    // the sign over the door, redrawn whenever the spot changes hands or opens and closes
    const canvas = makeCanvas(512, 128);
    const tex = new THREE.CanvasTexture(canvas);
    tex.encoding = THREE.sRGBEncoding;
    const signMat = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, roughness: 0.6 });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(width - 2, 9), 1.4), signMat);
    sign.position.set(front - 0.06, height - 1.4, z);
    sign.rotation.y = -Math.PI / 2;
    g.add(sign);
    let showing: ShopView | undefined;
    const draw = (shop: ShopView | undefined) => {
      showing = shop;
      const look = signFor(spot, shop);
      const c = canvas.getContext('2d') as CanvasRenderingContext2D;
      const { width: w, height: h } = canvas;
      c.fillStyle = css(look.bg);
      c.fillRect(0, 0, w, h);
      c.strokeStyle = css(look.accent);
      c.lineWidth = 8;
      c.strokeRect(6, 6, w - 12, h - 12);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = '#f4ecdc';
      let size = 58;
      do {
        c.font = `700 ${size}px "Chakra Petch", "Arial Narrow", sans-serif`;
        size -= 2;
      } while (c.measureText(look.main).width > w - 50 && size > 12);
      c.fillText(look.main, w / 2, h * 0.42);
      size = 19;
      do {
        c.font = `500 ${size}px "IBM Plex Mono", monospace`;
        size -= 1;
      } while (c.measureText(look.sub).width > w - 40 && size > 9);
      c.fillStyle = css(look.accent);
      c.fillText(look.sub, w / 2, h * 0.78);
      signMat.emissiveIntensity = look.glow;
      tex.needsUpdate = true;
    };
    draw(undefined);
    // The display font may arrive after the first draw.
    document.fonts?.ready.then(() => draw(showing));
    signs.set(spot.id, draw);

    // solid walls with the doorway left open, the kiosk, and the counter
    colliders.push(
      { x: back - T / 2, z, hw: T / 2 + 0.05, hd: width / 2 },
      { x: cx, z: z0 + T / 2, hw: depth / 2, hd: T / 2 + 0.05 },
      { x: cx, z: z1 - T / 2, hw: depth / 2, hd: T / 2 + 0.05 },
      ...[-1, 1].map((s) => ({ x: front + T / 2, z: z + s * (dz + jamb), hw: T / 2 + 0.05, hd: jamb })),
      { x: kx, z: kz, hw: 0.5, hd: 0.65 },
      { x: back - 2.2, z, hw: 0.6, hd: width * 0.3 },
    );
  }

  return {
    root,
    colliders,
    show(spotId, shop) {
      signs.get(spotId)?.(shop);
    },
  };
}
