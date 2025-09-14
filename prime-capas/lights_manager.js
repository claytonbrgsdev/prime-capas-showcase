import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { RectAreaLightHelper } from 'three/addons/helpers/RectAreaLightHelper.js';

// Per-scenario lights manager. For now, it removes ALL lights from the scene.
export function createLightsManager(scene) {
  const sceneRef = scene;
  const lightsRoot = new THREE.Group();
  lightsRoot.name = 'LightsManagerRoot';
  sceneRef.add(lightsRoot);

  /** @type {Array<{ name: string, light: any, helper: any, handle: THREE.Mesh, targetHandle?: THREE.Mesh }>} */
  const editableDirectionals = [];
  /** @type {THREE.Camera | null} */
  let cameraRef = null;
  /** @type {HTMLElement | null} */
  let domRef = null;
  /** @type {TransformControls | null} */
  let transformControls = null;
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  /** @type {Array<THREE.RectAreaLight>} */
  const midPanels = [];
  /** @type {Array<{ light: THREE.DirectionalLight, phaseRad: number, speedRadPerSec: number, radiusFactor: number, axis: 'x'|'y' }>} */
  const autoRotators = [];

  function clearLightsRoot() {
    try {
      for (let i = lightsRoot.children.length - 1; i >= 0; i--) {
        const obj = lightsRoot.children[i];
        lightsRoot.remove(obj);
        if (obj.dispose) { try { obj.dispose(); } catch (_) {} }
      }
    } catch (_) {}
  }

  function clearAllSceneLights() {
    try {
      const toRemove = [];
      sceneRef.traverse((obj) => {
        // Remove standard three.js light types and helpers living anywhere in the scene
        if (obj && (obj.isLight || obj.type.endsWith('Light') || /LightHelper$/i.test(obj.type))) {
          toRemove.push(obj);
        }
      });
      for (const obj of toRemove) {
        if (obj.parent) obj.parent.remove(obj);
        if (obj.dispose) { try { obj.dispose(); } catch (_) {} }
      }
    } catch (_) {}
  }

  function clear() {
    // Do not remove scene lights anymore; only manage our own group.
    clearLightsRoot();
  }

  function applyScenarioLights(scenarioKey) {
    // Preserve all embedded lights from scenarios.
    // Add a subtle hemisphere light to simulate outside sunlight leakage.
    clearLightsRoot();
    try {
      const sky = 0xffedd5;    // warm daylight
      const ground = 0x0b1220; // cool interior bounce
      const intensity = 0;   // disabled by request (set to 0)
      const hemi = new THREE.HemisphereLight(sky, ground, intensity);
      hemi.name = 'HemisphereLight';
      hemi.position.set(8, 6, -3);
      hemi.visible = false;
      lightsRoot.add(hemi);
      // Draggable handle for hemisphere
      const hemiHandle = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xffc107 })
      );
      hemiHandle.position.copy(hemi.position);
      hemiHandle.userData.__lightRef = hemi;
      hemiHandle.visible = hemi.visible;
      lightsRoot.add(hemiHandle);
      editableDirectionals.push({ name: hemi.name, light: hemi, helper: null, handle: hemiHandle });
    } catch (_) {}

    // Add a pair of opposite key lights based on provided config
    try {
      addDirectionalPairFromConfig({
        name: 'dirKey',
        color: 16741120,
        intensity: 71.5,
        position: { x: 0.07937292242285715, y: -0.4049990686256919, z: -3.058025187110535 },
        target: { x: 0, y: 0, z: 0 },
      });
      // Rename primary front key to follow naming convention
      try { renameLightByName('dirKey', 'dirKeyFront'); } catch (_) {}
    } catch (_) {}
    // Override rear light with explicit user config
    try {
      setLightByName('dirKeyRear', {
        color: 16741120,
        intensity: 71.5,
        position: new THREE.Vector3(0.02373385712506315, -0.7026993270213006, 3.2332064639679303),
        target: new THREE.Vector3(0, 0, 0),
      });
    } catch (_) {}
    // Keep key lights as DirectionalLight (requested 4 directional keys)

    // Duplicate front/rear keys to reach 4 directionals pointing at the car
    try { duplicateDirectionalByName('dirKeyFront', 'dirKeyFront2', new THREE.Vector3(0.4, 0, 0)); } catch (_) {}
    try { duplicateDirectionalByName('dirKeyRear', 'dirKeyRear2', new THREE.Vector3(-0.4, 0, 0)); } catch (_) {}

    // Normalize color/intensity across all four keys
    try { setLightByName('dirKeyFront', { color: 16741120, intensity: 71.5 }); } catch (_) {}
    try { setLightByName('dirKeyFront2', { color: 16741120, intensity: 71.5 }); } catch (_) {}
    try { setLightByName('dirKeyRear', { color: 16741120, intensity: 71.5 }); } catch (_) {}
    try { setLightByName('dirKeyRear2', { color: 16741120, intensity: 71.5 }); } catch (_) {}

    // Disable overhead panel for now; use a directional from above pointing to the car
    try {
      const oh = addOverheadDownDirectional();
      // Apply provided overhead config
      setLightByName('overheadDir', {
        color: 14079702,
        intensity: 13.2,
        position: new THREE.Vector3(0, 5, 0),
        target: new THREE.Vector3(0, 0, 0),
      });
    } catch (_) {}
    // Add default panel lights (active by default)
    try {
      addTopPanelLight({ color: 14079702, intensity: 13.2, width: 5, height: 3, y: 5 });
    } catch (_) {}
    try {
      addSidePanelLight({ color: 14079702, intensity: 50, width: 4, height: 2, x: 11.95, y: -0.6510760832458184, z: 0.002659134000747746 });
    } catch (_) {}
    // Removed four floor uplights by request
  }

  function update(deltaSeconds = 0, modelRoot = null) {
    // Keep helpers/handles in sync with light positions
    for (const e of editableDirectionals) {
      try {
        if (e.helper && e.helper.update) e.helper.update();
        e.handle.position.copy(e.light.position);
        if (e.targetHandle && e.light.target) e.targetHandle.position.copy(e.light.target.position);
      } catch (_) {}
    }
    // Keep mid-height panels locked to model center height and facing center
    try {
      if (modelRoot && midPanels.length) {
        const box = new THREE.Box3().setFromObject(modelRoot);
        const center = new THREE.Vector3();
        box.getCenter(center);
        for (const panel of midPanels) {
          const off = panel.userData && panel.userData.__panelOffsetVec ? panel.userData.__panelOffsetVec : new THREE.Vector3();
          panel.position.set(center.x + off.x, center.y, center.z + off.z);
          panel.lookAt(center);
        }
      }
    } catch (_) {}
    // Stop auto-arranging directional keys so manual position edits persist
    // Update auto-rotating directional lights (around X axis)
    try {
      if (modelRoot && autoRotators.length) {
        const box = new THREE.Box3().setFromObject(modelRoot);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);
        const baseRadius = Math.max(size.x, size.y, size.z) * 0.5 || 1;
        for (const r of autoRotators) {
          r.phaseRad += Math.max(0, deltaSeconds || 0) * (r.speedRadPerSec || 0);
          const radius = Math.max(0.1, baseRadius * (r.radiusFactor || 1.0));
          if (r.axis === 'y') {
            // Horizontal orbit: keep Y constant, move in X/Z
            const x = center.x + Math.cos(r.phaseRad) * radius;
            const z = center.z + Math.sin(r.phaseRad) * radius;
            r.light.position.set(x, center.y, z);
          } else {
            // Vertical orbit (around X): move in Y/Z
            const y = center.y + Math.sin(r.phaseRad) * radius;
            const z = center.z + Math.cos(r.phaseRad) * radius;
            r.light.position.set(center.x, y, z);
          }
          if (r.light.target) {
            r.light.target.position.copy(center);
            r.light.target.updateMatrixWorld();
          }
        }
      }
    } catch (_) {}
  }

  function addEditableDirectional(name, opts = {}) {
    const color = opts.color ?? 0xffffff;
    const intensity = opts.intensity ?? 1.0;
    const position = opts.position ?? new THREE.Vector3(1, 2, 1);
    const target = opts.target ?? new THREE.Vector3(0, 0, 0);
    const light = new THREE.DirectionalLight(color, intensity);
    light.name = name || 'dir';
    light.position.copy(position);
    lightsRoot.add(light);
    // Target object
    const tgt = new THREE.Object3D();
    tgt.position.copy(target);
    tgt.userData.__isTarget = true;
    lightsRoot.add(tgt);
    light.target = tgt;
    // Helper
    const helper = new THREE.DirectionalLightHelper(light, 0.5, 0x00ffff);
    lightsRoot.add(helper);
    // Handle sphere for selection
    const handle = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xffff00 })
    );
    handle.position.copy(light.position);
    handle.userData.__lightRef = light;
    lightsRoot.add(handle);
    // Target handle for manual aiming
    const targetHandle = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.08, 0.08),
      new THREE.MeshBasicMaterial({ color: 0xff66aa })
    );
    targetHandle.position.copy(tgt.position);
    targetHandle.userData.__targetRef = tgt;
    lightsRoot.add(targetHandle);

    const initVisible = (typeof opts.visible === 'boolean') ? !!opts.visible : false;
    light.visible = initVisible;
    helper.visible = initVisible;
    handle.visible = initVisible;
    targetHandle.visible = initVisible;
    editableDirectionals.push({ name: light.name, light, helper, handle, targetHandle });
    return light;
  }

  function addDirectionalPairFromConfig(cfg) {
    if (!cfg || !cfg.position || !cfg.target) return [];
    const pos = new THREE.Vector3(cfg.position.x || 0, cfg.position.y || 0, cfg.position.z || 0);
    const tgt = new THREE.Vector3(cfg.target.x || 0, cfg.target.y || 0, cfg.target.z || 0);
    const nameA = cfg.name || 'dirCustom';
    const color = cfg.color ?? 0xffffff;
    const intensity = cfg.intensity ?? 1.0;
    const a = addEditableDirectional(nameA, { color, intensity, position: pos, target: tgt });
    // Opposite around Y axis (front/back)
    const posB = new THREE.Vector3(-pos.x, pos.y, -pos.z);
    const nameB = nameA + 'Rear';
    const b = addEditableDirectional(nameB, { color, intensity, position: posB, target: tgt });
    return [a, b];
  }

  function setLightByName(name, props = {}) {
    let lightObj = null;
    for (const e of editableDirectionals) {
      if (e && e.light && e.light.name === name) { lightObj = e.light; break; }
    }
    if (!lightObj) {
      // Also search any light under our root
      lightsRoot.traverse((obj) => { if (!lightObj && obj.isLight && obj.name === name) lightObj = obj; });
    }
    if (!lightObj) return false;
    if ('color' in props && lightObj.color) lightObj.color.setHex(props.color >>> 0);
    if ('intensity' in props && typeof props.intensity === 'number') lightObj.intensity = props.intensity;
    if (props.position && lightObj.position) lightObj.position.copy(props.position);
    if (props.target && lightObj.target && props.target.isVector3) lightObj.target.position.copy(props.target);
    return true;
  }

  function renameLightByName(oldName, newName) {
    if (!oldName || !newName || oldName === newName) return false;
    let renamed = false;
    lightsRoot.traverse((obj) => {
      if (obj.isLight && obj.name === oldName) {
        obj.name = newName;
        renamed = true;
      }
    });
    for (const e of editableDirectionals) {
      if (e && e.light && e.light.name === newName) e.name = newName;
    }
    return renamed;
  }

  function getLightByName(name) {
    let lightObj = null;
    for (const e of editableDirectionals) {
      if (e && e.light && e.light.name === name) { lightObj = e.light; break; }
    }
    if (!lightObj) {
      lightsRoot.traverse((obj) => { if (!lightObj && obj.isLight && obj.name === name) lightObj = obj; });
    }
    return lightObj;
  }

  function arrangeDirectionalKeysRadially(modelRoot) {
    const lFront = getLightByName('dirKeyFront');
    const lFront2 = getLightByName('dirKeyFront2');
    const lBack = getLightByName('dirKeyRear');
    const lBack2 = getLightByName('dirKeyRear2');
    // Require at least front/back to exist
    if (!lFront || !lBack) return;
    const box = new THREE.Box3().setFromObject(modelRoot);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    const radius = Math.max(size.x, size.z) * 0.9 || 1.8;
    const height = center.y + Math.max(0.2, Math.min(radius * 0.35, 1.2));
    // Try to preserve intensities/colors from originals
    const baseIntensity = lFront.intensity ?? 1.0;
    const baseColor = lFront.color?.getHex?.() ?? 0xffffff;
    const ensure = (light, name) => {
      if (light) return light;
      return addEditableDirectional(name, { color: baseColor, intensity: baseIntensity, position: new THREE.Vector3(), target: new THREE.Vector3() });
    };
    const f = ensure(lFront, 'dirKey');
    const r = ensure(lFront2, 'dirKeyFront2');
    const b = ensure(lBack, 'dirKeyRear');
    const l = ensure(lBack2, 'dirKeyRear2');
    // Angles: front (0° along -Z), right (90°), back (180°), left (270°)
    const positions = [
      new THREE.Vector3(center.x + 0, height, center.z - radius),
      new THREE.Vector3(center.x + radius, height, center.z + 0),
      new THREE.Vector3(center.x + 0, height, center.z + radius),
      new THREE.Vector3(center.x - radius, height, center.z + 0),
    ];
    const lights = [f, r, b, l];
    for (let i = 0; i < lights.length; i++) {
      const li = lights[i];
      if (!li) continue;
      li.position.copy(positions[i]);
      // Do not override any target positions here so users can tweak all lights
    }
  }

  function duplicateDirectionalByName(srcName, newName, positionOffset = new THREE.Vector3()) {
    let src = null;
    for (const e of editableDirectionals) {
      if (e && e.light && e.light.name === srcName && e.light.isDirectionalLight) { src = e.light; break; }
    }
    if (!src) {
      // Also scan our root
      lightsRoot.traverse((obj) => { if (!src && obj.isDirectionalLight && obj.name === srcName) src = obj; });
    }
    if (!src) return null;
    const color = src.color?.getHex?.() ?? 0xffffff;
    const intensity = src.intensity ?? 1.0;
    const position = src.position.clone().add(positionOffset || new THREE.Vector3());
    const target = src.target ? src.target.position.clone() : new THREE.Vector3(0,0,0);
    const dup = addEditableDirectional(newName, { color, intensity, position, target });
    return dup;
  }

  function addEditableSpot(name, opts = {}) {
    const color = opts.color ?? 0xffffff;
    const intensity = opts.intensity ?? 1.0;
    const position = opts.position ?? new THREE.Vector3(1, 2, 1);
    const target = opts.target ?? new THREE.Vector3(0, 0, 0);
    const angleDeg = opts.angleDeg ?? 35;
    const penumbra = opts.penumbra ?? 0.25;
    const distance = opts.distance ?? 0; // 0 = no range limit
    const decay = opts.decay ?? 2; // physical falloff; lower = flatter fill
    const light = new THREE.SpotLight(
      color,
      intensity,
      distance,
      THREE.MathUtils.degToRad(angleDeg),
      penumbra,
      decay
    );
    light.name = name || 'spot';
    light.position.copy(position);
    lightsRoot.add(light);
    const tgt = new THREE.Object3D();
    tgt.position.copy(target);
    tgt.userData.__isTarget = true;
    lightsRoot.add(tgt);
    light.target = tgt;
    const helper = null; // Avoid external helper import to prevent CORS issues
    const handle = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0x00ffff })
    );
    handle.position.copy(light.position);
    handle.userData.__lightRef = light;
    lightsRoot.add(handle);
    // Target handle
    const targetHandle = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.08, 0.08),
      new THREE.MeshBasicMaterial({ color: 0xff66aa })
    );
    targetHandle.position.copy(tgt.position);
    targetHandle.userData.__targetRef = tgt;
    lightsRoot.add(targetHandle);
    const initVisible = (typeof opts.visible === 'boolean') ? !!opts.visible : false;
    light.visible = initVisible;
    if (helper) helper.visible = initVisible;
    handle.visible = initVisible;
    targetHandle.visible = initVisible;
    editableDirectionals.push({ name: light.name, light, helper, handle, targetHandle });
    return light;
  }

  function replaceLightWithSpotByName(name, opts = {}) {
    let light = null;
    for (let i = 0; i < editableDirectionals.length; i++) {
      const e = editableDirectionals[i];
      if (e && e.light && e.light.name === name) { light = e.light; break; }
    }
    if (!light) return null;
    const color = light.color?.getHex?.() ?? 0xffffff;
    const intensity = light.intensity ?? 1.0;
    const position = light.position.clone();
    const target = light.target ? light.target.position.clone() : new THREE.Vector3(0,0,0);
    // Remove old helpers/handle
    for (let i = editableDirectionals.length - 1; i >= 0; i--) {
      if (editableDirectionals[i].light === light) {
        try { lightsRoot.remove(editableDirectionals[i].helper); } catch (_) {}
        try { lightsRoot.remove(editableDirectionals[i].handle); } catch (_) {}
        editableDirectionals.splice(i, 1);
      }
    }
    try { lightsRoot.remove(light); } catch (_) {}
    // Create spot with same name
    const spot = addEditableSpot(name, { color, intensity, position, target, angleDeg: opts.angleDeg ?? 35, penumbra: opts.penumbra ?? 0.25 });
    return spot;
  }

  function addOverheadDiffusePanel(opts = {}) {
    try { RectAreaLightUniformsLib.init(); } catch (_) {}
    const color = opts.color ?? 0xffffff;
    const intensity = opts.intensity ?? 55; // RectAreaLight needs higher intensity
    const width = opts.width ?? 10;
    const height = opts.height ?? 7;
    const y = opts.y ?? 5;
    const light = new THREE.RectAreaLight(color, intensity, width, height);
    light.name = 'overheadPanel';
    light.position.set(0, y, 0);
    light.lookAt(0, 0, 0);
    lightsRoot.add(light);
    try {
      const helper = new RectAreaLightHelper(light);
      helper.material.depthTest = false;
      helper.material.transparent = true;
      helper.material.opacity = 0.25;
      lightsRoot.add(helper);
    } catch (_) {}
    // Draggable handle
    const handle = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0x00ff88 })
    );
    handle.position.copy(light.position);
    handle.userData.__lightRef = light;
    lightsRoot.add(handle);
    editableDirectionals.push({ name: light.name, light, helper: null, handle });
  }

  function addTopPanelLight(opts = {}) {
    try { RectAreaLightUniformsLib.init(); } catch (_) {}
    const color = opts.color ?? 0xffffff;
    const intensity = opts.intensity ?? 10;
    const width = opts.width ?? 5;
    const height = opts.height ?? 3;
    const y = opts.y ?? 5;
    const light = new THREE.RectAreaLight(color, intensity, width, height);
    light.name = 'panelTop';
    light.position.set(0, y, 0);
    light.lookAt(0, 0, 0);
    light.visible = true;
    lightsRoot.add(light);
    try {
      const helper = new RectAreaLightHelper(light); helper.material.depthTest = false; helper.material.transparent = true; helper.material.opacity = 0.25; lightsRoot.add(helper);
      // Draggable handle
      const handle = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 16), new THREE.MeshBasicMaterial({ color: 0x00ff88 }));
      handle.position.copy(light.position);
      handle.userData.__lightRef = light;
      lightsRoot.add(handle);
      editableDirectionals.push({ name: light.name, light, helper, handle });
    } catch (_) {}
    return light;
  }

  function addSidePanelLight(opts = {}) {
    try { RectAreaLightUniformsLib.init(); } catch (_) {}
    const color = opts.color ?? 0xffffff;
    const intensity = opts.intensity ?? 10;
    const width = opts.width ?? 4;
    const height = opts.height ?? 2;
    const x = opts.x ?? 4;
    const y = opts.y ?? 1.5;
    const z = opts.z ?? 0;
    const target = opts.target ?? new THREE.Vector3(0, 0, 0);
    const light = new THREE.RectAreaLight(color, intensity, width, height);
    light.name = 'panelSide';
    light.position.set(x, y, z);
    light.lookAt(target);
    light.visible = true;
    lightsRoot.add(light);
    try {
      const helper = new RectAreaLightHelper(light); helper.material.depthTest = false; helper.material.transparent = true; helper.material.opacity = 0.25; lightsRoot.add(helper);
      const handle = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 16), new THREE.MeshBasicMaterial({ color: 0x00ff88 }));
      handle.position.copy(light.position);
      handle.userData.__lightRef = light;
      lightsRoot.add(handle);
      editableDirectionals.push({ name: light.name, light, helper, handle });
    } catch (_) {}
    return light;
  }

  function addOverheadDownDirectional(opts = {}) {
    const color = opts.color ?? 0xffffff;
    const intensity = opts.intensity ?? 6.0;
    const y = opts.y ?? 5.0;
    const pos = new THREE.Vector3(0, y, 0);
    const target = new THREE.Vector3(0, 0, 0);
    const light = addEditableDirectional('overheadDir', { color, intensity, position: pos, target });
    return light;
  }

  function addAutoRotatingDirectional(name = 'autoRotX', opts = {}) {
    const color = opts.color ?? 0xffffff;
    const intensity = opts.intensity ?? 8.0;
    const initialPos = opts.position ?? new THREE.Vector3(0, 2.5, 2.5);
    const target = opts.target ?? new THREE.Vector3(0, 0, 0);
    const speedDegPerSec = opts.speedDegPerSec ?? 25;
    const radiusFactor = opts.radiusFactor ?? 1.2;
    const phaseDeg = opts.phaseDeg ?? 0;
    const axis = (opts.axis === 'y' ? 'y' : 'x');
    const light = addEditableDirectional(name, { color, intensity, position: initialPos, target, visible: false });
    light.userData.__autoRot = true;
    light.userData.__autoRotAxis = axis;
    autoRotators.push({ light, phaseRad: THREE.MathUtils.degToRad(phaseDeg), speedRadPerSec: THREE.MathUtils.degToRad(speedDegPerSec), radiusFactor, axis });
    return light;
  }

  function addFloorUplights(opts = {}) {
    const color = opts.color ?? 0xffffff;
    // Brighter, softer, ambient-like fill
    const intensity = opts.intensity ?? 45.0;
    const y = opts.y ?? 0.05; // snap to floor
    const offset = opts.offset ?? 3.5;
    const angleDeg = opts.angleDeg ?? 85; // very wide beam for diffuse wash
    const penumbra = opts.penumbra ?? 0.85; // soft edge
    const targetY = opts.targetY ?? 4.0; // wash more of the walls/ceiling
    const decay = opts.decay ?? 1; // flatter attenuation to behave more ambient-like
    const positions = [
      new THREE.Vector3(-offset, y, -offset),
      new THREE.Vector3(offset, y, -offset),
      new THREE.Vector3(offset, y, offset),
      new THREE.Vector3(-offset, y, offset),
    ];
    const lights = [];
    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i];
      const target = new THREE.Vector3(pos.x, targetY, pos.z);
      const name = `floorUplight${i+1}`;
      const spot = addEditableSpot(name, { color, intensity, position: pos, target, angleDeg, penumbra, decay, distance: 0 });
      lights.push(spot);
    }
    return lights;
  }

  function clearMidHeightPanels() {
    for (let i = midPanels.length - 1; i >= 0; i--) {
      try { lightsRoot.remove(midPanels[i]); } catch (_) {}
    }
    midPanels.length = 0;
  }

  function addMidHeightPanels(modelRoot, opts = {}) {
    if (!modelRoot) return [];
    clearMidHeightPanels();
    try { RectAreaLightUniformsLib.init(); } catch (_) {}
    try {
      const box = new THREE.Box3().setFromObject(modelRoot);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);
      const radius = Math.max(size.x, size.y, size.z) * 0.5 || 1;
      const color = opts.color ?? 0xffffff;
      const intensity = opts.intensity ?? 55; // require higher intensity for area lights
      const width = opts.width ?? Math.max(2.5, radius * 1.3);
      const height = opts.height ?? Math.max(1.6, radius * 0.9);
      const offset = opts.offset ?? Math.max(3.5, radius * 1.8);

      const configs = [
        { name: 'midPanelPosZ', off: new THREE.Vector3(0, 0, +offset) },
        { name: 'midPanelNegZ', off: new THREE.Vector3(0, 0, -offset) },
      ];

      for (const cfg of configs) {
        const light = new THREE.RectAreaLight(color, intensity, width, height);
        light.name = cfg.name;
        light.position.set(center.x + cfg.off.x, center.y, center.z + cfg.off.z);
        light.lookAt(center);
        light.userData.__panelOffsetVec = cfg.off.clone();
        lightsRoot.add(light);
        try {
          const helper = new RectAreaLightHelper(light);
          helper.material.depthTest = false;
          helper.material.transparent = true;
          helper.material.opacity = 0.2;
          lightsRoot.add(helper);
        } catch (_) {}
        midPanels.push(light);
      }
      return midPanels.slice();
    } catch (_) { return []; }
  }

  function setEditorContext(camera, domElement, orbitControls = null) {
    cameraRef = camera;
    domRef = domElement;
    if (!transformControls) {
      transformControls = new TransformControls(cameraRef, domRef);
      transformControls.setMode('translate');
      transformControls.size = 0.75;
      sceneRef.add(transformControls);
      if (orbitControls && 'enabled' in orbitControls) {
        transformControls.addEventListener('dragging-changed', (e) => {
          orbitControls.enabled = !e.value;
        });
      }
    }
    if (domRef) {
      const onPointerDown = (ev) => {
        if (!cameraRef) return;
        const rect = domRef.getBoundingClientRect();
        ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
        ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(ndc, cameraRef);
        const meshes = [];
        for (const e of editableDirectionals) {
          if (e.handle) meshes.push(e.handle);
          if (e.targetHandle) meshes.push(e.targetHandle);
        }
        const hits = raycaster.intersectObjects(meshes, true);
        if (hits && hits.length) {
          const m = hits[0].object;
          const light = m.userData.__lightRef;
          const target = m.userData.__targetRef;
          if (light && transformControls) {
            transformControls.attach(light);
          } else if (target && transformControls) {
            transformControls.attach(target);
          }
        }
      };
      domRef.addEventListener('pointerdown', onPointerDown);
    }
  }

  function getSelectedLightConfig() {
    const l = transformControls && transformControls.object;
    if (!l || !l.isLight) return null;
    const light = l;
    const tgt = light.target;
    /** @type {any} */
    const cfg = {
      type: light.type || '',
      name: light.name || 'dir',
      visible: !!light.visible,
      color: light.color?.getHex?.() ?? 0xffffff,
      intensity: light.intensity ?? 1,
      position: { x: light.position.x, y: light.position.y, z: light.position.z },
      target: (tgt && tgt.position) ? { x: tgt.position.x, y: tgt.position.y, z: tgt.position.z } : null,
    };
    // RectAreaLight extras
    if (light.isRectAreaLight) {
      cfg.width = light.width ?? null;
      cfg.height = light.height ?? null;
    }
    // Spot extras
    if (light.isSpotLight) {
      try { cfg.angleDeg = THREE.MathUtils.radToDeg(light.angle || 0); } catch (_) { cfg.angleDeg = null; }
      cfg.penumbra = light.penumbra ?? null;
    }
    // Auto-rotator extras
    try {
      if (light.userData && (light.userData.__autoRot || light.userData.__autoRotX)) {
        const entry = autoRotators.find((r) => r.light === light);
        if (entry) {
          cfg.autoRot = true;
          cfg.autoAxis = entry.axis || (light.userData.__autoRotAxis || 'x');
          cfg.autoSpeedDegPerSec = THREE.MathUtils.radToDeg(entry.speedRadPerSec || 0);
          cfg.autoRadiusFactor = entry.radiusFactor ?? 1.0;
          cfg.autoPhaseDeg = THREE.MathUtils.radToDeg(entry.phaseRad || 0);
        }
      }
    } catch (_) {}
    return cfg;
  }

  async function copySelectedLightConfigToClipboard() {
    try {
      const cfg = getSelectedLightConfig();
      if (!cfg) return false;
      const text = JSON.stringify(cfg, null, 2);
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback: create a temporary textarea
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      console.log('[LightsManager] Copied light config:', cfg);
      return true;
    } catch (e) {
      console.warn('[LightsManager] Failed to copy config', e);
      return false;
    }
  }

  function whitenWalls(rootObject, color = 0xffffff) {
    if (!rootObject) return 0;
    let count = 0;
    rootObject.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      const name = (child.name || '').toLowerCase();
      if (/neon|light|strip|emiss/i.test(name)) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      const box = new THREE.Box3().setFromObject(child);
      const size = new THREE.Vector3(); box.getSize(size);
      const dims = [size.x, size.y, size.z].sort((a,b)=>a-b);
      const thin = dims[0] < 0.25;
      const tall = size.y > 2.5;
      const wide = Math.max(size.x, size.z) > 3.0;
      if (!(thin && tall && wide)) return;
      for (const m of mats) {
        if (!m) continue;
        if ('emissiveIntensity' in m && m.emissiveIntensity > 0.05) continue;
        if (m.color) m.color.set(color);
        if ('metalness' in m) m.metalness = Math.min(0.05, m.metalness ?? 0);
        if ('roughness' in m) m.roughness = Math.max(0.85, m.roughness ?? 0.85);
        m.needsUpdate = true;
      }
      count++;
    });
    return count;
  }

  function buildLightsAdminUI(containerEl) {
    if (!containerEl) return;
    // Clear
    while (containerEl.firstChild) containerEl.removeChild(containerEl.firstChild);
    // Enumerate lights we manage (root children only)
    const entries = [];
    lightsRoot.traverse((obj) => {
      if (obj.isLight) {
        entries.push(obj);
      }
    });
    for (const light of entries) {
      const wrap = document.createElement('div');
      wrap.className = 'control';
      const title = document.createElement('div');
      title.style.fontWeight = '600';
      title.textContent = light.name || light.type;
      wrap.appendChild(title);

      // Per-light enable/disable toggle
      const toggleRow = document.createElement('div');
      toggleRow.className = 'row';
      const toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      const refreshToggleText = () => {
        toggleBtn.textContent = light.visible ? 'Desativar' : 'Ativar';
      };
      refreshToggleText();
      toggleBtn.addEventListener('click', () => {
        light.visible = !light.visible;
        // If helper/handles exist, keep them in sync with light visibility for clarity
        try {
          const entry = editableDirectionals.find((e) => e.light === light);
          if (entry) {
            if (entry.helper) entry.helper.visible = light.visible;
            if (entry.handle) entry.handle.visible = light.visible;
            if (entry.targetHandle) entry.targetHandle.visible = light.visible;
          }
        } catch (_) {}
        refreshToggleText();
      });
      toggleRow.appendChild(toggleBtn);
      wrap.appendChild(toggleRow);

      const mkRange = (label, min, max, step, getVal, setVal) => {
        const row = document.createElement('div');
        row.className = 'row';
        const lab = document.createElement('label');
        lab.textContent = label;
        const input = document.createElement('input');
        input.type = 'range';
        input.min = String(min); input.max = String(max); input.step = String(step);
        input.value = String(getVal());
        input.addEventListener('input', () => { setVal(Number(input.value)); });
        row.appendChild(lab);
        row.appendChild(input);
        return row;
      };

      // Intensity — lower default max to improve responsiveness, but never clamp below current value
      {
        const cur = (light.intensity != null ? Number(light.intensity) : 1);
        const dynMax = Math.max(50, Math.ceil(cur * 1.25));
        wrap.appendChild(mkRange('Intensidade', 0, dynMax, 0.1, () => light.intensity ?? 1, (v) => { light.intensity = v; }));
      }
      // Auto-rotating directional orbit controls
      if (light.userData && (light.userData.__autoRot || light.userData.__autoRotX)) {
        const getCfg = () => autoRotators.find((r) => r.light === light);
        if (getCfg()) {
          wrap.appendChild(mkRange('Velocidade (°/s)', -360, 360, 0.1,
            () => THREE.MathUtils.radToDeg(getCfg().speedRadPerSec || 0),
            (v) => { const c = getCfg(); if (c) c.speedRadPerSec = THREE.MathUtils.degToRad(v); }
          ));
          wrap.appendChild(mkRange('Raio (x raio do objeto)', 0.2, 6, 0.01,
            () => (getCfg().radiusFactor || 1.0),
            (v) => { const c = getCfg(); if (c) c.radiusFactor = Math.max(0.2, v); }
          ));
          // Axis selector (X = vertical circle; Y = horizontal orbit)
          const axisRow = document.createElement('div');
          axisRow.className = 'row';
          const axisLab = document.createElement('label'); axisLab.textContent = 'Eixo (órbita)';
          const axisSel = document.createElement('select');
          const optX = document.createElement('option'); optX.value = 'x'; optX.text = 'X (vertical)';
          const optY = document.createElement('option'); optY.value = 'y'; optY.text = 'Y (horizontal)';
          axisSel.appendChild(optX); axisSel.appendChild(optY);
          axisSel.value = (getCfg().axis || 'x');
          axisSel.addEventListener('change', () => { const c = getCfg(); if (c) { c.axis = (axisSel.value === 'y' ? 'y' : 'x'); if (light.userData) light.userData.__autoRotAxis = c.axis; } });
          axisRow.appendChild(axisLab); axisRow.appendChild(axisSel);
          wrap.appendChild(axisRow);
        }
      }
      // Beam angle control for SpotLight (real physical cone)
      if (light.isSpotLight) {
        const getAngleDeg = () => THREE.MathUtils.radToDeg(light.angle || 0.1);
        const setAngleDeg = (deg) => { light.angle = THREE.MathUtils.degToRad(deg); };
        wrap.appendChild(mkRange('Abertura (°)', 5, 90, 1, getAngleDeg, setAngleDeg));
        const getPen = () => light.penumbra ?? 0.0;
        const setPen = (v) => { light.penumbra = Math.max(0, Math.min(1, v)); };
        wrap.appendChild(mkRange('Penumbra', 0, 1, 0.01, getPen, setPen));
      }
      // RectAreaLight-specific controls (width/height)
      if (light.isRectAreaLight) {
        wrap.appendChild(mkRange('Largura', 0.1, 20, 0.05, () => light.width ?? 1, (v) => { light.width = Math.max(0.1, v); }));
        wrap.appendChild(mkRange('Altura', 0.1, 20, 0.05, () => light.height ?? 1, (v) => { light.height = Math.max(0.1, v); }));
      }

      // Position X/Y/Z
      wrap.appendChild(mkRange('Pos X', -20, 20, 0.05, () => light.position.x, (v) => { light.position.x = v; }));
      wrap.appendChild(mkRange('Pos Y', -20, 20, 0.05, () => light.position.y, (v) => { light.position.y = v; }));
      wrap.appendChild(mkRange('Pos Z', -20, 20, 0.05, () => light.position.z, (v) => { light.position.z = v; }));

      // Rotation/angles (Euler in degrees) — when applicable
      const hasRotation = !!light.rotation || !!(light.target && light.position);
      if (hasRotation) {
        const getEuler = () => {
          // Compute orientation from position->target for directional/spot; otherwise use light.rotation if present
          if (light.isDirectionalLight || light.isSpotLight) {
            const dir = new THREE.Vector3().subVectors(light.target.position || new THREE.Vector3(), light.position).normalize();
            const euler = new THREE.Euler().setFromVector3(dir);
            return euler;
          }
          return light.rotation || new THREE.Euler();
        };
        const setEulerComponent = (axis, deg) => {
          if (light.isDirectionalLight || light.isSpotLight) {
            // Rotate around current position by adjusting target on a unit sphere
            const e = new THREE.Euler(
              axis === 'x' ? THREE.MathUtils.degToRad(deg) : 0,
              axis === 'y' ? THREE.MathUtils.degToRad(deg) : 0,
              axis === 'z' ? THREE.MathUtils.degToRad(deg) : 0
            );
            const dir = new THREE.Vector3(0, 0, -1).applyEuler(e);
            const dist = light.target ? light.position.distanceTo(light.target.position) || 1 : 1;
            const newTarget = new THREE.Vector3().copy(light.position).add(dir.multiplyScalar(dist));
            if (light.target) {
              light.target.position.copy(newTarget);
              light.target.updateMatrixWorld();
            }
          } else if (light.rotation) {
            light.rotation[axis] = THREE.MathUtils.degToRad(deg);
          }
        };
        const e = getEuler();
        wrap.appendChild(mkRange('Rot X (°)', -180, 180, 1, () => THREE.MathUtils.radToDeg(e.x), (v) => setEulerComponent('x', v)));
        wrap.appendChild(mkRange('Rot Y (°)', -180, 180, 1, () => THREE.MathUtils.radToDeg(e.y), (v) => setEulerComponent('y', v)));
        wrap.appendChild(mkRange('Rot Z (°)', -180, 180, 1, () => THREE.MathUtils.radToDeg(e.z), (v) => setEulerComponent('z', v)));
      }

      // Target X/Y/Z — exposed when light uses a target (directional/spot)
      if (light.target && light.target.position) {
        wrap.appendChild(mkRange('Target X', -20, 20, 0.05, () => light.target.position.x, (v) => { light.target.position.x = v; light.target.updateMatrixWorld(); }));
        wrap.appendChild(mkRange('Target Y', -20, 20, 0.05, () => light.target.position.y, (v) => { light.target.position.y = v; light.target.updateMatrixWorld(); }));
        wrap.appendChild(mkRange('Target Z', -20, 20, 0.05, () => light.target.position.z, (v) => { light.target.position.z = v; light.target.updateMatrixWorld(); }));
      }

      // Color picker (if light has color)
      if (light.color) {
        const colorWrap = document.createElement('div');
        colorWrap.className = 'row';
        const lab = document.createElement('label');
        lab.textContent = 'Cor';
        const inp = document.createElement('input');
        inp.type = 'color';
        const hex = '#' + ('000000' + light.color.getHex().toString(16)).slice(-6);
        inp.value = hex;
        inp.addEventListener('input', () => { light.color.set(inp.value); });
        colorWrap.appendChild(lab);
        colorWrap.appendChild(inp);
        wrap.appendChild(colorWrap);
      }

      containerEl.appendChild(wrap);
    }
  }

  function serializeLights() {
    /** @type {Array<any>} */
    const data = [];
    lightsRoot.traverse((obj) => {
      if (obj.isLight) {
        const entry = {
          type: obj.type,
          name: obj.name || '',
          color: obj.color?.getHex?.() ?? null,
          intensity: obj.intensity ?? null,
          visible: obj.visible ?? true,
          position: obj.position ? { x: obj.position.x, y: obj.position.y, z: obj.position.z } : null,
          target: obj.target && obj.target.position ? { x: obj.target.position.x, y: obj.target.position.y, z: obj.target.position.z } : null,
          angle: obj.isSpotLight ? obj.angle : null,
          penumbra: obj.isSpotLight ? obj.penumbra : null,
          width: obj.isRectAreaLight ? obj.width : null,
          height: obj.isRectAreaLight ? obj.height : null,
        };
        // Include auto-rotator metadata if applicable
        if (obj.userData && (obj.userData.__autoRot || obj.userData.__autoRotX)) {
          const cfg = autoRotators.find((r) => r.light === obj);
          if (cfg) {
            entry.autoRot = true;
            entry.autoAxis = cfg.axis || (obj.userData.__autoRotAxis || 'x');
            entry.autoSpeedDegPerSec = THREE.MathUtils.radToDeg(cfg.speedRadPerSec || 0);
            entry.autoRadiusFactor = cfg.radiusFactor ?? 1.0;
            entry.autoPhaseDeg = THREE.MathUtils.radToDeg(cfg.phaseRad || 0);
          }
        }
        data.push(entry);
      }
    });
    return data;
  }

  function clearManagedLights() {
    // Remove only our managed lights/handles/helpers
    for (let i = editableDirectionals.length - 1; i >= 0; i--) {
      try { lightsRoot.remove(editableDirectionals[i].handle); } catch (_) {}
      try { if (editableDirectionals[i].helper) lightsRoot.remove(editableDirectionals[i].helper); } catch (_) {}
    }
    editableDirectionals.length = 0;
    const toRemove = [];
    lightsRoot.traverse((o) => { if (o.isLight) toRemove.push(o); });
    for (const o of toRemove) { try { lightsRoot.remove(o); } catch (_) {} }
  }

  function applyLightsFromSerialized(list = []) {
    clearManagedLights();
    for (const l of list) {
      const color = l.color ?? 0xffffff;
      const intensity = l.intensity ?? 1;
      const position = l.position ? new THREE.Vector3(l.position.x, l.position.y, l.position.z) : new THREE.Vector3();
      const target = l.target ? new THREE.Vector3(l.target.x, l.target.y, l.target.z) : new THREE.Vector3(0,0,0);
      if (l.type === 'SpotLight') {
        const spot = addEditableSpot(l.name || 'spot', { color, intensity, position, target, angleDeg: THREE.MathUtils.radToDeg(l.angle ?? 0.61), penumbra: l.penumbra ?? 0.25 });
        if (spot) {
          spot.visible = (l.visible !== false);
          // Hide/show helper/handles to match visibility
          const e = editableDirectionals.find((x) => x.light === spot);
          if (e) {
            if (e.helper) e.helper.visible = spot.visible;
            if (e.handle) e.handle.visible = spot.visible;
            if (e.targetHandle) e.targetHandle.visible = spot.visible;
          }
        }
      } else if (l.type === 'DirectionalLight') {
        // If entry carries auto-rotator config, restore as auto-rotating directional
        if (l.autoRot) {
          const axis = (l.autoAxis === 'y' ? 'y' : 'x');
          const speedDegPerSec = (typeof l.autoSpeedDegPerSec === 'number' && isFinite(l.autoSpeedDegPerSec)) ? l.autoSpeedDegPerSec : 25;
          const radiusFactor = (typeof l.autoRadiusFactor === 'number' && isFinite(l.autoRadiusFactor)) ? l.autoRadiusFactor : 1.2;
          const phaseDeg = (typeof l.autoPhaseDeg === 'number' && isFinite(l.autoPhaseDeg)) ? l.autoPhaseDeg : 0;
          const dir = addAutoRotatingDirectional(l.name || 'dir', { color, intensity, position, target, axis, speedDegPerSec, radiusFactor, phaseDeg });
          if (dir) {
            dir.visible = (l.visible !== false);
            const e = editableDirectionals.find((x) => x.light === dir);
            if (e) {
              if (e.helper) e.helper.visible = dir.visible;
              if (e.handle) e.handle.visible = dir.visible;
              if (e.targetHandle) e.targetHandle.visible = dir.visible;
            }
          }
        } else {
          const dir = addEditableDirectional(l.name || 'dir', { color, intensity, position, target });
          if (dir) {
            dir.visible = (l.visible !== false);
            const e = editableDirectionals.find((x) => x.light === dir);
            if (e) {
              if (e.helper) e.helper.visible = dir.visible;
              if (e.handle) e.handle.visible = dir.visible;
              if (e.targetHandle) e.targetHandle.visible = dir.visible;
            }
          }
        }
      } else if (l.type === 'HemisphereLight') {
        const hemi = new THREE.HemisphereLight(color ?? 0xffffff, 0x0b1220, intensity);
        hemi.name = l.name || 'HemisphereLight';
        hemi.position.copy(position);
        hemi.visible = (l.visible !== false);
        lightsRoot.add(hemi);
        const handle = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 16), new THREE.MeshBasicMaterial({ color: 0xffc107 }));
        handle.position.copy(hemi.position);
        handle.userData.__lightRef = hemi;
        handle.visible = hemi.visible;
        lightsRoot.add(handle);
        editableDirectionals.push({ name: hemi.name, light: hemi, helper: null, handle });
      } else if (l.type === 'RectAreaLight') {
        // optional restoration, currently disabled
      }
    }
  }

  return { applyScenarioLights, update, clear, root: lightsRoot, setEditorContext, getSelectedLightConfig, copySelectedLightConfigToClipboard, whitenWalls, buildLightsAdminUI, serializeLights, applyLightsFromSerialized, addFloorUplights, addMidHeightPanels, clearMidHeightPanels, addAutoRotatingDirectional };
}


