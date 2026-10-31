import type { LaserPool, XYZ } from '@saber-side/shared';
import * as THREE from 'three';
import type { GlowFn } from '../kit';

/**
 * Laser bolts (drawn from the sim's laser pool) and little bursts of glowing bits when something gets zapped.
 * Everything lives under `root`; add it to whichever scene the ship is flying in.
 */
export interface FlightFx {
  root: THREE.Group;
  /** Shows the live lasers where the sim has them. */
  syncLasers(pool: LaserPool): void;
  /** A burst of `n` bits flying out from `pos` at up to `power` units per second. Cosmetic: uses `rand`. */
  burst(pos: XYZ, color: number, n: number, power: number): void;
  /** Moves the bits; `gravity` pulls them down (0 in space). */
  update(dt: number, gravity: number): void;
  clear(): void;
}

const AXIS_Z = new THREE.Vector3(0, 0, 1);
const dir = new THREE.Vector3();

interface Bit {
  sprite: THREE.Sprite;
  mat: THREE.SpriteMaterial;
  vel: THREE.Vector3;
  life: number;
  max: number;
  size: number;
}

export function buildFlightFx(glow: GlowFn, lasers: number, rand: () => number = Math.random): FlightFx {
  const root = new THREE.Group();
  const boltGeo = new THREE.CylinderGeometry(0.09, 0.09, 3, 6).rotateX(Math.PI / 2);
  const boltMat = new THREE.MeshBasicMaterial({
    color: 0xff5a3a,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const bolts = Array.from({ length: lasers }, () => {
    const m = new THREE.Mesh(boltGeo, boltMat);
    m.visible = false;
    m.add(glow(0xff4020, 2, 0.6));
    root.add(m);
    return m;
  });
  const bits: Bit[] = Array.from({ length: 120 }, () => {
    const sprite = glow(0xffffff, 1, 1);
    const mat = sprite.material;
    mat.blending = THREE.NormalBlending;
    sprite.visible = false;
    root.add(sprite);
    return { sprite, mat, vel: new THREE.Vector3(), life: 0, max: 1, size: 1 };
  });
  let next = 0;

  return {
    root,
    syncLasers(pool) {
      pool.lasers.forEach((l, i) => {
        const m = bolts[i];
        if (!m) return;
        m.visible = l.life > 0;
        if (!m.visible) return;
        m.position.set(l.pos.x, l.pos.y, l.pos.z);
        m.quaternion.setFromUnitVectors(AXIS_Z, dir.set(l.dir.x, l.dir.y, l.dir.z));
      });
    },
    burst(pos, color, n, power) {
      for (let i = 0; i < n; i++) {
        next = (next + 1) % bits.length;
        const b = bits[next] as Bit;
        b.sprite.position.set(pos.x, pos.y, pos.z);
        b.vel.set(rand() - 0.5, rand() * 0.8, rand() - 0.5).multiplyScalar(power);
        b.life = b.max = 0.5 + rand() * 0.5;
        b.size = 0.4 + rand() * 0.8;
        b.mat.color.setHex(color);
        b.sprite.visible = true;
      }
    },
    update(dt, gravity) {
      for (const b of bits) {
        if (!b.sprite.visible) continue;
        b.life -= dt;
        if (b.life <= 0) {
          b.sprite.visible = false;
          continue;
        }
        b.vel.y -= gravity * dt;
        b.sprite.position.addScaledVector(b.vel, dt);
        const k = b.life / b.max;
        b.sprite.scale.setScalar(b.size * (0.4 + k));
        b.mat.opacity = k;
      }
    },
    clear() {
      for (const m of bolts) m.visible = false;
      for (const b of bits) {
        b.life = 0;
        b.sprite.visible = false;
      }
    },
  };
}
