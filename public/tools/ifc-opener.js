/**
 * OmniOpener — IFC (Industry Foundation Classes) Viewer
 * Professional BIM viewer using OmniTool SDK, Three.js, and web-ifc.
 */
(function () {
  'use strict';

  // Helper for human-readable file sizes
  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  // Sanitization for safe HTML injection
  function escape(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  window.initTool = function (toolConfig, mountEl) {
    let renderer, scene, camera, controls, ifcLoader, animationId;
    let currentModel = null;
    let resizeObserver = null;

    /**
     * Clean up all Three.js and WebIFC resources to prevent memory leaks.
     */
    function _cleanup() {
      if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
      }

      if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }

      if (controls) {
        controls.dispose();
        controls = null;
      }

      if (renderer) {
        renderer.dispose();
        if (renderer.domElement && renderer.domElement.parentNode) {
          renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
        renderer = null;
      }

      if (scene) {
        scene.traverse((object) => {
          if (object.geometry) object.geometry.dispose();
          if (object.material) {
            if (Array.isArray(object.material)) {
              object.material.forEach(mat => mat.dispose());
            } else {
              object.material.dispose();
            }
          }
        });
        scene = null;
      }

      currentModel = null;
      camera = null;
    }

    OmniTool.create(mountEl, toolConfig, {
      accept: '.ifc',
      dropLabel: 'Drop an IFC BIM model here',
      binary: true,

      onInit: function (h) {
        h.loadScripts([
          'https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.min.js',
          'https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/controls/OrbitControls.js',
          'https://cdn.jsdelivr.net/npm/web-ifc@0.0.59/web-ifc-api.js',
          'https://cdn.jsdelivr.net/npm/web-ifc-three@0.0.126/dist/web-ifc-three.js'
        ]);
      },

      onDestroy: _cleanup,

      onFile: function _onFile(file, content, h) {
        // Handle race condition for scripts
        if (!window.THREE || !window.THREE.OrbitControls || !window.WebIFC || !window.IFCLoader) {
          h.showLoading('Initializing 3D engine...');
          setTimeout(() => _onFile(file, content, h), 200);
          return;
        }

        h.showLoading('Parsing BIM structure...');
        
        // Use a small delay to allow the loading message to render
        setTimeout(async () => {
          try {
            await renderBIM(file, content, h);
          } catch (err) {
            console.error('[IFC] Render Error:', err);
            h.showError(
              'Failed to render IFC model',
              'The file may be corrupted or use an unsupported IFC schema. Error: ' + err.message
            );
          }
        }, 50);
      },

      actions: [
        {
          label: '📋 Copy Metadata',
          id: 'copy-meta',
          onClick: function (h, btn) {
            const meta = h.getState().metadata;
            if (meta) {
              h.copyToClipboard(JSON.stringify(meta, null, 2), btn);
            } else {
              h.copyToClipboard(h.getFile().name, btn);
            }
          }
        },
        {
          label: '📥 Download',
          id: 'download',
          onClick: function (h) {
            h.download(h.getFile().name, h.getContent(), 'application/octet-stream');
          }
        }
      ],
      infoHtml: '<strong>OmniBIM:</strong> High-performance 3D visualization for Industry Foundation Classes. Powered by <code>web-ifc</code> and <code>Three.js</code>.'
    });

    async function renderBIM(file, content, h) {
      _cleanup();

      // Render Layout
      h.render(`
        <div class="flex flex-col h-full max-h-[85vh] font-sans animate-in fade-in duration-500">
          <!-- U1. File Info Bar -->
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 border border-surface-100">
            <span class="font-semibold text-surface-800">${escape(file.name)}</span>
            <span class="text-surface-300">|</span>
            <span>${formatSize(file.size)}</span>
            <span class="text-surface-300">|</span>
            <span class="text-surface-500">IFC BIM Model</span>
            <div id="ifc-meta-badges" class="ml-auto hidden md:flex items-center gap-2"></div>
          </div>

          <div class="flex-1 flex flex-col lg:flex-row gap-6 min-h-0">
            <!-- 3D Viewport -->
            <div class="relative flex-[3] bg-[#111827] rounded-2xl overflow-hidden border border-surface-200 shadow-sm min-h-[450px]">
              <div id="canvas-mount" class="w-full h-full outline-none"></div>
              
              <!-- Floating Controls -->
              <div class="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-gray-900/90 backdrop-blur-md px-4 py-2 rounded-full border border-gray-700 shadow-2xl">
                <button id="btn-reset" class="text-[10px] font-bold text-gray-400 hover:text-white uppercase tracking-wider transition-colors px-2 border-r border-gray-700">Reset View</button>
                <button id="btn-top" class="text-[10px] font-bold text-gray-400 hover:text-white uppercase tracking-wider transition-colors px-2">Top</button>
                <div class="w-px h-3 bg-gray-700"></div>
                <label class="flex items-center gap-2 cursor-pointer group">
                  <input type="checkbox" id="toggle-wire" class="w-3 h-3 rounded bg-gray-800 border-gray-600 text-brand-500 focus:ring-brand-500 focus:ring-offset-0">
                  <span class="text-[10px] font-bold text-gray-400 group-hover:text-gray-200 uppercase transition-colors">Wireframe</span>
                </label>
              </div>

              <!-- Selection Indicator -->
              <div id="selection-hint" class="absolute top-4 left-4 bg-brand-500/90 text-white text-[10px] font-bold px-2 py-1 rounded shadow-lg hidden">Element Selected</div>
            </div>

            <!-- Side Panel: Properties & Structure -->
            <div class="flex-1 flex flex-col gap-4 min-w-[320px]">
              <!-- Property Search -->
              <div class="bg-white rounded-2xl border border-surface-200 shadow-sm p-4">
                <div class="flex items-center gap-2 px-3 py-2 bg-surface-50 rounded-lg border border-surface-100 focus-within:border-brand-300 transition-colors">
                  <svg class="w-4 h-4 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                  <input type="text" id="prop-filter" placeholder="Filter properties..." class="bg-transparent border-none text-sm focus:ring-0 w-full text-surface-700">
                </div>
              </div>

              <!-- Properties Card -->
              <div class="flex-1 bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden flex flex-col">
                <div class="px-4 py-3 border-b border-surface-100 bg-surface-50 flex items-center justify-between">
                  <h3 class="text-xs font-bold text-surface-800 uppercase tracking-wider">Model Data</h3>
                  <span id="prop-count" class="text-[10px] bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-bold">0 items</span>
                </div>
                <div id="property-list" class="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                  <div class="flex flex-col items-center justify-center h-full text-center p-6 opacity-40">
                    <svg class="w-12 h-12 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" stroke-width="2"/></svg>
                    <p class="text-sm">Select an element in 3D to see properties</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `);

      const mount = document.getElementById('canvas-mount');
      const propList = document.getElementById('property-list');
      const propCount = document.getElementById('prop-count');
      const propFilter = document.getElementById('prop-filter');
      const badgeContainer = document.getElementById('ifc-meta-badges');

      // 1. Scene Setup
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x111827);
      
      camera = new THREE.PerspectiveCamera(45, mount.clientWidth / mount.clientHeight, 0.1, 1000);
      camera.position.set(15, 15, 15);
      
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.shadowMap.enabled = true;
      mount.appendChild(renderer.domElement);

      const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
      scene.add(ambientLight);
      
      const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
      dirLight.position.set(10, 20, 10);
      dirLight.castShadow = true;
      scene.add(dirLight);

      controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;

      // 2. IFC Loading
      ifcLoader = new window.IFCLoader();
      // Set wasm path to local CDN to avoid version mismatch
      ifcLoader.ifcManager.setWasmPath('https://cdn.jsdelivr.net/npm/web-ifc@0.0.59/');

      try {
        const uint8 = new Uint8Array(content);
        currentModel = await ifcLoader.parse(uint8);
        scene.add(currentModel);

        // 3. Auto-fit Camera
        const box = new THREE.Box3().setFromObject(currentModel);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        
        // Center model
        currentModel.position.sub(center);

        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = camera.fov * (Math.PI / 180);
        let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
        cameraZ *= 2.0; // Margin
        
        camera.position.set(cameraZ, cameraZ, cameraZ);
        camera.lookAt(0, 0, 0);
        controls.target.set(0, 0, 0);
        controls.update();

        // 4. Metadata Extraction
        const spatial = await ifcLoader.ifcManager.getSpatialStructure(0);
        h.setState('metadata', spatial);
        
        // Show root info in panel
        _renderProps(spatial, propList, propCount);

        // Add size badge
        badgeContainer.innerHTML = `
          <span class="text-[10px] font-bold uppercase text-slate-500 bg-slate-100 px-2 py-1 rounded border border-slate-200">
            ${Math.round(size.x)}m × ${Math.round(size.y)}m × ${Math.round(size.z)}m
          </span>
          <span class="text-[10px] font-bold uppercase text-brand-600 bg-brand-50 px-2 py-1 rounded border border-brand-100">
            ${spatial.type || 'BIM'}
          </span>
        `;
        badgeContainer.classList.remove('hidden');

      } catch (err) {
        console.error('[IFC] Parse Error:', err);
        throw err;
      }

      // 5. Interaction Handlers
      document.getElementById('btn-reset').onclick = () => {
        controls.reset();
        controls.target.set(0, 0, 0);
        controls.update();
      };

      document.getElementById('btn-top').onclick = () => {
        const dist = camera.position.distanceTo(new THREE.Vector3(0,0,0));
        camera.position.set(0, dist, 0);
        camera.lookAt(0, 0, 0);
        controls.update();
      };

      document.getElementById('toggle-wire').onchange = (e) => {
        if (!currentModel) return;
        currentModel.traverse(node => {
          if (node.isMesh) {
            if (Array.isArray(node.material)) {
              node.material.forEach(m => m.wireframe = e.target.checked);
            } else {
              node.material.wireframe = e.target.checked;
            }
          }
        });
      };

      // Live search filter
      propFilter.oninput = (e) => {
        const query = e.target.value.toLowerCase();
        const items = propList.querySelectorAll('.prop-item');
        let count = 0;
        items.forEach(item => {
          const text = item.textContent.toLowerCase();
          const match = text.includes(query);
          item.style.display = match ? 'block' : 'none';
          if (match) count++;
        });
        propCount.textContent = `${count} items`;
      };

      // 6. Raycasting for selection
      const raycaster = new THREE.Raycaster();
      const mouse = new THREE.Vector2();

      mount.addEventListener('click', async (event) => {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(scene.children, true);

        if (intersects.length > 0) {
          const obj = intersects[0].object;
          if (obj.modelID !== undefined && intersects[0].faceIndex !== undefined) {
            try {
              const index = ifcLoader.ifcManager.getExpressId(obj.geometry, intersects[0].faceIndex);
              const props = await ifcLoader.ifcManager.getItemProperties(obj.modelID, index, true);
              _renderProps(props, propList, propCount);
              document.getElementById('selection-hint').classList.remove('hidden');
              setTimeout(() => document.getElementById('selection-hint').classList.add('hidden'), 2000);
            } catch (e) {
              console.warn('Could not pick element:', e);
            }
          }
        }
      });

      // 7. Animation Loop
      function _animate() {
        if (!mount || !mount.isConnected) {
          _cleanup();
          return;
        }
        animationId = requestAnimationFrame(_animate);
        if (controls) controls.update();
        if (renderer && scene && camera) renderer.render(scene, camera);
      }
      _animate();

      // 8. Responsive
      resizeObserver = new ResizeObserver(() => {
        if (!mount.clientWidth || !mount.clientHeight) return;
        camera.aspect = mount.clientWidth / mount.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(mount.clientWidth, mount.clientHeight);
      });
      resizeObserver.observe(mount);
    }

    /**
     * Render Property JSON into UI Cards
     */
    function _renderProps(data, container, countEl) {
      if (!data) {
        container.innerHTML = `
          <div class="flex flex-col items-center justify-center h-full text-center p-6 opacity-40">
            <p class="text-sm">No data found</p>
          </div>
        `;
        countEl.textContent = '0 items';
        return;
      }

      // Flatten or structure the data
      const items = [];
      const walk = (obj, prefix = '') => {
        for (const key in obj) {
          if (key === 'children') continue;
          const val = obj[key];
          if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
            walk(val, prefix + key + ' / ');
          } else {
            items.push({ key: prefix + key, value: val });
          }
        }
      };
      walk(data);

      if (items.length === 0) {
        container.innerHTML = '<p class="text-xs text-surface-400 italic text-center py-8">Metadata empty.</p>';
        countEl.textContent = '0 items';
        return;
      }

      container.innerHTML = `
        <div class="space-y-2">
          ${items.map(item => `
            <div class="prop-item p-3 bg-surface-50 rounded-xl border border-surface-100 hover:border-brand-200 transition-all group">
              <div class="flex flex-col gap-1">
                <span class="text-[9px] font-bold text-surface-400 uppercase tracking-tighter">${escape(item.key)}</span>
                <span class="text-xs font-medium text-surface-800 break-all select-all">${escape(typeof item.value === 'object' ? JSON.stringify(item.value) : item.value)}</span>
              </div>
            </div>
          `).join('')}
        </div>
      `;

      countEl.textContent = `${items.length} items`;
    }
  };
})();
