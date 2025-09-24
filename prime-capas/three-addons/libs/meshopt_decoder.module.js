// meshopt_decoder placeholder - CDN fallback will be used
console.warn('meshopt_decoder: Using placeholder implementation - CDN fallback active');

// Export minimal required properties/functions
export const MeshoptDecoder = {
  // Placeholder implementation
  ready: true,

  decodeVertexBuffer: function() {
    console.warn('meshopt_decoder: decodeVertexBuffer is placeholder');
    return new Uint8Array(0);
  },

  decodeIndexBuffer: function() {
    console.warn('meshopt_decoder: decodeIndexBuffer is placeholder');
    return new Uint32Array(0);
  }
};
