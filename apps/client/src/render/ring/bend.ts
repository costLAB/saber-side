import { R_IN } from '@saber-side/shared';
import type * as THREE from 'three';

// Everything that lives on the floor is simulated on a flat strip (x across, z around the ring, y up) and bent onto the
// cylinder in the vertex shader. The CPU uses the same mapping (bendPoint in @saber-side/shared) for the camera and
// lights. Anything parked above y = 5000 is "real space" (lift tubes, hub, end caps): drawn unbent, 10000 lower.

/** The GLSL twin of `bendPoint` / `bendUp`: `bendPos` for positions, `bendDir` for normals. */
export const BEND_GLSL = `
#define BEND_R ${R_IN.toFixed(4)}
vec4 bendPos( vec4 w ) { if ( w.y > 5000.0 ) return vec4( w.x, w.y - 10000.0, w.z, 1.0 ); float th = -w.z / BEND_R; float r = BEND_R - w.y; return vec4( w.x, -r * cos( th ), -r * sin( th ), 1.0 ); }
vec3 bendDir( vec3 v, float th ) { float c = cos( th ), s = sin( th ); return vec3( v.x, c * v.y - s * v.z, s * v.y + c * v.z ); }
`;

/**
 * Patches a material's vertex shader so whatever uses it is bent onto the ring (or drawn as-is in real space).
 * Works for meshes, instanced meshes, and sprites. Safe to call twice.
 */
export function bendMaterial(m: THREE.Material) {
  if (m.userData.bent) return;
  m.userData.bent = true;
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${BEND_GLSL}`);
    if ((m as THREE.SpriteMaterial).isSpriteMaterial) {
      sh.vertexShader = sh.vertexShader.replace(
        'vec4 mvPosition = modelViewMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );',
        'vec4 mvPosition = viewMatrix * bendPos( modelMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) );',
      );
      return;
    }
    sh.vertexShader = sh.vertexShader.replace(
      '#include <project_vertex>',
      `
      vec4 bl = vec4( transformed, 1.0 );
      #ifdef USE_INSTANCING
        bl = instanceMatrix * bl;
      #endif
      vec4 mvPosition = viewMatrix * bendPos( modelMatrix * bl );
      gl_Position = projectionMatrix * mvPosition;`,
    );
    sh.vertexShader = sh.vertexShader.replace(
      'transformedNormal = normalMatrix * transformedNormal;',
      `
      {
        vec4 bp0 = vec4( position, 1.0 );
        #ifdef USE_INSTANCING
          bp0 = instanceMatrix * bp0;
        #endif
        bp0 = modelMatrix * bp0;
        vec3 wn0 = normalize( mat3( modelMatrix ) * transformedNormal );
        transformedNormal = mat3( viewMatrix ) * ( bp0.y > 5000.0 ? wn0 : bendDir( wn0, -bp0.z / BEND_R ) );
      }`,
    );
  };
  m.customProgramCacheKey = () => 'bend';
  m.needsUpdate = true;
}
