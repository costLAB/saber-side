import { assignLights, pickLit, SABER_LIGHTS } from '@saber-side/shared';
import * as THREE from 'three';

// The sabers' lights, from a fixed pool (D9, shared/sim/light-pool.ts): sabers glow by their emissive core and glow
// shells, and the pool's few point lights go to the nearest lit sabers, riding on their blades. The legacy game's
// light sync (syncLights) draws each one from where it is, on the bent floor or in real space.
//
// The first sabers made each make one of the pool's lights, on their own blade, so the scene starts out exactly as it
// did when every saber had a light of its own (three.js draws object ids from Math.random, and the order matters).

export interface LitSaber {
  blade: THREE.Object3D;
  color: number;
  /** How bright its light would be (the legacy game's hum included). */
  level: number;
}

const at = new THREE.Vector3();

export function createSaberLights(bladeLength: number) {
  const lights: THREE.PointLight[] = [];
  /** Which saber each light is on (an index into the last update's list), or -1. */
  let on: number[] = [];

  return {
    lights,
    /** Makes a light for a new saber's blade, while the pool isn't full. */
    make(blade: THREE.Object3D, color: number) {
      if (lights.length >= SABER_LIGHTS) return;
      const light = new THREE.PointLight(color, 1.6, 4.5, 2);
      light.position.y = bladeLength / 2;
      blade.add(light);
      lights.push(light);
      on.push(-1);
    },
    /** Gives the pool's lights to the lit sabers nearest `from` (all in the same world: the strip, or real space). */
    update(sabers: readonly LitSaber[], from: THREE.Vector3) {
      // a light still sits on the blade it was made on until it's needed elsewhere
      on = lights.map((l) => sabers.findIndex((s) => s.blade === l.parent));
      const dists = sabers.map((s) => s.blade.getWorldPosition(at).distanceTo(from));
      const picked = pickLit(
        sabers.map((s) => s.level),
        dists,
        lights.length,
      );
      const next = assignLights(on, picked);
      lights.forEach((light, i) => {
        const s = next[i] ?? -1;
        const saber = sabers[s];
        if (!saber) {
          light.intensity = 0;
          return;
        }
        if (light.parent !== saber.blade) {
          saber.blade.add(light);
          light.position.set(0, bladeLength / 2, 0);
          light.color.setHex(saber.color);
        }
        light.intensity = saber.level;
      });
    },
  };
}
