// GLTFLoader placeholder - CDN fallback will be used
class GLTFLoader {
  constructor(manager) {
    console.warn('GLTFLoader: Using placeholder implementation - CDN fallback active');
    this.manager = manager;
  }

  load(url, onLoad, onProgress, onError) {
    console.error('GLTFLoader placeholder cannot load models. CDN fallback should provide real implementation.');
    if (onError) onError(new Error('GLTFLoader placeholder cannot load files'));
  }

  loadAsync(url) {
    return Promise.reject(new Error('GLTFLoader placeholder cannot load files'));
  }
}

export { GLTFLoader };
