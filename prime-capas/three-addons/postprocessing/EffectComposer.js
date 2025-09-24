// EffectComposer placeholder - CDN fallback will be used
class EffectComposer {
  constructor(renderer) {
    console.warn('EffectComposer: Using placeholder implementation - CDN fallback active');
    this.renderer = renderer;
    this.passes = [];
  }

  addPass(pass) {
    this.passes.push(pass);
  }

  render(deltaTime) {
    // Placeholder implementation
  }
}

export { EffectComposer };
