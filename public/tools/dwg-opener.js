/**
 * OmniOpener — DWG Technical Inspector
 * Uses OmniTool SDK and Three.js for 3D grid visualization.
 * Provides deep binary analysis and version detection for AutoCAD DWG files.
 */
(function () {
  'use strict';

  const VERSIONS = {
    'AC1032': 'AutoCAD 2018/2019/2020/2021',
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
    'AC1002': 'AutoCAD R2.5'
  };

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
    let animationId, renderer, scene, camera, controls;

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
      accept: '.dwg',
      binary: true,
      infoHtml: '<strong>Professional DWG Inspector:</strong> Analyze AutoCAD drawing files locally. Detect versions, inspect binary headers, and explore file structure without uploading data.',

      actions: [
        {
          label: '📋 Copy Version',
          id: 'copy-v',
          onClick: function (h, btn) {
            const v = h.getState().version;
            if (v) h.copyToClipboard(v, btn);
          }
        },
        {
          label: '📥 Download',
          id: 'dl',
          onClick: function (h) {
            h.download(h.getFile().name, h.getContent(), 'application/vnd.dwg');
          }
        }
      ],

      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.min.js', () => {
          h.loadScript('https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/controls/OrbitControls.js');
        });
      },

      onDestroy: cleanup,

      onFile: function (file, content, h) {
        h.showLoading('Parsing DWG binary structure...');
        
        setTimeout(() => {
          try {
            const view = new DataView(content);
            let version = '';
            for (let i = 0; i < 6; i++) {
              version += String.fromCharCode(view.getUint8(i));
            }

            const friendlyVersion = VERSIONS[version] || 'Unknown AutoCAD Version';
            h.setState('version', version);
            
            renderInspector(file, version, friendlyVersion, content, h);
          } catch (err) {
            h.showError('Unable to parse DWG', err.message);
          }
        }, 300);
      }
    });

    function renderInspector(file, version, friendly, content, h) {
      cleanup();

      const bytes = new Uint8Array(content.slice(0, 512));
      
      h.render(`
        <div class="flex flex-col h-[85vh] font-sans">
          <!-- File Banner -->
          <div class="flex items-center gap-4 p-4 bg-surface-50 rounded-2xl border border-surface-200 mb-6 shadow-sm">
            <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white text-xl font-bold shadow-lg shadow-brand-500/20">DWG</div>
            <div class="flex-1 min-w-0">
              <h3 class="text-sm font-bold text-surface-900 truncate">${escapeHtml(file.name)}</h3>
              <p class="text-[10px] text-surface-400 uppercase tracking-widest font-bold mt-1">${formatSize(file.size)} • AutoCAD Drawing Database</p>
            </div>
            <div class="px-3 py-1.5 bg-white border border-surface-200 rounded-lg shadow-sm flex flex-col items-center">
              <span class="text-[9px] font-bold text-surface-400 uppercase">Magic</span>
              <span class="text-xs font-mono font-bold text-brand-600">${version}</span>
            </div>
          </div>

          <div class="flex-1 flex flex-col md:flex-row gap-6 min-h-0">
            <!-- Left: Binary & Metadata -->
            <div class="flex-1 flex flex-col gap-6 overflow-hidden">
              <div class="bg-white rounded-2xl border border-surface-200 shadow-lg flex flex-col flex-1 overflow-hidden">
                <div class="p-4 border-b border-surface-100 bg-surface-50/50 flex justify-between items-center">
                  <h4 class="text-[10px] font-bold text-surface-400 uppercase tracking-widest">Header Byte Map</h4>
                  <span class="text-[9px] font-mono text-surface-400">Offset 0x0000 - 0x0200</span>
                </div>
                <div class="flex-1 overflow-auto bg-[#0f172a] p-4">
                  <pre class="font-mono text-[10px] leading-relaxed text-surface-400 whitespace-pre">${renderHex(bytes)}</pre>
                </div>
              </div>

              <div class="bg-white rounded-2xl border border-surface-200 shadow-lg p-5">
                <h4 class="text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-4">Technical Profile</h4>
                <div class="grid grid-cols-2 gap-4">
                  <div class="p-3 bg-surface-50 rounded-xl border border-surface-100">
                    <p class="text-[9px] font-bold text-surface-400 uppercase">Release</p>
                    <p class="text-xs font-bold text-surface-700 mt-1">${friendly}</p>
                  </div>
                  <div class="p-3 bg-surface-50 rounded-xl border border-surface-100">
                    <p class="text-[9px] font-bold text-surface-400 uppercase">Data Encoding</p>
                    <p class="text-xs font-bold text-surface-700 mt-1">${version >= 'AC1021' ? 'UTF-16 Unicode' : 'ANSI / Codepage'}</p>
                  </div>
                </div>
              </div>
            </div>

            <!-- Right: 3D Workspace Visualization -->
            <div class="flex-1 flex flex-col gap-6 min-w-0">
              <div class="relative flex-1 bg-[#1e293b] rounded-2xl overflow-hidden border border-surface-200 shadow-xl group">
                <div id="three-mount" class="w-full h-full cursor-move"></div>
                
                <!-- 3D Overlay -->
                <div class="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-8 text-center bg-slate-900/40 backdrop-blur-[2px]">
                   <div class="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mb-4 border border-white/20 animate-pulse">
                      <svg class="w-8 h-8 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-1.343 3-3s-1.343-3-3-3m0 6c-1.657 0-3-1.343-3-3s1.343-3-3-3m6 0a9 9 0 00-9-9m9 9H3"/></svg>
                   </div>
                   <h4 class="text-white font-bold text-sm mb-2">Workspace Analyzer</h4>
                   <p class="text-slate-400 text-xs max-w-[240px] leading-relaxed">3D geometry extraction is not available in the browser for this version of DWG. Try converting to <strong>DXF</strong> for full vector preview.</p>
                </div>

                <div class="absolute bottom-4 left-4 flex gap-2">
                   <span class="bg-black/60 backdrop-blur px-2.5 py-1 rounded text-[9px] font-bold text-white uppercase tracking-tighter border border-white/10">3D Grid Environment</span>
                </div>
              </div>

              <!-- Action Card -->
              <div class="bg-brand-600 rounded-2xl p-5 text-white shadow-lg shadow-brand-500/20">
                <div class="flex items-start gap-3">
                  <span class="text-xl">🛠️</span>
                  <div>
                    <h4 class="text-xs font-bold uppercase tracking-widest mb-1">Developer Notice</h4>
                    <p class="text-[11px] text-brand-100 leading-relaxed">
                      DWG is a proprietary binary format. This tool provides deep header inspection. To view actual drawings, use a DXF converter.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `);

      // Initialize 3D View for Grid
      if (window.THREE) {
        const mount = document.getElementById('three-mount');
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1e293b);
        
        camera = new THREE.PerspectiveCamera(45, mount.clientWidth / mount.clientHeight, 0.1, 1000);
        camera.position.set(15, 15, 15);
        
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(mount.clientWidth, mount.clientHeight);
        mount.appendChild(renderer.domElement);

        const grid = new THREE.GridHelper(20, 20, 0x475569, 0x334155);
        scene.add(grid);

        if (THREE.OrbitControls) {
          controls = new THREE.OrbitControls(camera, renderer.domElement);
          controls.enableDamping = true;
          controls.autoRotate = true;
          controls.autoRotateSpeed = 0.5;
        }

        function animate() {
          if (!mount.isConnected) { cleanup(); return; }
          animationId = requestAnimationFrame(animate);
          if (controls) controls.update();
          renderer.render(scene, camera);
        }
        animate();

        const ro = new ResizeObserver(() => {
          if (!mount.clientWidth || !mount.clientHeight) return;
          camera.aspect = mount.clientWidth / mount.clientHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(mount.clientWidth, mount.clientHeight);
        });
        ro.observe(mount);
      }
    }

    function renderHex(bytes) {
      let html = '';
      for (let i = 0; i < bytes.length; i += 16) {
        const chunk = bytes.slice(i, i + 16);
        const offset = i.toString(16).padStart(4, '0').toUpperCase();
        const hex = Array.from(chunk).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
        const decoded = Array.from(chunk).map(b => (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.').join('');
        html += `<div><span class="text-brand-500 font-bold">${offset}</span>   ${hex.padEnd(47)}   <span class="text-slate-500">${escapeHtml(decoded)}</span></div>`;
      }
      return html;
    }
  };
})();
