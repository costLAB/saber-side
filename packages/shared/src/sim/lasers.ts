import type { XYZ } from '../ring-space';
import { Vec3 } from '../vec3';

/** A laser bolt from a ship's wing guns. It flies straight and fades out after `life` seconds. */
export interface Laser {
  pos: Vec3;
  /** Unit direction of travel. */
  dir: Vec3;
  speed: number;
  /** Seconds left; the laser is gone at 0. */
  life: number;
}

export const LASER_LIFE = 1.6;

/** A fixed pool, reused round-robin so firing never allocates. */
export interface LaserPool {
  lasers: Laser[];
  next: number;
}

export function makeLasers(n = 40): LaserPool {
  return {
    lasers: Array.from({ length: n }, () => ({ pos: new Vec3(), dir: new Vec3(0, 0, 1), speed: 0, life: 0 })),
    next: 0,
  };
}

export function fireLaser(pool: LaserPool, from: XYZ, dir: XYZ, speed: number): Laser {
  pool.next = (pool.next + 1) % pool.lasers.length;
  const l = pool.lasers[pool.next] as Laser;
  l.pos.copy(from);
  l.dir.copy(dir);
  l.speed = speed;
  l.life = LASER_LIFE;
  return l;
}

export function stepLasers(pool: LaserPool, dt: number) {
  for (const l of pool.lasers) {
    if (l.life <= 0) continue;
    l.life -= dt;
    l.pos.x += l.dir.x * l.speed * dt;
    l.pos.y += l.dir.y * l.speed * dt;
    l.pos.z += l.dir.z * l.speed * dt;
  }
}

export function clearLasers(pool: LaserPool) {
  for (const l of pool.lasers) l.life = 0;
}
