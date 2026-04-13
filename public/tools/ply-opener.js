/**
 * OmniOpener — PLY 3D Viewer
 * Uses OmniTool SDK and Three.js.
 */
(function () {
  'use strict';

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.ply',
      binary: true,
      infoHtml: '<strong>PLY Viewer:</strong> High-performance 3D visualization for Polygon File Format. Supports both mesh and point cloud data with vertex colors.',
      
      actions: [
        {
          label: '📥 Download PLY',
          id: 'download-ply',
          onClick: function (h) {
            h.download(h.getFile().name, h.getContent(), 'application/octet-stream');
          }
        },
        {
          label: '📋 Copy Stats',
          id: 'copy-stats',
          onClick: function (h, btn) {
            const state = h.getState();
            if (state.stats) {
              const text = `File: ${h.getFile().name}\nVertices: ${state.stats.vertices}\nFaces: ${state.stats.faces}\nDimensions: ${state.stats.dims}`;
              h.copyToClipboard(text, btn);
            }
          }
        }
      ],

      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.min.js', () => {
           h.loadScript('https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/loaders/PLYLoader.js', () => {
              h.loadScript('https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/controls/OrbitControls.js');
           });
        });
      },

      onFile: function (file, content, h) {
        if (typeof THREE === 'undefined' || typeof THREE.PLYLoader === 'undefined') {
          h.showLoading('Loading 3D engine...');
          setTimeout(() => this.onFile(file, content, h), 500);
          return;
        }

        h.showLoading('Parsing PLY data...');
        try {
          const loader = new THREE.PLYLoader();
          const geometry = loader.parse(content);
          renderViewer(geometry, file, h);
        } catch (err) {
           h.showError('Parsing Error', 'Unable to parse this PLY model. It may be corrupted or in an unsupported sub-format.');
        }
      }
    });
  };

  function renderViewer(geometry, file, h) {
    geometry.computeBoundingBox();
    const size = geometry.boundingBox.getSize(new THREE.Vector3());
    const vertices = geometry.attributes.position.count;
    const faces = geometry.index ? geometry.index.count / 3 : 0;
    const dims = `${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}`;

    h.setState('stats', {
      vertices: vertices.toLocaleString(),
      faces: faces.toLocaleString(),
      dims: dims
    });

    h.render(`
      <div class="flex flex-col h-[80vh] font-sans">
        <div class="flex items-center gap-3 px-4 py-2 bg-surface-50 rounded-t-xl text-[10px] text-surface-500 border border-surface-200 border-b-0">
          <span class="font-bold text-surface-900 uppercase">${escapeHtml(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${vertices.toLocaleString()} Vertices</span>
          ${faces > 0 ? `<span class="text-surface-300">|</span><span>${faces.toLocaleString()} Faces</span>` : ''}
          <span class="text-surface-300">|</span>
          <span class="text-brand-600 font-bold">${dims} units</span>
        </div>
        <div class="relative flex-1 bg-slate-900 rounded-b-xl overflow-hidden border border-surface-200 shadow-xl">
          <div id="three-container" class="w-full h-full cursor-move"></div>
          <div class="absolute top-4 right-4 w-48 bg-white/95 backdrop-blur shadow-xl rounded-xl border border-surface-200 p-4 space-y-4">
             <section>
                <label class="block text-[10px] font-bold text-surface-400 uppercase mb-2">Environment</label>
                <select id="env-preset" class="w-full text-xs p-1.5 bg-surface-50 border border-surface-200 rounded outline-none font-bold">
                   <option value="studio">Studio</option>
                   <option value="night">Night</option>
                   <option value="sunset">Sunset</option>
                </select>
             </section>
             <section class="space-y-2">
                <label class="flex items-center justify-between cursor-pointer group">
                   <span class="text-[10px] font-bold text-surface-400 uppercase group-hover:text-brand-600 transition-colors">Point Cloud</span>
                   <input type="checkbox" id="check-points" class="w-3 h-3 accent-brand-500" ${faces === 0 ? 'checked disabled' : ''}>
                </label>
                <label class="flex items-center justify-between cursor-pointer group">
                   <span class="text-[10px] font-bold text-surface-400 uppercase group-hover:text-brand-600 transition-colors">Wireframe</span>
                   <input type="checkbox" id="check-wire" class="w-3 h-3 accent-brand-500">
                </label>
                <label class="flex items-center justify-between cursor-pointer group">
                   <span class="text-[10px] font-bold text-surface-400 uppercase group-hover:text-brand-600 transition-colors">Auto-Rotate</span>
                   <input type="checkbox" id="check-rotate" class="w-3 h-3 accent-brand-500">
                </label>
             </section>
             <button id="btn-reset" class="w-full py-1.5 bg-surface-100 text-surface-600 text-[10px] font-bold rounded hover:bg-surface-200 transition-colors">Reset Camera</button>
          </div>
        </div>
      </div>
    `);

    const container = document.getElementById('three-container');
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);

    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 10000);
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const mainLight = new THREE.DirectionalLight(0xffffff, 1.2);
    mainLight.position.set(5, 10, 7);
    scene.add(mainLight);

    // PLY can have vertex colors
    const hasColors = geometry.attributes.color !== undefined;
    
    // Mesh Material
    const meshMaterial = new THREE.MeshStandardMaterial({ 
      color: hasColors ? 0xffffff : 0x4f46e5, 
      vertexColors: hasColors,
      roughness: 0.5,
      metalness: 0.2
    });
    
    // Point Material
    const pointMaterial = new THREE.PointsMaterial({ 
      size: 0.05, 
      vertexColors: hasColors, 
      color: hasColors ? 0xffffff : 0x4f46e5 
    });

    const mesh = new THREE.Mesh(geometry, meshMaterial);
    const points = new THREE.Points(geometry, pointMaterial);
    
    const center = new THREE.Vector3();
    geometry.boundingBox.getCenter(center);
    mesh.position.sub(center);
    points.position.sub(center);

    if (faces > 0) {
      scene.add(mesh);
    } else {
      scene.add(points);
    }

    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    camera.position.set(maxDim * 1.5, maxDim * 1.5, maxDim * 1.5);
    camera.lookAt(0, 0, 0);

    const envs = {
       studio: { bg: 0x0f172a, light: 1.2 },
       night: { bg: 0x020617, light: 0.4 },
       sunset: { bg: 0x451a03, light: 1.5 }
    };

    document.getElementById('env-preset').onchange = (e) => {
       const p = envs[e.target.value];
       scene.background = new THREE.Color(p.bg);
       mainLight.intensity = p.light;
    };
    
    document.getElementById('check-points').onchange = (e) => {
      if (e.target.checked) {
        scene.remove(mesh);
        scene.add(points);
      } else {
        scene.remove(points);
        scene.add(mesh);
      }
    };

    document.getElementById('check-wire').onchange = (e) => meshMaterial.wireframe = e.target.checked;
    document.getElementById('check-rotate').onchange = (e) => controls.autoRotate = e.target.checked;
    document.getElementById('btn-reset').onclick = () => { 
      camera.position.set(maxDim * 1.5, maxDim * 1.5, maxDim * 1.5); 
      controls.reset(); 
    };

    const animate = () => {
       if (!container.isConnected) { renderer.dispose(); return; }
       requestAnimationFrame(animate);
       controls.update();
       renderer.render(scene, camera);
    };
    animate();

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      if (container.clientWidth > 0 && container.clientHeight > 0) {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
      }
    });
    resizeObserver.observe(container);
  }
})();
