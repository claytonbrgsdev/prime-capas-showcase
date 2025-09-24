// BokehPass placeholder - CDN fallback will be used
// This is a minimal implementation for when CDN is available
class BokehPass {
  constructor() {
    console.warn('BokehPass: Using placeholder implementation - CDN fallback active');
    this.enabled = true;
    this.needsSwap = false;
  }

  render(renderer, writeBuffer, readBuffer, deltaTime, maskActive) {
    // Placeholder implementation
  }
}

export { BokehPass };
