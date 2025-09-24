import * as THREE from 'three';

// Role-based material name matchers. Update these to match each model's material names.
// You can override at runtime via setMaterialRoleMatchers().
export const materialRoleMatchers = {
  frente: [/frente|front/i],
  tras: [/trás|tras|rear|back/i],
  lateral1: [/lateral\s*1|lateral\.?001|lateral\b(?!.*2)|left|esquerda/i],
  lateral2: [/lateral\s*2|lateral\.?002|right|direita/i],
  logos: [/\blogo\b|\blogos\b/i],
  capa: [/\bcapa\b/i],
};

export function setMaterialRoleMatchers(overrides) {
  if (!overrides || typeof overrides !== 'object') return;
  for (const key of Object.keys(overrides)) {
    const arr = overrides[key];
    if (!Array.isArray(arr)) continue;
    materialRoleMatchers[key] = arr;
  }
}

function materialMatchesRole(material, roleKey) {
  if (!material || typeof material.name !== 'string') return false;
  const matchers = materialRoleMatchers[roleKey] || [];
  return matchers.some((rx) => {
    try { return rx.test(material.name); } catch { return false; }
  });
}

function ensureClonedMaterialFor(mesh, indexOrMat, userDataFlagKey) {
  if (!mesh) return null;
  if (Array.isArray(mesh.material)) {
    const i = indexOrMat;
    const m = mesh.material[i];
    if (!m) return null;
    if (!m.userData || !m.userData[userDataFlagKey]) {
      const cloned = m.clone();
      cloned.userData = { ...(m.userData || {}), [userDataFlagKey]: true };
      if (m.color && typeof m.color.clone === 'function' && !cloned.userData._origColor) {
        cloned.userData._origColor = m.color.clone();
      }
      mesh.material[i] = cloned;
      return cloned;
    }
    return m;
  } else {
    const m = mesh.material;
    if (!m) return null;
    if (!m.userData || !m.userData[userDataFlagKey]) {
      const cloned = m.clone();
      cloned.userData = { ...(m.userData || {}), [userDataFlagKey]: true };
      if (m.color && typeof m.color.clone === 'function' && !cloned.userData._origColor) {
        cloned.userData._origColor = m.color.clone();
      }
      mesh.material = cloned;
      return cloned;
    }
    return m;
  }
}

function listRoleInstances(modelRoot, roleKey) {
  const results = [];
  if (!modelRoot) return results;
  modelRoot.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    const meshName = (child.name || '').toString();
    for (let i = 0; i < mats.length; i++) {
      const m = mats[i];
      if (!m) continue;
      const matName = typeof m.name === 'string' ? m.name : '';
      const genericDecal = /(decal|logo|sticker|label)/i.test(matName);
      const meshMatches = (materialRoleMatchers[roleKey] || []).some((rx) => { try { return rx.test(meshName); } catch { return false; } });
      if (materialMatchesRole(m, roleKey) || meshMatches || genericDecal) {
        results.push({ mesh: child, materialIndex: Array.isArray(child.material) ? i : 0, material: m });
      }
    }
  });
  // Stable order: by mesh.id then materialIndex
  results.sort((a, b) => (a.mesh.id - b.mesh.id) || (a.materialIndex - b.materialIndex));
  return results;
}

export function getRoleInstanceCount(modelRoot, roleKey) {
  return listRoleInstances(modelRoot, roleKey).length;
}

export function setRoleInstanceVisible(modelRoot, roleKey, instanceIndex, enabled) {
  const list = listRoleInstances(modelRoot, roleKey);
  const item = list[instanceIndex];
  if (!item) return;
  const mat = ensureClonedMaterialFor(item.mesh, Array.isArray(item.mesh.material) ? item.materialIndex : item.mesh.material, '_clonedForRoleVisibility');
  if (mat) { mat.visible = !!enabled; mat.needsUpdate = true; }
}

export function rotateRoleInstance(modelRoot, roleKey, instanceIndex, quarterTurns) {
  // Pega a rotação atual em graus, que está salva no nosso controle de estado.
  const currentDegrees = getLogoTextureRotation(modelRoot, instanceIndex);
  
  // Calcula o quanto vamos adicionar (ex: -2 * 90 = -180 graus).
  const deltaDegrees = (quarterTurns || 0) * 90;
  const newDegrees = currentDegrees + deltaDegrees;

  // Chama a nossa função principal para aplicar a nova rotação absoluta.
  setLogoTextureRotation(modelRoot, instanceIndex, newDegrees);
}

