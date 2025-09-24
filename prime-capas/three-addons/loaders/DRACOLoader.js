// DRACOLoader placeholder - CDN fallback will be used
class DRACOLoader {
  constructor(manager) {
    console.warn('DRACOLoader: Using placeholder implementation - CDN fallback active');
    this.manager = manager;
  }

  setDecoderPath(path) {
    console.warn('DRACOLoader: Decoder path set but using placeholder');
  }

  setDecoderConfig(config) {
    console.warn('DRACOLoader: Decoder config set but using placeholder');
  }

  preload() {
    console.warn('DRACOLoader: Preload called but using placeholder');
  }
}

export { DRACOLoader };
