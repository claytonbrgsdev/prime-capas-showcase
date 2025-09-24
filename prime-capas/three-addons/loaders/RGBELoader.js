// RGBELoader placeholder - CDN fallback will be used
class RGBELoader {
  constructor(manager) {
    console.warn('RGBELoader: Using placeholder implementation - CDN fallback active');
    this.manager = manager;
  }

  load(url, onLoad, onProgress, onError) {
    console.error('RGBELoader placeholder cannot load HDR files. CDN fallback should provide real implementation.');
    if (onError) onError(new Error('RGBELoader placeholder cannot load files'));
  }

  loadAsync(url) {
    return Promise.reject(new Error('RGBELoader placeholder cannot load files'));
  }
}

export { RGBELoader };
