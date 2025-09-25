import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';

export function setupPostProcessing(renderer, scene, camera, width, height) {
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  const bokehPass = new BokehPass(scene, camera, {
    focus: 8.0,
    aperture: 0.00018,
    maxblur: 0.007,
  });
  bokehPass.enabled = false;
  composer.addPass(bokehPass);
  composer.setSize(width, height);
  return { composer, renderPass, bokehPass };
}



