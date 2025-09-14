import * as THREE from 'three';

export function applyColorToModel(modelRoot, hex) {
  if (!modelRoot) return;
  modelRoot.traverse((child) => {
    if (child.isMesh && child.material) {
      const material = child.material;
      const materials = Array.isArray(material) ? material : [material];
      for (const m of materials) {
        if (m && m.color) m.color.set(hex);
        if (m) m.needsUpdate = true;
      }
    }
  });
}

export function applyColorToSpecificTarget(modelRoot, hex) {
  if (!modelRoot) return;
  const norm = (s) => (s || '').toString().trim().toLowerCase();
  modelRoot.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const meshName = norm(child.name);
    if (!meshName.includes('cube001')) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (const m of mats) {
      if (!m) continue;
      const matName = norm(m.name);
      if (matName.includes('material.002') || /material\s*0*02/.test(matName)) {
        if (m.color) m.color.set(hex);
        m.needsUpdate = true;
      }
    }
  });
}

export function disableMapForSpecificTarget(modelRoot) {
  if (!modelRoot) return;
  const norm = (s) => (s || '').toString().trim().toLowerCase();
  modelRoot.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const meshName = norm(child.name);
    if (!meshName.includes('cube001')) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (let i = 0; i < mats.length; i++) {
      const m = mats[i];
      if (!m) continue;
      const matName = norm(m.name);
      if (matName.includes('material.002') || /material\s*0*02/.test(matName)) {
        if (!m.userData || !m.userData._clonedForTargetColor) {
          const cloned = m.clone();
          cloned.userData = { ...(m.userData || {}), _clonedForTargetColor: true };
          if (Array.isArray(child.material)) mats[i] = cloned; else child.material = cloned;
        }
        const mat = Array.isArray(child.material) ? child.material[i] : child.material;
        if ('map' in mat && mat.map) { mat.map = null; }
        mat.needsUpdate = true;
      }
    }
  });
}

export function applyLineColor(modelRoot, hex) {
  if (!modelRoot) return;
  try {
    const norm = (s) => (s || '').toString().trim().toLowerCase();
    modelRoot.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      const meshName = norm(child.name);
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const m of mats) {
        if (!m || typeof m.name !== 'string') continue;
        const matName = norm(m.name);
        const isTargetMesh = meshName === 'linhas' || meshName.includes('linhas');
        const isTargetMat = matName === 'linha' || /^linha\b/.test(matName);
        if (isTargetMesh && isTargetMat && m.color) {
          m.color.set(hex);
          m.needsUpdate = true;
        }
      }
    });
  } catch (_) {}
}
