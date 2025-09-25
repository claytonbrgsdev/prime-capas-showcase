import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { setupPostProcessing } from './camera_postfx.js';
import { RGBELoader } from './RGBELoader.js';
import { createOrUpdateFloor, snapModelToScenarioFloor as snapModelToScenarioFloorUtil } from './scene/floor.js';
 
// Deprecated lights are replaced by per-scenario lights manager
import { createLightsManager } from './lights_manager.js';
import { createLoadingOverlay } from './overlay.js';
import { createScenarioManager } from './scenarios.js';
import { initializeCamera, enforceCameraDistanceClamp as clampCameraDistance, updateControlsTargetFromObject, frameObject, setPleasantCameraView as setPleasantView } from './camera.js';
import { applyColorToModel as applyColorToModelExt, applyColorToSpecificTarget as applyColorToSpecificTargetExt, disableMapForSpecificTarget as disableMapForSpecificTargetExt, applyLineColor as applyLineColorExt } from './materials/core.js';
import { removeDefaultTextureMapsFromModel as removeDefaultTextureMapsFromModelExt } from './materials/baked.js';
import { applyLogoRegionsFromUI as applyLogoRegionsFromUIExt, getAllMaterialNames as getAllMaterialNamesExt, setMaterialRoleMatchers as setMaterialRoleMatchersExt, applyTextureToRole as applyTextureToRoleExt, applyColorToRole as applyColorToRoleExt, applyRoughnessToRole as applyRoughnessToRoleExt, getRoleInstanceCount as getRoleInstanceCountExt, setRoleInstanceVisible as setRoleInstanceVisibleExt, rotateRoleInstance as rotateRoleInstanceExt, setLogoTextureRotation, getLogoTextureRotation, resetLogoTextureRotation, applyDefaultLogoRotations as applyDefaultLogoRotationsExt, getDefaultRotation, applyTextureToLogoInstance, clearTextureFromLogoInstance } from './materials/regions.js';