export function setMaterialsVisibleByRole(modelRoot, roleKey, enabled) {
  if (!modelRoot) return;
  modelRoot.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (let i = 0; i < mats.length; i++) {
      const m = mats[i];
      if (!m) continue;
      if (materialMatchesRole(m, roleKey)) {
        const mat = ensureClonedMaterialFor(child, Array.isArray(child.material) ? i : child.material, '_clonedForRoleVisibility');
        if (mat) { mat.visible = !!enabled; mat.needsUpdate = true; }
      }
    }
  });
}

export function applyTextureToRole(modelRoot, roleKey, textureUrl, options = {}) {
  if (!modelRoot || !textureUrl) return;
  const texLoader = new THREE.TextureLoader();
  texLoader.load(
    textureUrl,
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      if (options.anisotropy != null) tex.anisotropy = options.anisotropy;
      // Default to clamped edges to avoid tiling when we inset for padding
      if (options.wrap === 'repeat') {
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      } else {
        tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      }
      if (options.flipY != null) tex.flipY = !!options.flipY;
      modelRoot.traverse((child) => {
        if (!child.isMesh || !child.material) return;
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        const meshName = (child.name || '').toString();
        for (let i = 0; i < mats.length; i++) {
          const m = mats[i];
          if (!m) continue;
          const matName = typeof m.name === 'string' ? m.name : '';
          // Broaden match: allow either material or mesh name to satisfy role,
          // and also typical decal-like material names.
          const genericDecal = /(decal|logo|sticker|label)/i.test(matName);
          const meshMatches = (materialRoleMatchers[roleKey] || []).some((rx) => { try { return rx.test(meshName); } catch { return false; } });
          if (materialMatchesRole(m, roleKey) || meshMatches || genericDecal) {
            const mat = ensureClonedMaterialFor(child, Array.isArray(child.material) ? i : child.material, '_clonedForRoleTexture');
            if (mat) {
              // Clone the base texture so each instance can have its own transform
              const instancedTex = tex.clone();
              instancedTex.needsUpdate = true;
              // Keep clamped edges by default to avoid visible repetition at borders
              if (options.wrap === 'repeat') {
                instancedTex.wrapS = instancedTex.wrapT = THREE.RepeatWrapping;
              } else {
                instancedTex.wrapS = instancedTex.wrapT = THREE.ClampToEdgeWrapping;
              }
              // Fit the texture to the UV bounds used by this material index on this mesh,
              // insetting slightly to create padding so logos are not trimmed on edges.
              try { fitTextureToMaterialGroups(child, i, instancedTex, { padPercent: options.padPercent }); } catch (_) {}
              if ('map' in mat) mat.map = instancedTex;
              if ('color' in mat) mat.color.set('#ffffff');
              mat.needsUpdate = true;
            }
          }
        }
      });
    },
    undefined,
    (err) => { console.warn('[texture] failed to load', textureUrl, err); }
  );
}

export function applyTextureToLogoInstance(modelRoot, instanceIndex, textureUrl, options = {}) {
  if (!modelRoot || !textureUrl) return;
  const list = listRoleInstances(modelRoot, 'logos');
  const item = list[instanceIndex];
  if (!item) return;

  const texLoader = new THREE.TextureLoader();
  texLoader.load(
    textureUrl,
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      if (options.anisotropy != null) tex.anisotropy = options.anisotropy;
      if (options.wrap === 'repeat') {
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      } else {
        tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      }
      if (options.flipY != null) tex.flipY = !!options.flipY;

      const mat = ensureClonedMaterialFor(item.mesh, Array.isArray(item.mesh.material) ? item.materialIndex : item.mesh.material, '_clonedForRoleTexture');
      if (!mat) return;

      const instancedTex = tex.clone();
      instancedTex.needsUpdate = true;
      if (options.wrap === 'repeat') {
        instancedTex.wrapS = instancedTex.wrapT = THREE.RepeatWrapping;
      } else {
        instancedTex.wrapS = instancedTex.wrapT = THREE.ClampToEdgeWrapping;
      }
      try { fitTextureToMaterialGroups(item.mesh, item.materialIndex, instancedTex, { padPercent: options.padPercent }); } catch (_) {}
      if ('map' in mat) mat.map = instancedTex;
      if ('color' in mat) mat.color.set('#ffffff');
      if ('visible' in mat) mat.visible = true;
      mat.needsUpdate = true;

      const rotation = typeof options.rotationDegrees === 'number' ? options.rotationDegrees : getLogoTextureRotation(modelRoot, instanceIndex);
      setLogoTextureRotation(modelRoot, instanceIndex, rotation);
    },
    undefined,
    (err) => { console.warn('[texture] failed to load logo instance texture', textureUrl, err); }
  );
}

