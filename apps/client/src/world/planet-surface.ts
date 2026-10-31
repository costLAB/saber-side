import { ALIEN_COUNT, type Alien, mulberry, type Planet, SURFACE_SIZE, TAU, terrainHeight } from '@saber-side/shared';
import * as THREE from 'three';
import { type DrawTexFn, dot } from '../render/kit';
import type { PlanetLook } from './planet-looks';

/** A planet's surface: rolling ground under its own sky, scattered scenery, and a crowd of little aliens. */
export interface SurfaceScene {
  scene: THREE.Scene;
  /** Moves the alien models to match the sim. */
  sync(aliens: readonly Alien[]): void;
}

const SCENERY_COUNT = 260;
const SCENERY_SPREAD = 3600;

export function buildSurface(planet: Planet, look: PlanetLook, drawTex: DrawTexFn): SurfaceScene {
  const scene = new THREE.Scene();
  const R = mulberry(look.globe.seed * 7);
  scene.background = new THREE.Color(look.sky);
  scene.fog = new THREE.Fog(look.sky, 260, 1700);
  scene.add(new THREE.HemisphereLight(0xffffff, new THREE.Color(look.ground[3]), 0.75));
  const sun = new THREE.DirectionalLight(0xfff4e0, 1.1);
  sun.position.set(300, 600, 200);
  scene.add(sun);

  const groundTex = drawTex(256, 256, (g, w, h) => {
    g.fillStyle = look.ground[0];
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 700; i++) {
      g.globalAlpha = 0.25;
      g.fillStyle = look.ground[(R() * 4) | 0] ?? look.ground[0];
      dot(g, R() * w, R() * h, 2 + R() * 14);
    }
    g.globalAlpha = 1;
  });
  groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
  groundTex.repeat.set(70, 70);
  const geo = new THREE.PlaneGeometry(SURFACE_SIZE, SURFACE_SIZE, 200, 200).rotateX(-Math.PI / 2);
  const pa = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pa.count; i++) pa.setY(i, terrainHeight(planet, pa.getX(i), pa.getZ(i)));
  geo.computeVertexNormals();
  scene.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95 })));

  // scenery: two kinds per planet, each instanced; [geometry, color, how far it sits up out of the ground]
  const kinds: Record<PlanetLook['deco'], [THREE.BufferGeometry, number, number][]> = {
    trees: [
      [new THREE.ConeGeometry(3, 9, 7), 0x2f6a3a, 4.5],
      [new THREE.IcosahedronGeometry(3.5, 1), 0x5f9a45, 2.6],
    ],
    rocks: [
      [new THREE.IcosahedronGeometry(3, 0), 0x8a3f26, 1.5],
      [new THREE.IcosahedronGeometry(1.6, 0), 0x6e2f1a, 0.8],
    ],
    crystals: [
      [new THREE.ConeGeometry(1.6, 10, 5), 0xd06ad8, 5],
      [new THREE.ConeGeometry(1, 6, 5), 0x3fe0c8, 3],
    ],
    ice: [
      [new THREE.ConeGeometry(2, 12, 6), 0xbfe6ff, 6],
      [new THREE.IcosahedronGeometry(2.4, 0), 0xe8f4fa, 1.2],
    ],
  };
  const dummy = new THREE.Object3D();
  for (const [shape, color, lift] of kinds[look.deco]) {
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.6,
      flatShading: true,
      emissive: look.deco === 'crystals' ? color : 0x000000,
      emissiveIntensity: 0.35,
    });
    const im = new THREE.InstancedMesh(shape, mat, SCENERY_COUNT);
    for (let i = 0; i < SCENERY_COUNT; i++) {
      const x = (R() - 0.5) * SCENERY_SPREAD;
      const z = (R() - 0.5) * SCENERY_SPREAD;
      const s = 0.7 + R() * 0.9;
      dummy.position.set(x, terrainHeight(planet, x, z) + lift * s, z);
      dummy.rotation.set(0, R() * TAU, 0);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
    }
    scene.add(im);
  }

  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
  const skin = new THREE.MeshStandardMaterial({ color: look.alien, roughness: 0.45 });
  const models = Array.from({ length: ALIEN_COUNT }, () => {
    const m = buildAlien(skin, eyeMat, pupilMat);
    scene.add(m);
    return m;
  });

  return {
    scene,
    sync(aliens) {
      aliens.forEach((a, i) => {
        const m = models[i];
        if (!m) return;
        m.visible = a.alive;
        m.position.set(a.pos.x, a.pos.y, a.pos.z);
        m.rotation.y = a.yaw;
      });
    },
  };
}

/** A round little alien on two feet, with eyes on stalks. About 6.6 units tall. */
function buildAlien(skin: THREE.Material, eyeMat: THREE.Material, pupilMat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  add(new THREE.SphereGeometry(0.9, 16, 12), skin, 0, 1, 0).scale.set(1, 1.15, 1);
  for (const sx of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.06, 0.08, 0.8, 6), skin, sx * 0.4, 2.1, 0).rotation.z = -sx * 0.4;
    add(new THREE.SphereGeometry(0.24, 12, 8), eyeMat, sx * 0.58, 2.5, 0.05);
    add(new THREE.SphereGeometry(0.11, 8, 6), pupilMat, sx * 0.58, 2.52, 0.26);
    add(new THREE.SphereGeometry(0.3, 8, 6), skin, sx * 0.4, 0.12, 0.1).scale.set(1, 0.5, 1.4);
  }
  const mouth = add(new THREE.TorusGeometry(0.22, 0.05, 6, 12, Math.PI), pupilMat, 0, 1.15, 0.86);
  mouth.rotation.z = Math.PI;
  g.scale.setScalar(2.2);
  return g;
}
