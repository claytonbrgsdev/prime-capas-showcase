import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { setupPostProcessing } from './camera_postfx.js';
import { createOrUpdateFloor, snapModelToScenarioFloor as snapModelToScenarioFloorUtil } from './scene/floor.js';
 
// Deprecated lights are replaced by per-scenario lights manager
import { createLightsManager } from './lights_manager.js';
import { createLoadingOverlay } from './overlay.js';
import { createScenarioManager } from './scenarios.js';
import { initializeCamera, enforceCameraDistanceClamp as clampCameraDistance, updateControlsTargetFromObject, frameObject, setPleasantCameraView as setPleasantView } from './camera.js';
import { createCinematicController } from './camera_cinematic.js';
import { applyColorToModel as applyColorToModelExt, applyColorToSpecificTarget as applyColorToSpecificTargetExt, disableMapForSpecificTarget as disableMapForSpecificTargetExt, applyLineColor as applyLineColorExt } from './materials/core.js';
import { removeDefaultTextureMapsFromModel as removeDefaultTextureMapsFromModelExt } from './materials/baked.js';
import { applyLogoRegionsFromUI as applyLogoRegionsFromUIExt, getAllMaterialNames as getAllMaterialNamesExt, setMaterialRoleMatchers as setMaterialRoleMatchersExt, applyTextureToRole as applyTextureToRoleExt, applyColorToRole as applyColorToRoleExt, getRoleInstanceCount as getRoleInstanceCountExt, setRoleInstanceVisible as setRoleInstanceVisibleExt, rotateRoleInstance as rotateRoleInstanceExt, listRoleInstances } from './materials/regions.js';

// ===== LOGOS Debug System =====
function LOGOS_LOG(type, msg, data) {
  try { if (localStorage.getItem('LOGOS_DEBUG') !== '1') return; } catch(_) { return; }
  const tag = `[LOGOS][${type}]`;
  if (data !== undefined) console.log(tag, msg, data); else console.log(tag, msg);
}

// Expose debug helper in dev environment
try { window.LOGOS_SET_DEBUG = (v) => localStorage.setItem('LOGOS_DEBUG', v ? '1' : '0'); } catch(_) {}

// Expose listRoleInstances for LOGOS functions
try { window.__logos_listInstances = (modelRoot) => listRoleInstances(modelRoot, 'logos'); } catch(_) {}

// ===== LOGOS Instance Management =====
function logosInstanceSignature(item) {
  const mesh = item.mesh; const mi = item.materialIndex; const mat = item.material;
  return `${mesh?.name || mesh?.id}#${mi}#${mat?.name || 'mat'}`;
}

function logosLogInstanceMap(modelRoot) {
  const list = window.__logos_listInstances ? window.__logos_listInstances(modelRoot) : [];
  const rows = list.map((it, idx) => ({ idx, sig: logosInstanceSignature(it), meshId: it.mesh.id, mesh: it.mesh.name, materialIndex: it.materialIndex, material: it.material?.name }));
  LOGOS_LOG('map', 'instances'); console.table(rows);
  try { localStorage.setItem('logos:map:v1', JSON.stringify(rows)); LOGOS_LOG('map', 'saved logos:map:v1'); } catch(_) {}
  return rows;
}

function logosLogTexState(idx, tex, extras={}) {
  const rep = tex?.repeat || {x:NaN,y:NaN}; const off = tex?.offset || {x:NaN,y:NaN}; const ctr = tex?.center || {x:NaN,y:NaN};
  const ub = (tex?.userData && tex.userData.uvBounds) || {};
  const q = (()=>{ const r = tex?.rotation || 0; const pi2 = Math.PI*2; const nr = ((r%pi2)+pi2)%pi2; return Math.round(nr/(Math.PI/2))%4; })();
  LOGOS_LOG('state', 'texture', { idx, q, rot:+(tex?.rotation||0).toFixed?.(3), rep:`(${+(rep.x||0).toFixed(3)},${+(rep.y||0).toFixed(3)})`, off:`(${+(off.x||0).toFixed(3)},${+(off.y||0).toFixed(3)})`, ctr:`(${+(ctr.x||0).toFixed(3)},${+(ctr.y||0).toFixed(3)})`, uvCtr:`(${+(ub.centerU||0).toFixed(3)},${+(ub.centerV||0).toFixed(3)})`, ...extras });
}

// ===== LOGOS Rotation Management =====
function logosRadToQ(rad){ const t=Math.PI*2; const r=((rad%t)+t)%t; return Math.round(r/(Math.PI/2))%4; }

function logosSetRotationQ(modelRoot, idx, targetQ){
  const list = window.__logos_listInstances ? window.__logos_listInstances(modelRoot) : [];
  const it = list[idx]; if (!it) return;
  const sig = logosInstanceSignature(it);
  const mat = it.material; const tex = mat?.map; if (!tex) return;
  const currentQ = logosRadToQ(tex.rotation||0);
  const delta = ((targetQ - currentQ)%4 + 4)%4;
  LOGOS_LOG('rotate', `idx=${idx} fromQ=${currentQ} -> toQ=${targetQ} (Δ=${delta}) baseRad=${(tex.rotation||0).toFixed(3)}`);
  if (delta) rotateRoleInstanceExt(modelRoot, 'logos', idx, delta);
  try { localStorage.setItem('logos:pref:'+sig, JSON.stringify({ rotationQ: targetQ })); LOGOS_LOG('persist','save',{sig,rotationQ:targetQ}); } catch(_){}
  logosLogTexState(idx, it.material?.map);
}

// ===== LOGOS Post-Upload Reapplication =====
function applyDefaultsForLogos(modelRoot){
  const list = window.__logos_listInstances ? window.__logos_listInstances(modelRoot) : [];
  list.forEach((it, idx) => {
    const sig = logosInstanceSignature(it);
    let pref = null; try { pref = JSON.parse(localStorage.getItem('logos:pref:'+sig) || 'null'); } catch(_){}
    const tex = it.material?.map; if (!tex) return;
    if (pref && Number.isFinite(pref.rotationQ)) {
      const current = logosRadToQ(tex.rotation||0);
      const delta = ((pref.rotationQ - current)%4 + 4)%4;
      if (delta) rotateRoleInstanceExt(modelRoot, 'logos', idx, delta);
    }
    if (pref && typeof pref.flipY === 'number') { tex.flipY = !!pref.flipY; tex.needsUpdate = true; }
    // padPercent opcional (se usar refit custom)
    logosLogTexState(idx, tex, { loadedPref: !!pref });
  });
}