export function clearTextureFromLogoInstance(modelRoot, instanceIndex) {
  if (!modelRoot) return;
  const list = listRoleInstances(modelRoot, 'logos');
  const item = list[instanceIndex];
  if (!item) return;
  const mat = ensureClonedMaterialFor(item.mesh, Array.isArray(item.mesh.material) ? item.materialIndex : item.mesh.material, '_clonedForRoleTexture');
  if (!mat) return;
  if ('map' in mat && mat.map) {
    try { mat.map.dispose?.(); } catch (_) {}
    mat.map = null;
  }
  if (mat.userData?._origColor && 'color' in mat && mat.color) {
    try { mat.color.copy(mat.userData._origColor); } catch (_) {}
  }
  if ('visible' in mat) mat.visible = false;
  mat.needsUpdate = true;
  logosTextureRotations.delete(getLogoInstanceKey(modelRoot, instanceIndex));
}

export function applyColorToRole(modelRoot, roleKey, hex, options = {}) {
  if (!modelRoot || !hex) return;
  const disableMap = options.disableMap !== false; // default true
  modelRoot.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    const meshName = (child.name || '').toString();
    for (let i = 0; i < mats.length; i++) {
      const m = mats[i];
      if (!m) continue;
      const matName = typeof m.name === 'string' ? m.name : '';
      const meshMatches = (materialRoleMatchers[roleKey] || []).some((rx) => { try { return rx.test(meshName); } catch { return false; } });
      if (materialMatchesRole(m, roleKey) || meshMatches) {
        const mat = ensureClonedMaterialFor(child, Array.isArray(child.material) ? i : child.material, '_clonedForRoleColor');
        if (!mat) continue;
        if (disableMap && 'map' in mat && mat.map) mat.map = null;
        if ('color' in mat && mat.color) mat.color.set(hex);
        mat.needsUpdate = true;
      }
    }
  });
}

export function applyRoughnessToRole(modelRoot, roleKey, roughness, options = {}) {
  if (!modelRoot || roughness === undefined) return;
  modelRoot.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    const meshName = (child.name || '').toString();
    for (let i = 0; i < mats.length; i++) {
      const m = mats[i];
      if (!m) continue;
      const matName = typeof m.name === 'string' ? m.name : '';
      const meshMatches = (materialRoleMatchers[roleKey] || []).some((rx) => { try { return rx.test(meshName); } catch { return false; } });
      if (materialMatchesRole(m, roleKey) || meshMatches) {
        const mat = ensureClonedMaterialFor(child, Array.isArray(child.material) ? i : child.material, '_clonedForRoleRoughness');
        if (!mat) continue;
        if ('roughness' in mat && mat.roughness !== undefined) mat.roughness = roughness;
        if ('metalness' in mat && options.metalness !== undefined) mat.metalness = options.metalness;
        mat.needsUpdate = true;
        console.log(`[roughness] Applied roughness ${roughness} to ${roleKey} material:`, matName || mat.type);
      }
    }
  });
}

