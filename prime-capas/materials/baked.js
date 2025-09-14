import * as THREE from 'three';

export function removeDefaultTextureMapsFromModel(modelRoot, remove = true) {
  if (!modelRoot) return;
  modelRoot.traverse((child) => {
    if (!child.isMesh) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (const m of mats) {
      if (!m) continue;
      if (remove && 'map' in m && m.map) { m.map = null; m.needsUpdate = true; }
    }
  });
}

export function applyBakedTextureToModel(modelRoot, textureUrl) {
  if (!modelRoot) return;
  const texLoader = new THREE.TextureLoader();
  texLoader.load(
    textureUrl,
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      modelRoot.traverse((child) => {
        if (!child.isMesh || !child.material) return;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        for (let i = 0; i < materials.length; i++) {
          const m = materials[i];
          if (!m) continue;
          if (!m.userData || !m.userData._clonedForBaked) {
            const cloned = m.clone();
            cloned.userData = { ...(m.userData || {}), _clonedForBaked: true };
            if (Array.isArray(child.material)) materials[i] = cloned; else child.material = cloned;
          }
        }
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const mm of mats) {
          if (!mm) continue;
          if ('map' in mm) mm.map = tex;
          if ('color' in mm) mm.color.set('#ffffff');
          mm.needsUpdate = true;
        }
      });
    },
    undefined,
    (err) => { console.warn('[texture] failed to load', textureUrl, err); }
  );
}
