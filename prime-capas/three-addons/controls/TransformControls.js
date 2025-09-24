// TransformControls placeholder - CDN fallback will be used
class TransformControls {
  constructor(camera, domElement) {
    console.warn('TransformControls: Using placeholder implementation - CDN fallback active');
    this.camera = camera;
    this.domElement = domElement;
    this.object = null;
    this.mode = 'translate';
    this.enabled = true;
  }

  attach(object) {
    this.object = object;
  }

  detach() {
    this.object = null;
  }

  update() {
    // Placeholder implementation
  }

  dispose() {
    // Placeholder implementation
  }
}

export { TransformControls };
