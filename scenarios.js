import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

/**
 * Scenario manager: load and swap scene environments under /assets/scenarios.
 * Provides setScenario and utilities to snap a model to the scenario floor.
 */
export function createScenarioManager(scene) {
  /** @type {THREE.Group | null} */
  let scenarioRoot = null;
  let currentScenarioKey = 'none';

  // Explicit URL mapping for scenarios that don't follow the default scene.gltf path
  /** @type {Record<string, string>} */
  const scenarioUrlMap = {
    // Uses GLB instead of scene.gltf
    'vr_moody_lighting_art_gallery_scene_06': './assets/scenarios/vr_moody_lighting_art_gallery_scene_06/vr_moody_lighting_art_gallery_scene_06.glb',
    // Show Room sci-fi garage now provided as a GLB
    'sci-fi_garage': './assets/scenarios/sci-fi_garage/sci-fi_garage.glb',
    // Garage showroom VR ready (GLB)
    'garageshowroom_vr_ready': './assets/scenarios/garageshowroom_vr_ready/garageshowroom_vr_ready.glb',
    // New GLB scenarios
    'car-showroom_1': './assets/scenarios/car-showroom_1.glb',
    'car-showroom_2': './assets/scenarios/car-showroom_2.glb',
    'garage': './assets/scenarios/garage.glb',
    'hangar': './assets/scenarios/hangar.glb',
    'vr_gallery': './assets/scenarios/vr_gallery.glb',
    'white-room1': './assets/scenarios/white-room1.glb',
  };

  function disposeScenario() {
    if (!scenarioRoot) return;
    scene.remove(scenarioRoot);
    scenarioRoot.traverse((child) => {
      if (child.isMesh) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          for (const m of materials) m.dispose?.();
        }
      }
    });
    scenarioRoot = null;
  }

  function setScenario(key, { onProgress, onDone } = {}) {
    disposeScenario();
    currentScenarioKey = key || 'none';
    if (!key || key === 'none') {
      onProgress?.(100);
      onDone?.();
      return;
    }

    const url = scenarioUrlMap[key] || `./assets/scenarios/${key}/scene.gltf`;
    const loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath('https://unpkg.com/three@0.160.0/examples/jsm/libs/draco/');
    loader.setDRACOLoader(draco);

    loader.load(
      url,
      (gltf) => {
        console.log(`[scenario] GLTF loaded successfully for ${key}:`, gltf);
        console.log(`[scenario] GLTF animations:`, gltf.animations);
        console.log(`[scenario] GLTF scenes:`, gltf.scenes);
        console.log(`[scenario] GLTF scene:`, gltf.scene);

        const root = gltf.scene || gltf.scenes[0];
        if (!root) {
          console.error(`[scenario] No root scene found in ${key}`);
          return;
        }

        console.log(`[scenario] Root scene for ${key}:`, root);
        console.log(`[scenario] Root animations for ${key}:`, root.animations);
        console.log(`[scenario] Root type:`, root.type);

        // Check all objects in the scene for animations
        const objectsWithAnimations = [];
        root.traverse((child) => {
          console.log(`[scenario] Object in ${key}: ${child.name || child.type}`, {
            animations: child.animations,
            type: child.type
          });
          if (child.animations && child.animations.length > 0) {
            objectsWithAnimations.push(child);
          }
        });

        console.log(`[scenario] Objects with animations in ${key}:`, objectsWithAnimations);

        scenarioRoot = new THREE.Group();
        scenarioRoot.add(root);
        scene.add(scenarioRoot);
        onProgress?.(90);
        onDone?.();
      },
      (ev) => {
        if (ev && ev.total) {
          const pct = Math.round((ev.loaded / ev.total) * 100);
          onProgress?.(90 + Math.round(pct * 0.09));
        } else {
          onProgress?.(95);
        }
      },
      (err) => { console.error('[scenario] error', err); onProgress?.(100); onDone?.(); }
    );
  }

  function getScenarioRoot() { return scenarioRoot; }
  function getCurrentScenarioKey() { return currentScenarioKey; }

  return { setScenario, getScenarioRoot, getCurrentScenarioKey };
}