(function () {
  // ===== App State =====
  /** @type {THREE.WebGLRenderer} */
  let renderer;
  /** @type {THREE.PerspectiveCamera} */
  let camera;
  /** @type {THREE.Scene} */
  let scene;
  /** @type {THREE.Mesh | null} */
  let hdrBackgroundMesh = null; // HDR background transformable container
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
  /** @type {Record<string, {x: number, y: number, z: number}>} */
  const scenarioPositionDefaults = {
    none: { x: 0, y: 0, z: 0 },
    modern_garage: { x: 0, y: 0.15, z: 0 },
    office_garage: { x: 0, y: -0.10, z: 0 },
    parking_lot: { x: 0, y: 0.12, z: 0 },
    parking_lot_uf: { x: 0, y: 0.18, z: 0 },
    'sci-fi_garage': { x: 0, y: 0.0, z: 0 },
    'vr_moody_lighting_art_gallery_scene_06': { x: 0, y: 0.0, z: 0 },
    'car-showroom_1': { x: 0, y: 0.65, z: 0 },    // Ajuste conforme necessário
    'car-showroom_2': { x: 0, y: 0.65, z: 0 },    // Ajuste conforme necessário
    'garage': { x: -1, y: 0, z: 0 },            // Ajuste conforme necessário
    'hangar': { x: 0, y: 0.65, z: 0 },            // Ajuste conforme necessário
    'vr_gallery': { x: 0, y: 0.65, z: 0 },        // Ajuste conforme necessário
    'white-room1': { x: 0, y: 0.65, z: 0 },       // Ajuste conforme necessário
    'garageshowroom_vr_ready': { x: 0, y: 0.4, z: 2 }
  };

  /** @type {Record<string, {x: number, y: number, z: number}>} */
  const scenarioRotationDefaults = {
    none: { x: 0, y: 0, z: 0 },
    modern_garage: { x: 0, y: 0, z: 0 },           // Rotações em graus
    office_garage: { x: 0, y: 0, z: 0 },
    parking_lot: { x: 0, y: 0, z: 0 },
    parking_lot_uf: { x: 0, y: 0, z: 0 },
    'sci-fi_garage': { x: 0, y: 45, z: 0 },
    'vr_moody_lighting_art_gallery_scene_06': { x: 0, y: 0, z: 0 },
    'car-showroom_1': { x: 0, y: 0, z: 0 },       // Exemplo: 45 graus no eixo Y
    'car-showroom_2': { x: 0, y: -30, z: 0 },      // Exemplo: -30 graus no eixo Y
    'garage': { x: 0, y: 0, z: 0 },                // Ajuste conforme necessário
    'hangar': { x: 0, y: 90, z: 0 },                // Exemplo: 90 graus no eixo Y
    'vr_gallery': { x: 0, y: 0, z: 0 },            // Ajuste conforme necessário
    'white-room1': { x: 0, y: 0, z: 0 },           // Ajuste conforme necessário
    'garageshowroom_vr_ready': { x: 0, y: 0, z: 0 }
  };

  let currentScenarioKey = 'none';
  let userXOffset = 0; // live override via UI for X position
  let userYOffset = 0; // live override via UI for Y position
  let userZOffset = 0; // live override via UI for Z position
  let userXRotation = 0; // live override via UI for X rotation (degrees)
  let userYRotation = 0; // live override via UI for Y rotation (degrees)
  let userZRotation = 0; // live override via UI for Z rotation (degrees)
  let modelPositionBase = { x: 0, y: 0, z: 0 }; // baseline after snapping to scenario floor
  let modelRotationBase = { x: 0, y: 0, z: 0 }; // baseline after applying scenario rotation
  // Loading overlay API
  let overlay = null;
  // Expose readouts updater to outer scope (avoid ReferenceError)
  /** @type {null | (() => void)} */
  let updateReadouts = null;
  // Animation mixer for scenario animations
  /** @type {THREE.AnimationMixer | null} */
  let scenarioAnimationMixer = null;

  // Environment map cache
  /** @type {THREE.Texture | null} */
  let environmentTexture = null;
  /** @type {Promise<THREE.Texture | null> | null} */
  let environmentLoadPromise = null;

  // Simple lights controls
  /** @type {THREE.AmbientLight | null} */
  let baseAmbientLight = null;
  /** @type {THREE.DirectionalLight | null} */
  let baseDirectionalLight = null;

  // HDR Management
  /** @type {string[]} */
  let availableHDRs = ['none', 'studio.hdr', 'street.hdr', 'hangar.hdr', 'office.hdr', 'dancehall.hdr', 'brwnstudio.hdr', 'satara.hdr', 'plh.hdr', 'zw.hdr', 'scythian_tombs_2_4k.hdr', 'venice_sunset_4k.hdr', 'moonless_golf_4k.hdr', 'msichll.hdr', 'empty_warehouse_01_4k.hdr', 'old_bus_depot_4k.hdr', 'subway_entrance_4k.hdr'];
  /** @type {string} */
  let currentHDR = 'zw.hdr';
  /** @type {boolean} */
  let hdrBackgroundEnabled = false; // HDR como Background 360 ativo
  /** @type {number} */
  let environmentMapIntensity = 0.3; // Intensidade do environment map
  /** @type {number} */
  let hdrBackgroundPositionX = 0.0; // Posição X do HDR background
  /** @type {number} */
  let hdrBackgroundPositionY = 0.0; // Posição Y do HDR background
  /** @type {number} */
  let hdrBackgroundPositionZ = 0.0; // Posição Z do HDR background
  /** @type {number} */
  let hdrBackgroundRotation = -160; // Rotação do HDR background (degrees)
  /** @type {number} */
  let hdrBackgroundScale = 1.0; // Scale do HDR background
  let currentToneMapping = 'ACESFilmicToneMapping'; // Modo de tone mapping

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

  // Tone mapping exposure UI refs
  /** @type {HTMLInputElement | null} */
  let toneMappingExposureSlider = null;
  /** @type {HTMLElement | null} */
  let toneMappingExposureValue = null;

  // HDR Controls UI refs
  /** @type {HTMLSelectElement | null} */
  let hdrSelectEl = null;
  /** @type {HTMLInputElement | null} */
  let hdrBackgroundEnabledEl = null;
  /** @type {HTMLButtonElement | null} */
  let toggleHdrControlsBtn = null;
  /** @type {HTMLInputElement | null} */
  let environmentIntensitySlider = null;
  /** @type {HTMLElement | null} */
  let environmentIntensityValue = null;
  /** @type {HTMLSelectElement | null} */
  let toneMappingSelectEl = null;
  /** @type {HTMLInputElement | null} */
  let hdrBackgroundPositionXSlider = null;
  /** @type {HTMLElement | null} */
  let hdrBackgroundPositionXValue = null;
  /** @type {HTMLInputElement | null} */
  let hdrBackgroundPositionYSlider = null;
  /** @type {HTMLElement | null} */
  let hdrBackgroundPositionYValue = null;
  /** @type {HTMLInputElement | null} */
  let hdrBackgroundPositionZSlider = null;
  /** @type {HTMLElement | null} */
  let hdrBackgroundPositionZValue = null;
  /** @type {HTMLInputElement | null} */
  let hdrBackgroundRotationSlider = null;
  /** @type {HTMLElement | null} */
  let hdrBackgroundRotationValue = null;
  /** @type {HTMLInputElement | null} */
  let hdrBackgroundScaleSlider = null;
  /** @type {HTMLElement | null} */
  let hdrBackgroundScaleValue = null;

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

  // Auto-rotation variables
  /** @type {boolean} */
  let isAutoRotating = false;
  /** @type {number} */
  let autoRotationSpeed = 0.005; // radians per frame
  /** @type {number} */
  let autoRotationRadius = 5.0;
  /** @type {number} */
  let autoRotationAngle = 0;

  /**
   * Toggle auto-rotation of camera around the object
   */
  function toggleAutoRotation() {
    isAutoRotating = !isAutoRotating;
    console.log(`[camera] Auto-rotation ${isAutoRotating ? 'started' : 'stopped'}`);

    // Update button label
    const toggleAutoRotateBtn = /** @type {HTMLButtonElement} */ (document.getElementById('toggleAutoRotateBtn'));
    if (toggleAutoRotateBtn) {
      toggleAutoRotateBtn.textContent = isAutoRotating ? 'Parar rotação' : 'Girar câmera';
    }
  }

  /**
   * Update camera position for auto-rotation around the object
   */
  function updateAutoRotation() {
    if (!modelRoot || !controls) return;

    // Get the center of the object for rotation
    const objectCenter = new THREE.Vector3();
    const boundingBox = new THREE.Box3().setFromObject(modelRoot);
    boundingBox.getCenter(objectCenter);

    // Calculate camera position in a circle around the object
    autoRotationAngle += autoRotationSpeed;

    // Get current camera distance from object center
    const currentDistance = camera.position.distanceTo(objectCenter);

    // Update camera position
    const x = objectCenter.x + Math.cos(autoRotationAngle) * currentDistance;
    const z = objectCenter.z + Math.sin(autoRotationAngle) * currentDistance;
    const y = camera.position.y; // Keep current height

    camera.position.set(x, y, z);

    // Make camera look at the object center
    camera.lookAt(objectCenter);

    // Update orbit controls target
    controls.target.copy(objectCenter);
    controls.update();
  }

  function updatePositionUI() {
    if (yOffsetRange) yOffsetRange.value = String(userYOffset);
    if (yOffsetValue) yOffsetValue.textContent = userYOffset.toFixed(3);
    // TODO: Add X, Z offset and rotation UI elements and update them here
  }

  function applyPositionAndRotation() {

    // Apply legacy positioning to modelRoot
    if (modelRoot) {
      const defaultPos = scenarioPositionDefaults[currentScenarioKey] ?? { x: 0, y: 0, z: 0 };
      const defaultRot = scenarioRotationDefaults[currentScenarioKey] ?? { x: 0, y: 0, z: 0 };

      // Apply position
      modelRoot.position.x = modelPositionBase.x + defaultPos.x + userXOffset;
      modelRoot.position.y = modelPositionBase.y + defaultPos.y + userYOffset;
      modelRoot.position.z = modelPositionBase.z + defaultPos.z + userZOffset;

      // Apply rotation (convert degrees to radians)
      modelRoot.rotation.x = modelRotationBase.x + (defaultRot.x * Math.PI / 180) + (userXRotation * Math.PI / 180);
      modelRoot.rotation.y = modelRotationBase.y + (defaultRot.y * Math.PI / 180) + (userYRotation * Math.PI / 180);
      modelRoot.rotation.z = modelRotationBase.z + (defaultRot.z * Math.PI / 180) + (userZRotation * Math.PI / 180);
    }


    updateFloorUnderModel();
    updateReadouts && updateReadouts();
    updateControlsTargetFromModel();
  }


  function loadHDREnvironment(hdrFilename) {
    if (!scene) return Promise.resolve(null);

    const loader = new RGBELoader().setPath('./assets/images/');
    return loader
      .loadAsync(hdrFilename)
      .then((texture) => {
        if (!texture) return null;
        // Configurar para uso como background 360
        texture.mapping = THREE.EquirectangularRefractionMapping;
        texture.needsUpdate = true;
        return texture;
      })
      .catch((err) => {
        console.warn(`[env] Failed to load HDR ${hdrFilename}:`, err);
        return null;
      });
  }

  function applyHDREnvironment(texture) {
    if (!scene) return;

    if (texture) {
      // Aplicar intensidade do environment map
      texture.intensity = environmentMapIntensity;

      // Sempre usar como environment map para reflexões
      scene.environment = texture;

      // Aplicar intensidade atual nos materiais
      setEnvironmentMapIntensity(environmentMapIntensity);

      // Usar como background apenas se habilitado
      if (hdrBackgroundEnabled) {
        // Create or update HDR background container
        createHDRBackgroundContainer(texture);
        console.log(`[env] Applied ${currentHDR} as background and environment (intensity: ${environmentMapIntensity})`);
      } else {
        // Se HDR background desabilitado, remover container e usar cor sólida
        if (hdrBackgroundMesh) {
          scene.remove(hdrBackgroundMesh);
          hdrBackgroundMesh = null;
        }
        applySceneThemeForScenario(currentScenarioKey);
        console.log(`[env] Applied ${currentHDR} as environment only (background disabled, intensity: ${environmentMapIntensity})`);
      }
    } else {
      // Se não há textura HDR, usar background sólido
      scene.environment = null;
      applySceneThemeForScenario(currentScenarioKey);
      console.log('[env] No HDR texture - using solid background');
    }
  }

  function loadAndApplyHDR(hdrFilename) {
    console.log(`[env] Loading HDR: ${hdrFilename}`);
    environmentLoadPromise = loadHDREnvironment(hdrFilename);

    return environmentLoadPromise.then((texture) => {
      if (texture) {
        environmentTexture = texture;
        applyHDREnvironment(texture);

        // Aplicar intensidade atual após carregar o HDR
        setEnvironmentMapIntensity(environmentMapIntensity);
      }
    });
  }

  // Função para compatibilidade com código existente
  function ensureStudioEnvironment() {
    if (currentHDR === 'none') {
      // Se nenhum HDR estiver selecionado, apenas desabilitar
      disableHDR();
      return Promise.resolve();
    } else {
      return loadAndApplyHDR(currentHDR);
    }
  }

  // ===== Initialization (DOM, Three.js, PostFX, UI) =====
  function initialize() {
    console.log('[init] starting');
    // DOM refs
    viewportEl = document.getElementById('viewport');
    
    const toggleDofBtn = /** @type {HTMLButtonElement} */ (document.getElementById('toggleDofBtn'));
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
    // Set fixed sRGB color space with gamma correction (default)
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.8;
    renderer.physicallyCorrectLights = true;
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    viewportEl.appendChild(renderer.domElement);

    // Scene
    scene = new THREE.Scene();
    applySceneThemeForScenario(currentScenarioKey);

    // Base lighting so the model is visible before custom authoring lights
    baseAmbientLight = new THREE.AmbientLight(0xffffff, 0.4);
    baseAmbientLight.name = 'BaseAmbientLight';
    scene.add(baseAmbientLight);

    baseDirectionalLight = new THREE.DirectionalLight(0xffffff, 3.4);
    baseDirectionalLight.name = 'BaseOverheadDirectional';
    baseDirectionalLight.position.set(0, 8.55, 0);
    baseDirectionalLight.target.position.set(0, 0, 0);
    scene.add(baseDirectionalLight);
    scene.add(baseDirectionalLight.target);


    // Load studio HDR background and environment
    ensureStudioEnvironment();

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

    // Lights (handled by lights_manager.js)
    lightsManager = createLightsManager(scene);
    try { lightsManager.setEditorContext(camera, renderer.domElement, controls); } catch (_) {}
    // Build admin UI for lights - DISABLED by request
    // try {
    //   const lightsAdminEl = document.getElementById('lightsAdmin');
    //   const refocusBtn = /** @type {HTMLButtonElement} */ (document.getElementById('adminRefocusBtn'));
    //   if (lightsAdminEl) {
    //     lightsManager.buildLightsAdminUI(lightsAdminEl);
    //   }
    //   if (refocusBtn) refocusBtn.addEventListener('click', () => { if (modelRoot) { setPleasantCameraView(); } });
    // } catch (_) {}

    // Build simple lights controls
    try {
      buildSimpleLightsControls();
      const refocusBtn = /** @type {HTMLButtonElement} */ (document.getElementById('adminRefocusBtn'));
      if (refocusBtn) refocusBtn.addEventListener('click', () => { if (modelRoot) { setPleasantCameraView(); } });

      // Auto-rotate button
      const toggleAutoRotateBtn = /** @type {HTMLButtonElement} */ (document.getElementById('toggleAutoRotateBtn'));
      if (toggleAutoRotateBtn) {
        toggleAutoRotateBtn.addEventListener('click', () => {
          toggleAutoRotation();
        });
        // Initialize label
        toggleAutoRotateBtn.textContent = isAutoRotating ? 'Parar rotação' : 'Girar câmera';
      }

      // Toggle lights controls visibility
      const toggleLightsControlsBtn = /** @type {HTMLButtonElement} */ (document.getElementById('toggleLightsControlsBtn'));
      if (toggleLightsControlsBtn) {
        const lightsAdminEl = document.getElementById('lightsAdmin');
        const updateLabel = () => {
          if (!lightsAdminEl || !toggleLightsControlsBtn) return;
          const isHidden = lightsAdminEl.style.display === 'none';
          toggleLightsControlsBtn.textContent = isHidden ? 'Mostrar controles' : 'Ocultar controles';
        };
        toggleLightsControlsBtn.addEventListener('click', () => {
          if (!lightsAdminEl) return;
          const isHidden = lightsAdminEl.style.display === 'none';
          lightsAdminEl.style.display = isHidden ? 'block' : 'none';
          updateLabel();
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

    // Tone mapping exposure controls
    toneMappingExposureSlider = /** @type {HTMLInputElement} */ (document.getElementById('toneMappingExposure'));
    toneMappingExposureValue = document.getElementById('toneMappingExposureValue');

    // HDR controls
    hdrSelectEl = /** @type {HTMLSelectElement} */ (document.getElementById('hdrSelect'));
    hdrBackgroundEnabledEl = /** @type {HTMLInputElement} */ (document.getElementById('hdrBackgroundEnabled'));
    toggleHdrControlsBtn = /** @type {HTMLButtonElement} */ (document.getElementById('toggleHdrControlsBtn'));
    environmentIntensitySlider = /** @type {HTMLInputElement} */ (document.getElementById('environmentIntensity'));
    environmentIntensityValue = document.getElementById('environmentIntensityValue');
    toneMappingSelectEl = /** @type {HTMLSelectElement} */ (document.getElementById('toneMappingSelect'));
    hdrBackgroundPositionXSlider = /** @type {HTMLInputElement} */ (document.getElementById('hdrBackgroundPositionX'));
    hdrBackgroundPositionXValue = document.getElementById('hdrBackgroundPositionXValue');
    hdrBackgroundPositionYSlider = /** @type {HTMLInputElement} */ (document.getElementById('hdrBackgroundPositionY'));
    hdrBackgroundPositionYValue = document.getElementById('hdrBackgroundPositionYValue');
    hdrBackgroundPositionZSlider = /** @type {HTMLInputElement} */ (document.getElementById('hdrBackgroundPositionZ'));
    hdrBackgroundPositionZValue = document.getElementById('hdrBackgroundPositionZValue');
    hdrBackgroundRotationSlider = /** @type {HTMLInputElement} */ (document.getElementById('hdrBackgroundRotation'));
    hdrBackgroundRotationValue = document.getElementById('hdrBackgroundRotationValue');
    hdrBackgroundScaleSlider = /** @type {HTMLInputElement} */ (document.getElementById('hdrBackgroundScale'));
    hdrBackgroundScaleValue = document.getElementById('hdrBackgroundScaleValue');

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

    // Tone mapping exposure slider event
    if (toneMappingExposureSlider && toneMappingExposureValue) {
      toneMappingExposureSlider.addEventListener('input', () => {
        const exposure = parseFloat(toneMappingExposureSlider.value);
        setToneMappingExposure(exposure);
        toneMappingExposureValue.textContent = exposure.toFixed(1);
      });

      // Initialize with current exposure value
      updateToneMappingExposureUI();
    }

    // HDR controls events
    if (hdrSelectEl) {
      hdrSelectEl.addEventListener('change', () => {
        const selectedHDR = hdrSelectEl.value;
        changeHDR(selectedHDR);
      });

      // Initialize with current HDR
      updateHDRSelectUI();
    }

    // Initialize "none" option if not present
    if (hdrSelectEl && !availableHDRs.includes('none')) {
      availableHDRs.unshift('none');
      const option = document.createElement('option');
      option.value = 'none';
      option.textContent = 'Nenhum';
      hdrSelectEl.insertBefore(option, hdrSelectEl.firstChild);
    }

    if (hdrBackgroundEnabledEl) {
      hdrBackgroundEnabledEl.addEventListener('change', () => {
        toggleHDRBackground(hdrBackgroundEnabledEl.checked);
      });

      // Initialize with current state
      updateHDRBackgroundToggleUI();
    }

    // Environment intensity slider event
    if (environmentIntensitySlider && environmentIntensityValue) {
      environmentIntensitySlider.addEventListener('input', () => {
        const intensity = parseFloat(environmentIntensitySlider.value);
        console.log('[ui] Environment intensity slider changed to:', intensity);
        setEnvironmentMapIntensity(intensity);
        environmentIntensityValue.textContent = intensity.toFixed(2);
        console.log('[ui] Environment intensity updated to:', intensity);
      });

      // Initialize with current intensity value
      updateEnvironmentIntensityUI();
    }

    // Tone mapping mode selector event
    if (toneMappingSelectEl) {
      toneMappingSelectEl.addEventListener('change', () => {
        const selectedMode = toneMappingSelectEl.value;
        setToneMappingMode(selectedMode);
      });

      // Initialize with current tone mapping mode
      if (toneMappingSelectEl && currentToneMapping) {
        toneMappingSelectEl.value = currentToneMapping;
      }
    }


    // HDR Background position X slider event
    if (hdrBackgroundPositionXSlider && hdrBackgroundPositionXValue) {
      hdrBackgroundPositionXSlider.addEventListener('input', () => {
        const value = parseFloat(hdrBackgroundPositionXSlider.value);
        setHDRBackgroundPositionX(value);
        hdrBackgroundPositionXValue.textContent = value.toFixed(1);
      });

      // Initialize with current value
      updateHDRBackgroundPositionXUI();
    }

    // HDR Background position Y slider event
    if (hdrBackgroundPositionYSlider && hdrBackgroundPositionYValue) {
      hdrBackgroundPositionYSlider.addEventListener('input', () => {
        const value = parseFloat(hdrBackgroundPositionYSlider.value);
        setHDRBackgroundPositionY(value);
        hdrBackgroundPositionYValue.textContent = value.toFixed(1);
      });

      // Initialize with current value
      updateHDRBackgroundPositionYUI();
    }

    // HDR Background position Z slider event
    if (hdrBackgroundPositionZSlider && hdrBackgroundPositionZValue) {
      hdrBackgroundPositionZSlider.addEventListener('input', () => {
        const value = parseFloat(hdrBackgroundPositionZSlider.value);
        setHDRBackgroundPositionZ(value);
        hdrBackgroundPositionZValue.textContent = value.toFixed(1);
      });

      // Initialize with current value
      updateHDRBackgroundPositionZUI();
    }

    // HDR Background rotation slider event
    if (hdrBackgroundRotationSlider && hdrBackgroundRotationValue) {
      hdrBackgroundRotationSlider.addEventListener('input', () => {
        const value = parseInt(hdrBackgroundRotationSlider.value);
        setHDRBackgroundRotation(value);
        hdrBackgroundRotationValue.textContent = value + '°';
      });

      // Initialize with current value
      updateHDRBackgroundRotationUI();
    }

    // HDR Background scale slider event
    if (hdrBackgroundScaleSlider && hdrBackgroundScaleValue) {
      hdrBackgroundScaleSlider.addEventListener('input', () => {
        const value = parseFloat(hdrBackgroundScaleSlider.value);
        setHDRBackgroundScale(value);
        hdrBackgroundScaleValue.textContent = value.toFixed(1);
      });

      // Initialize with current value
      updateHDRBackgroundScaleUI();
    }


    if (toggleHdrControlsBtn) {
      const hdrControls = document.getElementById('hdrControls');
      const updateLabel = () => {
        if (!hdrControls || !toggleHdrControlsBtn) return;
        const isHidden = hdrControls.style.display === 'none';
        toggleHdrControlsBtn.textContent = isHidden ? 'Mostrar controles' : 'Ocultar controles';
      };

      toggleHdrControlsBtn.addEventListener('click', () => {
        const hdrControls = document.getElementById('hdrControls');
        if (!hdrControls) return;
        const isHidden = hdrControls.style.display === 'none';
        hdrControls.style.display = isHidden ? '' : 'none';
        updateLabel();
      });

      updateLabel();
    }

    // Detect available HDRs
    refreshAvailableHDRs();

    // Scan for any additional HDRs that might be present
    setTimeout(() => {
      scanForNewHDRs();
    }, 2000); // Delay to allow initial HDRs to load first

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
        // Note: lights controls are rebuilt in setScenarioManaged after scenario loads
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

    // Auto-rotate camera around object if enabled
    if (isAutoRotating && modelRoot) {
      updateAutoRotation();
    }
    // Per-scenario lights update hook
    try { lightsManager && lightsManager.update(0.016, modelRoot); } catch (_) {}

    // Update scenario animations
    if (scenarioAnimationMixer) {
      scenarioAnimationMixer.update(0.016); // 60fps
    }

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

            // Apply default roughness to capa
            const defaultRoughness = 0.68; // Fixed roughness value
            applyRoughnessToRole('capa', defaultRoughness);
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
        try {
          const modelKey = getCurrentModelKey();
          applyDefaultLogoRotationsExt(modelRoot, modelKey);
        } catch (_) {}

        frameObject3D(modelRoot);

        onProgress?.(85);
        // After model is ready, load default scenario if any
        if (currentScenarioKey) {
          setScenarioManaged(currentScenarioKey, onProgress, onDone);
        } else {
          onProgress?.(100); onDone?.();
        }

        // Create model-scenario group after everything is loaded
        setTimeout(() => {
          createModelScenarioGroup();
        }, 100);
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
    // Remove model from scene
    if (modelRoot) {
      scene.remove(modelRoot);
      modelRoot = null;
    }

    // Dispose model if it exists
    if (modelRoot) {
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
  }

  function switchModel(url) {
    if (!url) return;
    // Reset offsets when changing model
    userXOffset = 0;
    userYOffset = 0;
    userZOffset = 0;
    userXRotation = 0;
    userYRotation = 0;
    userZRotation = 0;
    modelPositionBase = { x: 0, y: 0, z: 0 };
    modelRotationBase = { x: 0, y: 0, z: 0 };
    updatePositionUI();
    // Clean up animations when changing model
    cleanupScenarioAnimations();

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
    const done = () => {
      overlay && overlay.hide();

      // After model is loaded, apply default rotations based on the model
      setTimeout(() => {
        try {
          const modelKey = getCurrentModelKey();
          console.log(`[switchModel] Applying default rotations for model: ${modelKey}`);
          applyDefaultLogoRotationsExt(modelRoot, modelKey);
        } catch (e) {
          console.warn('[switchModel] Failed to apply default rotations:', e);
        }
      }, 100); // Small delay to ensure model is fully loaded
    };

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
  function applyRoughnessToRole(roleKey, roughness, options) { if (!modelRoot) return; applyRoughnessToRoleExt(modelRoot, roleKey, roughness, options || {}); }



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

    // Configure shadows and environment mapping for the model
    modelRoot.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        console.log('[shadow] Configured mesh for shadows:', child.name || child.type);

        // Configure environment mapping for reflective materials
        if (child.material) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach((material) => {
            if (material && environmentTexture) {
              // Enable environment mapping for metallic/rough materials
              if (material.envMapIntensity !== undefined) {
                material.envMapIntensity = environmentMapIntensity;
                material.needsUpdate = true;
              }
              console.log('[env] Configured material for environment mapping:', material.name || material.type);
            }
          });
        }
      }
    });

    // Configure shadow reception for the floor
    if (floorMesh) {
      floorMesh.receiveShadow = true;
      console.log('[shadow] Configured floor to receive shadows');
    }

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

  // Choose a pleasant front-biased 3/4 camera view on the model/group
  function setPleasantCameraView() {
    // Use modelRoot as target
    const targetObject = modelRoot;
    if (!targetObject) return;
    setPleasantView(camera, controls, targetObject);
  }

  // Keep orbit controls target aligned with the model center
  function updateControlsTargetFromModel(precomputedCenter) {
    if (!controls) return;

    // Use modelRoot as target
    const targetObject = modelRoot;
    if (!targetObject) return;

    if (precomputedCenter) {
      controls.target.copy(precomputedCenter);
    controls.update();
    } else {
      updateControlsTargetFromObject(camera, controls, targetObject);
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
    modelPositionBase = {
      x: modelRoot.position.x,
      y: res.modelYOffsetBase || modelRoot.position.y,
      z: modelRoot.position.z
    };
    modelRotationBase = {
      x: modelRoot.rotation.x,
      y: modelRoot.rotation.y,
      z: modelRoot.rotation.z
    };
    updateFloorUnderModel();
    frameObject3D(modelRoot);
    updateControlsTargetFromModel();
  }

  // ===== Scenario-specific model positioning =====
  function positionModelForScenario(scenarioKey) {
    if (!modelRoot) return;

    const defaultPos = scenarioPositionDefaults[scenarioKey] ?? { x: 0, y: 0, z: 0 };

    switch (scenarioKey) {
      case 'modern_garage':
        // Use the default position from scenarioPositionDefaults
        modelRoot.position.set(defaultPos.x, defaultPos.y, defaultPos.z);
        break;
      case 'garageshowroom_vr_ready':
      case 'vr_moody_lighting_art_gallery_scene_06':
        // Start high for VR scenarios
        modelRoot.position.set(0, 4.0, 0);
        break;
      // New scenarios - adjust these values in scenarioPositionDefaults
      case 'car-showroom_1':
        modelRoot.position.set(defaultPos.x, defaultPos.y, defaultPos.z);
        break;
      case 'car-showroom_2':
        modelRoot.position.set(defaultPos.x, defaultPos.y, defaultPos.z);
        break;
      case 'garage':
        modelRoot.position.set(defaultPos.x, defaultPos.y, defaultPos.z);
        break;
      case 'hangar':
        modelRoot.position.set(defaultPos.x, defaultPos.y, defaultPos.z);
        break;
      case 'vr_gallery':
        modelRoot.position.set(defaultPos.x, defaultPos.y, defaultPos.z);
        break;
      case 'white-room1':
        modelRoot.position.set(defaultPos.x, defaultPos.y, defaultPos.z);
        break;
      default:
        // For other scenarios, use default positioning
        modelRoot.position.set(0, 0, 0);
        break;
    }

    // Apply rotation defaults
    const defaultRot = scenarioRotationDefaults[scenarioKey] ?? { x: 0, y: 0, z: 0 };
    modelRoot.rotation.x = defaultRot.x * Math.PI / 180;
    modelRoot.rotation.y = defaultRot.y * Math.PI / 180;
    modelRoot.rotation.z = defaultRot.z * Math.PI / 180;

    modelPositionBase = {
      x: modelRoot.position.x,
      y: modelRoot.position.y,
      z: modelRoot.position.z
    };
    modelRotationBase = {
      x: modelRoot.rotation.x,
      y: modelRoot.rotation.y,
      z: modelRoot.rotation.z
    };
    applyPositionAndRotation();
  }

  // Removed per-region coloring; keep global color only

  // ===== Scenario Animation Management =====
  function setupScenarioAnimations(scenarioRoot) {
    console.log('[animation] Setting up animations for scenario root:', scenarioRoot);
    console.log('[animation] Scenario root children:', scenarioRoot.children);
    console.log('[animation] Scenario root type:', scenarioRoot.type);

    // Dispose existing animation mixer
    if (scenarioAnimationMixer) {
      console.log('[animation] Disposing existing animation mixer');
      scenarioAnimationMixer.stopAllAction();
      scenarioAnimationMixer = null;
    }

    // Check for animations in multiple ways
    let animations = [];

    // Method 1: Direct animations on root
    if (scenarioRoot.animations) {
      animations = scenarioRoot.animations;
      console.log('[animation] Found animations directly on root:', animations.length);
    }

    // Method 2: Check all children for animations
    if (animations.length === 0) {
      scenarioRoot.traverse((child) => {
        if (child.animations && child.animations.length > 0) {
          console.log(`[animation] Found animations on child:`, child);
          animations = child.animations;
        }
      });
      console.log('[animation] Found animations on children:', animations.length);
    }

    // Method 3: Check if scenarioRoot is a Scene and look for AnimationClips
    if (animations.length === 0 && scenarioRoot.type === 'Scene') {
      console.log('[animation] Scenario root is a Scene, checking for AnimationClips...');
      // Try to find any object with animations
      scenarioRoot.traverse((child) => {
        if (child.type === 'Mesh' || child.type === 'Group' || child.type === 'Object3D') {
          if (child.animations && child.animations.length > 0) {
            animations = child.animations;
            console.log(`[animation] Found animations on object:`, child, animations);
          }
        }
      });
    }

    console.log('[animation] Final animations array:', animations);
    console.log('[animation] Animations length:', animations.length);

    if (animations.length === 0) {
      console.log('[animation] No animations found in garage scenario - checking all objects...');
      // Debug: List all objects in the scene
      const objectsWithAnimations = [];
      scenarioRoot.traverse((child) => {
        console.log(`[animation] Object: ${child.name || child.type}`, {
          animations: child.animations,
          type: child.type
        });
        if (child.animations && child.animations.length > 0) {
          objectsWithAnimations.push(child);
        }
      });
      console.log('[animation] Objects with animations:', objectsWithAnimations);

      // If we found objects with animations, use the first one
      if (objectsWithAnimations.length > 0) {
        animations = objectsWithAnimations[0].animations;
        console.log('[animation] Using animations from first object with animations');
      }

      if (animations.length === 0) {
        console.log('[animation] No animations found anywhere in garage scenario');

        // Try to create a simple rotation animation as demonstration
        console.log('[animation] Creating a demonstration animation...');
        try {
          // Find a mesh to animate
          let targetMesh = null;
          scenarioRoot.traverse((child) => {
            if (child.type === 'Mesh' && !targetMesh) {
              targetMesh = child;
              console.log('[animation] Found mesh to animate:', child);
            }
          });

          if (targetMesh) {
            console.log('[animation] Creating rotation animation for mesh:', targetMesh.name);

            // Create a simple rotation animation
            const rotationKeyframes = [];
            for (let i = 0; i <= 60; i++) {
              const angle = (i / 60) * Math.PI * 2;
              rotationKeyframes.push({
                time: i / 60,
                rotation: [0, angle, 0]
              });
            }

            // Create animation clip manually
            const rotationTrack = new THREE.VectorKeyframeTrack(
              '.rotation',
              rotationKeyframes.map(k => k.time),
              rotationKeyframes.flatMap(k => k.rotation)
            );

            const clip = new THREE.AnimationClip('DemoRotation', 1, [rotationTrack]);
            animations = [clip];
            console.log('[animation] Created demo rotation animation');

          } else {
            console.log('[animation] No mesh found to animate');
          }
        } catch (e) {
          console.error('[animation] Error creating demo animation:', e);
        }

        if (animations.length === 0) {
          console.log('[animation] Could not create demo animation, trying garage-specific approach...');

          // Try garage-specific animations
          try {
            const garageAnimations = createGarageAnimations(scenarioRoot);
            if (garageAnimations.length > 0) {
              animations = garageAnimations;
              console.log('[animation] Successfully created garage-specific animations:', animations.length);
            } else {
              console.log('[animation] No garage-specific animations created, trying final fallback...');

              // Final fallback: Create animation for the entire scenario root
              try {
                console.log('[animation] Creating animation for scenario root:', scenarioRoot);

                // Create a simple rotation animation
                const rotationKeyframes = [];
                for (let i = 0; i <= 120; i++) {
                  const angle = (i / 120) * Math.PI * 2;
                  rotationKeyframes.push({
                    time: i / 60,
                    rotation: [0, angle, 0]
                  });
                }

                const rotationTrack = new THREE.VectorKeyframeTrack(
                  '.rotation',
                  rotationKeyframes.map(k => k.time),
                  rotationKeyframes.flatMap(k => k.rotation)
                );

                const rotationClip = new THREE.AnimationClip('GarageRootRotation', 2, [rotationTrack]);
                animations = [rotationClip];
                console.log('[animation] Created root rotation animation as final fallback');

              } catch (e) {
                console.error('[animation] Error creating final fallback animation:', e);
                return;
              }
            }
          } catch (e) {
            console.error('[animation] Error creating garage-specific animations:', e);
            return;
          }
        }
      }
    }

    console.log(`[animation] Found ${animations.length} animations in garage scenario`);
    animations.forEach((clip, index) => {
      console.log(`[animation] Animation ${index}:`, {
        name: clip.name,
        duration: clip.duration,
        tracks: clip.tracks ? clip.tracks.length : 'N/A'
      });
      if (clip.tracks) {
        clip.tracks.forEach((track, trackIndex) => {
          console.log(`  Track ${trackIndex}:`, track.name, track.type);
        });
      }
    });

    // Create animation mixer
    try {
      scenarioAnimationMixer = new THREE.AnimationMixer(scenarioRoot);
      console.log('[animation] Animation mixer created successfully');
    } catch (e) {
      console.error('[animation] Failed to create animation mixer:', e);
      return;
    }

    // Play all animations
    let animationCount = 0;
    animations.forEach((clip, index) => {
      try {
        console.log(`[animation] Creating action for clip ${index}:`, clip);
        const action = scenarioAnimationMixer.clipAction(clip);
        console.log(`[animation] Action created:`, action);

        // Set some action properties
        action.loop = THREE.LoopRepeat;
        action.clampWhenFinished = false;
        action.timeScale = 1.0;
        action.weight = 1.0;

        console.log(`[animation] Action properties set, calling play() on action:`, action);
        action.play();
        animationCount++;
        console.log(`[animation] Playing animation ${index}: ${clip.name || 'unnamed'} - Action:`, action);

        // Force update to check if animation is running
        setTimeout(() => {
          console.log(`[animation] Animation ${index} status after 100ms:`, {
            isRunning: action.isRunning(),
            time: action.time,
            paused: action.paused,
            stopped: action.stopped,
            mixer: scenarioAnimationMixer
          });
        }, 100);

      } catch (e) {
        console.error(`[animation] Failed to play animation ${index}:`, e);
      }
    });

    console.log(`[animation] Successfully started ${animationCount}/${animations.length} animations`);

    // Test if mixer is working
    if (scenarioAnimationMixer && animationCount > 0) {
      console.log('[animation] Animation mixer test:', scenarioAnimationMixer);
      console.log('[animation] Mixer _actions:', scenarioAnimationMixer._actions);
      console.log('[animation] Mixer _root:', scenarioAnimationMixer._root);
    }
  }

  function cleanupScenarioAnimations() {
    if (scenarioAnimationMixer) {
      console.log('[animation] Cleaning up scenario animations');
      scenarioAnimationMixer.stopAllAction();
      scenarioAnimationMixer = null;
    }
  }

  // Debug function to test garage animations directly
  function testGarageAnimations() {
    console.log('[animation] Testing garage animations directly...');
    const loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath('https://unpkg.com/three@0.160.0/examples/jsm/libs/draco/');
    loader.setDRACOLoader(draco);

    loader.load(
      './assets/scenarios/garage.glb',
      (gltf) => {
        console.log('[animation] Garage GLB loaded directly:', gltf);
        console.log('[animation] GLB animations:', gltf.animations);
        console.log('[animation] GLB scene:', gltf.scene);
        console.log('[animation] GLB scene animations:', gltf.scene.animations);

        if (gltf.scene) {
          console.log('[animation] Traversing scene for animations...');
          gltf.scene.traverse((child) => {
            console.log(`[animation] Child: ${child.name || child.type}`, {
              animations: child.animations,
              type: child.type
            });
          });

          // Try to create and play animations directly from the loaded GLB
          if (gltf.animations && gltf.animations.length > 0) {
            console.log('[animation] Found animations in GLB, trying to play them...');
            try {
              const testMixer = new THREE.AnimationMixer(gltf.scene);
              gltf.animations.forEach((clip, index) => {
                console.log(`[animation] Creating test action for clip ${index}:`, clip);
                const action = testMixer.clipAction(clip);
                action.loop = THREE.LoopRepeat;
                action.play();
                console.log(`[animation] Playing test animation ${index}: ${clip.name || 'unnamed'}`);
              });

              // Update the mixer a few times to see if it works
              let updateCount = 0;
              const testInterval = setInterval(() => {
                if (updateCount < 10) {
                  testMixer.update(0.1);
                  updateCount++;
                  console.log(`[animation] Test update ${updateCount}/10`);
                } else {
                  clearInterval(testInterval);
                  console.log('[animation] Test completed');
                }
              }, 100);

            } catch (e) {
              console.error('[animation] Error testing animations:', e);
            }
          }
        }
      },
      (progress) => {
        console.log('[animation] Loading progress:', progress);
      },
      (error) => {
        console.error('[animation] Error loading garage.glb:', error);
      }
    );
  }

  // Alternative approach: Force play animations on any object in garage scene
  function forceGarageAnimations(scenarioRoot) {
    console.log('[animation] Force garage animations approach');

    const animatableObjects = [];
    scenarioRoot.traverse((child) => {
      if (child.type === 'Mesh' || child.type === 'Group' || child.type === 'Object3D') {
        if (child.animations && child.animations.length > 0) {
          animatableObjects.push(child);
        }
      }
    });

    console.log('[animation] Found animatable objects:', animatableObjects);

    if (animatableObjects.length > 0) {
      animatableObjects.forEach((obj, index) => {
        console.log(`[animation] Object ${index}:`, obj);
        obj.animations.forEach((clip, clipIndex) => {
          console.log(`[animation] Clip ${clipIndex} on object ${index}:`, clip);

          try {
            const mixer = new THREE.AnimationMixer(obj);
            const action = mixer.clipAction(clip);
            action.loop = THREE.LoopRepeat;
            action.play();
            console.log(`[animation] Successfully played animation on object ${index}, clip ${clipIndex}`);

            // Update this mixer as well
            let updateCount = 0;
            const updateInterval = setInterval(() => {
              if (updateCount < 50) {
                mixer.update(0.1);
                updateCount++;
              } else {
                clearInterval(updateInterval);
              }
            }, 100);

          } catch (e) {
            console.error(`[animation] Error playing animation on object ${index}, clip ${clipIndex}:`, e);
          }
        });
      });
    } else {
      console.log('[animation] No animatable objects found');
    }
  }

  // Add to window for easy access
  window.testGarageAnimations = testGarageAnimations;
  window.createGarageAnimations = createGarageAnimations;

  // Test function for new HDR
  function testNewHDR() {
    console.log('[test] Testing new msichll.hdr...');
    return loadAndApplyHDR('msichll.hdr');
  }

  // Function to force refresh HDR list and detect new ones
  function refreshHDRList() {
    console.log('[test] Forcing HDR list refresh...');
    refreshAvailableHDRs();
    return Promise.resolve();
  }

  // Add to window for easy access
  window.testNewHDR = testNewHDR;
  window.refreshHDRList = refreshHDRList;

  // Function to create garage-specific animations
  function createGarageAnimations(scenarioRoot) {
    console.log('[animation] Creating garage-specific animations...');

    const garageAnimations = [];

    try {
      // Find lights in the garage to animate them
      const lights = [];
      scenarioRoot.traverse((child) => {
        if (child.name && child.name.toLowerCase().includes('light')) {
          lights.push(child);
          console.log('[animation] Found light object:', child.name);
        }
      });

      if (lights.length > 0) {
        console.log(`[animation] Found ${lights.length} lights to animate`);

        // Create animation for each light
        lights.forEach((light, index) => {
          console.log(`[animation] Creating animation for light ${index}:`, light.name);

          // Create position animation for the light
          const positionKeyframes = [];
          for (let i = 0; i <= 60; i++) {
            const angle = (i / 60) * Math.PI * 2;
            const radius = 0.5 + (index * 0.2);
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            positionKeyframes.push({
              time: i / 60,
              position: [x, light.position.y || 2, z]
            });
          }

          const positionTrack = new THREE.VectorKeyframeTrack(
            '.position',
            positionKeyframes.map(k => k.time),
            positionKeyframes.flatMap(k => k.position)
          );

          const clip = new THREE.AnimationClip(`GarageLight${index}`, 1, [positionTrack]);
          garageAnimations.push(clip);

          console.log(`[animation] Created position animation for light ${index}`);
        });
      } else {
        console.log('[animation] No lights found, creating general scene animation');

        // Create a general scene animation - rotate all objects
        const rotationKeyframes = [];
        for (let i = 0; i <= 120; i++) {
          const angle = (i / 120) * Math.PI * 4;
          rotationKeyframes.push({
            time: i / 60,
            rotation: [0, angle, 0]
          });
        }

        const rotationTrack = new THREE.VectorKeyframeTrack(
          '.rotation',
          rotationKeyframes.map(k => k.time),
          rotationKeyframes.flatMap(k => k.rotation)
        );

        const clip = new THREE.AnimationClip('GarageSceneRotation', 2, [rotationTrack]);
        garageAnimations.push(clip);

        console.log('[animation] Created scene rotation animation');
      }

      return garageAnimations;

    } catch (e) {
      console.error('[animation] Error creating garage animations:', e);
      return garageAnimations;
    }
  }

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
    userXOffset = 0;
    userYOffset = 0;
    userZOffset = 0;
    userXRotation = 0;
    userYRotation = 0;
    userZRotation = 0;
    modelPositionBase = { x: 0, y: 0, z: 0 };
    modelRotationBase = { x: 0, y: 0, z: 0 };
    updatePositionUI();
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
            // Apply scenario-specific positioning
            positionModelForScenario(currentScenarioKey);
            if ((currentScenarioKey === 'sci-fi_garage' || currentScenarioKey === 'garageshowroom_vr_ready' || currentScenarioKey === 'vr_moody_lighting_art_gallery_scene_06' ||
                 currentScenarioKey === 'car-showroom_1' || currentScenarioKey === 'car-showroom_2' || currentScenarioKey === 'garage' ||
                 currentScenarioKey === 'hangar' || currentScenarioKey === 'vr_gallery' || currentScenarioKey === 'white-room1') && modelRoot) {
              // Rely on precise floor snapping only; avoid hardcoded baseline to prevent pop-in.
              setTimeout(() => { try { snapModelToScenarioFloor(); } catch (_) {} }, 350);
            } else {
              snapModelToScenarioFloor();
            }
            applyPositionAndRotation();
            // Ensure mid-height panels are cleared (none requested)
            try { if (lightsManager && lightsManager.clearMidHeightPanels) lightsManager.clearMidHeightPanels(); } catch (_) {}
            setPleasantCameraView();

            // Handle scenario animations
            console.log(`[scenario] Finalizing scenario: ${currentScenarioKey}, scenarioRoot:`, scenarioRoot);

            // Apply current environment map intensity to model materials
            setEnvironmentMapIntensity(environmentMapIntensity);

            if (currentScenarioKey === 'garage') {
              if (scenarioRoot) {
                console.log('[animation] Garage scenario loaded, setting up animations...');

                // First test animations directly
                console.log('[animation] Testing animations directly first...');
                testGarageAnimations();

                // Small delay to ensure scenario is fully loaded
                setTimeout(() => {
                  try {
                    console.log('[animation] About to setup garage animations, scenarioRoot:', scenarioRoot);
                    setupScenarioAnimations(scenarioRoot);

                    // As backup, try force approach after a longer delay
                    setTimeout(() => {
                      console.log('[animation] Trying force animation approach as backup...');
                      forceGarageAnimations(scenarioRoot);
                    }, 1000);

                    // Try garage-specific animations as final approach
                    setTimeout(() => {
                      console.log('[animation] Trying garage-specific animation creation...');
                      const garageSpecificAnimations = createGarageAnimations(scenarioRoot);
                      if (garageSpecificAnimations.length > 0) {
                        console.log('[animation] Garage-specific animations created, playing them...');

                        // Dispose existing mixer
                        if (scenarioAnimationMixer) {
                          scenarioAnimationMixer.stopAllAction();
                          scenarioAnimationMixer = null;
                        }

                        // Create new mixer with garage-specific animations
                        try {
                          scenarioAnimationMixer = new THREE.AnimationMixer(scenarioRoot);
                          garageSpecificAnimations.forEach((clip, index) => {
                            const action = scenarioAnimationMixer.clipAction(clip);
                            action.loop = THREE.LoopRepeat;
                            action.play();
                            console.log(`[animation] Playing garage-specific animation ${index}: ${clip.name}`);
                          });
                        } catch (e) {
                          console.error('[animation] Error creating garage-specific animation mixer:', e);
                        }
                      }
                    }, 1500);

                  } catch (e) {
                    console.error('[animation] Error setting up garage animations:', e);
                  }
                }, 500);
              } else {
                console.warn('[animation] Garage scenario key set but scenarioRoot is null');
              }
            } else {
              // Clean up animations if switching away from garage
              cleanupScenarioAnimations();
            }

            // Rebuild simple lights controls after scenario change
            try {
              const lightsAdminEl = document.getElementById('lightsAdmin');
              if (lightsAdminEl) {
                buildSimpleLightsControls();
              } else {
                console.warn('[lights] lightsAdmin element not found, skipping lights controls rebuild');
              }
            } catch (e) {
              console.warn('[lights] Failed to rebuild lights controls:', e);
            }

          } catch (e) {
            console.error('[scenario] finalize error', e);
          } finally {
            if (typeof onDone === 'function') {
              onDone();
            }
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
      modelPositionBase = {
        x: modelRoot.position.x,
        y: modelRoot.position.y,
        z: modelRoot.position.z
      };
      modelRotationBase = {
        x: modelRoot.rotation.x,
        y: modelRoot.rotation.y,
        z: modelRoot.rotation.z
      };
      updateFloorUnderModel();
      updateControlsTargetFromModel();
    } else if (scenarioKey === 'sci-fi_garage') {
      // Legacy provisional pose tuned for sci-fi
      modelRoot.position.set(0, -0.535, 0);
      modelPositionBase = {
        x: modelRoot.position.x,
        y: modelRoot.position.y,
        z: modelRoot.position.z
      };
      modelRotationBase = {
        x: modelRoot.rotation.x,
        y: modelRoot.rotation.y,
        z: modelRoot.rotation.z
      };
      updateFloorUnderModel();
      updateControlsTargetFromModel();
    } else if (scenarioKey === 'garageshowroom_vr_ready') {
      // Start high for VR showroom to ensure snap ray hits scenario floor/platform
      modelRoot.position.set(0, 4.2, 0);
      modelPositionBase = {
        x: modelRoot.position.x,
        y: modelRoot.position.y,
        z: modelRoot.position.z
      };
      modelRotationBase = {
        x: modelRoot.rotation.x,
        y: modelRoot.rotation.y,
        z: modelRoot.rotation.z
      };
      updateFloorUnderModel();
      updateControlsTargetFromModel();
    }
  }

  function applySceneThemeForScenario(key) {
    if (!scene || !renderer) return;

    // Se HDR background habilitado, usar HDR como background
    if (environmentTexture && hdrBackgroundEnabled) {
      // Create or update HDR background container
      createHDRBackgroundContainer(environmentTexture);
      renderer.setClearColor(0x000000, 0); // Fundo transparente para HDR
    } else {
      // Fallback para cores sólidas
      if (!key || key === 'none') {
        scene.background = new THREE.Color(noScenarioSceneBackground);
        renderer.setClearColor(noScenarioSceneBackground, 1);
      } else {
        scene.background = new THREE.Color(defaultSceneBackground);
        renderer.setClearColor(0x000000, 0);
      }
    }

    // Ajustar exposure baseada no cenário
    if (!key || key === 'none') {
      renderer.toneMappingExposure = 0.4; // Exposição para "sem cenário"
    } else if (key === 'car-showroom_1') {
      renderer.toneMappingExposure = 0.4; // Exposição específica conforme screenshot
      // Configurar tone mapping para car-showroom_1
      setToneMappingMode('ACESFilmicToneMapping');
    } else {
      renderer.toneMappingExposure = 1.0;
    }

    // Update UI to reflect current exposure value
    updateToneMappingExposureUI();
  }

  function setToneMappingExposure(exposure) {
    if (!renderer) return;
    renderer.toneMappingExposure = exposure;
    console.log('[tone-mapping] Exposure set to:', exposure);
  }

  function setToneMappingMode(mode) {
    if (!renderer) return;

    // Map string names to THREE constants
    const toneMappingModes = {
      'ACESFilmicToneMapping': THREE.ACESFilmicToneMapping,
      'LinearToneMapping': THREE.LinearToneMapping,
      'ReinhardToneMapping': THREE.ReinhardToneMapping,
      'CineonToneMapping': THREE.CineonToneMapping,
      'Uncharted2ToneMapping': THREE.Uncharted2ToneMapping
    };

    const toneMappingConstant = toneMappingModes[mode] || THREE.ACESFilmicToneMapping;
    renderer.toneMapping = toneMappingConstant;
    currentToneMapping = mode;

    console.log('[tone-mapping] Mode set to:', mode, '(', toneMappingConstant, ')');
  }

  function updateToneMappingExposureUI() {
    if (toneMappingExposureSlider && toneMappingExposureValue && renderer) {
      const currentExposure = renderer.toneMappingExposure;
      toneMappingExposureSlider.value = String(currentExposure);
      toneMappingExposureValue.textContent = currentExposure.toFixed(1);
    }
  }



  function createHDRBackgroundContainer(texture) {
    if (!texture || !scene) return null;

    // Remove existing HDR background mesh
    if (hdrBackgroundMesh) {
      scene.remove(hdrBackgroundMesh);
      hdrBackgroundMesh = null;
    }

    // Create a large sphere to act as HDR background container
    const geometry = new THREE.SphereGeometry(50, 64, 32);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.BackSide, // Render only the inside of the sphere
      transparent: true,
      opacity: 1.0
    });

    hdrBackgroundMesh = new THREE.Mesh(geometry, material);
    hdrBackgroundMesh.name = 'HDRBackgroundMesh';

    // Apply initial transformations
    updateHDRBackgroundTransform();

    scene.add(hdrBackgroundMesh);
    return hdrBackgroundMesh;
  }

  function updateHDRBackgroundTransform() {
    if (!hdrBackgroundMesh) return;

    // Apply position X, Y, Z
    hdrBackgroundMesh.position.x = hdrBackgroundPositionX;
    hdrBackgroundMesh.position.y = hdrBackgroundPositionY;
    hdrBackgroundMesh.position.z = hdrBackgroundPositionZ;

    // Apply rotation (convert degrees to radians)
    hdrBackgroundMesh.rotation.y = (hdrBackgroundRotation * Math.PI) / 180;

    // Apply scale
    hdrBackgroundMesh.scale.setScalar(hdrBackgroundScale);
  }

  function setHDRBackgroundPositionX(value) {
    hdrBackgroundPositionX = value;
    updateHDRBackgroundTransform();
    console.log(`[hdr-bg] Position X set to: ${value}`);
  }

  function setHDRBackgroundPositionY(value) {
    hdrBackgroundPositionY = value;
    updateHDRBackgroundTransform();
    console.log(`[hdr-bg] Position Y set to: ${value}`);
  }

  function setHDRBackgroundPositionZ(value) {
    hdrBackgroundPositionZ = value;
    updateHDRBackgroundTransform();
    console.log(`[hdr-bg] Position Z set to: ${value}`);
  }

  function setHDRBackgroundRotation(value) {
    hdrBackgroundRotation = value;
    updateHDRBackgroundTransform();
    console.log(`[hdr-bg] Rotation set to: ${value}°`);
  }

  function setHDRBackgroundScale(value) {
    hdrBackgroundScale = value;
    updateHDRBackgroundTransform();
    console.log(`[hdr-bg] Scale set to: ${value}`);
  }

  function updateHDRBackgroundPositionXUI() {
    if (hdrBackgroundPositionXSlider && hdrBackgroundPositionXValue) {
      hdrBackgroundPositionXSlider.value = String(hdrBackgroundPositionX);
      hdrBackgroundPositionXValue.textContent = hdrBackgroundPositionX.toFixed(1);
    }
  }

  function updateHDRBackgroundPositionYUI() {
    if (hdrBackgroundPositionYSlider && hdrBackgroundPositionYValue) {
      hdrBackgroundPositionYSlider.value = String(hdrBackgroundPositionY);
      hdrBackgroundPositionYValue.textContent = hdrBackgroundPositionY.toFixed(1);
    }
  }

  function updateHDRBackgroundPositionZUI() {
    if (hdrBackgroundPositionZSlider && hdrBackgroundPositionZValue) {
      hdrBackgroundPositionZSlider.value = String(hdrBackgroundPositionZ);
      hdrBackgroundPositionZValue.textContent = hdrBackgroundPositionZ.toFixed(1);
    }
  }

  function updateHDRBackgroundRotationUI() {
    if (hdrBackgroundRotationSlider && hdrBackgroundRotationValue) {
      hdrBackgroundRotationSlider.value = String(hdrBackgroundRotation);
      hdrBackgroundRotationValue.textContent = hdrBackgroundRotation + '°';
    }
  }

  function updateHDRBackgroundScaleUI() {
    if (hdrBackgroundScaleSlider && hdrBackgroundScaleValue) {
      hdrBackgroundScaleSlider.value = String(hdrBackgroundScale);
      hdrBackgroundScaleValue.textContent = hdrBackgroundScale.toFixed(1);
    }
  }




  function setEnvironmentMapIntensity(intensity) {
    if (!scene) return;

    environmentMapIntensity = intensity;
    console.log('[env] Setting environment map intensity to:', intensity);
    console.log('[env] Current environment texture:', environmentTexture);

    let materialCount = 0;

    // Update all materials that might use environment mapping
    scene.traverse((child) => {
      if (child.isMesh && child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => {
          if (material.envMapIntensity !== undefined) {
            const oldIntensity = material.envMapIntensity;
            material.envMapIntensity = intensity;
            material.needsUpdate = true;
            materialCount++;
            console.log(`[env] Updated material ${material.name || material.type}: ${oldIntensity} -> ${intensity}`);
          } else {
            // Enable environment mapping for materials that support it
            if (material.type === 'MeshStandardMaterial' || material.type === 'MeshPhysicalMaterial') {
              if (material.envMapIntensity !== undefined) {
                material.envMapIntensity = intensity;
                material.needsUpdate = true;
                materialCount++;
                console.log(`[env] Enabled environment mapping on material ${material.name || material.type}: ${intensity}`);
              }
            }
          }
        });
      }
    });

    console.log(`[env] Updated ${materialCount} materials with environment map intensity: ${intensity}`);

    // Also update any newly created materials
    if (modelRoot) {
      modelRoot.traverse((child) => {
        if (child.isMesh && child.material) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach((material) => {
            if (material.envMapIntensity !== undefined) {
              const oldIntensity = material.envMapIntensity;
              material.envMapIntensity = intensity;
              material.needsUpdate = true;
              materialCount++;
              console.log(`[env] Updated model material ${material.name || material.type}: ${oldIntensity} -> ${intensity}`);
            }
          });
        }
      });
    }

    console.log(`[env] Final count: Updated ${materialCount} materials with environment map intensity: ${intensity}`);
  }

  function updateEnvironmentIntensityUI() {
    if (environmentIntensitySlider && environmentIntensityValue) {
      environmentIntensitySlider.value = String(environmentMapIntensity);
      environmentIntensityValue.textContent = environmentMapIntensity.toFixed(2);
    }
  }

  // Função auxiliar para detectar o modelo atual baseado no caminho
  function getCurrentModelKey() {
    const activeBtn = document.querySelector('#modelButtons .seg-btn.active');
    if (!activeBtn) return null;

    const modelUrl = activeBtn.getAttribute('data-url');
    if (!modelUrl) return null;

    // Extrair o nome do modelo do caminho
    if (modelUrl.includes('jetski6.glb')) {
      return 'jetski6';
    } else if (modelUrl.includes('teste14.glb')) {
      return 'sedan'; // Para o modelo Sedan (teste14)
    }

    return null;
  }

  function updateHDRSelectUI() {
    if (hdrSelectEl) {
      hdrSelectEl.value = currentHDR;
    }
  }

  function updateHDRBackgroundToggleUI() {
    if (hdrBackgroundEnabledEl) {
      hdrBackgroundEnabledEl.checked = hdrBackgroundEnabled;
    }
  }

  function changeHDR(hdrFilename) {
    currentHDR = hdrFilename;
    updateHDRSelectUI();

    if (hdrFilename === 'none') {
      // Desabilitar HDR completamente
      disableHDR();
      return Promise.resolve();
    } else {
      return loadAndApplyHDR(hdrFilename);
    }
  }

  function disableHDR() {
    if (!scene) return;

    // Remove HDR background mesh
    if (hdrBackgroundMesh) {
      scene.remove(hdrBackgroundMesh);
      hdrBackgroundMesh = null;
    }

    // Remover HDR do background e environment
    environmentTexture = null;
    scene.environment = null;

    // Aplicar background sólido baseado no cenário atual
    applySceneThemeForScenario(currentScenarioKey);

    console.log('[env] HDR disabled - using solid background');
  }

  function toggleHDRBackground(enabled) {
    hdrBackgroundEnabled = enabled;
    updateHDRBackgroundToggleUI();

    if (environmentTexture) {
      applyHDREnvironment(environmentTexture);
    } else {
      applySceneThemeForScenario(currentScenarioKey);
    }
  }

  function refreshAvailableHDRs() {
    // Detectar HDRs disponíveis fazendo preload das imagens
    const hdrCandidates = [
      'studio.hdr', 'street.hdr', 'hangar.hdr', 'office.hdr',
      'dancehall.hdr', 'brwnstudio.hdr', 'satara.hdr', 'plh.hdr', 'zw.hdr', 'scythian_tombs_2_4k.hdr', 'venice_sunset_4k.hdr', 'moonless_golf_4k.hdr', 'msichll.hdr'
    ];

    let loadedCount = 0;
    const totalCount = hdrCandidates.length;

    hdrCandidates.forEach(hdrFilename => {
      if (hdrFilename === 'none') {
        // A opção "none" sempre deve estar disponível
        if (!availableHDRs.includes('none')) {
          availableHDRs.unshift('none'); // Adicionar no início da lista
          if (hdrSelectEl) {
            const option = document.createElement('option');
            option.value = 'none';
            option.textContent = 'Nenhum';
            hdrSelectEl.insertBefore(option, hdrSelectEl.firstChild);
          }
        }
        loadedCount++;
        if (loadedCount === totalCount) {
          console.log(`[env] HDR detection completed. Found ${availableHDRs.length} HDRs:`, availableHDRs);
          updateHDRSelectUI();
        }
        return;
      }

      if (!availableHDRs.includes(hdrFilename)) {
        // Tentar fazer preload da imagem para verificar se existe
        const img = new Image();
        img.onload = () => {
          if (!availableHDRs.includes(hdrFilename)) {
            availableHDRs.push(hdrFilename);
            console.log(`[env] HDR detected and added: ${hdrFilename}`);

            // Atualizar o select se ele existir
            if (hdrSelectEl) {
              const option = document.createElement('option');
              option.value = hdrFilename;
              option.textContent = formatHDRName(hdrFilename);
              hdrSelectEl.appendChild(option);
            }
          }
          loadedCount++;
          if (loadedCount === totalCount) {
            console.log(`[env] HDR detection completed. Found ${availableHDRs.length} HDRs:`, availableHDRs);
            updateHDRSelectUI();
          }
        };
        img.onerror = () => {
          console.log(`[env] HDR not found or failed to load: ${hdrFilename}`);
          loadedCount++;
          if (loadedCount === totalCount) {
            console.log(`[env] HDR detection completed. Found ${availableHDRs.length} HDRs:`, availableHDRs);
            updateHDRSelectUI();
          }
        };
        img.src = `./assets/images/${hdrFilename}`;
      } else {
        loadedCount++;
        if (loadedCount === totalCount) {
          console.log(`[env] HDR detection completed. Found ${availableHDRs.length} HDRs:`, availableHDRs);
          updateHDRSelectUI();
        }
      }
    });
  }

  // Função para detectar novos HDRs dinamicamente
  function scanForNewHDRs() {
    // Lista de nomes de HDRs comuns para tentar detectar
    const commonHDRNames = [
      'parking', 'garage', 'warehouse', 'factory', 'industrial', 'urban', 'city', 'night',
      'sunset', 'dawn', 'morning', 'afternoon', 'evening', 'dusk', 'interior', 'exterior',
      'room', 'hall', 'lobby', 'atrium', 'courtyard', 'sky', 'clouds', 'sun',
      'studio', 'gallery', 'museum', 'showroom', 'exhibition', 'display', 'presentation',
      'modern', 'contemporary', 'classic', 'vintage', 'retro', 'minimal', 'clean',
      'bright', 'dark', 'moody', 'dramatic', 'soft', 'warm', 'cool', 'neutral',
      'colorful', 'monochrome', 'sepia', 'vintage', 'grunge', 'rustic', 'elegant'
    ];

    let scanCount = 0;
    const maxScans = 20; // Limitar número de tentativas

    function tryLoadHDR(name) {
      if (scanCount >= maxScans || availableHDRs.includes(`${name}.hdr`)) {
        if (scanCount >= maxScans) {
          console.log(`[env] HDR scan completed after ${maxScans} attempts`);
        }
        return;
      }

      scanCount++;
      const filename = `${name}.hdr`;
      const img = new Image();

      img.onload = () => {
        if (!availableHDRs.includes(filename)) {
          availableHDRs.push(filename);
          console.log(`[env] New HDR discovered: ${filename}`);

          // Atualizar o select se ele existir
          if (hdrSelectEl) {
            const option = document.createElement('option');
            option.value = filename;
            option.textContent = formatHDRName(filename);
            hdrSelectEl.appendChild(option);
            updateHDRSelectUI();
          }
        }

        // Tentar próximo nome
        const nextIndex = Math.floor(Math.random() * commonHDRNames.length);
        tryLoadHDR(commonHDRNames[nextIndex]);
      };

      img.onerror = () => {
        // Tentar próximo nome
        const nextIndex = Math.floor(Math.random() * commonHDRNames.length);
        tryLoadHDR(commonHDRNames[nextIndex]);
      };

      img.src = `./assets/images/${filename}`;
    }

    // Começar com um nome aleatório
    const startIndex = Math.floor(Math.random() * commonHDRNames.length);
    tryLoadHDR(commonHDRNames[startIndex]);
  }

  function formatHDRName(filename) {
    return filename
      .replace('.hdr', ' HDR')
      .replace(/^\w/, c => c.toUpperCase())
      .replace(/([a-z])([A-Z])/g, '$1 $2') // Adicionar espaço entre camelCase
      .replace(/_/g, ' '); // Substituir underscore por espaço
  }

  function buildSimpleLightsControls() {
    console.log('[lights] Building simple lights controls...');
    const lightsAdminEl = document.getElementById('lightsAdmin');
    if (!lightsAdminEl) {
      console.warn('[lights] lightsAdmin element not found, cannot build controls');
      return;
    }

    console.log('[lights] lightsAdmin element found, clearing content...');
    // Clear existing content
    lightsAdminEl.innerHTML = '';

    console.log('[lights] lightsAdmin content cleared, rebuilding...');

    // Create Ambient Light controls
    const ambientControl = document.createElement('div');
    ambientControl.className = 'control';
    ambientControl.innerHTML = `
      <label>Luz Ambiente</label>
      <div class="slider-row">
        <input id="ambientIntensity" type="range" min="0" max="2" value="0.4" step="0.01" />
        <span id="ambientIntensityValue">0.4</span>
      </div>
      <div class="toggle-group">
        <label class="toggle-item">
          <input id="ambientEnabled" type="checkbox" checked />
          <span>Luz Ambiente Ativa</span>
        </label>
      </div>
    `;

    // Create Directional Light controls
    const directionalControl = document.createElement('div');
    directionalControl.className = 'control';
    directionalControl.innerHTML = `
      <label>Luz Direcional</label>
      <div class="slider-row">
        <input id="directionalIntensity" type="range" min="0" max="5" value="3.4" step="0.1" />
        <span id="directionalIntensityValue">3.4</span>
      </div>
      <div class="slider-row">
        <input id="directionalPositionY" type="range" min="-10" max="20" value="8.55" step="0.5" />
        <span id="directionalPositionYValue">8.55</span>
      </div>
      <div class="toggle-group">
        <label class="toggle-item">
          <input id="directionalEnabled" type="checkbox" checked />
          <span>Luz Direcional Ativa</span>
        </label>
      </div>
    `;

    lightsAdminEl.appendChild(ambientControl);
    lightsAdminEl.appendChild(directionalControl);


    // Add event listeners for Ambient Light
    const ambientIntensity = document.getElementById('ambientIntensity');
    const ambientIntensityValue = document.getElementById('ambientIntensityValue');
    const ambientEnabled = document.getElementById('ambientEnabled');

    if (ambientIntensity && ambientIntensityValue && ambientEnabled && baseAmbientLight) {
      ambientIntensity.addEventListener('input', () => {
        const value = parseFloat(ambientIntensity.value);
        baseAmbientLight.intensity = value;
        ambientIntensityValue.textContent = value.toFixed(2);
      });

      ambientEnabled.addEventListener('change', () => {
        baseAmbientLight.visible = ambientEnabled.checked;
      });
    }

    // Add event listeners for Directional Light
    const directionalIntensity = document.getElementById('directionalIntensity');
    const directionalIntensityValue = document.getElementById('directionalIntensityValue');
    const directionalPositionY = document.getElementById('directionalPositionY');
    const directionalPositionYValue = document.getElementById('directionalPositionYValue');
    const directionalEnabled = document.getElementById('directionalEnabled');

    if (directionalIntensity && directionalIntensityValue && directionalPositionY && directionalPositionYValue && directionalEnabled && baseDirectionalLight) {
      directionalIntensity.addEventListener('input', () => {
        const value = parseFloat(directionalIntensity.value);
        baseDirectionalLight.intensity = value;
        directionalIntensityValue.textContent = value.toFixed(1);
      });

      directionalPositionY.addEventListener('input', () => {
        const value = parseFloat(directionalPositionY.value);
        baseDirectionalLight.position.y = value;
        directionalPositionYValue.textContent = value.toFixed(1);
      });

      directionalEnabled.addEventListener('change', () => {
        baseDirectionalLight.visible = directionalEnabled.checked;
      });
    }


    console.log('[lights] Simple lights controls initialized successfully');
  }

  // ===== Bootstrapping =====
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
})();
