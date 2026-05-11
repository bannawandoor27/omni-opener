(function () {
  'use strict';

  var scene, camera, renderer, controls, animationId, modelGroup, resizeHandler;

  function esc(str) {
    if (!str) return '';
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function formatSize(bytes) {
    if (!bytes) return '0 B';
    var k = 1024;
    var sizes = ['B', 'KB', 'MB', 'GB'];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.step,.stp,.iges,.igs',
      binary: true,
      infoHtml: '<strong>CAD Pro:</strong> Professional STEP/IGES viewer powered by Open CASCADE. High-performance tessellation happens entirely in your browser.',

      actions: [
        {
          label: '📸 Screenshot',
          id: 'screenshot',
          onClick: function (h) {
            if (!renderer || !scene || !camera) return;
            renderer.render(scene, camera);
            renderer.domElement.toBlob(function (blob) {
              if (blob) h.download('omni-cad-capture.png', blob, 'image/png');
            }, 'image/png');
          }
        },
        {
          label: '🔄 Reset View',
          id: 'reset-view',
          onClick: function (h) {
            if (controls && camera && modelGroup) {
              var box = new THREE.Box3().setFromObject(modelGroup);
              var center = box.getCenter(new THREE.Vector3());
              var size = box.getSize(new THREE.Vector3());
              var maxDim = Math.max(size.x, size.y, size.z) || 10;
              camera.position.set(center.x + maxDim, center.y + maxDim, center.z + maxDim);
              controls.target.copy(center);
              controls.update();
            }
          }
        },
        {
          label: '📊 Export JSON',
          id: 'export-json',
          onClick: function (h) {
            var result = h.getState().cadResult;
            if (result) {
              var blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
              h.download(h.getFile().name + '.json', blob, 'application/json');
            } else {
              h.showError('No Data', 'Load a file first to export its mesh data.');
            }
          }
        }
      ],

      onInit: function (h) {
        return h.loadScripts([
          'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js',
          'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js',
          'https://cdn.jsdelivr.net/npm/occt-import-js@0.0.12/dist/occt-import-js.js'
        ]);
      },

      onFile: function _onFileFn(file, content, h) {
        h.showLoading('Initialising CAD engine...');
        
        // Ensure scripts are loaded (B1)
        if (typeof THREE === 'undefined' || typeof occtImportJs === 'undefined') {
          h.loadScripts([
            'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js',
            'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js',
            'https://cdn.jsdelivr.net/npm/occt-import-js@0.0.12/dist/occt-import-js.js'
          ]).then(function() {
            _onFileFn(file, content, h);
          });
          return;
        }

        (async function() {
          try {
            var occt = await occtImportJs();
            h.showLoading('Tessellating 3D geometry...');

            var nameLower = file.name.toLowerCase();
            var deflection = h.getState().linearDeflection || 0.1;
            var u8 = new Uint8Array(content);

            var result;
            if (nameLower.endsWith('.step') || nameLower.endsWith('.stp')) {
              result = occt.ReadStep(u8, deflection);
            } else if (nameLower.endsWith('.iges') || nameLower.endsWith('.igs')) {
              result = occt.ReadIges(u8, deflection);
            } else {
              throw new Error('Unsupported file extension. Please use .step, .stp, .iges, or .igs');
            }

            if (!result || !result.success) {
              throw new Error('Failed to parse CAD geometry. The file might be corrupted or uses an unsupported protocol.');
            }

            if (!result.meshes || result.meshes.length === 0) {
              h.render(`
                <div class="flex flex-col items-center justify-center p-12 text-center bg-surface-50 rounded-2xl border-2 border-dashed border-surface-200">
                  <div class="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-4 shadow-sm text-2xl">🧊</div>
                  <h3 class="text-lg font-semibold text-surface-900">Empty Model</h3>
                  <p class="text-surface-500 max-w-sm mt-1">This CAD file contains no renderable 3D meshes or surfaces.</p>
                </div>
              `);
              return;
            }

            h.setState('cadResult', result);
            renderViewer(file, content, result, h, _onFileFn);
          } catch (e) {
            console.error(e);
            h.showError('CAD Processing Error', e.message || 'An error occurred while rendering the 3D model.');
          }
        })();
      },

      onDestroy: function () {
        cleanupAll();
      }
    });
  };

  function renderViewer(file, content, result, h, onFileRef) {
    cleanupAll();

    var deflection = h.getState().linearDeflection || 0.1;
    var materialColor = h.getState().materialColor || '#6366f1';
    var isWireframe = h.getState().isWireframe || false;

    var totalVertices = 0;
    result.meshes.forEach(function (m) {
      if (m.attributes && m.attributes.position) {
        totalVertices += (m.attributes.position.array.length / 3);
      }
    });

    h.render(`
      <div class="flex flex-col h-full">
        <!-- U1: File Info Bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">
          <span class="font-semibold text-surface-800">${esc(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(file.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">${file.name.split('.').pop().toUpperCase()} Format</span>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div class="lg:col-span-3 space-y-4">
            <div class="relative rounded-2xl overflow-hidden border border-surface-200 bg-slate-950 group">
              <div id="cad-mount" class="w-full h-[600px] cursor-move"></div>

              <!-- Overlay Controls -->
              <div class="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-white/90 backdrop-blur border border-surface-200 p-2 rounded-2xl shadow-xl transition-all opacity-0 group-hover:opacity-100">
                <div class="px-3 border-r border-surface-200 flex items-center gap-2">
                  <span class="text-[10px] font-bold text-surface-400 uppercase tracking-widest">Quality</span>
                  <select id="ctrl-qual" class="bg-transparent border-none text-xs font-semibold text-surface-700 outline-none cursor-pointer">
                    <option value="0.5" ${deflection === 0.5 ? 'selected' : ''}>Draft</option>
                    <option value="0.1" ${deflection === 0.1 ? 'selected' : ''}>Standard</option>
                    <option value="0.02" ${deflection === 0.02 ? 'selected' : ''}>High</option>
                    <option value="0.005" ${deflection === 0.005 ? 'selected' : ''}>Ultra</option>
                  </select>
                </div>
                <div class="px-3 border-r border-surface-200 flex items-center gap-2">
                  <span class="text-[10px] font-bold text-surface-400 uppercase tracking-widest">Color</span>
                  <input type="color" id="ctrl-color" value="${materialColor}" class="w-6 h-6 rounded border-none cursor-pointer bg-transparent">
                </div>
                <button id="ctrl-wire" class="px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${isWireframe ? 'bg-brand-600 text-white' : 'hover:bg-surface-100 text-surface-600'}">
                  Wireframe
                </button>
              </div>

              <!-- Stats Overlay -->
              <div class="absolute top-4 right-4 bg-slate-900/80 backdrop-blur text-white/90 p-3 rounded-xl border border-white/10 shadow-xl text-[10px] font-mono flex flex-col gap-1.5 pointer-events-none">
                <div class="flex justify-between gap-6">
                  <span class="text-white/40 uppercase">Meshes</span>
                  <span class="text-brand-400 font-bold">${result.meshes.length}</span>
                </div>
                <div class="flex justify-between gap-6">
                  <span class="text-white/40 uppercase">Vertices</span>
                  <span class="text-brand-400 font-bold">${totalVertices.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Sidebar Information -->
          <div class="lg:col-span-1 space-y-6">
            <div>
              <div class="flex items-center justify-between mb-3">
                <h3 class="font-semibold text-surface-800">Mesh Analysis</h3>
                <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${result.meshes.length} units</span>
              </div>
              
              <div class="overflow-hidden rounded-xl border border-surface-200 max-h-[600px] overflow-y-auto">
                <table class="min-w-full text-sm">
                  <thead class="sticky top-0 bg-white/95 backdrop-blur z-10">
                    <tr>
                      <th class="px-4 py-2.5 text-left font-semibold text-surface-700 border-b border-surface-200">Mesh #</th>
                      <th class="px-4 py-2.5 text-right font-semibold text-surface-700 border-b border-surface-200">Triangles</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-surface-100">
                    ${result.meshes.map((m, i) => `
                      <tr class="even:bg-surface-50 hover:bg-brand-50 transition-colors">
                        <td class="px-4 py-2 text-surface-600">Component ${i + 1}</td>
                        <td class="px-4 py-2 text-right text-surface-500 font-mono">${(m.attributes.position.array.length / 9).toFixed(0)}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>

            <div class="p-4 bg-surface-50 rounded-xl border border-surface-200 space-y-3">
              <h4 class="text-[11px] font-bold text-surface-400 uppercase tracking-wider">Viewer Controls</h4>
              <ul class="text-xs text-surface-600 space-y-2">
                <li class="flex items-center gap-2">
                  <span class="w-5 h-5 bg-white rounded flex items-center justify-center border border-surface-200 shadow-sm">🖱️</span>
                  <b>Rotate:</b> Left Mouse
                </li>
                <li class="flex items-center gap-2">
                  <span class="w-5 h-5 bg-white rounded flex items-center justify-center border border-surface-200 shadow-sm">🖐️</span>
                  <b>Pan:</b> Right Mouse
                </li>
                <li class="flex items-center gap-2">
                  <span class="w-5 h-5 bg-white rounded flex items-center justify-center border border-surface-200 shadow-sm">🔍</span>
                  <b>Zoom:</b> Scroll
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    `);

    var mount = document.getElementById('cad-mount');
    if (!mount) return;

    // THREE Setup
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, mount.clientWidth / mount.clientHeight, 0.1, 1000000);
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    var l1 = new THREE.DirectionalLight(0xffffff, 0.8);
    l1.position.set(1, 1, 1).normalize();
    scene.add(l1);
    var l2 = new THREE.DirectionalLight(0xffffff, 0.4);
    l2.position.set(-1, -1, -1).normalize();
    scene.add(l2);

    modelGroup = new THREE.Group();
    var material = new THREE.MeshPhongMaterial({
      color: materialColor,
      shininess: 30,
      side: THREE.DoubleSide,
      wireframe: isWireframe
    });

    result.meshes.forEach(function (m) {
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(m.attributes.position.array), 3));
      if (m.attributes.normal) {
        geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(m.attributes.normal.array), 3));
      } else {
        geo.computeVertexNormals();
      }
      if (m.index) {
        geo.setIndex(new THREE.BufferAttribute(new Uint32Array(m.index.array), 1));
      }
      modelGroup.add(new THREE.Mesh(geo, material));
    });
    scene.add(modelGroup);

    // Auto-center camera
    var box = new THREE.Box3().setFromObject(modelGroup);
    var center = box.getCenter(new THREE.Vector3());
    var size = box.getSize(new THREE.Vector3());
    var maxDim = Math.max(size.x, size.y, size.z) || 10;
    camera.position.set(center.x + maxDim * 1.5, center.y + maxDim * 1.5, center.z + maxDim * 1.5);
    camera.lookAt(center);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.copy(center);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // Event Handlers
    document.getElementById('ctrl-qual').onchange = function (e) {
      h.setState('linearDeflection', parseFloat(e.target.value));
      onFileRef(file, content, h);
    };

    document.getElementById('ctrl-color').oninput = function (e) {
      var c = e.target.value;
      h.setState('materialColor', c);
      material.color.set(c);
    };

    document.getElementById('ctrl-wire').onclick = function () {
      var active = !material.wireframe;
      material.wireframe = active;
      h.setState('isWireframe', active);
      this.classList.toggle('bg-brand-600', active);
      this.classList.toggle('text-white', active);
      this.classList.toggle('text-surface-600', !active);
    };

    function animate() {
      if (!document.getElementById('cad-mount')) { 
        cleanupAll(); 
        return; 
      }
      animationId = requestAnimationFrame(animate);
      if (controls) controls.update();
      if (renderer && scene && camera) renderer.render(scene, camera);
    }
    animate();

    resizeHandler = function () {
      if (!mount || !renderer || !camera) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener('resize', resizeHandler);
  }

  function cleanupAll() {
    if (animationId) cancelAnimationFrame(animationId);
    if (resizeHandler) window.removeEventListener('resize', resizeHandler);
    if (controls && typeof controls.dispose === 'function') controls.dispose();
    
    if (renderer) {
      renderer.dispose();
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    }
    
    if (scene) {
      scene.traverse(function (obj) {
        if (obj.isMesh) {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) {
            if (Array.isArray(obj.material)) {
              obj.material.forEach(function (m) { if (m.dispose) m.dispose(); });
            } else {
              if (obj.material.dispose) obj.material.dispose();
            }
          }
        }
      });
    }
    
    scene = camera = renderer = controls = modelGroup = resizeHandler = null;
    animationId = null;
  }
})();
