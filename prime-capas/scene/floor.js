import * as THREE from 'three';

export function createOrUpdateFloor(scene, modelRoot, existingFloorMesh = null) {
  if (!modelRoot) return existingFloorMesh;
  const box = new THREE.Box3().setFromObject(modelRoot);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  const padding = 1.2;
  const scaledSizeX = Math.max(1, size.x * padding);
  const scaledSizeZ = Math.max(1, size.z * padding);
  const offset = Math.max(0.005, size.y * 0.01);
  const floorY = box.min.y - offset;

  let floorMesh = existingFloorMesh;
  if (!floorMesh) {
    const geometry = new THREE.PlaneGeometry(1, 1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 1.0, metalness: 0.0 });
    floorMesh = new THREE.Mesh(geometry, material);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = true;
    floorMesh.visible = false;

    const grid = new THREE.GridHelper(1, 40, 0x475569, 0x1f2937);
    grid.name = 'DynamicFloorGrid';
    const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
    for (const m of gridMaterials) {
      if (!m) continue;
      m.transparent = true;
      m.opacity = 0.35;
      m.depthWrite = false;
    }
    grid.visible = false;
    grid.renderOrder = 1;
    floorMesh.userData.gridHelper = grid;
    scene.add(grid);

    scene.add(floorMesh);
  }
  floorMesh.visible = false;
  floorMesh.scale.set(scaledSizeX, scaledSizeZ, 1);
  floorMesh.position.set(center.x, floorY, center.z);

  const grid = floorMesh.userData?.gridHelper;
  if (grid) {
    grid.scale.set(scaledSizeX, 1, scaledSizeZ);
    grid.position.set(center.x, floorY + 0.001, center.z);
  }
  return floorMesh;
}

export function snapModelToScenarioFloor(modelRoot, scenarioKey, scenarioRoot, currentFloorMesh) {
  if (!modelRoot) return { modelYOffsetBase: 0 };
  const box = new THREE.Box3().setFromObject(modelRoot);
  const center = new THREE.Vector3();
  box.getCenter(center);

  if (!scenarioKey || scenarioKey === 'none') {
    const bottomY = box.min.y;
    const deltaY = -bottomY;
    modelRoot.position.y += deltaY;
    return { modelYOffsetBase: modelRoot.position.y };
  }

  const raycaster = new THREE.Raycaster();
  let rayOrigin;
  let rayDirection;
  if (scenarioKey === 'sci-fi_garage' || scenarioKey === 'garageshowroom_vr_ready' || scenarioKey === 'vr_moody_lighting_art_gallery_scene_06' ||
      scenarioKey === 'car-showroom_1' || scenarioKey === 'car-showroom_2' || scenarioKey === 'garage' ||
      scenarioKey === 'hangar' || scenarioKey === 'vr_gallery' || scenarioKey === 'white-room1') {
    rayOrigin = new THREE.Vector3(center.x, box.min.y - 0.01, center.z);
    rayDirection = new THREE.Vector3(0, -1, 0);
  } else {
    rayOrigin = new THREE.Vector3(center.x, box.min.y - 1000, center.z);
    rayDirection = new THREE.Vector3(0, 1, 0);
  }
  raycaster.set(rayOrigin, rayDirection);

  const candidates = [];
  if ((scenarioKey === 'sci-fi_garage' || scenarioKey === 'garageshowroom_vr_ready' || scenarioKey === 'vr_moody_lighting_art_gallery_scene_06' ||
       scenarioKey === 'car-showroom_1' || scenarioKey === 'car-showroom_2' || scenarioKey === 'garage' ||
       scenarioKey === 'hangar' || scenarioKey === 'vr_gallery' || scenarioKey === 'white-room1') && scenarioRoot) {
    candidates.push(scenarioRoot);
  } else if (currentFloorMesh && currentFloorMesh.visible) {
    candidates.push(currentFloorMesh);
  }
  if (!candidates.length) return { modelYOffsetBase: 0 };

  const intersections = raycaster.intersectObjects(candidates, true);
  if (!intersections.length) return { modelYOffsetBase: 0 };
  let hit = intersections[0];
  if (scenarioKey === 'sci-fi_garage' || scenarioKey === 'garageshowroom_vr_ready' || scenarioKey === 'vr_moody_lighting_art_gallery_scene_06' ||
      scenarioKey === 'car-showroom_1' || scenarioKey === 'car-showroom_2' || scenarioKey === 'garage' ||
      scenarioKey === 'hangar' || scenarioKey === 'vr_gallery' || scenarioKey === 'white-room1') {
    for (const i of intersections) {
      const below = i.point.y <= box.min.y + 0.05;
      const face = i.face;
      let up = false;
      if (face) {
        const n = face.normal.clone();
        i.object.updateMatrixWorld(true);
        n.transformDirection(i.object.matrixWorld);
        up = n.y > 0.3;
      }
      if (below && up) { hit = i; break; }
    }
  }
  let targetY = hit.point.y;
  if (scenarioKey === 'sci-fi_garage' || scenarioKey === 'garageshowroom_vr_ready' || scenarioKey === 'vr_moody_lighting_art_gallery_scene_06' ||
      scenarioKey === 'car-showroom_1' || scenarioKey === 'car-showroom_2' || scenarioKey === 'garage' ||
      scenarioKey === 'hangar' || scenarioKey === 'vr_gallery' || scenarioKey === 'white-room1') targetY += 0.008;

  const epsilon = 0.0005;
  const bottomY = box.min.y;
  const deltaY = targetY + epsilon - bottomY;
  modelRoot.position.y += deltaY;
  const modelYOffsetBase = modelRoot.position.y;
  return { modelYOffsetBase };
}