// Compute UV bounds for the subset of geometry faces that use a given material index,
// then transform the texture so a single image exactly covers that UV rectangle.
function fitTextureToMaterialGroups(mesh, materialIndex, texture, opts = {}) {
  const geometry = mesh.geometry;
  if (!geometry) return;
  const uvAttr = geometry.getAttribute('uv');
  if (!uvAttr) return;
  const groups = Array.isArray(geometry.groups) && geometry.groups.length ? geometry.groups.filter((g) => g.materialIndex === materialIndex) : null;
  const indexAttr = geometry.index;
  let minU = Infinity, minV = Infinity, maxU = -Infinity, maxV = -Infinity;

  const updateBoundsFromVertex = (vi) => {
    const u = uvAttr.getX(vi);
    const v = uvAttr.getY(vi);
    if (u < minU) minU = u; if (u > maxU) maxU = u;
    if (v < minV) minV = v; if (v > maxV) maxV = v;
  };

  if (groups && groups.length) {
    for (const g of groups) {
      const start = g.start || 0;
      const end = start + (g.count || 0);
      if (indexAttr) {
        for (let idx = start; idx < end; idx++) updateBoundsFromVertex(indexAttr.getX(idx));
      } else {
        for (let vi = start; vi < end; vi++) updateBoundsFromVertex(vi);
      }
    }
  } else {
    // Fallback: consider entire geometry
    const vertCount = uvAttr.count;
    for (let vi = 0; vi < vertCount; vi++) updateBoundsFromVertex(vi);
  }

  const width = Math.max(1e-6, maxU - minU);
  const height = Math.max(1e-6, maxV - minV);
  // Inset by a small percentage to add padding and avoid trimming at UV borders
  const pad = Math.max(0, Math.min(0.2, (opts.padPercent != null ? opts.padPercent : 0.06)));
  const insetU = width * pad;
  const insetV = height * pad;
  const innerW = Math.max(1e-6, width - insetU * 2);
  const innerH = Math.max(1e-6, height - insetV * 2);
  const repX = 1 / innerW;
  const repY = 1 / innerH;
  texture.repeat.set(repX, repY);
  texture.offset.set(-(minU + insetU) * repX, -(minV + insetV) * repY);
  
  // Store the UV bounds info for rotation center calculation
  texture.userData = texture.userData || {};
  texture.userData.uvBounds = {
    minU: minU + insetU,
    minV: minV + insetV,
    maxU: maxU - insetU,
    maxV: maxV - insetV,
    centerU: (minU + maxU) * 0.5,
    centerV: (minV + maxV) * 0.5
  };
}

// Calculate the actual center of a fitted texture in UV space
function getTextureUVCenter(texture) {
  if (!texture || !texture.userData || !texture.userData.uvBounds) {
    return { x: 0.5, y: 0.5 }; // fallback to middle
  }
  
  const bounds = texture.userData.uvBounds;
  return {
    x: bounds.centerU,
    y: bounds.centerV
  };
}

// Alternative pivot options - uncomment the one you want:

// Option 1: Always center of texture (ignores UV bounds)
function getFixedCenter(texture) {
  return { x: 0.5, y: 0.5 };
}

// Option 2: Custom pivot point (adjust values as needed)
function getCustomPivot(texture) {
  return { 
    x: 0.3,  // Move pivot left (0.0) or right (1.0) 
    y: 0.7   // Move pivot up (0.0) or down (1.0)
  };
}

// Option 3: Top-left corner pivot
function getTopLeftPivot(texture) {
  return { x: 0.0, y: 0.0 };
}

export function getAllMaterialNames(modelRoot) {
  const names = new Set();
  if (!modelRoot) return [];
  modelRoot.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (const m of mats) { if (m && typeof m.name === 'string') names.add(m.name); }
  });
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

export function applyLogoRegionsFromUI(modelRoot, uiRefs) {
  if (!modelRoot) return;
  const frenteOn = uiRefs.logoRegionFrenteEl ? !!uiRefs.logoRegionFrenteEl.checked : true;
  const trasOn = uiRefs.logoRegionTrasEl ? !!uiRefs.logoRegionTrasEl.checked : true;
  const lat1On = uiRefs.logoRegionLateral1El ? !!uiRefs.logoRegionLateral1El.checked : true;
  const lat2On = uiRefs.logoRegionLateral2El ? !!uiRefs.logoRegionLateral2El.checked : true;
  setMaterialsVisibleByRole(modelRoot, 'frente', frenteOn);
  setMaterialsVisibleByRole(modelRoot, 'tras', trasOn);
  setMaterialsVisibleByRole(modelRoot, 'lateral1', lat1On);
  setMaterialsVisibleByRole(modelRoot, 'lateral2', lat2On);
}

// Storage for individual LOGOS texture rotations (in degrees)
const logosTextureRotations = new Map();

function getLogoInstanceKey(modelRoot, instanceIndex) {
  // Create a unique key for this model + instance combination
  return `${modelRoot.uuid}_${instanceIndex}`;
}

