import { HALF_L, LEN, mulberry, PLANETS, R_OUT, RING_DOCKS } from '@saber-side/shared';
import * as THREE from 'three';
import { type DrawTexFn, dot, type GlowFn } from '../render/kit';
import { textLabel } from '../render/label';
import { type PlanetLook, planetLook } from './planet-looks';

/** Outside the station: stars, the sun, Ring Seven turning with a dock at each end, and the planets. */
export interface SpaceScene {
  scene: THREE.Scene;
  /** Ring Seven's hull and end caps. Spin it about x at the real rate. */
  ring: THREE.Group;
}

const SUN = new THREE.Vector3(14000, 4000, 6000);

export function buildSpace(kit: { drawTex: DrawTexFn; glow: GlowFn; capMap: THREE.Texture }): SpaceScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x02030a);
  scene.add(new THREE.AmbientLight(0x5a6478, 0.55));
  const sun = new THREE.DirectionalLight(0xfff2dc, 1.6);
  sun.position.copy(SUN);
  scene.add(sun);

  const R = mulberry(303);
  const n = 7000;
  const stars = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = R() * 2 - 1;
    const y = R() * 2 - 1;
    const z = R() * 2 - 1;
    const l = Math.hypot(x, y, z) || 1;
    stars.set([(x / l) * 20000, (y / l) * 20000, (z / l) * 20000], i * 3);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(stars, 3));
  scene.add(
    new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false }),
    ),
  );
  const sunGlow = kit.glow(0xfff0d0, 3200, 1);
  sunGlow.position.copy(SUN);
  scene.add(sunGlow);

  // Ring Seven from outside
  const ring = new THREE.Group();
  scene.add(ring);
  const hullTex = kit.drawTex(1024, 256, (g, w, h) => {
    const r = mulberry(12);
    g.fillStyle = '#8d939a';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 600; i++) {
      g.globalAlpha = 0.08;
      g.fillStyle = r() < 0.5 ? '#ffffff' : '#30363c';
      g.fillRect(r() * w, r() * h, 10 + r() * 60, 4 + r() * 20);
    }
    g.globalAlpha = 1;
    g.strokeStyle = 'rgba(30,34,40,0.6)';
    g.lineWidth = 2;
    for (let x = 0; x < w; x += 32) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, h);
      g.stroke();
    }
    for (let y = 0; y < h; y += 32) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
    }
    g.fillStyle = '#c0662a';
    g.fillRect(0, h * 0.46, w, h * 0.08);
    // a row of lit windows
    g.fillStyle = '#ffe2a8';
    for (let x = 8; x < w; x += 16) g.fillRect(x, h * 0.3, 4, 3);
  });
  hullTex.wrapS = THREE.RepeatWrapping;
  hullTex.repeat.set(4, 1);
  ring.add(
    new THREE.Mesh(
      new THREE.CylinderGeometry(R_OUT, R_OUT, LEN, 128, 1, true).rotateZ(Math.PI / 2),
      new THREE.MeshStandardMaterial({ map: hullTex, roughness: 0.55, metalness: 0.5, side: THREE.DoubleSide }),
    ),
  );
  for (const s of [-1, 1]) {
    const cap = new THREE.Mesh(
      new THREE.CircleGeometry(R_OUT, 96).rotateY((s * Math.PI) / 2),
      new THREE.MeshStandardMaterial({ map: kit.capMap, roughness: 0.6, metalness: 0.5, side: THREE.DoubleSide }),
    );
    cap.position.x = s * HALF_L;
    ring.add(cap);
  }
  // the docks don't turn with the ring, so they're easy to fly into
  const dockMat = new THREE.MeshBasicMaterial({ color: 0x7fe0ff });
  for (const d of RING_DOCKS) {
    const dock = new THREE.Mesh(new THREE.TorusGeometry(14, 1.6, 10, 48).rotateY(Math.PI / 2), dockMat);
    dock.position.x = d.x - Math.sign(d.x);
    scene.add(dock);
  }
  const ringLabel = textLabel(kit.drawTex, 'RING SEVEN · DOCK AT EITHER END', '#ffd7a8');
  ringLabel.position.set(0, R_OUT + 120, 0);
  scene.add(ringLabel);

  for (const p of PLANETS) {
    const look = planetLook(p.name);
    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(p.r, 64, 40),
      new THREE.MeshStandardMaterial({ map: globeTexture(kit.drawTex, look.globe), roughness: 0.85 }),
    );
    globe.position.set(p.pos.x, p.pos.y, p.pos.z);
    scene.add(globe);
    const air = new THREE.Mesh(
      new THREE.SphereGeometry(p.r * 1.06, 48, 32),
      new THREE.MeshBasicMaterial({
        color: look.sky,
        transparent: true,
        opacity: 0.22,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    air.position.copy(globe.position);
    scene.add(air);
    if (look.rings) {
      const rings = new THREE.Mesh(
        new THREE.RingGeometry(p.r * 1.4, p.r * 2.1, 96),
        new THREE.MeshBasicMaterial({ color: 0xc9a6e0, transparent: true, opacity: 0.45, side: THREE.DoubleSide }),
      );
      rings.position.copy(globe.position);
      rings.rotation.x = Math.PI / 2 - 0.35;
      scene.add(rings);
    }
    const label = textLabel(kit.drawTex, p.name, '#ffffff');
    label.position.set(p.pos.x, p.pos.y + p.r + 140, p.pos.z);
    scene.add(label);
  }
  return { scene, ring };
}

/** Oceans and continents (or bands, ice caps, clouds) painted onto an equirectangular map. */
function globeTexture(drawTex: DrawTexFn, o: PlanetLook['globe']): THREE.Texture {
  return drawTex(1024, 512, (g, w, h) => {
    const R = mulberry(o.seed);
    g.fillStyle = o.base;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < o.blobs; i++) {
      const cx = R() * w;
      const cy = h * 0.12 + R() * h * 0.76;
      const n = 20 + R() * 40;
      for (let k = 0; k < n; k++) {
        g.fillStyle = o.land[(R() * o.land.length) | 0] ?? o.base;
        dot(g, cx + (R() - 0.5) * 120, cy + (R() - 0.5) * 60, 6 + R() * 22);
      }
    }
    if (o.bands)
      for (let y = 0; y < h; y += 18) {
        g.globalAlpha = 0.18;
        g.fillStyle = o.land[((y / 18) | 0) % o.land.length] ?? o.base;
        g.fillRect(0, y, w, 9 + R() * 8);
      }
    g.globalAlpha = 1;
    if (o.caps) {
      g.fillStyle = o.caps;
      g.fillRect(0, 0, w, h * 0.06);
      g.fillRect(0, h * 0.94, w, h * 0.06);
    }
    if (o.clouds)
      for (let i = 0; i < 260; i++) {
        g.globalAlpha = 0.3;
        g.fillStyle = '#ffffff';
        g.fillRect(R() * w, R() * h, 30 + R() * 90, 4 + R() * 6);
      }
    g.globalAlpha = 1;
  });
}
