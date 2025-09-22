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
import { applyColorToModel as applyColorToModelExt, applyColorToSpecificTarget as applyColorToSpecificTargetExt, disableMapForSpecificTarget as disableMapForSpecificTargetExt, applyLineColor as applyLineColorExt } from './materials/core.js';
import { removeDefaultTextureMapsFromModel as removeDefaultTextureMapsFromModelExt } from './materials/baked.js';
import { applyLogoRegionsFromUI as applyLogoRegionsFromUIExt, getAllMaterialNames as getAllMaterialNamesExt, setMaterialRoleMatchers as setMaterialRoleMatchersExt, applyTextureToRole as applyTextureToRoleExt, applyColorToRole as applyColorToRoleExt, getRoleInstanceCount as getRoleInstanceCountExt, setRoleInstanceVisible as setRoleInstanceVisibleExt, rotateRoleInstance as rotateRoleInstanceExt, setLogoTextureRotation, getLogoTextureRotation, resetLogoTextureRotation, applyDefaultLogoRotations, getDefaultRotation, applyTextureToLogoInstance, clearTextureFromLogoInstance } from './materials/regions.js';

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
  /** @type {HTMLElement | null} */
  let scenarioButtons = null;
  /** @type {HTMLElement | null} */
  let modelButtons = null;
  
  // Removed global model color control
  /** @type {any | null} */
  let controls = null;
  /** @type {THREE.Mesh | null} */
  let floorMesh = null;
  // Scenario manager
  let scenarioManager = null;
  // Lights manager (widen scope for scenario hooks)
  let lightsManager = null;
  // Postprocess state
  let composer = null; // EffectComposer
  let renderPass = null; // RenderPass
  let bokehPass = null; // BokehPass
  const defaultSceneBackground = 0x0b1220;
  const noScenarioSceneBackground = 0xe5e7eb;
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
  let currentScenarioKey = 'none';
  let userYOffset = 0; // live override via UI
  let modelYOffsetBase = 0; // baseline after snapping to scenario floor
  // Loading overlay API
  let overlay = null;
  // Expose readouts updater to outer scope (avoid ReferenceError)
  /** @type {null | (() => void)} */
  let updateReadouts = null;

  // Texture toggles UI removed
  /** @type {HTMLInputElement | HTMLSelectElement | null} */
  let lineColorInputEl = null;
  /** @type {HTMLElement | null} */
  let lineColorSwatches = null;
  /** @type {HTMLSelectElement | null} */
  let capaColorSelectEl = null;
  /** @type {HTMLElement | null} */
  let capaColorSwatches = null;
  /** @type {HTMLInputElement | null} */
  let modelColorInputEl = null;
  /** @type {HTMLButtonElement | null} */
  let toggleLogosControlsBtn = null;

  // Logo regions UI removed; single PNG upload replaces it
  /** @type {HTMLInputElement | null} */
  let pngUploadEl = null;
  /** @type {HTMLInputElement | null} */
  let logoColorEl = null;
  // Per-instance UI elements
  /** @type {HTMLInputElement | null} */
  let logoInst0Visible = null, logoInst1Visible = null, logoInst2Visible = null, logoInst3Visible = null;
  let logoUserInst0Visible = null, logoUserInst1Visible = null, logoUserInst2Visible = null, logoUserInst3Visible = null;
  /** @type {HTMLButtonElement | null} */
  let logoInst0RotCCW = null, logoInst0RotCW = null, logoInst1RotCCW = null, logoInst1RotCW = null, logoInst2RotCCW = null, logoInst2RotCW = null, logoInst3RotCCW = null, logoInst3RotCW = null;

  // Texture rotation sliders and value displays for each instance
  /** @type {HTMLInputElement | null} */
  let logoInst0RotSlider = null, logoInst1RotSlider = null, logoInst2RotSlider = null, logoInst3RotSlider = null;
  /** @type {HTMLSpanElement | null} */
  let logoInst0RotValue = null, logoInst1RotValue = null, logoInst2RotValue = null, logoInst3RotValue = null;

  const logoInstanceLabels = ['Lateral - motorista', 'Lateral - passageiro', 'Traseira', 'Dianteira'];
  const logoImageLibrary = [];
  const logoInstanceAssignments = [null, null, null, null];
  let logoImageListEl = null;
  /** @type {HTMLSelectElement[]} */
  let logoAssignmentSelects = [];
  let logoImageIdCounter = 0;
  
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
    
    const toggleDofBtn = /** @type {HTMLButtonElement} */ (document.getElementById('toggleDofBtn'));
    const camPresetNameInput = /** @type {HTMLInputElement} */ (document.getElementById('camPresetNameInput'));
    const camPresetSelect = /** @type {HTMLSelectElement} */ (document.getElementById('camPresetSelect'));
    const saveCamPresetBtn = /** @type {HTMLButtonElement} */ (document.getElementById('saveCamPresetBtn'));
    const loadCamPresetBtn = /** @type {HTMLButtonElement} */ (document.getElementById('loadCamPresetBtn'));
    const deleteCamPresetBtn = /** @type {HTMLButtonElement} */ (document.getElementById('deleteCamPresetBtn'));
    const exportCamPresetBtn = /** @type {HTMLButtonElement} */ (document.getElementById('exportCamPresetBtn'));
    const importCamPresetBtn = /** @type {HTMLButtonElement} */ (document.getElementById('importCamPresetBtn'));
    const importCamPresetFile = /** @type {HTMLInputElement} */ (document.getElementById('importCamPresetFile'));

    scenarioButtons = document.getElementById('scenarioButtons');
    const activeScenarioBtn = scenarioButtons?.querySelector('button.seg-btn.active');
    const preselectedScenarioKey = activeScenarioBtn?.getAttribute('data-key');
    if (preselectedScenarioKey) currentScenarioKey = preselectedScenarioKey;
    
    
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
    applySceneThemeForScenario(currentScenarioKey);

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

    const captureCameraState = () => ({
      position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      target: { x: controls.target.x, y: controls.target.y, z: controls.target.z },
      fov: camera.fov,
    });
    const applyCameraState = (state) => {
      if (!state) return;
      if (state.position) camera.position.set(state.position.x, state.position.y, state.position.z);
      if (typeof state.fov === 'number') { camera.fov = state.fov; camera.updateProjectionMatrix(); }
      if (state.target) { controls.target.set(state.target.x, state.target.y, state.target.z); controls.update(); }
    };

    // ===== Camera Admin (presets) =====
    function cameraStorageKey() { return `cam-presets:${currentScenarioKey || 'none'}`; }
    function readCamPresets() { try { return JSON.parse(localStorage.getItem(cameraStorageKey()) || '[]'); } catch { return []; } }
    function writeCamPresets(list) { try { localStorage.setItem(cameraStorageKey(), JSON.stringify(list)); } catch (_) {} }

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
      const name = (camPresetNameInput?.value || '').trim() || `camera-${Date.now()}`;
      const preset = { name, camera: captureCameraState() };
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
      applyCameraState(p.camera || null);
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
          const name = (preset.name && String(preset.name).trim()) || nameFromFile || `camera-${Date.now()}`;
          const normalized = { name, camera: preset.camera || null };
          const list = readCamPresets();
          const idx = list.findIndex((p) => p.name === normalized.name);
          if (idx >= 0) list[idx] = normalized; else list.push(normalized);
          writeCamPresets(list); refreshCamPresetSelect();
          if (camPresetSelect) camPresetSelect.value = normalized.name;
          applyCameraState(normalized.camera || null);
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

      if (savePresetBtn) savePresetBtn.addEventListener('click', () => {
        const name = (presetNameInput?.value || '').trim() || `preset-${Date.now()}`;
        const preset = { name, lights: lightsManager.serializeLights(), camera: captureCameraState() };
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
        applyCameraState(p.camera || null);
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
            try { applyCameraState(normalized.camera || null); } catch (_) {}
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

    // Main lights only; keep consistent lighting

    // Loading overlay
    overlay = createLoadingOverlay();
    overlay.show();
    overlay.setProgress(0);

    // Load model (from segmented buttons if present)
    modelButtons = document.getElementById('modelButtons');
    lineColorInputEl = /** @type {HTMLInputElement | HTMLSelectElement} */ (null);
    capaColorSelectEl = /** @type {HTMLSelectElement} */ (null);
    lineColorSwatches = document.getElementById('lineColorSwatches');
    capaColorSwatches = document.getElementById('capaColorSwatches');
    modelColorInputEl = /** @type {HTMLInputElement} */ (document.getElementById('modelColorControl'));
    // PNG upload control
    pngUploadEl = /** @type {HTMLInputElement} */ (document.getElementById('pngUpload'));
    logoColorEl = /** @type {HTMLInputElement} */ (null);
    toggleLogosControlsBtn = /** @type {HTMLButtonElement} */ (document.getElementById('toggleLogosControlsBtn'));
    // Per-instance refs
    logoInst0Visible = /** @type {HTMLInputElement} */ (document.getElementById('logoInst0Visible'));
    logoInst1Visible = /** @type {HTMLInputElement} */ (document.getElementById('logoInst1Visible'));
    logoInst2Visible = /** @type {HTMLInputElement} */ (document.getElementById('logoInst2Visible'));
    logoInst3Visible = /** @type {HTMLInputElement} */ (document.getElementById('logoInst3Visible'));
    logoUserInst0Visible = /** @type {HTMLInputElement} */ (document.getElementById('logoUserInst0Visible'));
    logoUserInst1Visible = /** @type {HTMLInputElement} */ (document.getElementById('logoUserInst1Visible'));
    logoUserInst2Visible = /** @type {HTMLInputElement} */ (document.getElementById('logoUserInst2Visible'));
    logoUserInst3Visible = /** @type {HTMLInputElement} */ (document.getElementById('logoUserInst3Visible'));
    logoInst0RotCCW = /** @type {HTMLButtonElement} */ (document.getElementById('logoInst0RotCCW'));
    logoInst0RotCW  = /** @type {HTMLButtonElement} */ (document.getElementById('logoInst0RotCW'));
    logoInst1RotCCW = /** @type {HTMLButtonElement} */ (document.getElementById('logoInst1RotCCW'));
    logoInst1RotCW  = /** @type {HTMLButtonElement} */ (document.getElementById('logoInst1RotCW'));
    logoInst2RotCCW = /** @type {HTMLButtonElement} */ (document.getElementById('logoInst2RotCCW'));
    logoInst2RotCW  = /** @type {HTMLButtonElement} */ (document.getElementById('logoInst2RotCW'));
    logoInst3RotCCW = /** @type {HTMLButtonElement} */ (document.getElementById('logoInst3RotCCW'));
    logoInst3RotCW  = /** @type {HTMLButtonElement} */ (document.getElementById('logoInst3RotCW'));

    // Texture rotation sliders
    logoInst0RotSlider = /** @type {HTMLInputElement} */ (document.getElementById('logoInst0Rot'));
    logoInst1RotSlider = /** @type {HTMLInputElement} */ (document.getElementById('logoInst1Rot'));
    logoInst2RotSlider = /** @type {HTMLInputElement} */ (document.getElementById('logoInst2Rot'));
    logoInst3RotSlider = /** @type {HTMLInputElement} */ (document.getElementById('logoInst3Rot'));

    // Value display spans
    logoInst0RotValue = /** @type {HTMLSpanElement} */ (document.getElementById('logoInst0RotValue'));
    logoInst1RotValue = /** @type {HTMLSpanElement} */ (document.getElementById('logoInst1RotValue'));
    logoInst2RotValue = /** @type {HTMLSpanElement} */ (document.getElementById('logoInst2RotValue'));
    logoInst3RotValue = /** @type {HTMLSpanElement} */ (document.getElementById('logoInst3RotValue'));

    logoImageListEl = document.getElementById('logoImageList');
    logoAssignmentSelects = Array.from(document.querySelectorAll('.logo-assignment-select'));
    logoAssignmentSelects.forEach((select) => {
      const idx = Number(select.getAttribute('data-instance') || '0');
      select.addEventListener('change', () => handleLogoAssignmentChange(idx, select.value));
    });
    rebuildLogoImageUI();

    const initialModelUrl = (document.querySelector('#modelButtons .seg-btn.active')?.getAttribute('data-url')) || './assets/models/kosha4/teste14.glb';
    console.log('[loader] loading', initialModelUrl);
    loadGltfModel(initialModelUrl, (p) => overlay.setProgress(p), () => overlay.hide());

    // UI events
    // Global model color UI removed
    // Bind scenario segmented buttons
    if (scenarioButtons) {
      scenarioButtons.addEventListener('click', (ev) => {
        const target = ev.target;
        if (!(target instanceof HTMLElement)) return;
        const btn = target.closest('button.seg-btn');
        if (!btn) return;
        const key = btn.getAttribute('data-key');
        if (!key) return;
        Array.from(scenarioButtons.querySelectorAll('button.seg-btn')).forEach((b) => { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
        btn.classList.add('active'); btn.setAttribute('aria-pressed', 'true');
        setScenarioManaged(key);
        // after scenario changes, keep orbit target centered on model
        if (modelRoot) updateControlsTargetFromObject(camera, controls, modelRoot);
        // Rebuild admin UI for lights (mirrors previous behavior)
        try {
          lightsManager && lightsManager.applyScenarioLights(key);
          const lightsAdminEl = document.getElementById('lightsAdmin');
          if (lightsAdminEl) {
            try { lightsManager.addAutoRotatingDirectional('autoRotX', { color: 0xffffff, intensity: 10, speedDegPerSec: 25, radiusFactor: 1.2, axis: 'x', phaseDeg: 0 }); } catch (_) {}
            try { lightsManager.addAutoRotatingDirectional('autoRotY', { color: 0xffffff, intensity: 10, speedDegPerSec: -20, radiusFactor: 1.4, axis: 'y', phaseDeg: 120 }); } catch (_) {}
            try { lightsManager.addAutoRotatingDirectional('autoRotX2', { color: 0xffffff, intensity: 10, speedDegPerSec: 15, radiusFactor: 0.9, axis: 'x', phaseDeg: 240 }); } catch (_) {}
            lightsManager.buildLightsAdminUI(lightsAdminEl);
          }
        } catch (_) {}
      });
    }
    // Bind model segmented buttons
    if (modelButtons) {
      modelButtons.addEventListener('click', (ev) => {
        const target = ev.target;
        if (!(target instanceof HTMLElement)) return;
        const btn = target.closest('button.seg-btn');
        if (!btn) return;
        const url = btn.getAttribute('data-url');
        if (!url) return;
        Array.from(modelButtons.querySelectorAll('button.seg-btn')).forEach((b) => { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
        btn.classList.add('active'); btn.setAttribute('aria-pressed', 'true');
        switchModel(url);
      });
    }

    // Bind swatch clicks (event delegation)
    const bindSwatches = (containerId, onHex) => {
      const el = document.getElementById(containerId);
      if (!el) return;
      el.addEventListener('click', (ev) => {
        const target = ev.target;
        if (!(target instanceof HTMLElement)) return;
        const btn = target.closest('button.swatch-btn');
        if (!btn) return;
        const hex = btn.getAttribute('data-hex') || '#ffffff';
        onHex(hex);
        // Update active state
        Array.from(el.querySelectorAll('button.swatch-btn')).forEach((b) => {
          b.classList.remove('active');
          b.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
      });
    };
    bindSwatches('lineColorSwatches', (hex) => applyLineColor(hex));
    bindSwatches('capaColorSwatches', (hex) => applyColorToRole('capa', hex, { disableMap: true }));
    // Model color input removed

    // Logo color input removed
    if (toggleLogosControlsBtn) {
      const logosControls = document.getElementById('logosControls');
      const updateLabel = () => {
        if (!logosControls || !toggleLogosControlsBtn) return;
        const isHidden = logosControls.style.display === 'none';
        toggleLogosControlsBtn.textContent = isHidden ? 'Mostrar controles' : 'Ocultar controles';
      };
      toggleLogosControlsBtn.addEventListener('click', () => {
        const logosControls = document.getElementById('logosControls');
        if (!logosControls) return;
        const isHidden = logosControls.style.display === 'none';
        logosControls.style.display = isHidden ? '' : 'none';
        updateLabel();
      });
      updateLabel();
    }

    // Guard: if fewer than 4 instances, disable extra controls
    refreshLogosControlsAvailability = function () {
      try {
        const count = getRoleInstanceCountExt(modelRoot, 'logos');
        if (!count || count <= 0) return; // don't disable controls before model is ready
        const setEnabled = (el, on) => { if (!el) return; el.disabled = !on; };
        
        // Instance 0 controls
        setEnabled(logoInst0Visible, count > 0);
        setEnabled(logoUserInst0Visible, count > 0);
        setEnabled(logoInst0RotCCW, count > 0); setEnabled(logoInst0RotCW, count > 0);
        setEnabled(logoInst0RotSlider, count > 0);
        
        // Instance 1 controls
        setEnabled(logoInst1Visible, count > 1);
        setEnabled(logoUserInst1Visible, count > 1);
        setEnabled(logoInst1RotCCW, count > 1); setEnabled(logoInst1RotCW, count > 1);
        setEnabled(logoInst1RotSlider, count > 1);
        
        // Instance 2 controls
        setEnabled(logoInst2Visible, count > 2);
        setEnabled(logoUserInst2Visible, count > 2);
        setEnabled(logoInst2RotCCW, count > 2); setEnabled(logoInst2RotCW, count > 2);
        setEnabled(logoInst2RotSlider, count > 2);
        
        // Instance 3 controls
        setEnabled(logoInst3Visible, count > 3);
        setEnabled(logoUserInst3Visible, count > 3);
        setEnabled(logoInst3RotCCW, count > 3); setEnabled(logoInst3RotCW, count > 3);
        setEnabled(logoInst3RotSlider, count > 3);
      } catch (_) {}
      applyLogoVisibilityFromUI();
      applyAllLogoAssignments();
    };

    const bindLogoInstanceControls = (idx, visibilityCheckboxes, btnCCW, btnCW, rotSlider, rotValue) => {
      const validCheckboxes = visibilityCheckboxes.filter(Boolean);

      const syncCheckboxes = (value, source) => {
        for (const cb of validCheckboxes) {
          if (cb === source) continue;
          cb.checked = value;
        }
      };

      const setVisible = (on, source) => {
        const next = !!on;
        syncCheckboxes(next, source);
        if (modelRoot) setRoleInstanceVisibleExt(modelRoot, 'logos', idx, next);
      };

      const rotate = (qt) => {
        rotateRoleInstanceExt(modelRoot, 'logos', idx, qt);
      };

      for (const cb of validCheckboxes) {
        cb.addEventListener('change', () => setVisible(cb.checked, cb));
      }

      const initialCheckbox = validCheckboxes[0];
      if (initialCheckbox) setVisible(initialCheckbox.checked, initialCheckbox);

      // Use 180° rotation steps to avoid UV-fit distortions that appear at 90°
      if (btnCCW) btnCCW.addEventListener('click', () => rotate(-2));
      if (btnCW)  btnCW.addEventListener('click',  () => rotate(+2));

      // Texture rotation slider event handler
      if (rotSlider && rotValue) {
        rotSlider.addEventListener('input', () => {
          const degrees = parseInt(rotSlider.value, 10);
          rotValue.textContent = `${degrees}°`;
          setLogoTextureRotation(modelRoot, idx, degrees);
        });
        
        // Initialize display with default rotation for this instance
        const defaultRotation = getDefaultRotation(idx);
        rotSlider.value = String(defaultRotation);
        rotValue.textContent = `${defaultRotation}°`;
      }
    };
    bindLogoInstanceControls(0, [logoInst0Visible, logoUserInst0Visible], logoInst0RotCCW, logoInst0RotCW, logoInst0RotSlider, logoInst0RotValue);
    bindLogoInstanceControls(1, [logoInst1Visible, logoUserInst1Visible], logoInst1RotCCW, logoInst1RotCW, logoInst1RotSlider, logoInst1RotValue);
    bindLogoInstanceControls(2, [logoInst2Visible, logoUserInst2Visible], logoInst2RotCCW, logoInst2RotCW, logoInst2RotSlider, logoInst2RotValue);
    bindLogoInstanceControls(3, [logoInst3Visible, logoUserInst3Visible], logoInst3RotCCW, logoInst3RotCW, logoInst3RotSlider, logoInst3RotValue);
    applyLogoVisibilityFromUI();

    
    // Reapply saved texture rotations after PNG upload (includes default rotations)
    function reapplyLogoRotations() {
      if (!modelRoot) return;
      try {
        // Apply rotations for all instances (saved or default via getLogoTextureRotation)
        for (let i = 0; i < 4; i++) {
          const rotationToApply = getLogoTextureRotation(modelRoot, i);
          
          if (rotationToApply !== 0) {
            setLogoTextureRotation(modelRoot, i, rotationToApply);
            console.log(`[LOGOS] Applied rotation ${rotationToApply}° to instance ${i}`);
          }
        }
        
        // Update UI sliders to reflect current values
        const updateSlider = (slider, valueEl, instanceIndex) => {
          if (slider && valueEl) {
            const currentRotation = getLogoTextureRotation(modelRoot, instanceIndex);
            slider.value = String(currentRotation);
            valueEl.textContent = `${currentRotation}°`;
          }
        };
        
        updateSlider(logoInst0RotSlider, logoInst0RotValue, 0);
        updateSlider(logoInst1RotSlider, logoInst1RotValue, 1);
        updateSlider(logoInst2RotSlider, logoInst2RotValue, 2);
        updateSlider(logoInst3RotSlider, logoInst3RotValue, 3);
      } catch (e) {
        console.warn('[LOGOS] Error reapplying rotations:', e);
      }
    }
    
    if (pngUploadEl) {
      pngUploadEl.addEventListener('change', () => {
        const files = Array.from(pngUploadEl.files || []);
        addLogoImages(files);
        try { pngUploadEl.value = ''; } catch (_) {}
      });
    }
    

    // Light controls are handled within lights.js

    // Scenario controls migrated to segmented buttons above
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
    if (composer) {
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
          // Initialize colors from active swatches
          try {
            const lineActive = document.querySelector('#lineColorSwatches .swatch-btn.active');
            const lineHex = lineActive?.getAttribute('data-hex') || '#666666';
            applyLineColor(lineHex);
          } catch (_) {}
          try {
            const capaActive = document.querySelector('#capaColorSwatches .swatch-btn.active');
            const capaHex = capaActive?.getAttribute('data-hex') || '#666666';
            applyColorToRole('capa', capaHex, { disableMap: true });
          } catch (_) {}
          // Model color input removed
          applyLogoRegionsFromUI();
        } catch (e) { /* non-fatal */ }
        try {
          const names = getAllMaterialNames();
          console.log('[materials] model materials:', names);
        } catch (_) {}
        try { refreshLogosControlsAvailability && refreshLogosControlsAvailability(); } catch (_) {}
        try { applyAllLogoAssignments(); } catch (_) {}

        frameObject3D(modelRoot);

        onProgress?.(85);
        // After model is ready, load default scenario if any
        if (currentScenarioKey) {
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

  function applyLogoVisibilityFromUI() {
    if (!modelRoot) return;
    const groups = [
      [logoInst0Visible, logoUserInst0Visible],
      [logoInst1Visible, logoUserInst1Visible],
      [logoInst2Visible, logoUserInst2Visible],
      [logoInst3Visible, logoUserInst3Visible],
    ];
    groups.forEach((group, idx) => {
      const activeCheckbox = group.find((cb) => cb);
      if (!activeCheckbox) return;
      setRoleInstanceVisibleExt(modelRoot, 'logos', idx, !!activeCheckbox.checked);
    });
  }

  function findLogoImageById(id) {
    return logoImageLibrary.find((img) => img.id === id) || null;
  }

  function rebuildLogoImageUI() {
    if (logoImageListEl) {
      logoImageListEl.innerHTML = '';
      if (!logoImageLibrary.length) {
        const msg = document.createElement('p');
        msg.className = 'logo-image-empty';
        msg.textContent = 'Nenhuma imagem carregada.';
        logoImageListEl.appendChild(msg);
      } else {
        for (const img of logoImageLibrary) {
          const card = document.createElement('div');
          card.className = 'logo-image-card';
          const thumb = document.createElement('div');
          thumb.className = 'logo-image-thumb';
          thumb.style.backgroundImage = `url(${img.url})`;
          const name = document.createElement('span');
          name.className = 'logo-image-name';
          name.textContent = img.name || 'imagem.png';
          const removeBtn = document.createElement('button');
          removeBtn.type = 'button';
          removeBtn.className = 'logo-image-remove';
          removeBtn.textContent = 'Remover';
          removeBtn.addEventListener('click', () => removeLogoImage(img.id));
          card.appendChild(thumb);
          card.appendChild(name);
          card.appendChild(removeBtn);
          logoImageListEl.appendChild(card);
        }
      }
    }

    logoAssignmentSelects.forEach((select) => {
      const idx = Number(select.getAttribute('data-instance') || '0');
      const current = logoInstanceAssignments[idx] || '';
      select.innerHTML = '';
      const noneOpt = document.createElement('option');
      noneOpt.value = '';
      noneOpt.textContent = 'Nenhuma';
      select.appendChild(noneOpt);
      for (const img of logoImageLibrary) {
        const opt = document.createElement('option');
        opt.value = img.id;
        opt.textContent = img.name || 'imagem.png';
        select.appendChild(opt);
      }
      select.value = current;
    });
  }

  function addLogoImages(files) {
    const filtered = files.filter((file) => /png$/i.test(file.name || '') || file.type === 'image/png');
    if (!filtered.length) return;
    for (const file of filtered) {
      const id = `logoImg_${Date.now()}_${logoImageIdCounter++}`;
      const url = URL.createObjectURL(file);
      logoImageLibrary.push({ id, name: file.name || id, url });
    }
    rebuildLogoImageUI();
    applyAllLogoAssignments();
  }

  function removeLogoImage(id) {
    const idx = logoImageLibrary.findIndex((img) => img.id === id);
    if (idx === -1) return;
    const [removed] = logoImageLibrary.splice(idx, 1);
    try { if (removed && removed.url) URL.revokeObjectURL(removed.url); } catch (_) {}
    for (let i = 0; i < logoInstanceAssignments.length; i++) {
      if (logoInstanceAssignments[i] === id) {
        logoInstanceAssignments[i] = null;
        if (modelRoot) clearTextureFromLogoInstance(modelRoot, i);
      }
    }
    rebuildLogoImageUI();
    applyAllLogoAssignments();
  }

  function handleLogoAssignmentChange(instanceIndex, imageId) {
    logoInstanceAssignments[instanceIndex] = imageId || null;
    applyImageAssignment(instanceIndex);
  }

  function applyImageAssignment(instanceIndex) {
    if (!modelRoot) return;
    const imageId = logoInstanceAssignments[instanceIndex];
    if (!imageId) {
      clearTextureFromLogoInstance(modelRoot, instanceIndex);
      setTimeout(() => reapplyLogoRotations(), 100);
      return;
    }
    const img = findLogoImageById(imageId);
    if (!img) return;
    const rotation = getLogoTextureRotation(modelRoot, instanceIndex);
    applyTextureToLogoInstance(modelRoot, instanceIndex, img.url, { anisotropy: 8, flipY: false, rotationDegrees: rotation });
    setTimeout(() => reapplyLogoRotations(), 120);
  }

  function applyAllLogoAssignments() {
    if (!modelRoot) return;
    logoInstanceAssignments.forEach((_, idx) => applyImageAssignment(idx));
  }

  function updateFloorGridVisibility() {
    const grid = floorMesh?.userData?.gridHelper;
    if (!grid) return;
    grid.visible = currentScenarioKey === 'none';
  }

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

  

  function updateFloorUnderModel() {
    if (!modelRoot) return;
    floorMesh = createOrUpdateFloor(scene, modelRoot, floorMesh);
    updateFloorGridVisibility();
  }


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
    applySceneThemeForScenario(currentScenarioKey);
    updateFloorGridVisibility();
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

  function applySceneThemeForScenario(key) {
    if (!scene || !renderer) return;
    if (!key || key === 'none') {
      scene.background = new THREE.Color(noScenarioSceneBackground);
      renderer.setClearColor(noScenarioSceneBackground, 1);
      renderer.toneMappingExposure = 1.25;
    } else {
      scene.background = new THREE.Color(defaultSceneBackground);
      renderer.setClearColor(0x000000, 0);
      renderer.toneMappingExposure = 1.0;
    }
  }

  // ===== Bootstrapping =====
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
})();
