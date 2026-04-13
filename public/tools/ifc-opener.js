/**
 * OmniOpener — IFC (Industry Foundation Classes) Viewer
 * Professional BIM viewer using OmniTool SDK, Three.js, and web-ifc.
 */
(function () {
  'use strict';

  function formatSize(b) {
    return b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : b > 1e3 ? (b / 1024).toFixed(0) + ' KB' : b + ' B';
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  window.initTool = function (toolConfig, mountEl) {
    let animationId, renderer, scene, camera, controls, ifcLoader;

    function cleanup() {
      if (animationId) cancelAnimationFrame(animationId);
      if (renderer) {
        renderer.dispose();
        if (renderer.domElement && renderer.domElement.parentNode) {
          renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
      }
      if (controls) controls.dispose();
      animationId = null;
      renderer = null;
      scene = null;
      camera = null;
      controls = null;
    }

    OmniTool.create(mountEl, toolConfig, {
      accept: '.ifc',
      dropLabel: 'Drop an IFC (BIM) file here',
      binary: true,
      onInit: function (h) {
        h.loadScripts([
          'https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.min.js',
          'https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/controls/OrbitControls.js',
          'https://cdn.jsdelivr.net/npm/web-ifc@0.0.59/web-ifc-api.js',
          'https://cdn.jsdelivr.net/npm/web-ifc-three@0.0.126/dist/web-ifc-three.js'
        ]);
      },

      onDestroy: cleanup,

      onFile: function (file, content, h) {
        if (!window.THREE || !window.THREE.OrbitControls || !window.WebIFC || !window.IFCLoader) {
          h.showLoading('Initializing 3D engine...');
          setTimeout(() => this.onFile(file, content, h), 500);
          return;
        }

        h.showLoading('Parsing IFC BIM model...');
        
        setTimeout(async () => {
          try {
            await renderViewer(file, content, h);
          } catch (err) {
            console.error(err);
            h.showError('Could not parse IFC file', err.message);
          }
        }, 100);
      },

      actions: [
        {
          label: '📋 Copy Properties',
          id: 'copy',
          onClick: function (h, btn) {
            const props = h.getState().properties;
            if (props) {
              const text = JSON.stringify(props, null, 2);
              h.copyToClipboard(text, btn);
            } else {
              h.copyToClipboard(h.getFile().name, btn);
            }
          }
        },
        {
          label: '📥 Download Original',
          id: 'dl',
          onClick: function (h) {
            h.download(h.getFile().name, h.getContent(), 'application/octet-stream');
          }
        }
      ],
      infoHtml: '<strong>BIM Viewer:</strong> 100% browser-based IFC visualization. Your architectural models never leave your machine.'
    });

    async function renderViewer(file, content, h) {
      cleanup();

      h.render(`
        <div class="flex flex-col h-[85vh] font-sans">
          <!-- File Info Bar -->
          <div class="flex items-center gap-3 p-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 border border-surface-200">
            <span class="font-bold text-surface-900 truncate">${escapeHtml(file.name)}</span>
            <span class="text-surface-400">·</span>
            <span>${formatSize(file.size)}</span>
            <div id="ifc-status" class="ml-auto flex items-center gap-2">
              <span class="text-[10px] font-bold uppercase text-brand-600 bg-brand-50 px-2 py-1 rounded border border-brand-100">BIM Model</span>
            </div>
          </div>

          <div class="flex-1 flex flex-col md:flex-row gap-4 min-h-0">
            <!-- 3D View Container -->
            <div class="relative flex-[2] bg-[#0f172a] rounded-2xl overflow-hidden border border-surface-200 shadow-xl min-h-[400px]">
              <div id="ifc-mount" class="w-full h-full cursor-move"></div>
              
              <!-- Toolbar -->
              <div class="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-slate-900/80 backdrop-blur px-3 py-2 rounded-full border border-slate-700 shadow-2xl">
                <button id="reset-cam" class="text-[10px] font-bold text-slate-300 hover:text-white uppercase transition-colors px-3 border-r border-slate-700">Reset View</button>
                <label class="flex items-center gap-2 cursor-pointer px-2 group">
                  <input type="checkbox" id="wire-check" class="w-3 h-3 rounded bg-slate-800 border-slate-600 text-brand-500 focus:ring-brand-500">
                  <span class="text-[10px] font-bold text-slate-400 group-hover:text-slate-200 uppercase transition-colors">Wireframe</span>
                </label>
              </div>
            </div>

            <!-- Property Panel -->
            <div class="flex-1 bg-white rounded-2xl border border-surface-200 shadow-lg overflow-hidden flex flex-col max-h-[400px] md:max-h-none">
              <div class="p-4 border-b border-surface-100 bg-surface-50">
                <h3 class="text-xs font-bold text-surface-400 uppercase tracking-wider">Model Properties</h3>
              </div>
              <div id="ifc-props" class="flex-1 overflow-auto p-4 space-y-4">
                <div class="animate-pulse space-y-3">
                  <div class="h-2 bg-surface-100 rounded w-3/4"></div>
                  <div class="h-2 bg-surface-100 rounded w-1/2"></div>
                  <div class="h-2 bg-surface-100 rounded w-5/6"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `);

      const mount = document.getElementById('ifc-mount');
      const propEl = document.getElementById('ifc-props');

      // Initialize Three.js Scene
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0f172a);
      
      camera = new THREE.PerspectiveCamera(45, mount.clientWidth / mount.clientHeight, 0.1, 1000);
      camera.position.set(10, 10, 10);
      
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      mount.appendChild(renderer.domElement);

      const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
      scene.add(ambientLight);
      
      const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
      directionalLight.position.set(5, 10, 7);
      scene.add(directionalLight);

      controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;

      // Initialize IFC Loader
      ifcLoader = new window.IFCLoader();
      ifcLoader.ifcManager.setWasmPath('https://cdn.jsdelivr.net/npm/web-ifc@0.0.59/');

      try {
        const uint8 = new Uint8Array(content);
        const model = await ifcLoader.parse(uint8);
        scene.add(model);

        // Center and Fit Camera
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        model.position.sub(center);

        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = camera.fov * (Math.PI / 180);
        let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
        cameraZ *= 1.5;
        camera.position.set(cameraZ, cameraZ, cameraZ);
        camera.lookAt(0, 0, 0);
        controls.update();

        // Extract Basic Info
        const projectProps = await ifcLoader.ifcManager.getSpatialStructure(0);
        h.setState('properties', projectProps);
        
        renderProperties(projectProps, propEl);

        document.getElementById('ifc-status').innerHTML += `
          <span class="text-[10px] font-bold uppercase text-slate-500 bg-slate-100 px-2 py-1 rounded border border-slate-200">${Math.round(size.x)}m × ${Math.round(size.y)}m</span>
        `;
      } catch (err) {
        console.error(err);
        propEl.innerHTML = `<p class="text-sm text-red-500">Failed to extract properties: ${err.message}</p>`;
      }

      // Interaction
      document.getElementById('reset-cam').onclick = () => {
        controls.reset();
        camera.position.set(10, 10, 10);
        camera.lookAt(0, 0, 0);
      };
      
      document.getElementById('wire-check').onchange = (e) => {
        scene.traverse(node => {
          if (node.isMesh) node.material.wireframe = e.target.checked;
        });
      };

      // Animation Loop
      function animate() {
        if (!mount.isConnected) {
          cleanup();
          return;
        }
        animationId = requestAnimationFrame(animate);
        if (controls) controls.update();
        if (renderer && scene && camera) renderer.render(scene, camera);
      }
      animate();

      const resizeObserver = new ResizeObserver(() => {
        if (!mount.clientWidth || !mount.clientHeight) return;
        if (camera && renderer) {
          camera.aspect = mount.clientWidth / mount.clientHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(mount.clientWidth, mount.clientHeight);
        }
      });
      resizeObserver.observe(mount);
    }

    function renderProperties(props, container) {
      if (!props) {
        container.innerHTML = '<p class="text-xs text-surface-400 italic text-center py-8">No properties found in model.</p>';
        return;
      }

      let html = '<div class="space-y-4">';
      
      html += `
        <div>
          <h4 class="text-[10px] font-bold text-surface-400 uppercase mb-2">Project Entity</h4>
          <div class="bg-surface-50 rounded-lg border border-surface-100 p-3 space-y-2">
            <div class="flex justify-between text-xs">
              <span class="text-surface-500">Type</span>
              <span class="font-medium text-surface-900">${escapeHtml(props.type || 'IfcProject')}</span>
            </div>
            <div class="flex justify-between text-xs">
              <span class="text-surface-500">Express ID</span>
              <span class="font-mono text-[10px] text-brand-600 truncate ml-4">${escapeHtml(props.expressID || '0')}</span>
            </div>
          </div>
        </div>
      `;

      if (props.children && props.children.length > 0) {
        html += `
          <div>
            <h4 class="text-[10px] font-bold text-surface-400 uppercase mb-2">Structure</h4>
            <div class="space-y-1">
              ${props.children.map(child => `
                <div class="flex items-center gap-2 p-2 hover:bg-surface-50 rounded-lg transition-colors cursor-default border border-transparent hover:border-surface-100">
                  <span class="text-sm">🏢</span>
                  <div class="flex flex-col">
                    <span class="text-xs font-medium text-surface-700">${escapeHtml(child.type)}</span>
                    <span class="text-[9px] text-surface-400">ID: ${child.expressID}</span>
                  </div>
                  ${child.children && child.children.length ? `<span class="ml-auto text-[9px] bg-surface-200 text-surface-600 px-1.5 rounded-full">${child.children.length}</span>` : ''}
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }

      html += '</div>';
      container.innerHTML = html;
    }
  };
})();
