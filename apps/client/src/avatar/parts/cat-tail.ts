import * as THREE from 'three';
import { CAT, type CatLook, INK } from './cat-look';

// Snatch's tail: a thick ringed tube along a spline, from the middle of the cat's back, along under it, and curling up
// behind its right paw. It's in the cat body's frame (model units). It holds the rest pose for now; anything that moves
// it (a swish, a ragdoll, a grab) hands `setPath` new points and the tube is rebuilt along them.

/** The tail's rest pose: its spline's points, root first (inside the body) to the tip. */
export const TAIL_REST: readonly (readonly [number, number, number])[] = [
  [0.0, 0.28, -0.55],
  [-0.35, 0.235, -0.92],
  [-0.85, 0.235, -0.98],
  [-1.22, 0.36, -0.72],
  [-1.38, 0.66, -0.55],
  [-1.5, 0.92, -0.46],
  [-1.72, 1.02, -0.4],
  [-1.9, 0.9, -0.36],
  [-1.93, 0.74, -0.32],
];

export const TAIL_RADIUS = 0.21;

/** Its rings, from the root: where each ends along the spline (0 to 1), its color, and whether it's fur (takes paint). */
const RINGS = [
  { to: 0.65, color: CAT.tailFur, fur: true },
  { to: 0.7, color: CAT.ring, fur: false },
  { to: 0.87, color: CAT.orange, fur: false },
  { to: 1, color: CAT.tailFur, fur: true },
] as const;

/** One ring's stretch of the tail's spline, from t0 to t1. */
class Span extends THREE.Curve<THREE.Vector3> {
  readonly whole: THREE.Curve<THREE.Vector3>;
  readonly t0: number;
  readonly t1: number;
  constructor(whole: THREE.Curve<THREE.Vector3>, t0: number, t1: number) {
    super();
    this.whole = whole;
    this.t0 = t0;
    this.t1 = t1;
  }
  override getPoint(u: number, out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(this.whole.getPoint(this.t0 + u * (this.t1 - this.t0)));
  }
}

export interface CatTail {
  group: THREE.Group;
  /** The points it's drawn along now. */
  path: THREE.Vector3[];
  /** Redraws the tube along new points (the same count as TAIL_REST, root first). */
  setPath(points: readonly THREE.Vector3[]): void;
}

export function buildCatTail(look: CatLook): CatTail {
  const { kit } = look;
  const group = new THREE.Group();
  const rings = RINGS.map((r) => {
    const mat = r.fur ? look.fur(r.color) : look.toon(r.color);
    const mesh = look.ink(kit.mesh(new THREE.BufferGeometry(), mat), INK.thick);
    group.add(mesh);
    return mesh;
  });
  const last = rings[rings.length - 1] as THREE.Mesh;
  const tip = look.ink(kit.mesh(new THREE.SphereGeometry(TAIL_RADIUS, 24, 16), last.material as THREE.Material));
  group.add(tip);

  const tail: CatTail = {
    group,
    path: TAIL_REST.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
    setPath(points) {
      tail.path = points.map((p) => p.clone());
      const curve = new THREE.CatmullRomCurve3(tail.path, false, 'centripetal');
      let from = 0;
      RINGS.forEach((r, i) => {
        const t0 = from;
        const t1 = r.to;
        from = r.to;
        const geo = new THREE.TubeGeometry(
          new Span(curve, t0, t1),
          Math.max(6, Math.round(48 * (t1 - t0))),
          TAIL_RADIUS,
          16,
          false,
        );
        const mesh = rings[i] as THREE.Mesh;
        mesh.geometry.dispose();
        mesh.geometry = geo;
        for (const hull of look.outlines(mesh)) hull.geometry = geo;
      });
      tip.position.copy(curve.getPoint(1));
    },
  };
  tail.setPath(tail.path);
  return tail;
}
