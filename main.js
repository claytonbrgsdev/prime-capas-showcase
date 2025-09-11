// Minimal Three.js scene: rotating cube rendered to #scene canvas
(function () {
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  const canvas = document.getElementById('scene');
  if (!canvas) return;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  scene.background = null; // transparent to show page background

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  camera.position.set(2.5, 1.8, 3.2);

  const light1 = new THREE.DirectionalLight(0xffffff, 1.1);
  light1.position.set(3, 4, 5);
  scene.add(light1);
  const light2 = new THREE.AmbientLight(0xffffff, 0.35);
  scene.add(light2);

  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.35, metalness: 0.2 });
  const cube = new THREE.Mesh(geometry, material);
  scene.add(cube);

  const grid = new THREE.GridHelper(10, 10, 0x94a3b8, 0xe2e8f0);
  grid.position.y = -1.2;
  scene.add(grid);

  function resizeRendererToDisplaySize() {
    const container = canvas.parentElement;
    const width = container.clientWidth;
    const height = container.clientHeight;
    const needResize = canvas.width !== width || canvas.height !== height;
    if (needResize) {
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    }
    return needResize;
  }

  function animate() {
    requestAnimationFrame(animate);
    resizeRendererToDisplaySize();
    cube.rotation.x += 0.01;
    cube.rotation.y += 0.0125;
    renderer.render(scene, camera);
  }
  animate();

  window.addEventListener('resize', resizeRendererToDisplaySize);
})();

