(function() {
  /**
   * FBX Opener Tool for OmniOpener
   * Production-grade 3D viewer with Three.js
   */
  window.initTool = function(toolConfig, mountEl) {
    let renderer, scene, camera, controls, model, mixer, clock, animationId, resizeObserver;

    const formatSize = (bytes) => {
      if (!bytes) return '0 B';
      const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    const escapeHtml = (str) => {
      if (!str) return '';
      return String(str).replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      })[m]);
    };

    function cleanup() {
      if (animationId) cancelAnimationFrame(animationId);
      if (resizeObserver) resizeObserver.disconnect();
      if (renderer) {
        renderer.dispose();
        if (renderer.domElement && renderer.domElement.parentNode) {
          renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
      }
      if (scene) {
        scene.traverse(obj => {
          if (obj.isMesh) {
            obj.geometry?.dispose();
            if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
            else obj.material?.dispose();
          }
        });
      }
      model = scene = camera = controls = renderer = mixer = null;
    }

    OmniTool.create(mountEl, toolConfig, {
      accept: '.fbx',
      binary: true,
      onInit: (h) => {
        h.loadScript('https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js', () => {
          h.loadScript('https://cdn.jsdelivr.net/npm/fflate@0.8.2/lib/browser.min.js', () => {
            h.loadScript('https://cdn.jsdelivr.net/npm/three@0.149.0/examples/js/loaders/FBXLoader.js', () => {
              h.loadScript('https://cdn.jsdelivr.net/npm/three@0.149.0/examples/js/controls/OrbitControls.js');
            });
          });
        });
      },
      onDestroy: cleanup,
      onFile: function _onFileFn(file, content, h) {
        if (!window.THREE || !THREE.FBXLoader || !THREE.OrbitControls || !window.fflate) {
          h.showLoading('Initializing 3D engine...');
          setTimeout(function() { _onFileFn(file, content, h); }, 300);
          return;
        }

        cleanup();
        h.showLoading('Parsing 3D geometry...');

        try {
          const loader = new THREE.FBXLoader();
          const object = loader.parse(content, '');
          if (!object || (object.children.length === 0 && !object.isMesh)) {
            h.showError('Empty Model', 'The FBX file was parsed but contains no visible 3D geometry.');
            return;
          }
          renderViewer(object, file, h);
        } catch (err) {
          console.error('[FBX Error]', err);
          h.showError('Could not open FBX file', 'The file may be corrupted, in an unsupported variant, or uses features not supported by the browser-based loader.');
        }
      },
      actions: [
        {
          label: '📸 Save Preview',
          onClick: (h) => {
            if (!renderer) return;
            renderer.render(scene, camera);
            renderer.domElement.toBlob(blob => {
              const name = h.getFile().name.replace(/\.[^/.]+$/, "") + "-preview.png";
              h.download(name, blob, 'image/png');
            }, 'image/png');
          }
        },
        {
          label: '📋 Copy Stats',
          onClick: (h, btn) => {
            if (!model) return;
            let v = 0, p = 0, m = 0;
            model.traverse(n => {
              if (n.isMesh) {
                m++;
                v += n.geometry.attributes.position.count;
                p += n.geometry.index ? n.geometry.index.count / 3 : n.geometry.attributes.position.count / 3;
              }
            });
            const stats = `File: ${h.getFile().name}\nMeshes: ${m}\nVertices: ${v.toLocaleString()}\nPolygons: ${Math.round(p).toLocaleString()}`;
            h.copyToClipboard(stats, btn);
          }
        }
      ]
    });

    function renderViewer(object, file, h) {
      model = object;
      clock = new THREE.Clock();
      let v = 0, p = 0, m = 0;
      model.traverse(n => {
        if (n.isMesh) {
          m++;
          v += n.geometry.attributes.position.count;
          p += n.geometry.index ? n.geometry.index.count / 3 : n.geometry.attributes.position.count / 3;
        }
      });

      h.render(`
        <div class="flex flex-col h-full overflow-hidden animate-in fade-in duration-500">
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 border border-surface-200">
            <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
            <span class="text-surface-300">|</span>
            <span>${formatSize(file.size)}</span>
            <span class="text-surface-300">|</span>
            <span class="text-surface-500">.fbx file</span>
          </div>

          <div class="flex items-center justify-between mb-3 px-1">
            <h3 class="font-semibold text-surface-800">Scene Information</h3>
            <div class="flex gap-2">
              <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${m} meshes</span>
              <span class="text-xs bg-surface-100 text-surface-700 px-2 py-0.5 rounded-full">${Math.round(p).toLocaleString()} polys</span>
            </div>
          </div>

          <div class="relative flex-1 bg-slate-950 rounded-2xl overflow-hidden border border-surface-200 shadow-sm group">
            <div id="fbx-viewport" class="w-full h-full cursor-grab active:cursor-grabbing"></div>
            
            <div class="absolute top-4 right-4 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button id="ctrl-reset" class="p-2 bg-white/10 hover:bg-white/20 backdrop-blur rounded-lg border border-white/20 text-white transition-all shadow-lg" title="Reset Camera">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
              </button>
              <button id="ctrl-wire" class="p-2 bg-white/10 hover:bg-white/20 backdrop-blur rounded-lg border border-white/20 text-white transition-all shadow-lg" title="Toggle Wireframe">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12l-9-9-9 9 9 9 9-9z"></path></svg>
              </button>
              <button id="ctrl-grid" class="p-2 bg-white/10 hover:bg-white/20 backdrop-blur rounded-lg border border-white/20 text-white transition-all shadow-lg" title="Toggle Grid">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"></path></svg>
              </button>
            </div>

            <div id="anim-container" class="absolute bottom-4 left-4 max-w-[200px] hidden">
               <div class="bg-black/40 backdrop-blur-md rounded-xl border border-white/10 p-2 shadow-2xl">
                 <div class="text-[10px] text-white/50 uppercase tracking-wider font-bold mb-2 px-1">Animations</div>
                 <div id="anim-list" class="flex flex-col gap-1 max-h-[160px] overflow-y-auto pr-1"></div>
               </div>
            </div>

            <div class="absolute bottom-4 right-4 text-[10px] font-mono text-white/30 pointer-events-none">
              VERTICES: ${v.toLocaleString()}
            </div>
          </div>
        </div>
      `);

      const container = document.getElementById('fbx-viewport');
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.setSize(container.clientWidth, container.clientHeight);
      renderer.outputEncoding = THREE.sRGBEncoding;
      container.appendChild(renderer.domElement);

      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x020617);
      camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 2000000);
      
      controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;

      scene.add(new THREE.AmbientLight(0xffffff, 0.7));
      const mainLight = new THREE.DirectionalLight(0xffffff, 0.8);
      mainLight.position.set(100, 100, 100);
      scene.add(mainLight);
      
      const fillLight = new THREE.DirectionalLight(0xddeeff, 0.5);
      fillLight.position.set(-100, 50, -100);
      scene.add(fillLight);

      const grid = new THREE.GridHelper(1000, 50, 0x1e293b, 0x0f172a);
      scene.add(grid);
      scene.add(model);

      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const fov = camera.fov * (Math.PI / 180);
      let dist = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.8;

      camera.position.set(center.x + dist, center.y + dist * 0.5, center.z + dist);
      controls.target.copy(center);
      controls.update();

      mixer = new THREE.AnimationMixer(model);
      if (model.animations?.length > 0) {
        document.getElementById('anim-container').classList.remove('hidden');
        const list = document.getElementById('anim-list');
        model.animations.forEach((clip, i) => {
          const btn = document.createElement('button');
          btn.className = "text-left px-2 py-1.5 rounded-lg text-[11px] text-white/70 hover:bg-white/10 transition-all truncate border border-transparent";
          btn.textContent = clip.name || `Animation ${i + 1}`;
          btn.onclick = () => {
            mixer.stopAllAction();
            mixer.clipAction(clip).play();
            Array.from(list.children).forEach(c => c.className = c.className.replace('bg-brand-500 text-white border-brand-400', 'text-white/70 hover:bg-white/10 border-transparent'));
            btn.className = btn.className.replace('text-white/70 hover:bg-white/10 border-transparent', 'bg-brand-500 text-white border-brand-400');
          };
          list.appendChild(btn);
          if (i === 0) btn.click();
        });
      }

      let wireframe = false;
      document.getElementById('ctrl-wire').onclick = () => {
        wireframe = !wireframe;
        model.traverse(n => {
          if (n.isMesh) {
            if (Array.isArray(n.material)) n.material.forEach(m => m.wireframe = wireframe);
            else n.material.wireframe = wireframe;
          }
        });
        document.getElementById('ctrl-wire').classList.toggle('bg-brand-500', wireframe);
      };

      let gridVisible = true;
      document.getElementById('ctrl-grid').onclick = () => {
        gridVisible = !gridVisible;
        grid.visible = gridVisible;
        document.getElementById('ctrl-grid').classList.toggle('bg-brand-500', !gridVisible);
      };

      document.getElementById('ctrl-reset').onclick = () => {
        camera.position.set(center.x + dist, center.y + dist * 0.5, center.z + dist);
        controls.target.copy(center);
        controls.update();
      };

      const animate = () => {
        if (!container.isConnected) return;
        animationId = requestAnimationFrame(animate);
        const delta = clock.getDelta();
        if (mixer) mixer.update(delta);
        controls.update();
        renderer.render(scene, camera);
      };
      animate();

      resizeObserver = new ResizeObserver(() => {
        if (!container.clientWidth || !container.clientHeight) return;
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
      });
      resizeObserver.observe(container);
    }
  };
})();
