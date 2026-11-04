import { bendPoint } from '@saber-side/shared';
import * as THREE from 'three';
import { isBent, REAL_OFF } from './bend';

// Frustum culling for things bent onto the ring (quest-vr PR 6). The bend happens in the vertex shader, so three.js
// can't cull bent things by their unbent bounds, and the legacy game turns culling off for all of them: every frame
// draws the whole ring. Here each bent mesh's bounding sphere is put through the same bend (or, in real space,
// dropped REAL_OFF as the shader does) and tested against the view, and whatever's out of view is hidden for that
// draw, then shown again.
//
// A sphere through the bend keeps about its size (the ring is large next to anything on it), so the radius is padded
// a little rather than bent. Instanced meshes keep drawing: their bounds don't cover their instances.

const PAD = 1.1;
const SLACK = 0.5;

const sphere = new THREE.Sphere();
const center = new THREE.Vector3();
const scale = new THREE.Vector3();
const pos = new THREE.Vector3();
const quat = new THREE.Quaternion();
const frustum = new THREE.Frustum();
const m = new THREE.Matrix4();

function bentMaterial(o: THREE.Mesh | THREE.Sprite): boolean {
  const mat = o.material as THREE.Material | THREE.Material[];
  return Array.isArray(mat) ? mat.some(isBent) : isBent(mat);
}

/**
 * Hides the bent meshes and sprites of `scene` that are out of the view of `camera` (whose world matrix and
 * projection are up to date), and returns a function that shows them again.
 */
export function cullBent(scene: THREE.Object3D, camera: THREE.Camera): () => void {
  frustum.setFromProjectionMatrix(m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  const hidden: THREE.Object3D[] = [];
  const visit = (o: THREE.Object3D) => {
    if (!o.visible) return;
    const drawn = o as THREE.Mesh | THREE.Sprite;
    if (
      ((drawn as THREE.Mesh).isMesh || (drawn as THREE.Sprite).isSprite) &&
      !(o as THREE.InstancedMesh).isInstancedMesh &&
      !o.frustumCulled &&
      bentMaterial(drawn)
    ) {
      const geo = drawn.geometry;
      if (!geo.boundingSphere) geo.computeBoundingSphere();
      sphere.copy(geo.boundingSphere as THREE.Sphere);
      center.copy(sphere.center).applyMatrix4(o.matrixWorld);
      o.matrixWorld.decompose(pos, quat, scale);
      const r = sphere.radius * Math.max(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z)) * PAD + SLACK;
      if (center.y > REAL_OFF / 2) center.y -= REAL_OFF;
      else bendPoint(pos.copy(center), center);
      sphere.center.copy(center);
      sphere.radius = r;
      // (a mesh with children of its own isn't hidden: its bounds don't cover them)
      if (!frustum.intersectsSphere(sphere) && o.children.length === 0) {
        o.visible = false;
        hidden.push(o);
        return;
      }
    }
    for (const c of o.children) visit(c);
  };
  visit(scene);
  return () => {
    for (const o of hidden) o.visible = true;
  };
}