export function setLogoTextureRotation(modelRoot, instanceIndex, degrees) {
  if (!modelRoot) return;

  const key = getLogoInstanceKey(modelRoot, instanceIndex);
  logosTextureRotations.set(key, degrees);

  const list = listRoleInstances(modelRoot, 'logos');
  const item = list[instanceIndex];
  if (!item) return;

  const mat = ensureClonedMaterialFor(item.mesh, Array.isArray(item.mesh.material) ? item.materialIndex : item.mesh.material, '_clonedForRoleTexture');
  if (!mat || !('map' in mat) || !mat.map) return;

  const tex = mat.map;
  const radians = (degrees * Math.PI) / 180;

  // --- INÍCIO DA SOLUÇÃO COM MATRIZ ---

  // Desativamos a atualização automática, pois vamos controlar a matriz manualmente.
  tex.matrixAutoUpdate = false;

  // Pegamos os valores de offset e repeat que já foram calculados para encaixar a textura.
  const offsetX = tex.offset.x;
  const offsetY = tex.offset.y;
  const repeatX = tex.repeat.x;
  const repeatY = tex.repeat.y;
  const rotationCenter = 0.5; // O centro da imagem é sempre 0.5

  // Criamos as matrizes de transformação para cada operação.
  const scaleMatrix = new THREE.Matrix3().makeScale(repeatX, repeatY);
  const translationMatrix = new THREE.Matrix3().makeTranslation(offsetX, offsetY);
  
  // Matriz de rotação em torno do centro (0.5, 0.5)
  const rotationMatrix = new THREE.Matrix3();
  const s = Math.sin(radians);
  const c = Math.cos(radians);
  const tx = -rotationCenter * c + rotationCenter * s + rotationCenter;
  const ty = -rotationCenter * s - rotationCenter * c + rotationCenter;
  rotationMatrix.set(
     c, -s, tx,
     s,  c, ty,
     0,  0, 1
  );

  // Combinamos as matrizes na ordem correta:
  // Primeiro, aplicamos a escala e o offset para "encaixar" a textura.
  // Depois, aplicamos a rotação na textura já encaixada.
  tex.matrix
    .multiplyMatrices(rotationMatrix, translationMatrix)
    .multiply(scaleMatrix);
  
  mat.needsUpdate = true;

  // --- FIM DA SOLUÇÃO COM MATRIZ ---
  
  console.log(`[LOGOS] Instance ${instanceIndex} texture rotated: ${degrees}°`);
}

export function getLogoTextureRotation(modelRoot, instanceIndex) {
  const key = getLogoInstanceKey(modelRoot, instanceIndex);
  const savedRotation = logosTextureRotations.get(key);
  
  // Se não há rotação salva, retorna a rotação padrão para a instância
  if (savedRotation === undefined) {
    return getDefaultRotation(instanceIndex);
  }
  
  return savedRotation;
}

// Rotações padrão por instância (em graus)
const DEFAULT_ROTATIONS = {
  0: 90,  // lateral - motorista
  1: 90,  // lateral - passageiro
  2: 180, // traseira
  3: 0    // frente (sem rotação)
};

// Rotações padrão específicas por modelo
const MODEL_SPECIFIC_ROTATIONS = {
  // Modelo Jetski - ajustes específicos
  jetski6: {
    0: 90,  // lateral - motorista (90° para o Jetski)
    1: 90,  // lateral - passageiro
    2: 180, // traseira
    3: 0    // frente
  }
};

export function getDefaultRotation(instanceIndex, modelKey = null) {
  // Se há uma configuração específica para o modelo atual, use-a
  if (modelKey && MODEL_SPECIFIC_ROTATIONS[modelKey]) {
    return MODEL_SPECIFIC_ROTATIONS[modelKey][instanceIndex] || 0;
  }

  // Caso contrário, use as rotações padrão
  return DEFAULT_ROTATIONS[instanceIndex] || 0;
}

export function applyDefaultLogoRotations(modelRoot, modelKey = null) {
  if (!modelRoot) return;

  console.log('[LOGOS] Applying default rotations for all instances');

  // Aplicar rotações padrão para cada instância
  for (let i = 0; i < 4; i++) {
    const defaultRotation = getDefaultRotation(i, modelKey);
    if (defaultRotation !== 0) {
      setLogoTextureRotation(modelRoot, i, defaultRotation);
      console.log(`[LOGOS] Applied default rotation ${defaultRotation}° to instance ${i}`);
    }
  }
}

export function resetLogoTextureRotation(modelRoot, instanceIndex, modelKey = null) {
  if (!modelRoot) return;

  // Pega a rotação padrão para a instância.
  const defaultRotation = getDefaultRotation(instanceIndex, modelKey);

  // Usa a função principal para aplicar a rotação padrão.
  setLogoTextureRotation(modelRoot, instanceIndex, defaultRotation);

  console.log(`[LOGOS] Instance ${instanceIndex} texture rotation reset to default: ${defaultRotation}°`);
}
