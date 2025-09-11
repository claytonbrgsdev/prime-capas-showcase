// Scene: Galpão (blue cube + modern_garage scenario)
window.SceneGalpao = (function () {
  function create(canvas) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(2.5, 1.8, 3.2);

    // Orbit controls for debugging
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 0, 0);

    const light1 = new THREE.DirectionalLight(0xffffff, 1.1);
    light1.position.set(3, 4, 5);
    scene.add(light1);
    scene.add(new THREE.AmbientLight(0xffffff, 0.35));

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.35, metalness: 0.2 });
    const cube = new THREE.Mesh(geometry, material);
    scene.add(cube);

    // Load scenario: modern_garage
    let scenarioRoot = null;
    (function loadScenario() {
      if (!THREE.GLTFLoader) return;
      const loader = new THREE.GLTFLoader();
      loader.load(
        'public/assets/scenarios/modern_garage/scene.gltf',
        function (gltf) {
          scenarioRoot = gltf.scene || gltf.scenes?.[0];
          if (!scenarioRoot) return;
          scene.add(scenarioRoot);

          // Compute bounding box/sphere of scenario to center objects and frame camera
          const box = new THREE.Box3().setFromObject(scenarioRoot);
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          const radius = Math.max(size.x, size.y, size.z) * 0.5;

          // Place cube at scenario center
          cube.position.copy(center);

          // Reframe camera to fit the scenario
          const fov = camera.fov * (Math.PI / 180);
          const distance = (radius / Math.tan(fov / 2)) * 1.3; // padding factor
          camera.position.set(center.x + distance, center.y + radius * 0.5, center.z + distance);
          camera.lookAt(center);

          // Update orbit controls target to scenario center
          controls.target.copy(center);
          controls.update();
        },
        undefined,
        function (err) {
          // If load fails, keep default scene
          console.error('Failed to load modern_garage glTF:', err);
        }
      );
    })();

    function update() {
      cube.rotation.x += 0.01;
      cube.rotation.y += 0.0125;
      controls.update();
    }

    function render() {
      SceneResizer.resize(renderer, camera, canvas);
      renderer.render(scene, camera);
    }

    function dispose() {
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      if (scenarioRoot) {
        scene.remove(scenarioRoot);
      }
      controls.dispose && controls.dispose();
    }

    return { update, render, dispose };
  }

  return { create };
})();


