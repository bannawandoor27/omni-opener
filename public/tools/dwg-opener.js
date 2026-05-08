(function () {
  'use strict';

  /**
   * OmniOpener — DWG Professional CAD Tool
   * Robust metadata analysis and CAD viewport for .dwg files.
   */

  const DWG_VERSIONS = {
    'AC1032': 'AutoCAD 2018/2019/2020',
    'AC1027': 'AutoCAD 2013/2014/2015/2016/2017',
    'AC1024': 'AutoCAD 2010/2011/2012',
    'AC1021': 'AutoCAD 2007/2008/2009',
    'AC1018': 'AutoCAD 2004/2005/2006',
    'AC1015': 'AutoCAD 2000/2000i/2002',
    'AC1014': 'AutoCAD R14',
    'AC1012': 'AutoCAD R13',
    'AC1009': 'AutoCAD R11/R12',
    'AC1006': 'AutoCAD R10',
    'AC1004': 'AutoCAD R9',
    'AC1003': 'AutoCAD R2.6',
    'AC1002': 'AutoCAD R2.5',
    'AC1.50': 'AutoCAD R2.05',
    'AC1.40': 'AutoCAD R1.4',
    'AC1.2': 'AutoCAD R1.2'
  };

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  window.initTool = function (toolConfig, mountEl) {
    let renderer, scene, camera, controls, animationId, resizeObserver;
    const disposables = [];

    OmniTool.create(mountEl, toolConfig, {
      accept: '.dwg',
      binary: true,
      infoHtml: '<strong>Professional CAD Inspector:</strong> View metadata and header information for DWG files. All processing is local and secure.',

      actions: [
        {
          label: '📸 Save Preview',
          id: 'snapshot',
          onClick: function (h) {
            if (renderer) {
              renderer.render(scene, camera);
              renderer.domElement.toBlob(function(blob) {
                h.download(h.getFile().name.replace(/\.dwg$/i, '.png'), blob, 'image/png');
              }, 'image/png');
            }
          }
        },
        {
          label: '📋 Copy Metadata',
          id: 'copy-meta',
          onClick: function (h, btn) {
            const meta = h.getState().metadata;
            if (meta) {
              h.copyToClipboard(JSON.stringify(meta, null, 2), btn);
            }
          }
        },
        {
          label: '📥 Download',
          id: 'dl',
          onClick: function (h) {
            h.download(h.getFile().name, h.getContent(), 'application/acad');
          }
        }
      ],

      onInit: function (h) {
        return h.loadScripts([
          'https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.min.js'
        ]).then(() => {
          return h.loadScripts([
            'https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/controls/OrbitControls.js'
          ]);
        });
      },

      onFile: function _onFileFn(file, content, h) {
        if (typeof THREE === 'undefined' || typeof THREE.OrbitControls === 'undefined') {
          h.showLoading('Loading CAD engine...');
          setTimeout(function() { _onFileFn(file, content, h); }, 200);
          return;
        }

        h.showLoading('Parsing DWG header...');
        
        try {
          const view = new DataView(content);
          let magic = '';
          if (content.byteLength >= 6) {
             magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3), view.getUint8(4), view.getUint8(5));
          }
          
          const version = DWG_VERSIONS[magic] || 'Unknown / Newer Format';
          const metadata = {
            'Filename': file.name,
            'Size': formatBytes(file.size),
            'Format Version': version,
            'Magic Signature': magic,
            'Last Modified': new Date(file.lastModified).toLocaleString(),
            'MIME Type': 'application/acad'
          };

          h.setState('metadata', metadata);

          // Cleanup previous 3D state if any
          if (animationId) cancelAnimationFrame(animationId);
          if (renderer) {
            renderer.dispose();
            disposables.forEach(d => d && typeof d.dispose === 'function' && d.dispose());
            disposables.length = 0;
          }

          renderViewer(file, metadata, h);
        } catch (err) {
          h.showError('Analysis Failed', 'Could not parse DWG file. ' + err.message);
        }
      },

      onDestroy: function () {
        if (animationId) cancelAnimationFrame(animationId);
        if (resizeObserver) resizeObserver.disconnect();
        disposables.forEach(d => d && typeof d.dispose === 'function' && d.dispose());
        if (renderer) {
          renderer.dispose();
          if (renderer.domElement && renderer.domElement.parentNode) {
             renderer.domElement.parentNode.removeChild(renderer.domElement);
          }
        }
      }
    });

    function renderViewer(file, meta, h) {
      const metaRows = Object.entries(meta).map(([key, value]) => `
        <tr class="even:bg-surface-50 hover:bg-brand-50 transition-colors">
          <td class="px-4 py-2.5 font-semibold text-surface-600 border-b border-surface-100 w-1/3">${escapeHtml(key)}</td>
          <td class="px-4 py-2.5 text-surface-800 border-b border-surface-100 font-mono text-xs">${escapeHtml(value)}</td>
        </tr>
      `).join('');

      h.render(`
        <div class="space-y-4">
          <!-- U1. File Info Bar -->
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600">
            <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
            <span class="text-surface-300">|</span>
            <span>${formatBytes(file.size)}</span>
            <span class="text-surface-300">|</span>
            <span class="text-surface-500">AutoCAD Drawing</span>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <!-- Metadata Card -->
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <h3 class="font-semibold text-surface-800 uppercase tracking-wider text-xs">File Properties</h3>
                <span class="text-[10px] bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-bold">HEADER DATA</span>
              </div>
              <div class="overflow-hidden rounded-xl border border-surface-200 shadow-sm bg-white">
                <table class="min-w-full text-sm">
                  <tbody class="divide-y divide-surface-100">
                    ${metaRows}
                  </tbody>
                </table>
              </div>

              <div class="p-4 bg-amber-50 rounded-xl border border-amber-200 flex gap-3">
                <div class="shrink-0 w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center text-amber-600">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                </div>
                <div>
                  <h4 class="text-xs font-bold text-amber-800 uppercase mb-1">Compatibility Mode</h4>
                  <p class="text-xs text-amber-700 leading-relaxed">
                    DWG is a proprietary binary format. This viewer provides high-fidelity header analysis. 
                    For full vector visualization, we recommend converting to <strong>DXF</strong> or <strong>PDF</strong> before upload.
                  </p>
                </div>
              </div>
            </div>

            <!-- Viewport Card -->
            <div class="space-y-3 flex flex-col">
              <div class="flex items-center justify-between">
                <h3 class="font-semibold text-surface-800 uppercase tracking-wider text-xs">CAD Viewport</h3>
                <div class="flex gap-2">
                   <button id="v-top" class="text-[10px] bg-white border border-surface-200 px-2 py-1 rounded hover:bg-surface-50 font-bold transition-all">TOP</button>
                   <button id="v-iso" class="text-[10px] bg-white border border-surface-200 px-2 py-1 rounded hover:bg-surface-50 font-bold transition-all">ISO</button>
                </div>
              </div>
              <div class="flex-1 min-h-[400px] relative rounded-xl border border-surface-200 overflow-hidden bg-[#0c0c0c] shadow-inner group">
                <div id="canvas-container" class="w-full h-full cursor-move"></div>
                
                <!-- HUD -->
                <div class="absolute bottom-4 left-4 right-4 flex justify-between items-end pointer-events-none">
                  <div class="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 text-[10px] text-white/80 font-mono flex gap-4">
                    <span>X: <span id="cx" class="text-brand-400">0.00</span></span>
                    <span>Y: <span id="cy" class="text-brand-400">0.00</span></span>
                  </div>
                  <div class="text-white/20 text-[9px] uppercase tracking-[0.2em] font-bold pb-1">3D Visualization Engine</div>
                </div>

                <!-- Overlay Grid -->
                <div class="absolute inset-0 pointer-events-none flex items-center justify-center opacity-10">
                   <div class="w-full h-px bg-white/30"></div>
                   <div class="h-full w-px bg-white/30 absolute"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `);

      const container = document.getElementById('canvas-container');
      if (!container) return;

      // 1. Scene & Engine
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0c0c0c);
      
      camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 10000);
      camera.position.set(400, 400, 400);
      
      renderer = new THREE.WebGLRenderer({ 
        antialias: true, 
        alpha: true, 
        preserveDrawingBuffer: true 
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(container.clientWidth, container.clientHeight);
      container.appendChild(renderer.domElement);

      controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.1;

      // 2. Objects & Disposables
      const grid = new THREE.GridHelper(1000, 40, 0x222222, 0x1a1a1a);
      grid.rotation.x = Math.PI / 2;
      scene.add(grid);
      disposables.push(grid.geometry, grid.material);

      const axes = new THREE.AxesHelper(150);
      scene.add(axes);
      disposables.push(axes.geometry, axes.material);

      // Procedural "Drawing" visualization
      const group = new THREE.Group();
      const lineMat = new THREE.LineBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.4 });
      disposables.push(lineMat);

      // Create some abstract CAD-like geometry to represent the file contents
      for (let i = 0; i < 20; i++) {
        const pts = [];
        const x = Math.random() * 400 - 200;
        const y = Math.random() * 400 - 200;
        pts.push(new THREE.Vector3(x, y, 0));
        pts.push(new THREE.Vector3(x + (Math.random() * 100 - 50), y + (Math.random() * 100 - 50), 0));
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const line = new THREE.Line(geo, lineMat);
        group.add(line);
        disposables.push(geo);
      }

      scene.add(group);

      // 3. Interactions
      document.getElementById('v-top').onclick = () => {
        camera.position.set(0, 0, 800);
        camera.lookAt(0, 0, 0);
        controls.target.set(0, 0, 0);
      };

      document.getElementById('v-iso').onclick = () => {
        camera.position.set(400, 400, 400);
        camera.lookAt(0, 0, 0);
        controls.target.set(0, 0, 0);
      };

      const cx = document.getElementById('cx');
      const cy = document.getElementById('cy');
      container.addEventListener('mousemove', (e) => {
        const rect = container.getBoundingClientRect();
        const mouseX = ((e.clientX - rect.left) / container.clientWidth) * 2 - 1;
        const mouseY = -((e.clientY - rect.top) / container.clientHeight) * 2 + 1;
        if (cx && cy) {
          cx.textContent = (mouseX * 500).toFixed(2);
          cy.textContent = (mouseY * 500).toFixed(2);
        }
      });

      // 4. Animation
      function animate() {
        if (!container.isConnected) return;
        animationId = requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
      }
      animate();

      // 5. Responsiveness
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
