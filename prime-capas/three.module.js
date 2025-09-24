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
  }

  setSize(width, height) {
    // Placeholder implementation
  }

  render(scene, camera) {
    // Placeholder implementation
  }
}

// Export THREE constant for compatibility
export const THREE = {};