(function () {
  // ===== App State =====
  /** @type {THREE.WebGLRenderer} */
  let renderer;
  /** @type {THREE.PerspectiveCamera} */
  let camera;
  /** @type {THREE.Scene} */
  let scene;
  /** @type {THREE.Object3D | null} */
  let modelRoot = null;
  /** @type {HTMLElement} */
  let viewportEl;
  
  /** @type {HTMLSelectElement | null} */
  let modelSelectEl = null;
  
  // Removed global model color control
  /** @type {any | null} */
  let controls = null;
  /** @type {THREE.Mesh | null} */
  let floorMesh = null;
  // Scenario manager
  let scenarioManager = null;
  // Lights manager (widen scope for scenario hooks)
  let lightsManager = null;
  // Cinematic camera state
  let composer = null; // EffectComposer
  let renderPass = null; // RenderPass
  let bokehPass = null; // BokehPass
  let cinematic = null;
  /** @type {Record<string, number>} */
  const scenarioYOffsetDefaults = {
    none: 0,
    modern_garage: 0.0,
    office_garage: -0.10,
    parking_lot: 0.12,
    parking_lot_uf: 0.18,
    'sci-fi_garage': 0.0,
    'vr_moody_lighting_art_gallery_scene_06': 0.0
  };
  let currentScenarioKey = 'sci-fi_garage';
  let userYOffset = 0; // live override via UI
  let modelYOffsetBase = 0; // baseline after snapping to scenario floor
  // Loading overlay API
  let overlay = null;
  // Expose readouts updater to outer scope (avoid ReferenceError)
  /** @type {null | (() => void)} */
  let updateReadouts = null;

  // Texture toggles UI removed
  /** @type {HTMLInputElement | null} */
  let lineColorInputEl = null;
  /** @type {HTMLInputElement | null} */
  let modelColorInputEl = null;

  // Logo regions UI removed; single PNG upload replaces it
  /** @type {HTMLInputElement | null} */
  let pngUploadEl = null;
  /** @type {HTMLInputElement | null} */
  let logoColorEl = null;
  // Per-instance UI elements
  /** @type {HTMLInputElement | null} */
  let logoInst0Visible = null, logoInst1Visible = null, logoInst2Visible = null, logoInst3Visible = null;
  /** @type {HTMLButtonElement | null} */
  let logoInst0RotCCW = null, logoInst0RotCW = null, logoInst1RotCCW = null, logoInst1RotCW = null, logoInst2RotCCW = null, logoInst2RotCW = null, logoInst3RotCCW = null, logoInst3RotCW = null;
  /** @type {HTMLButtonElement | null} */
  let logoInst0Reset = null, logoInst1Reset = null, logoInst2Reset = null, logoInst3Reset = null;
  // Expose refresher so we can call it after model load
  let refreshLogosControlsAvailability = null;
  

  // Y offset UI refs (assigned in initialize)
  /** @type {HTMLInputElement | null} */
  let yOffsetRange = null;
  /** @type {HTMLElement | null} */
  let yOffsetValue = null;
  /** @type {HTMLButtonElement | null} */
  let nudgeDownBtn = null;
  /** @type {HTMLButtonElement | null} */
  let nudgeUpBtn = null;
  /** @type {HTMLButtonElement | null} */
  let saveScenarioOffsetBtn = null;

  function updateYOffsetUI() {
    if (yOffsetRange) yOffsetRange.value = String(userYOffset);
    if (yOffsetValue) yOffsetValue.textContent = userYOffset.toFixed(3);
  }

  function applyVerticalOffset() {
    if (!modelRoot) return;
    const base = scenarioYOffsetDefaults[currentScenarioKey] ?? 0;
    const total = base + userYOffset;
    modelRoot.position.y = modelYOffsetBase + total;
    updateFloorUnderModel();
    updateReadouts && updateReadouts();
    updateControlsTargetFromModel();
  }

  // ===== Initialization (DOM, Three.js, PostFX, UI) =====
  function initialize() {
    console.log('[init] starting');
    // DOM refs
    viewportEl = document.getElementById('viewport');
    
    const toggleCinematicBtn = /** @type {HTMLButtonElement} */ (document.getElementById('toggleCinematicBtn'));
    const restartCinematicBtn = /** @type {HTMLButtonElement} */ (document.getElementById('restartCinematicBtn'));
    const takesEditorEl = document.getElementById('takesEditor');
    const applyTakesBtn = /** @type {HTMLButtonElement} */ (document.getElementById('applyTakesBtn'));
    const toggleDofBtn = /** @type {HTMLButtonElement} */ (document.getElementById('toggleDofBtn'));
    const copyTakesBtn = /** @type {HTMLButtonElement} */ (document.getElementById('copyTakesBtn'));
    const camPresetNameInput = /** @type {HTMLInputElement} */ (document.getElementById('camPresetNameInput'));
    const camPresetSelect = /** @type {HTMLSelectElement} */ (document.getElementById('camPresetSelect'));
    const saveCamPresetBtn = /** @type {HTMLButtonElement} */ (document.getElementById('saveCamPresetBtn'));
    const loadCamPresetBtn = /** @type {HTMLButtonElement} */ (document.getElementById('loadCamPresetBtn'));
    const deleteCamPresetBtn = /** @type {HTMLButtonElement} */ (document.getElementById('deleteCamPresetBtn'));
    const exportCamPresetBtn = /** @type {HTMLButtonElement} */ (document.getElementById('exportCamPresetBtn'));
    const importCamPresetBtn = /** @type {HTMLButtonElement} */ (document.getElementById('importCamPresetBtn'));
    const importCamPresetFile = /** @type {HTMLInputElement} */ (document.getElementById('importCamPresetFile'));
    
    
    if (!viewportEl) throw new Error('Viewport element not found');

    // Renderer inside viewport container
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const { width, height } = getViewportSize();
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.physicallyCorrectLights = true;
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    viewportEl.appendChild(renderer.domElement);

    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1220);

    // Scenario manager
    scenarioManager = createScenarioManager(scene);

    // Camera and controls
    const { width: vw, height: vh } = getViewportSize();
    const { camera: cam, controls: ctrls } = initializeCamera(
      /** @type {HTMLCanvasElement} */ (undefined) || renderer.domElement,
      { fov: 60, near: 0.1, far: 100, aspect: vw / vh }
    );
    camera = cam;
    controls = ctrls;
    // Dev-only: relax orbit polar angle limits for easier authoring
    try {
      const isDev = /^(localhost|127\.?0\.?0\.?1)$/i.test(location.hostname) || /[?&]dev=1\b/i.test(location.search);
      if (isDev && controls) {
        // Remove polar constraints and allow screen-space panning for free-flight authoring
        controls.minPolarAngle = 0;
        controls.maxPolarAngle = Math.PI;
        controls.screenSpacePanning = true;
        controls.enablePan = true;
        controls.enableZoom = true;
      }
    } catch (_) {}
    scene.add(camera);

    // Postprocessing setup (needs scene and camera ready)
    {
      const res = setupPostProcessing(renderer, scene, camera, width, height);
      composer = res.composer;
      renderPass = res.renderPass;
      bokehPass = res.bokehPass;
    }

    // Cinematic controller
    cinematic = createCinematicController(camera, controls);
    cinematic.setBokehPass(bokehPass);
    // Turbo orbit defaults for cinematic mode
    try { cinematic.setOrbitParams({ speed: 0.6, radius: 3.8, elevation: 32, elevationSway: 6, dwellDriftSpeed: 0.35, radiusSwayAmp: 0.05, radiusSwayHz: 0.8 }); } catch (_) {}
    try { cinematic.setFovPulse({ enabled: false, base: 55, amplitudeDeg: 0 }); } catch (_) {}
    // Longer resume blend after manual drag (couple of seconds)
    try { cinematic.setResumeBlendSeconds(3.0); } catch (_) {}
    try {
      // Turbo takes: quick cuts, wide FOV to keep context
      // Explicit radiusFactor ensures consistent initial framing and DOF lock
      cinematic.setTakes([
        // Moderate elevation changes (80°–90°), varied zoom, subtle drift/sway per take
        { azimuthDeg:  15, elevationDeg: 88, radiusFactor: 3.6, fovDeg: 68, dwellSeconds: 1.2, transitionSeconds: 0.7, driftRadPerSec: 0.22, radiusSwayAmp: 0.03, radiusSwayHz: 0.7 },
        { azimuthDeg:  55, elevationDeg: 84, radiusFactor: 3.2, fovDeg: 64, dwellSeconds: 1.35, transitionSeconds: 0.85, driftRadPerSec: 0.18, radiusSwayAmp: 0.05, radiusSwayHz: 0.9 },
        { azimuthDeg: 100, elevationDeg: 90, radiusFactor: 4.6, fovDeg: 76, dwellSeconds: 1.25, transitionSeconds: 0.75, driftRadPerSec: 0.28, radiusSwayAmp: 0.02, radiusSwayHz: 0.6 },
        { azimuthDeg: 135, elevationDeg: 82, radiusFactor: 2.9, fovDeg: 58, dwellSeconds: 1.6,  transitionSeconds: 0.9,  driftRadPerSec: 0.16, radiusSwayAmp: 0.06, radiusSwayHz: 1.0 },
        { azimuthDeg: 175, elevationDeg: 86, radiusFactor: 3.9, fovDeg: 70, dwellSeconds: 1.4,  transitionSeconds: 0.8,  driftRadPerSec: 0.24, radiusSwayAmp: 0.04, radiusSwayHz: 0.8 },
        { azimuthDeg: 200, elevationDeg: 80, radiusFactor: 2.6, fovDeg: 56, dwellSeconds: 1.3,  transitionSeconds: 0.8,  driftRadPerSec: 0.12, radiusSwayAmp: 0.05, radiusSwayHz: 1.1 },
        { azimuthDeg: 230, elevationDeg: 89, radiusFactor: 4.8, fovDeg: 78, dwellSeconds: 1.2,  transitionSeconds: 0.7,  driftRadPerSec: 0.3,  radiusSwayAmp: 0.015, radiusSwayHz: 0.5 },
        { azimuthDeg: 265, elevationDeg: 85, radiusFactor: 3.3, fovDeg: 66, dwellSeconds: 1.35, transitionSeconds: 0.85, driftRadPerSec: 0.2,  radiusSwayAmp: 0.035, radiusSwayHz: 0.9 },
        { azimuthDeg: 300, elevationDeg: 90, radiusFactor: 4.2, fovDeg: 74, dwellSeconds: 1.45, transitionSeconds: 0.8,  driftRadPerSec: 0.26, radiusSwayAmp: 0.025, radiusSwayHz: 0.7 },
        { azimuthDeg: 330, elevationDeg: 83, radiusFactor: 2.8, fovDeg: 60, dwellSeconds: 1.25, transitionSeconds: 0.75, driftRadPerSec: 0.14, radiusSwayAmp: 0.06, radiusSwayHz: 1.2 },
        { azimuthDeg: 355, elevationDeg: 87, radiusFactor: 3.7, fovDeg: 70, dwellSeconds: 1.2,  transitionSeconds: 0.7,  driftRadPerSec: 0.22, radiusSwayAmp: 0.03, radiusSwayHz: 0.8 },
      ]);
    } catch (_) {}
    // Start with cinematic enabled by default
    try {
      cinematic.enable();
      if (toggleCinematicBtn) toggleCinematicBtn.textContent = 'Stop cinematic camera';
    } catch (_) {}

    
    // Allow temporary manual orbit while in cinematic mode: pause cinematic when pointer is down,
    // resume with a smooth blend when released.
    try {
      renderer.domElement.addEventListener('pointerdown', () => {
        if (!cinematic) return;
        // Pause cinematic motion but keep it enabled (lights/DOF remain)
        cinematic.setManualControlActive(true);
        if (restartCinematicBtn) restartCinematicBtn.style.display = '';
        if (controls) controls.enabled = true;
      });
      if (restartCinematicBtn) restartCinematicBtn.addEventListener('click', () => {
        if (!cinematic) return;
        // Resume cinematic motion smoothly
        cinematic.setManualControlActive(false);
        if (restartCinematicBtn) restartCinematicBtn.style.display = 'none';
      });
    } catch (_) {}
    if (toggleCinematicBtn) {
      toggleCinematicBtn.addEventListener('click', () => {
        if (!cinematic) return;
        if (cinematic.isEnabled()) {
          cinematic.disable();
          toggleCinematicBtn.textContent = 'Start cinematic camera';
        } else {
          cinematic.enable();
          toggleCinematicBtn.textContent = 'Stop cinematic camera';
        }
      });
    }

    // DOF toggle button
    if (toggleDofBtn) {
      toggleDofBtn.addEventListener('click', () => {
        if (!bokehPass) return;
        bokehPass.enabled = !bokehPass.enabled;
        toggleDofBtn.textContent = bokehPass.enabled ? 'DOF: On' : 'DOF: Off';
      });
      // Initialize label
      toggleDofBtn.textContent = (bokehPass && bokehPass.enabled) ? 'DOF: On' : 'DOF: Off';
    }

    // ===== Camera Admin UI (takes + presets) =====
    function cameraStorageKey() { return `cam-presets:${currentScenarioKey || 'none'}`; }
    function readCamPresets() { try { return JSON.parse(localStorage.getItem(cameraStorageKey()) || '[]'); } catch { return []; } }
    function writeCamPresets(list) { try { localStorage.setItem(cameraStorageKey(), JSON.stringify(list)); } catch (_) {} }

    function buildTakesEditor(container) {
      if (!container) return;
      while (container.firstChild) container.removeChild(container.firstChild);
      const mkNumber = (label, min, max, step, value) => {
        const row = document.createElement('div'); row.className = 'row';
        const lab = document.createElement('label'); lab.textContent = label; row.appendChild(lab);
        const input = document.createElement('input'); input.type = 'number'; input.min = String(min); input.max = String(max); input.step = String(step); input.value = String(value);
        row.appendChild(input);
        return { row, input };
      };
      // Order selector (indices 1..4)
      const orderRow = document.createElement('div'); orderRow.className = 'row';
      const orderLab = document.createElement('label'); orderLab.textContent = 'Ordem (1-4)'; orderRow.appendChild(orderLab);
      const orderInput = document.createElement('input'); orderInput.type = 'text'; orderInput.placeholder = 'ex: 1,2,3,4'; orderInput.value = '1,2,3,4'; orderRow.appendChild(orderInput);
      container.appendChild(orderRow);

      const defaultTakes = [
        { azimuthDeg:  15, elevationDeg: 88, radiusFactor: 3.6, fovDeg: 68, dwellSeconds: 1.2, transitionSeconds: 0.7, driftRadPerSec: 0.22, radiusSwayAmp: 0.03, radiusSwayHz: 0.7 },
        { azimuthDeg:  55, elevationDeg: 84, radiusFactor: 3.2, fovDeg: 64, dwellSeconds: 1.35, transitionSeconds: 0.85, driftRadPerSec: 0.18, radiusSwayAmp: 0.05, radiusSwayHz: 0.9 },
        { azimuthDeg: 100, elevationDeg: 90, radiusFactor: 4.6, fovDeg: 76, dwellSeconds: 1.25, transitionSeconds: 0.75, driftRadPerSec: 0.28, radiusSwayAmp: 0.02, radiusSwayHz: 0.6 },
        { azimuthDeg: 135, elevationDeg: 82, radiusFactor: 2.9, fovDeg: 58, dwellSeconds: 1.6,  transitionSeconds: 0.9,  driftRadPerSec: 0.16, radiusSwayAmp: 0.06, radiusSwayHz: 1.0 },
      ];
      const editors = [];
      for (let i = 0; i < 4; i++) {
        const box = document.createElement('div');
        box.style.border = '1px solid rgba(148,163,184,0.15)';
        box.style.borderRadius = '6px';
        box.style.padding = '8px';
        box.style.marginBottom = '8px';
        const title = document.createElement('div'); title.style.fontWeight = '600'; title.textContent = `Take ${i+1}`; box.appendChild(title);
        const seed = defaultTakes[i] || defaultTakes[0];
        const f = {};
        f.az = mkNumber('Azimuth (°)', -360, 360, 1, seed.azimuthDeg);
        f.el = mkNumber('Elevation (°)', 15, 90, 1, seed.elevationDeg);
        f.rf = mkNumber('Radius factor', 0.1, 10, 0.01, seed.radiusFactor);
        f.fov = mkNumber('FOV (°)', 20, 110, 1, seed.fovDeg);
        f.dw = mkNumber('Dwell (s)', 0.1, 30, 0.05, seed.dwellSeconds);
        f.tr = mkNumber('Transition (s)', 0.1, 10, 0.05, seed.transitionSeconds);
        f.dr = mkNumber('Drift (rad/s)', 0, 1, 0.001, seed.driftRadPerSec);
        f.sa = mkNumber('Radius sway amp', 0, 0.2, 0.001, seed.radiusSwayAmp);
        f.sh = mkNumber('Radius sway Hz', 0, 5, 0.01, seed.radiusSwayHz);
        for (const k of Object.keys(f)) box.appendChild(f[k].row);
        container.appendChild(box);
        editors.push({ box, f });
      }
      return { editors, orderInput };
    }

    const takesUI = buildTakesEditor(takesEditorEl);

    function readTakesFromUI() {
      if (!takesUI) return [];
      const order = (takesUI.orderInput.value || '1,2,3,4').split(',').map((s) => Math.max(1, Math.min(4, Number(s.trim()) || 1)) - 1);
      const unique = order.filter((_, idx) => order.indexOf(order[idx]) === idx);
      const indices = (unique.length ? unique : [0,1,2,3]);
      const takes = indices.map((i) => {
        const f = takesUI.editors[i].f;
        return {
          azimuthDeg: Number(f.az.input.value),
          elevationDeg: Number(f.el.input.value),
          radiusFactor: Number(f.rf.input.value),
          fovDeg: Number(f.fov.input.value),
          dwellSeconds: Number(f.dw.input.value),
          transitionSeconds: Number(f.tr.input.value),
          driftRadPerSec: Number(f.dr.input.value),
          radiusSwayAmp: Number(f.sa.input.value),
          radiusSwayHz: Number(f.sh.input.value),
        };
      });
      return takes;
    }

    if (applyTakesBtn) applyTakesBtn.addEventListener('click', () => {
      try { cinematic.setTakes(readTakesFromUI()); } catch (_) {}
      try { if (!cinematic.isEnabled()) cinematic.enable(); } catch (_) {}
      if (toggleCinematicBtn) toggleCinematicBtn.textContent = 'Stop cinematic camera';
    });
    if (copyTakesBtn) copyTakesBtn.addEventListener('click', async () => {
      const data = { scenario: currentScenarioKey, takes: readTakesFromUI() };
      const text = JSON.stringify(data, null, 2);
      try { await navigator.clipboard.writeText(text); } catch (_) {}
    });

    function refreshCamPresetSelect() {
      if (!camPresetSelect) return;
      camPresetSelect.innerHTML = '';
      const list = readCamPresets();
      for (const p of list) {
        const opt = document.createElement('option'); opt.value = p.name; opt.textContent = p.name; camPresetSelect.appendChild(opt);
      }
    }
    refreshCamPresetSelect();
    if (saveCamPresetBtn) saveCamPresetBtn.addEventListener('click', () => {
      const name = (camPresetNameInput?.value || '').trim() || `takes-${Date.now()}`;
      const preset = { name, takes: readTakesFromUI() };
      const list = readCamPresets();
      const idx = list.findIndex((p) => p.name === name);
      if (idx >= 0) list[idx] = preset; else list.push(preset);
      writeCamPresets(list);
      refreshCamPresetSelect();
    });
    if (loadCamPresetBtn) loadCamPresetBtn.addEventListener('click', () => {
      const name = camPresetSelect?.value; if (!name) return;
      const list = readCamPresets();
      const p = list.find((x) => x.name === name); if (!p) return;
      try { cinematic.setTakes(p.takes || []); } catch (_) {}
      try { if (!cinematic.isEnabled()) cinematic.enable(); } catch (_) {}
      if (toggleCinematicBtn) toggleCinematicBtn.textContent = 'Stop cinematic camera';
    });
    if (deleteCamPresetBtn) deleteCamPresetBtn.addEventListener('click', () => {
      const name = camPresetSelect?.value; if (!name) return;
      const list = readCamPresets().filter((p) => p.name !== name);
      writeCamPresets(list); refreshCamPresetSelect();
    });
    if (exportCamPresetBtn) exportCamPresetBtn.addEventListener('click', () => {
      const name = camPresetSelect?.value; if (!name) return;
      const list = readCamPresets();
      const p = list.find((x) => x.name === name); if (!p) return;
      const payload = { ...p, scenario: currentScenarioKey };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob); const a = document.createElement('a');
      a.href = url; a.download = `${name}.json`; a.click(); URL.revokeObjectURL(url);
    });
    if (importCamPresetBtn && importCamPresetFile) {
      importCamPresetBtn.addEventListener('click', () => importCamPresetFile.click());
      importCamPresetFile.addEventListener('change', async () => {
        const file = importCamPresetFile.files?.[0]; if (!file) return;
        try {
          const text = await file.text(); const preset = JSON.parse(text) || {};
          const nameFromFile = (file.name || '').replace(/\.[^.]+$/, '');
          const name = (preset.name && String(preset.name).trim()) || nameFromFile || `takes-${Date.now()}`;
          const normalized = { name, takes: Array.isArray(preset.takes) ? preset.takes : [] };
          const list = readCamPresets();
          const idx = list.findIndex((p) => p.name === normalized.name);
          if (idx >= 0) list[idx] = normalized; else list.push(normalized);
          writeCamPresets(list); refreshCamPresetSelect();
          if (camPresetSelect) camPresetSelect.value = normalized.name;
          try { cinematic.setTakes(normalized.takes || []); } catch (_) {}
          try { if (!cinematic.isEnabled()) cinematic.enable(); } catch (_) {}
          if (toggleCinematicBtn) toggleCinematicBtn.textContent = 'Stop cinematic camera';
        } catch (e) { console.warn('[camera] Failed to import preset:', e); }
        finally { try { importCamPresetFile.value = ''; } catch (_) {} }
      });
    }

    // Lights (handled by lights_manager.js)
    lightsManager = createLightsManager(scene);
    // Preserve embedded scenario lights; do not clear
    lightsManager.applyScenarioLights(currentScenarioKey);
    try { lightsManager.setEditorContext(camera, renderer.domElement, controls); } catch (_) {}
    // Build admin UI for lights
    try {
      const lightsAdminEl = document.getElementById('lightsAdmin');
      const copyBtn = /** @type {HTMLButtonElement} */ (document.getElementById('copySelectedLightBtn'));
      const refocusBtn = /** @type {HTMLButtonElement} */ (document.getElementById('adminRefocusBtn'));
      // Presets UI elements
      const presetNameInput = /** @type {HTMLInputElement} */ (document.getElementById('presetNameInput'));
      const presetSelect = /** @type {HTMLSelectElement} */ (document.getElementById('presetSelect'));
      const savePresetBtn = /** @type {HTMLButtonElement} */ (document.getElementById('savePresetBtn'));
      const loadPresetBtn = /** @type {HTMLButtonElement} */ (document.getElementById('loadPresetBtn'));
      const deletePresetBtn = /** @type {HTMLButtonElement} */ (document.getElementById('deletePresetBtn'));
      const exportPresetBtn = /** @type {HTMLButtonElement} */ (document.getElementById('exportPresetBtn'));
      const importPresetBtn = /** @type {HTMLButtonElement} */ (document.getElementById('importPresetBtn'));
      const importPresetFile = /** @type {HTMLInputElement} */ (document.getElementById('importPresetFile'));
      if (lightsAdminEl) {
        // Add three auto-rotating directionals by default (all start deactivated)
        try { lightsManager.addAutoRotatingDirectional('autoRotX', { color: 0xffffff, intensity: 10, speedDegPerSec: 25, radiusFactor: 1.2, axis: 'x', phaseDeg: 0 }); } catch (_) {}
        try { lightsManager.addAutoRotatingDirectional('autoRotY', { color: 0xffffff, intensity: 10, speedDegPerSec: -20, radiusFactor: 1.4, axis: 'y', phaseDeg: 120 }); } catch (_) {}
        try { lightsManager.addAutoRotatingDirectional('autoRotX2', { color: 0xffffff, intensity: 10, speedDegPerSec: 15, radiusFactor: 0.9, axis: 'x', phaseDeg: 240 }); } catch (_) {}
        lightsManager.buildLightsAdminUI(lightsAdminEl);
      }
      if (copyBtn) copyBtn.addEventListener('click', () => lightsManager.copySelectedLightConfigToClipboard());
      if (refocusBtn) refocusBtn.addEventListener('click', () => { if (modelRoot) { setPleasantCameraView(); } });

      // Presets: storage helpers
      function storageKeyForScenario() { return `presets:${currentScenarioKey || 'none'}`; }
      function readPresets() { try { return JSON.parse(localStorage.getItem(storageKeyForScenario()) || '[]'); } catch { return []; } }
      function writePresets(list) { try { localStorage.setItem(storageKeyForScenario(), JSON.stringify(list)); } catch (_) {} }
      function refreshPresetSelect() {
        if (!presetSelect) return;
        const list = readPresets();
        presetSelect.innerHTML = '';
        for (const p of list) {
          const opt = document.createElement('option');
          opt.value = p.name; opt.textContent = p.name;
          presetSelect.appendChild(opt);
        }
      }
      refreshPresetSelect();

      function captureCamera() {
        return {
          position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
          target: { x: controls.target.x, y: controls.target.y, z: controls.target.z },
          fov: camera.fov,
        };
      }
      function applyCamera(c) {
        if (!c) return;
        if (c.position) camera.position.set(c.position.x, c.position.y, c.position.z);
        if (c.fov) { camera.fov = c.fov; camera.updateProjectionMatrix(); }
        if (c.target) { controls.target.set(c.target.x, c.target.y, c.target.z); controls.update(); }
      }

      if (savePresetBtn) savePresetBtn.addEventListener('click', () => {
        const name = (presetNameInput?.value || '').trim() || `preset-${Date.now()}`;
        const preset = { name, lights: lightsManager.serializeLights(), camera: captureCamera() };
        const list = readPresets();
        const idx = list.findIndex((p) => p.name === name);
        if (idx >= 0) list[idx] = preset; else list.push(preset);
        writePresets(list);
        refreshPresetSelect();
      });
      if (loadPresetBtn) loadPresetBtn.addEventListener('click', () => {
        const name = presetSelect?.value;
        if (!name) return;
        const list = readPresets();
        const p = list.find((x) => x.name === name);
        if (!p) return;
        lightsManager.applyLightsFromSerialized(p.lights || []);
        applyCamera(p.camera || null);
        if (lightsAdminEl) lightsManager.buildLightsAdminUI(lightsAdminEl);
      });
      if (deletePresetBtn) deletePresetBtn.addEventListener('click', () => {
        const name = presetSelect?.value;
        if (!name) return;
        const list = readPresets().filter((p) => p.name !== name);
        writePresets(list);
        refreshPresetSelect();
      });
      if (exportPresetBtn) exportPresetBtn.addEventListener('click', () => {
        const name = presetSelect?.value;
        if (!name) return;
        const list = readPresets();
        const p = list.find((x) => x.name === name);
        if (!p) return;
        const payload = { ...p, scenario: currentScenarioKey };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `${name}.json`; a.click();
        URL.revokeObjectURL(url);
      });
      if (importPresetBtn && importPresetFile) {
        importPresetBtn.addEventListener('click', () => importPresetFile.click());
        importPresetFile.addEventListener('change', async () => {
          const file = importPresetFile.files?.[0];
          if (!file) return;
          try {
            const text = await file.text();
            const preset = JSON.parse(text) || {};
            const nameFromFile = (file.name || '').replace(/\.[^.]+$/, '');
            const name = (preset.name && String(preset.name).trim()) || nameFromFile || `preset-${Date.now()}`;
            const normalized = { name, lights: Array.isArray(preset.lights) ? preset.lights : [], camera: preset.camera || null };

            // If the imported preset is tied to a different scenario, warn and still allow import under current scenario
            try {
              if (preset.scenario && preset.scenario !== currentScenarioKey) {
                console.warn(`[presets] Imported preset was saved for scenario "${preset.scenario}", applying to current "${currentScenarioKey}".`);
              }
            } catch (_) {}

            const list = readPresets();
            const idx = list.findIndex((p) => p.name === normalized.name);
            if (idx >= 0) list[idx] = normalized; else list.push(normalized);
            writePresets(list);
            refreshPresetSelect();

            // Select newly imported preset
            if (presetSelect) presetSelect.value = normalized.name;
            // Immediately apply
            try { lightsManager.applyLightsFromSerialized(normalized.lights || []); } catch (_) {}
            try { applyCamera(normalized.camera || null); } catch (_) {}
            if (lightsAdminEl) lightsManager.buildLightsAdminUI(lightsAdminEl);
          } catch (e) {
            console.warn('[presets] Failed to import preset:', e);
          } finally {
            // Allow importing the same file again in the future
            try { importPresetFile.value = ''; } catch (_) {}
          }
        });
      }
    } catch (_) {}

    // Main lights only; no cinematic-only lights to keep consistent lighting

    // Loading overlay
    overlay = createLoadingOverlay();
    overlay.show();
    overlay.setProgress(0);

    // Load model (from selector if present)
    modelSelectEl = /** @type {HTMLSelectElement} */ (document.getElementById('modelSelect'));
    lineColorInputEl = /** @type {HTMLInputElement} */ (document.getElementById('lineColorControl'));
    modelColorInputEl = /** @type {HTMLInputElement} */ (document.getElementById('modelColorControl'));
    // PNG upload control
    pngUploadEl = /** @type {HTMLInputElement} */ (document.getElementById('pngUpload'));
    logoColorEl = /** @type {HTMLInputElement} */ (document.getElementById('logoColor'));
    // Per-instance refs
    logoInst0Visible = /** @type {HTMLInputElement} */ (document.getElementById('logoInst0Visible'));
    logoInst1Visible = /** @type {HTMLInputElement} */ (document.getElementById('logoInst1Visible'));
    logoInst2Visible = /** @type {HTMLInputElement} */ (document.getElementById('logoInst2Visible'));
    logoInst3Visible = /** @type {HTMLInputElement} */ (document.getElementById('logoInst3Visible'));
    logoInst0RotCCW = /** @type {HTMLButtonElement} */ (document.getElementById('logoInst0RotCCW'));
    logoInst0RotCW  = /** @type {HTMLButtonElement} */ (document.getElementById('logoInst0RotCW'));
    logoInst1RotCCW = /** @type {HTMLButtonElement} */ (document.getElementById('logoInst1RotCCW'));
    logoInst1RotCW  = /** @type {HTMLButtonElement} */ (document.getElementById('logoInst1RotCW'));
    logoInst2RotCCW = /** @type {HTMLButtonElement} */ (document.getElementById('logoInst2RotCCW'));
    logoInst2RotCW  = /** @type {HTMLButtonElement} */ (document.getElementById('logoInst2RotCW'));
    logoInst3RotCCW = /** @type {HTMLButtonElement} */ (document.getElementById('logoInst3RotCCW'));
    logoInst3RotCW  = /** @type {HTMLButtonElement} */ (document.getElementById('logoInst3RotCW'));
    logoInst0Reset = /** @type {HTMLButtonElement} */ (document.getElementById('logoInst0Reset'));
    logoInst1Reset = /** @type {HTMLButtonElement} */ (document.getElementById('logoInst1Reset'));
    logoInst2Reset = /** @type {HTMLButtonElement} */ (document.getElementById('logoInst2Reset'));
    logoInst3Reset = /** @type {HTMLButtonElement} */ (document.getElementById('logoInst3Reset'));
    const initialModelUrl = (modelSelectEl && modelSelectEl.value) || './assets/models/kosha4/teste14.glb';
    console.log('[loader] loading', initialModelUrl);
    loadGltfModel(initialModelUrl, (p) => overlay.setProgress(p), () => overlay.hide());

    // UI events
    // Global model color UI removed
    if (modelSelectEl) {
      modelSelectEl.addEventListener('change', () => {
        if (modelSelectEl) switchModel(modelSelectEl.value);
      });
    }

    if (lineColorInputEl) {
      lineColorInputEl.addEventListener('input', () => {
        const hex = lineColorInputEl.value || '#ffffff';
        applyLineColor(hex);
      });
    }
    if (modelColorInputEl) {
      modelColorInputEl.addEventListener('input', () => {
        const hex = modelColorInputEl.value || '#ffffff';
        // Ensure base color map is disabled so color is visible
        disableMapForSpecificTargetExt(modelRoot);
        applyModelTargetColor(hex);
      });
    }

    if (logoColorEl) {
      logoColorEl.addEventListener('input', () => {
        const hex = logoColorEl.value || '#ffffff';
        applyColorToRole('logos', hex, { disableMap: true });
      });
    }

    // Guard: if fewer than 4 instances, disable extra controls
    refreshLogosControlsAvailability = function () {
      try {
        const count = getRoleInstanceCountExt(modelRoot, 'logos');
        if (!count || count <= 0) return; // don't disable controls before model is ready
        const setEnabled = (el, on) => { if (!el) return; el.disabled = !on; };
        setEnabled(logoInst0Visible, count > 0); setEnabled(logoInst0RotCCW, count > 0); setEnabled(logoInst0RotCW, count > 0); setEnabled(logoInst0Reset, count > 0);
        setEnabled(logoInst1Visible, count > 1); setEnabled(logoInst1RotCCW, count > 1); setEnabled(logoInst1RotCW, count > 1); setEnabled(logoInst1Reset, count > 1);
        setEnabled(logoInst2Visible, count > 2); setEnabled(logoInst2RotCCW, count > 2); setEnabled(logoInst2RotCW, count > 2); setEnabled(logoInst2Reset, count > 2);
        setEnabled(logoInst3Visible, count > 3); setEnabled(logoInst3RotCCW, count > 3); setEnabled(logoInst3RotCW, count > 3); setEnabled(logoInst3Reset, count > 3);
      } catch (_) {}
    };

    const bindLogoInstanceControls = (idx, cbVisible, btnCCW, btnCW, btnReset) => {
      // Only rotate the specific logos instance, not the side roles which may be interfering
      const setVisible = (on) => {
        setRoleInstanceVisibleExt(modelRoot, 'logos', idx, !!on);
      };
      const rotate = (qt) => {
        rotateRoleInstanceExt(modelRoot, 'logos', idx, qt);
      };
      if (cbVisible) cbVisible.addEventListener('change', () => setVisible(!!cbVisible.checked));
      // Use 90° rotation steps (quarter-turns) as per LOGOS methodology
      if (btnCCW) btnCCW.addEventListener('click', () => rotate(-1));
      if (btnCW)  btnCW.addEventListener('click',  () => rotate(+1));
      if (btnReset) btnReset.addEventListener('click', () => logosSetRotationQ(modelRoot, idx, 0));
    };
    bindLogoInstanceControls(0, logoInst0Visible, logoInst0RotCCW, logoInst0RotCW, logoInst0Reset);
    bindLogoInstanceControls(1, logoInst1Visible, logoInst1RotCCW, logoInst1RotCW, logoInst1Reset);
    bindLogoInstanceControls(2, logoInst2Visible, logoInst2RotCCW, logoInst2RotCW, logoInst2Reset);
    bindLogoInstanceControls(3, logoInst3Visible, logoInst3RotCCW, logoInst3RotCW, logoInst3Reset);

    
    // PNG upload handler: apply to LOGOS role (and also front/back/lat roles for backward compat)
    if (pngUploadEl) {
      pngUploadEl.addEventListener('change', async () => {
        const file = pngUploadEl.files && pngUploadEl.files[0];
        if (!file || !modelRoot) return;
        try {
          const url = URL.createObjectURL(file);
          applyTextureToRole('logos', url, { anisotropy: 8, flipY: false });
          applyTextureToRole('frente', url, { anisotropy: 8, flipY: false });
          applyTextureToRole('tras', url, { anisotropy: 8, flipY: false });
          applyTextureToRole('lateral1', url, { anisotropy: 8, flipY: false });
          applyTextureToRole('lateral2', url, { anisotropy: 8, flipY: false });
          // LOGOS: Reagendar reaplicação de defaults após TextureLoader
          setTimeout(() => { try { applyDefaultsForLogos(modelRoot); } catch(_){} }, 50);
        } finally {
          try { pngUploadEl.value = ''; } catch (_) {}
        }
      });
    }
    

    // Light controls are handled within lights.js

    // Scenario controls
    const scenarioSelect = /** @type {HTMLSelectElement} */ (document.getElementById('scenarioSelect'));
    if (scenarioSelect) {
      scenarioSelect.addEventListener('change', () => {
        setScenarioManaged(scenarioSelect.value);
        // after scenario changes, keep orbit target centered on model
        if (modelRoot) updateControlsTargetFromObject(camera, controls, modelRoot);
        // Re-apply and rebuild admin UI
        try {
          lightsManager && lightsManager.applyScenarioLights(scenarioSelect.value);
          const lightsAdminEl = document.getElementById('lightsAdmin');
          if (lightsAdminEl) {
            // Recreate default auto-rotating lights for the new scenario (start deactivated)
            try { lightsManager.addAutoRotatingDirectional('autoRotX', { color: 0xffffff, intensity: 10, speedDegPerSec: 25, radiusFactor: 1.2, axis: 'x', phaseDeg: 0 }); } catch (_) {}
            try { lightsManager.addAutoRotatingDirectional('autoRotY', { color: 0xffffff, intensity: 10, speedDegPerSec: -20, radiusFactor: 1.4, axis: 'y', phaseDeg: 120 }); } catch (_) {}
            try { lightsManager.addAutoRotatingDirectional('autoRotX2', { color: 0xffffff, intensity: 10, speedDegPerSec: 15, radiusFactor: 0.9, axis: 'x', phaseDeg: 240 }); } catch (_) {}
            lightsManager.buildLightsAdminUI(lightsAdminEl);
          }
        } catch (_) {}
        // Refresh Presets dropdown for the new scenario
        try {
          const presetSelectEl = /** @type {HTMLSelectElement} */ (document.getElementById('presetSelect'));
          if (presetSelectEl) {
            const key = `presets:${currentScenarioKey || 'none'}`;
            let list = [];
            try { list = JSON.parse(localStorage.getItem(key) || '[]'); } catch (_) { list = []; }
            presetSelectEl.innerHTML = '';
            for (const p of list) {
              const opt = document.createElement('option');
              opt.value = p.name; opt.textContent = p.name;
              presetSelectEl.appendChild(opt);
            }
          }
        } catch (_) {}
        // Refresh camera presets dropdown for the new scenario
        try {
          const camPresetSelect = /** @type {HTMLSelectElement} */ (document.getElementById('camPresetSelect'));
          if (camPresetSelect) {
            const key = `cam-presets:${currentScenarioKey || 'none'}`;
            let list = [];
            try { list = JSON.parse(localStorage.getItem(key) || '[]'); } catch (_) { list = []; }
            camPresetSelect.innerHTML = '';
            for (const p of list) {
              const opt = document.createElement('option');
              opt.value = p.name; opt.textContent = p.name;
              camPresetSelect.appendChild(opt);
            }
          }
        } catch (_) {}
      });
    }
    // Floor plane is always hidden now
    if (floorMesh) floorMesh.visible = false;

    // Vertical offset UI removed; keep defaults and programmatic snapping only
    yOffsetRange = null; yOffsetValue = null; nudgeDownBtn = null; nudgeUpBtn = null; saveScenarioOffsetBtn = null;

    // Remove position readouts and manual nudge controls (no UI)
    function updateReadoutsLocal() { /* removed UI */ }
    updateReadouts = updateReadoutsLocal;
    updateReadoutsLocal();

    // Regions and decal UI removed

    // Resize handling
    window.addEventListener('resize', onWindowResize);

    // Start loop
    requestAnimationFrame(animate);
  }

  // Zoom helper moved to camera.js

  // ===== Resize & Animation Loop =====
  function onWindowResize() {
    const { width, height } = getViewportSize();
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    composer?.setSize(width, height);
  }

  function animate(nowMs) {

    if (controls) {
      controls.update();
      // Enforce distance clamp after control updates
      clampCameraDistance(camera, controls);
    }
    // Per-scenario lights update hook
    try { lightsManager && lightsManager.update(0.016, modelRoot); } catch (_) {}
    if (cinematic && cinematic.isEnabled()) {
      // Approx delta since requestAnimationFrame gives timestamp in ms
      cinematic.update(0.016, modelRoot);
      composer.render();
    } else {
      renderer.render(scene, camera);
    }
    requestAnimationFrame(animate);
  }

  // ===== Model: Loading & Lifecycle =====
  function loadGltfModel(path, onProgress, onDone) {
    const loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath('https://unpkg.com/three@0.160.0/examples/jsm/libs/draco/');
    loader.setDRACOLoader(draco);
    loader.setMeshoptDecoder(MeshoptDecoder);

    console.log('[loader] load', path);
    loader.load(
      path,
      (gltf) => {
        const root = gltf.scene || gltf.scenes[0];
        if (!root) { onProgress?.(100); onDone?.(); return; }
        normalizeAndAddToScene(root);
        // Update control limits based on model size
        updateControlDistanceLimitsFromModel();
        // Apply materials/textures per model
        try {
          const isKosha = (typeof path === 'string' && path.includes('assets/models/kosha4/'));
          removeDefaultTextureMapsFromModel(!isKosha ? true : false);
          applyColorToModel('#ffffff');
          if (lineColorInputEl) applyLineColor(lineColorInputEl.value || '#ffffff');
          if (modelColorInputEl) applyModelTargetColor(modelColorInputEl.value || '#ffffff');
          applyLogoRegionsFromUI();
        } catch (e) { /* non-fatal */ }
        try {
          const names = getAllMaterialNames();
          console.log('[materials] model materials:', names);
        } catch (_) {}
        try { refreshLogosControlsAvailability && refreshLogosControlsAvailability(); } catch (_) {}
        
        // LOGOS: Log instance mapping após modelo carregado/ready
        try { logosLogInstanceMap(modelRoot); } catch (_) {}
        
        // LOGOS: Bootstrap - aplicar defaults após primeiro carregamento
        setTimeout(() => { try { applyDefaultsForLogos(modelRoot); } catch(_){} }, 100);
        
        frameObject3D(modelRoot);
        
        onProgress?.(85);
        // After model is ready, load default scenario if any
        if (currentScenarioKey && currentScenarioKey !== 'none') {
          setScenarioManaged(currentScenarioKey, onProgress, onDone);
        } else {
          onProgress?.(100); onDone?.();
        }
      },
      (ev) => {
        if (ev && ev.total) {
          const pct = Math.round((ev.loaded / ev.total) * 100);
          onProgress?.(Math.min(80, Math.round(pct * 0.8)));
        } else {
          onProgress?.(50);
        }
      },
      (err) => { console.error('[loader] error', err); onProgress?.(100); onDone?.(); }
    );
  }

  function disposeModel() {
    if (!modelRoot) return;
    scene.remove(modelRoot);
    modelRoot.traverse((child) => {
      if (child.isMesh) {
        if (child.geometry) child.geometry.dispose();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        for (const m of materials) m?.dispose?.();
      }
    });
    modelRoot = null;
  }

  function switchModel(url) {
    if (!url) return;
    // Reset offsets when changing model
    userYOffset = 0;
    modelYOffsetBase = 0;
    updateYOffsetUI();

    // Show loading UI
    overlay && overlay.show();
    overlay && overlay.setProgress(0);

    // Dispose previous model
    disposeModel();

    // Choose proper loader based on file extension
    const lower = url.toLowerCase();
    const isGlb = lower.endsWith('.glb');
    const isGltf = lower.endsWith('.gltf');
    const progress = (p) => overlay && overlay.setProgress(Math.round(p));
    const done = () => overlay && overlay.hide();

    if (isGlb || isGltf) {
      loadGltfModel(url, progress, done);
    } else {
      console.warn('[switchModel] unsupported format for', url);
      done();
    }
  }

  // Remove default base color textures so the model shows solid colors
  const removeDefaultTextureMapsFromModel = (remove = true) => removeDefaultTextureMapsFromModelExt(modelRoot, remove);
  

  // Apply color only to the material named exactly 'LINHAS • Linha'
  function applyLineColor(hex) { if (!modelRoot) return; applyLineColorExt(modelRoot, hex); }

  // Apply solid color to all materials
  function applyColorToModel(hex) { applyColorToModelExt(modelRoot, hex); }

  // Apply color to the specific target (CUBE001 - Material.002)
  function applyModelTargetColor(hex) { applyColorToSpecificTargetExt(modelRoot, hex); }

  // Expose helpers to work with role-based materials system
  function getAllMaterialNames() { if (!modelRoot) return []; return getAllMaterialNamesExt(modelRoot); }
  function setMaterialRoleMatchers(map) { setMaterialRoleMatchersExt(map); }
  function applyTextureToRole(roleKey, textureUrl, options) { if (!modelRoot) return; applyTextureToRoleExt(modelRoot, roleKey, textureUrl, options || {}); }
  function applyColorToRole(roleKey, hex, options) { if (!modelRoot) return; applyColorToRoleExt(modelRoot, roleKey, hex, options || {}); }

  

  function applyLogoRegionsFromUI() { /* UI removed */ }

  // ===== Model: Normalize & Camera Bounds =====
  function normalizeAndAddToScene(root) {
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const wrapper = new THREE.Group();
    // Move the model so its center is at the origin
    root.position.sub(center);
    wrapper.add(root);

    // Scale to a comfortable size
    const maxSize = Math.max(size.x, size.y, size.z) || 1;
    const targetSize = 3.0; // fit within ~3 units (increased scale from 2.0 -> 3.0 = 1.5x)
    const scale = targetSize / maxSize;
    wrapper.scale.setScalar(scale);

    // Initial display rotation: 45 degrees around Y
    try { wrapper.rotation.y = THREE.MathUtils.degToRad(45); } catch (_) {}

    scene.add(wrapper);
    modelRoot = wrapper;

    updateFloorUnderModel();
    // Provisional placement to reduce visible snap when scenario loads
    try { applyProvisionalScenarioPose(); } catch (_) {}
  }

  // Compute reasonable min/max zoom based on model radius
  function updateControlDistanceLimitsFromModel() {
    if (!controls || !modelRoot) return;
    const box = new THREE.Box3().setFromObject(modelRoot);
    const size = new THREE.Vector3();
    box.getSize(size);
    const radius = Math.max(size.x, size.y, size.z) * 0.5 || 1;
    controls.minDistance = Math.max(0.15, radius * 0.3);
    controls.maxDistance = Math.max(5, radius * 8);
  }

  // ===== Camera Helpers =====
  function frameObject3D(object3D) {
    frameObject(camera, controls, object3D);
  }

  // Choose a pleasant front-biased 3/4 camera view on the model
  function setPleasantCameraView() {
    if (!modelRoot) return;
    setPleasantView(camera, controls, modelRoot);
  }

  // Keep orbit controls target aligned with the model center
  function updateControlsTargetFromModel(precomputedCenter) {
    if (!controls || !modelRoot) return;
    if (precomputedCenter) {
      controls.target.copy(precomputedCenter);
    controls.update();
    } else {
      updateControlsTargetFromObject(camera, controls, modelRoot);
    }
  }

  

  // ===== Floor Helpers =====
  function getFloorYAt(x, z) {
    const raycaster = new THREE.Raycaster();
    const origin = new THREE.Vector3(x, 10000, z);
    const dir = new THREE.Vector3(0, -1, 0);
    raycaster.set(origin, dir);
    const candidates = [];
    const scenarioRoot = scenarioManager?.getScenarioRoot?.();
    if (floorMesh && floorMesh.visible) candidates.push(floorMesh);
    const hits = candidates.length ? raycaster.intersectObjects(candidates, true) : [];
    if (hits && hits.length) return hits[0].point.y;
    return 0;
  }

  

  function updateFloorUnderModel() { if (!modelRoot) return; floorMesh = createOrUpdateFloor(scene, modelRoot, floorMesh); }


  function snapModelToScenarioFloor() {
    if (!modelRoot) return;
    const key = scenarioManager?.getCurrentScenarioKey?.();
    const scenarioRoot = scenarioManager?.getScenarioRoot?.();
    const res = snapModelToScenarioFloorUtil(modelRoot, key, scenarioRoot, floorMesh);
    modelYOffsetBase = res.modelYOffsetBase || 0;
    updateFloorUnderModel();
    frameObject3D(modelRoot);
    updateControlsTargetFromModel();
  }

  // Removed per-region coloring; keep global color only

  // ===== Utilities =====
  function getViewportSize() {
    const rect = viewportEl.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    return { width, height };
  }

  // ===== Scenario Management =====
  function setScenarioManaged(key, onProgress, onDone) {
    currentScenarioKey = key || 'none';
    userYOffset = 0;
    modelYOffsetBase = 0;
    updateYOffsetUI();
    scenarioManager.setScenario(key, {
      onProgress: (p) => {
        overlay && overlay.setProgress(p);
        onProgress?.(p);
      },
      onDone: () => {
        try {
            // After scenario is ready, whiten walls to white for a clean look
            try {
              const scenarioRoot = scenarioManager?.getScenarioRoot?.();
              if (lightsManager && scenarioRoot) {
                lightsManager.whitenWalls(scenarioRoot, 0xffffff);
              }
            } catch (_) {}
            if (currentScenarioKey === 'modern_garage' && modelRoot) {
              modelRoot.position.set(0, 0.3931981944627143, 0);
              modelYOffsetBase = modelRoot.position.y;
            }
            // Ensure starting above floor for the new art gallery scenario, then snap
            if ((currentScenarioKey === 'garageshowroom_vr_ready' || currentScenarioKey === 'vr_moody_lighting_art_gallery_scene_06') && modelRoot) {
              try { modelRoot.position.set(0, 4.0, 0); modelYOffsetBase = modelRoot.position.y; } catch (_) {}
            }
            if ((currentScenarioKey === 'sci-fi_garage' || currentScenarioKey === 'garageshowroom_vr_ready' || currentScenarioKey === 'vr_moody_lighting_art_gallery_scene_06') && modelRoot) {
              // Rely on precise floor snapping only; avoid hardcoded baseline to prevent pop-in.
              setTimeout(() => { try { snapModelToScenarioFloor(); } catch (_) {} }, 350);
            } else {
              snapModelToScenarioFloor();
            }
            applyVerticalOffset();
            // Ensure mid-height panels are cleared (none requested)
            try { if (lightsManager && lightsManager.clearMidHeightPanels) lightsManager.clearMidHeightPanels(); } catch (_) {}
            setPleasantCameraView();
          } catch (e) {
            console.error('[scenario] finalize error', e);
          } finally {
            onDone?.();
          }
      },
    });
  }

  // Set an approximate Y pose before the scenario finishes loading to reduce pop-in
  function applyProvisionalScenarioPose() {
    if (!modelRoot) return;
    const scenarioKey = currentScenarioKey;
    if (scenarioKey === 'vr_moody_lighting_art_gallery_scene_06') {
      // Start well above the likely floor so the downward ray will always hit
      const provisionalY = 4.2;
      modelRoot.position.set(0, provisionalY, 0);
      updateFloorUnderModel();
      updateControlsTargetFromModel();
    } else if (scenarioKey === 'sci-fi_garage') {
      // Legacy provisional pose tuned for sci-fi
      modelRoot.position.set(0, -0.535, 0);
      updateFloorUnderModel();
      updateControlsTargetFromModel();
    } else if (scenarioKey === 'garageshowroom_vr_ready') {
      // Start high for VR showroom to ensure snap ray hits scenario floor/platform
      modelRoot.position.set(0, 4.2, 0);
      updateFloorUnderModel();
      updateControlsTargetFromModel();
    }
  }

  // ===== Bootstrapping =====
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
})();


