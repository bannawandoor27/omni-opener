(function () {
  'use strict';

  var scene, camera, renderer, controls, animationId, modelGroup, resizeHandler;

  function esc(str) {
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
      infoHtml: '<strong>CAD Pro:</strong> Professional STEP/IGES viewer powered by Open CASCADE. All processing happens in-browser for 100% privacy.',

      actions: [
        {
          label: '📸 Screenshot',
          id: 'screenshot',
          onClick: function (h) {
            if (!renderer || !scene || !camera) return;
            renderer.render(scene, camera);
            renderer.domElement.toBlob(function (blob) {
              h.download('screenshot.png', blob, 'image/png');
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

      onFile: async function _onFile(file, content, h) {
        h.showLoading('Initialising CAD engine...');
        try {
          if (typeof occtImportJs === 'undefined') {
            await h.loadScripts([
              'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js',
              'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js',
              'https://cdn.jsdelivr.net/npm/occt-import-js@0.0.12/dist/occt-import-js.js'
            ]);
          }

          var occt = await occtImportJs();
          h.showLoading('Tessellating 3D geometry...');

          var ext = file.name.split('.').pop().toLowerCase();
          var deflection = h.getState().linearDeflection || 0.1;
          var u8 = new Uint8Array(content);

          var result;
          if (ext === 'step' || ext === 'stp') {
            result = occt.ReadStep(u8, deflection);
          } else {
            result = occt.ReadIges(u8, deflection);
          }

          if (!result || !result.success) {
            throw new Error('Failed to parse file. The format might be unsupported or corrupted.');
          }

          if (!result.meshes || result.meshes.length === 0) {
            h.render(`
              <div class="flex flex-col items-center justify-center p-12 text-center bg-surface-50 rounded-2xl border-2 border-dashed border-surface-200">
                <div class="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-4 shadow-sm">
                  <span class="text-2xl">🧊</span>
                </div>
                <h3 class="text-lg font-semibold text-surface-900">Empty Model</h3>
                <p class="text-surface-500 max-w-sm mt-1">This file contains no renderable 3D geometry.</p>
              </div>
            `);
            return;
          }

          h.setState('cadResult', result);
          renderViewer(file, result, h, _onFile);
        } catch (e) {
          h.showError('CAD Error', e.message || 'Could not process the 3D model.');
        }
      },

      onDestroy: function () {
        cleanupAll();
      }
    });
  };

  function renderViewer(file, result, h, onFileRef) {
    cleanupAll();

    var deflection = h.getState().linearDeflection || 0.1;
    var materialColor = h.getState().materialColor || '#6366f1';
    var isWireframe = h.getState().isWireframe || false;

    var totalVertices = 0;
    result.meshes.forEach(function (m) {
      totalVertices += (m.attributes.position.array.length / 3);
    });

    h.render(`
      <div class="flex flex-col h-full font-sans">
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">
          <span class="font-semibold text-surface-800">${esc(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(file.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">${file.name.split('.').pop().toUpperCase()} File</span>
        </div>

        <div class="relative rounded-2xl overflow-hidden border border-surface-200 bg-slate-950 group">
          <div id="cad-mount" class="w-full h-[600px]"></div>

          <div class="absolute top-4 right-4 flex flex-col gap-3 pointer-events-none">
            <div class="bg-white/95 backdrop-blur shadow-2xl rounded-2xl p-4 border border-white/20 pointer-events-auto min-w-[200px]">
              <div class="mb-4">
                <label class="block text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-2">Quality</label>
                <select id="ctrl-qual" class="w-full bg-surface-50 border border-surface-200 rounded-lg px-3 py-2 text-xs font-medium outline-none transition-all cursor-pointer hover:border-brand-300">
                  <option value="0.5" ${deflection === 0.5 ? 'selected' : ''}>Draft (Fast)</option>
                  <option value="0.1" ${deflection === 0.1 ? 'selected' : ''}>Standard</option>
                  <option value="0.02" ${deflection === 0.02 ? 'selected' : ''}>High Detail</option>
                  <option value="0.005" ${deflection === 0.005 ? 'selected' : ''}>Ultra (Slow)</option>
                </select>
              </div>

              <div class="flex gap-3">
                <div class="flex-1">
                  <label class="block text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-2">Color</label>
                  <div class="relative h-10 rounded-lg border border-surface-200 overflow-hidden">
                    <input type="color" id="ctrl-color" value="${materialColor}" class="absolute inset-[-5px] w-[calc(100%+10px)] h-[calc(100%+10px)] cursor-pointer">
                  </div>
                </div>
                <div>
                  <label class="block text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-2">Wire</label>
                  <button id="ctrl-wire" class="w-10 h-10 rounded-lg border flex items-center justify-center transition-all ${isWireframe ? 'bg-brand-600 border-brand-700 text-white' : 'bg-surface-50 border-surface-200 text-surface-600'}">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16m-7 6h7"></path></svg>
                  </button>
                </div>
              </div>
            </div>

            <div class="bg-slate-900/80 backdrop-blur text-white/90 p-3 rounded-xl border border-white/10 shadow-xl text-[10px] font-mono flex flex-col gap-1.5">
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
      </div>
    `);

    var mount = document.getElementById('cad-mount');
    if (!mount) return;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, mount.clientWidth / mount.clientHeight, 0.1, 1000000);
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    var l1 = new THREE.DirectionalLight(0xffffff, 0.8);
    l1.position.set(100, 100, 100);
    scene.add(l1);
    var l2 = new THREE.DirectionalLight(0xffffff, 0.3);
    l2.position.set(-100, -100, -100);
    scene.add(l2);

    modelGroup = new THREE.Group();
    var material = new THREE.MeshPhongMaterial({
      color: materialColor,
      shininess: 50,
      side: THREE.DoubleSide,
      wireframe: isWireframe
    });

    result.meshes.forEach(function (m) {
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(m.attributes.position.array, 3));
      if (m.attributes.normal) {
        geo.setAttribute('normal', new THREE.BufferAttribute(m.attributes.normal.array, 3));
      } else {
        geo.computeVertexNormals();
      }
      if (m.index) {
        geo.setIndex(new THREE.BufferAttribute(m.index.array, 1));
      }
      modelGroup.add(new THREE.Mesh(geo, material));
    });
    scene.add(modelGroup);

    var box = new THREE.Box3().setFromObject(modelGroup);
    var center = box.getCenter(new THREE.Vector3());
    var size = box.getSize(new THREE.Vector3());
    var maxDim = Math.max(size.x, size.y, size.z) || 10;
    camera.position.set(center.x + maxDim, center.y + maxDim, center.z + maxDim);
    camera.lookAt(center);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.copy(center);
    controls.enableDamping = true;

    document.getElementById('ctrl-qual').onchange = function (e) {
      h.setState('linearDeflection', parseFloat(e.target.value));
      onFileRef(file, h.getContent(), h);
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
      this.classList.toggle('border-brand-700', active);
      this.classList.toggle('text-white', active);
      this.classList.toggle('bg-surface-50', !active);
      this.classList.toggle('border-surface-200', !active);
      this.classList.toggle('text-surface-600', !active);
    };

    function animate() {
      if (!document.getElementById('cad-mount')) { cleanupAll(); return; }
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
    if (controls) controls.dispose();
    if (renderer) {
      renderer.dispose();
      if (renderer.domElement && renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
    if (scene) {
      scene.traverse(function (obj) {
        if (obj.isMesh) {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) {
            if (Array.isArray(obj.material)) {
              obj.material.forEach(function (m) { m.dispose(); });
            } else {
              obj.material.dispose();
            }
          }
        }
      });
    }
    scene = camera = renderer = controls = modelGroup = resizeHandler = null;
  }
})();
