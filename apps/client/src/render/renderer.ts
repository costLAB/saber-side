import * as THREE from 'three';

/** The WebGL renderer, filling the page's #stage. Filmic tone mapping and sRGB output, as the prototype had. */
export function createRenderer(stage: HTMLElement): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.domElement.tabIndex = 0;
  stage.appendChild(renderer.domElement);
  return renderer;
}
