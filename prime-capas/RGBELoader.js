import { RGBELoader as ThreeRGBELoader } from 'three/addons/loaders/RGBELoader.js';

// Thin wrapper so local imports can rely on the official three.js addon implementation.
class RGBELoader extends ThreeRGBELoader {}

export { RGBELoader };
export default RGBELoader;
