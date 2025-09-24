// Three.js placeholder - CDN fallback will be used
// This is a minimal implementation for when CDN is available
console.warn('Three.js: Using placeholder implementation - CDN fallback active');

// Export minimal Three.js classes that might be needed
export class Vector3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
}

export class Scene {
  constructor() {
    this.children = [];
    this.background = null;
  }

  add(object) {
    this.children.push(object);
  }
}

export class PerspectiveCamera {
  constructor(fov, aspect, near, far) {
    this.fov = fov;
    this.aspect = aspect;
    this.near = near;
    this.far = far;
    this.position = new Vector3();
  }
}

export class WebGLRenderer {
  constructor() {
    console.warn('WebGLRenderer: Using placeholder implementation');
    this.domElement = document.createElement('canvas');
    this.outputColorSpace = 'SRGBColorSpace';
    this.toneMapping = 0;
    this.toneMappingExposure = 1.0;
    this.shadowMap = { enabled: false };
    this.pixelRatio = 1.0;
    this.physicallyCorrectLights = false;
  }

  set outputColorSpace(value) {
    this._outputColorSpace = value;
  }

  get outputColorSpace() {
    return this._outputColorSpace || 'SRGBColorSpace';
  }

  set toneMapping(value) {
    this._toneMapping = value;
  }

  get toneMapping() {
    return this._toneMapping || 0;
  }

  set toneMappingExposure(value) {
    this._toneMappingExposure = value;
  }

  get toneMappingExposure() {
    return this._toneMappingExposure || 1.0;
  }

  set physicallyCorrectLights(value) {
    this._physicallyCorrectLights = value;
  }

  get physicallyCorrectLights() {
    return this._physicallyCorrectLights || false;
  }

  setSize(width, height) {
    // Placeholder implementation
  }

  setPixelRatio(ratio) {
    this.pixelRatio = ratio;
    console.warn('WebGLRenderer: setPixelRatio called but using placeholder');
  }

  getPixelRatio() {
    return this.pixelRatio;
  }

  render(scene, camera) {
    // Placeholder implementation
  }

  setClearColor(color, alpha) {
    console.warn('WebGLRenderer: setClearColor called but using placeholder');
  }

  compile(scene, camera) {
    console.warn('WebGLRenderer: compile called but using placeholder');
  }

  dispose() {
    // Placeholder implementation
  }
}

// Export THREE constant for compatibility
export const THREE = {
  SRGBColorSpace: 'SRGBColorSpace',
  ACESFilmicToneMapping: 4, // Valor típico do ACESFilmicToneMapping
  LinearToneMapping: 1,
  ReinhardToneMapping: 2,
  CineonToneMapping: 3,
  NoToneMapping: 0,
  WebGLRenderer: class extends WebGLRenderer {},
  PerspectiveCamera: class extends PerspectiveCamera {},
  Scene: class extends Scene {},
  Vector3: class extends Vector3 {},
};
