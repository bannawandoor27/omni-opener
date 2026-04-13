/**
 * OmniOpener — LAS Point Cloud Toolkit
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

  function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  function getCharString(view, offset, length) {
    let str = '';
    for (let i = 0; i < length; i++) {
      const char = view.getUint8(offset + i);
      if (char === 0) break;
      str += String.fromCharCode(char);
    }
    return str.trim();
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.las',
      binary: true,
      infoHtml: '<strong>LAS Toolkit:</strong> Professional Lidar viewer with 3D point cloud rendering, metadata inspection, and conversion tools.',
      
      actions: [
        {
          label: '📋 Copy Metadata',
          id: 'copy-meta',
          onClick: function (h, btn) {
            const data = h.getState().lasData;
            if (data && data.header) {
              h.copyToClipboard(JSON.stringify(data.header, null, 2), btn);
            }
          }
        },
        {
          label: '📊 Export CSV (Top 100k)',
          id: 'export-csv',
          onClick: function (h) {
            const data = h.getState().lasData;
            if (data && data.points) {
              h.showLoading('Preparing CSV...');
              setTimeout(() => {
                let csv = 'x,y,z,r,g,b\n';
                const count = Math.min(data.points.length / 3, 100000);
                for (let i = 0; i < count; i++) {
                  const x = data.points[i * 3];
                  const y = data.points[i * 3 + 1];
                  const z = data.points[i * 3 + 2];
                  const r = Math.round(data.colors[i * 3] * 255);
                  const g = Math.round(data.colors[i * 3 + 1] * 255);
                  const b = Math.round(data.colors[i * 3 + 2] * 255);
                  csv += `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)},${r},${g},${b}\n`;
                }
                h.download(h.getFile().name.replace('.las', '.csv'), csv, 'text/csv');
              }, 50);
            }
          }
        },
        {
          label: '🖼️ Screenshot',
          id: 'screenshot',
          onClick: function (h) {
            const canvas = h.getRenderEl().querySelector('canvas');
            if (canvas) {
              h.download(`las-capture-${Date.now()}.png`, canvas.toDataURL('image/png'), 'image/png');
            }
          }
        }
      ],

      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.min.js', () => {
          h.loadScript('https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/controls/OrbitControls.js');
        });
      },

      onFile: function _onFileFn(file, content, h) {
        if (typeof THREE === 'undefined' || typeof THREE.OrbitControls === 'undefined') {
          h.showLoading('Initializing 3D engine...');
          setTimeout(() => _onFileFn(file, content, h), 500);
          return;
        }

        h.showLoading('Parsing point cloud...');
        
        // Use a small delay to allow UI to show loading state
        setTimeout(() => {
          try {
            const data = parseLAS(content);
            if (!data || data.numPoints === 0) {
              h.showError('Empty LAS File', 'This file contains no point data records.');
              return;
            }
            h.setState('lasData', data);
            renderMain(data, file, h);
          } catch (err) {
            h.showError('Could not open LAS file', 'The file may be corrupted or in an unsupported format. ' + err.message);
          }
        }, 50);
      }
    });
  };

  function parseLAS(buffer) {
    const view = new DataView(buffer);
    
    // Check Signature
    const sig = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
    if (sig !== 'LASF') throw new Error('Not a valid LAS file (missing LASF signature)');

    // Header Basic Info
    const versionMajor = view.getUint8(24);
    const versionMinor = view.getUint8(25);
    const systemId = getCharString(view, 32, 32);
    const software = getCharString(view, 64, 32);
    
    const offsetToData = view.getUint32(96, true);
    const formatId = view.getUint8(104);
    const recordLength = view.getUint16(105, true);
    
    let numPoints = view.getUint32(107, true);
    // LAS 1.4 supports 64-bit point counts
    if (numPoints === 0 && buffer.byteLength > 250) {
      try { numPoints = Number(view.getBigUint64(247, true)); } catch(e) {}
    }

    if (numPoints === 0) return null;

    // Scaling and Offsets
    const xScale = view.getFloat64(131, true);
    const yScale = view.getFloat64(139, true);
    const zScale = view.getFloat64(147, true);
    const xOffset = view.getFloat64(155, true);
    const yOffset = view.getFloat64(163, true);
    const zOffset = view.getFloat64(171, true);

    const maxX = view.getFloat64(179, true);
    const minX = view.getFloat64(187, true);
    const maxY = view.getFloat64(195, true);
    const minY = view.getFloat64(203, true);
    const maxZ = view.getFloat64(211, true);
    const minZ = view.getFloat64(219, true);
    
    const bounds = {
      min: [minX, minY, minZ],
      max: [maxX, maxY, maxZ]
    };

    // Point record limit for browser performance
    const limit = Math.min(numPoints, 1000000);
    const points = new Float32Array(limit * 3);
    const colors = new Float32Array(limit * 3);
    
    // Check if format includes color (ID 2, 3, 5, 7, 8, 10)
    const hasColor = [2, 3, 5, 7, 8, 10].includes(formatId);
    
    let pOff = offsetToData;
    const rangeZ = maxZ - minZ || 1;

    for (let i = 0; i < limit; i++) {
      if (pOff + 12 > buffer.byteLength) break;
      
      const rawX = view.getInt32(pOff, true);
      const rawY = view.getInt32(pOff + 4, true);
      const rawZ = view.getInt32(pOff + 8, true);
      
      const x = rawX * xScale + xOffset;
      const y = rawY * yScale + yOffset;
      const z = rawZ * zScale + zOffset;
      
      points[i * 3] = x;
      points[i * 3 + 1] = y;
      points[i * 3 + 2] = z;

      let r = 0, g = 0, b = 0;
      
      if (hasColor) {
        let colorOffset = 0;
        if (formatId === 2) colorOffset = 20;
        else if (formatId === 3) colorOffset = 28;
        else if (formatId >= 6) colorOffset = 30;

        if (colorOffset > 0 && pOff + colorOffset + 6 <= buffer.byteLength) {
          r = view.getUint16(pOff + colorOffset, true) / 65535;
          g = view.getUint16(pOff + colorOffset + 2, true) / 65535;
          b = view.getUint16(pOff + colorOffset + 4, true) / 65535;
        }
      } 
      
      if (r === 0 && g === 0 && b === 0) {
        const t = Math.max(0, Math.min(1, (z - minZ) / rangeZ));
        r = 0.2 + t * 0.8;
        g = 0.4 + t * 0.4;
        b = 0.9 - t * 0.3;
      }

      colors[i * 3] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;

      pOff += recordLength;
    }

    return {
      points,
      colors,
      numPoints,
      header: {
        version: `${versionMajor}.${versionMinor}`,
        systemId,
        software,
        formatId,
        recordLength,
        totalPoints: numPoints,
        bounds,
        scales: [xScale, yScale, zScale],
        offsets: [xOffset, yOffset, zOffset]
      }
    };
  }

  function renderMain(data, file, h) {
    const fileSize = formatBytes(file.size);
    
    h.render(`
      <div class="flex flex-col h-[85vh] font-sans">
        <!-- U1: File Info Bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 border border-surface-200">
          <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${fileSize}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">.las Lidar file</span>
          <span class="ml-auto px-2 py-0.5 bg-brand-100 text-brand-700 rounded-full text-xs font-medium">LAS v${data.header.version}</span>
        </div>

        <!-- Navigation Tabs -->
        <div class="flex gap-2 mb-4">
          <button id="tab-3d" class="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-bold shadow-sm transition-all">3D Viewer</button>
          <button id="tab-meta" class="px-4 py-2 bg-white border border-surface-200 text-surface-600 rounded-lg text-sm font-bold hover:bg-surface-50 transition-all">Metadata</button>
          <button id="tab-points" class="px-4 py-2 bg-white border border-surface-200 text-surface-600 rounded-lg text-sm font-bold hover:bg-surface-50 transition-all">Point Table</button>
        </div>

        <!-- Content Area -->
        <div id="las-content" class="flex-1 relative min-h-0 bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
          
          <!-- 3D View Tab -->
          <div id="view-3d" class="w-full h-full relative">
            <div id="three-container" class="w-full h-full bg-slate-950 cursor-move"></div>
            
            <!-- Floating Controls -->
            <div class="absolute top-4 right-4 w-48 bg-white/90 backdrop-blur shadow-2xl rounded-2xl border border-surface-200 p-4 space-y-4">
               <div>
                  <div class="flex justify-between items-center mb-1">
                    <label class="text-[10px] font-bold text-surface-400 uppercase tracking-wider">Point Size</label>
                    <span id="size-val" class="text-[10px] font-mono text-brand-600">1.0</span>
                  </div>
                  <input type="range" id="range-size" min="0.1" max="5" step="0.1" value="1" class="w-full h-1.5 bg-surface-200 rounded-lg appearance-none cursor-pointer accent-brand-500">
               </div>
               
               <div class="flex items-center justify-between py-1 border-t border-surface-100 pt-3">
                  <span class="text-[10px] font-bold text-surface-400 uppercase tracking-wider">Auto-Rotate</span>
                  <label class="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" id="check-rotate" class="sr-only peer">
                    <div class="w-8 h-4 bg-surface-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-brand-500"></div>
                  </label>
               </div>

               <div class="pt-2 border-t border-surface-100">
                  <button id="btn-reset" class="w-full py-2 bg-surface-50 text-surface-600 text-[10px] font-bold rounded-lg hover:bg-surface-100 transition-colors border border-surface-200">Reset Camera</button>
               </div>
               
               <div class="text-[9px] text-surface-400 leading-tight">
                 Showing ${Math.min(data.numPoints, 1000000).toLocaleString()} of ${data.numPoints.toLocaleString()} points.
               </div>
            </div>
          </div>

          <!-- Metadata Tab -->
          <div id="view-meta" class="hidden h-full overflow-auto p-6">
            <div class="max-w-3xl mx-auto space-y-6">
               <div class="flex items-center justify-between border-b border-surface-100 pb-2">
                 <h3 class="font-bold text-surface-900 text-lg">Header Information</h3>
                 <span class="text-xs bg-surface-100 text-surface-500 px-2 py-1 rounded">LAS v${data.header.version}</span>
               </div>
               
               <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  ${renderMetaCard('System Info', [
                    ['System ID', data.header.systemId || 'N/A'],
                    ['Software', data.header.software || 'N/A'],
                    ['Format ID', data.header.formatId],
                    ['Record Length', `${data.header.recordLength} bytes`]
                  ])}
                  ${renderMetaCard('Cloud Stats', [
                    ['Total Points', data.header.totalPoints.toLocaleString()],
                    ['Rendered Points', Math.min(data.numPoints, 1000000).toLocaleString()],
                    ['File Size', fileSize]
                  ])}
               </div>

               <div class="rounded-xl border border-surface-200 overflow-hidden bg-white shadow-sm">
                 <div class="bg-surface-50 px-4 py-2 border-b border-surface-200 font-bold text-xs text-surface-600 uppercase">Coordinate Bounds</div>
                 <div class="p-0 overflow-x-auto">
                    <table class="w-full text-sm font-mono">
                      <thead class="bg-surface-50/50">
                        <tr class="text-left text-surface-400 border-b border-surface-100">
                          <th class="px-4 py-3">Axis</th>
                          <th class="px-4 py-3">Minimum</th>
                          <th class="px-4 py-3">Maximum</th>
                          <th class="px-4 py-3">Scale</th>
                          <th class="px-4 py-3">Offset</th>
                        </tr>
                      </thead>
                      <tbody class="text-surface-700">
                        ${['X', 'Y', 'Z'].map((axis, i) => `
                          <tr class="border-b border-surface-50 hover:bg-surface-50 transition-colors">
                            <td class="px-4 py-3 font-bold text-brand-600">${axis}</td>
                            <td class="px-4 py-3">${data.header.bounds.min[i].toFixed(4)}</td>
                            <td class="px-4 py-3">${data.header.bounds.max[i].toFixed(4)}</td>
                            <td class="px-4 py-3 text-surface-400 text-xs">${data.header.scales[i].toFixed(6)}</td>
                            <td class="px-4 py-3 text-surface-400 text-xs">${data.header.offsets[i].toFixed(2)}</td>
                          </tr>
                        `).join('')}
                      </tbody>
                    </table>
                 </div>
               </div>
            </div>
          </div>

          <!-- Points Tab -->
          <div id="view-points" class="hidden h-full overflow-hidden flex flex-col">
            <div class="px-6 py-4 border-b border-surface-100 flex items-center justify-between shrink-0">
               <div>
                 <h3 class="font-bold text-surface-900">Point Sample</h3>
                 <p class="text-xs text-surface-400">First 100 point records in the file.</p>
               </div>
               <span class="text-xs bg-brand-50 text-brand-600 px-2 py-1 rounded-full font-bold">100 rows</span>
            </div>
            <div class="flex-1 overflow-auto p-6">
               <div class="rounded-xl border border-surface-200 overflow-hidden shadow-sm">
                  <table class="min-w-full text-sm">
                    <thead class="sticky top-0 bg-white border-b border-surface-200 z-10">
                      <tr class="text-left text-surface-600 font-bold bg-surface-50/80 backdrop-blur">
                        <th class="px-4 py-3">#</th>
                        <th class="px-4 py-3">X</th>
                        <th class="px-4 py-3">Y</th>
                        <th class="px-4 py-3">Z</th>
                        <th class="px-4 py-3">Color (RGB)</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${renderPointRows(data)}
                    </tbody>
                  </table>
               </div>
            </div>
          </div>

        </div>
      </div>
    `);

    function renderMetaCard(title, items) {
      return `
        <div class="rounded-xl border border-surface-200 p-4 hover:border-brand-300 transition-colors bg-white shadow-sm">
          <h4 class="text-[10px] font-bold text-surface-400 uppercase mb-3 tracking-widest">${title}</h4>
          <div class="space-y-2">
            ${items.map(([k, v]) => `
              <div class="flex justify-between text-sm">
                <span class="text-surface-500">${k}</span>
                <span class="font-semibold text-surface-800">${v}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    function renderPointRows(data) {
      let html = '';
      const sampleCount = Math.min(data.numPoints, 100);
      for (let i = 0; i < sampleCount; i++) {
        const r = Math.round(data.colors[i * 3] * 255);
        const g = Math.round(data.colors[i * 3 + 1] * 255);
        const b = Math.round(data.colors[i * 3 + 2] * 255);
        html += `
          <tr class="even:bg-surface-50 hover:bg-brand-50 transition-colors border-b border-surface-100">
            <td class="px-4 py-2 text-surface-400 font-mono text-xs">${i + 1}</td>
            <td class="px-4 py-2 font-mono">${data.points[i * 3].toFixed(3)}</td>
            <td class="px-4 py-2 font-mono">${data.points[i * 3 + 1].toFixed(3)}</td>
            <td class="px-4 py-2 font-mono font-bold text-brand-600">${data.points[i * 3 + 2].toFixed(3)}</td>
            <td class="px-4 py-2">
              <div class="flex items-center gap-2">
                <div class="w-3 h-3 rounded-full border border-surface-200 shadow-sm" style="background-color: rgb(${r},${g},${b})"></div>
                <span class="text-xs text-surface-500 font-mono">${r}, ${g}, ${b}</span>
              </div>
            </td>
          </tr>
        `;
      }
      return html;
    }

    const tabs = {
      'tab-3d': 'view-3d',
      'tab-meta': 'view-meta',
      'tab-points': 'view-points'
    };

    Object.keys(tabs).forEach(id => {
      document.getElementById(id).onclick = () => {
        Object.keys(tabs).forEach(tid => {
          const btn = document.getElementById(tid);
          const view = document.getElementById(tabs[tid]);
          if (tid === id) {
            btn.className = 'px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-bold shadow-sm transition-all scale-105 z-10';
            view.classList.remove('hidden');
          } else {
            btn.className = 'px-4 py-2 bg-white border border-surface-200 text-surface-600 rounded-lg text-sm font-bold hover:bg-surface-50 transition-all';
            view.classList.add('hidden');
          }
        });
      };
    });

    initThree(data);
  }

  function initThree(data) {
    const container = document.getElementById('three-container');
    if (!container) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020617);

    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000000);
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(data.points, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
    geometry.computeBoundingSphere();

    const material = new THREE.PointsMaterial({ 
      size: 1.0, 
      vertexColors: true, 
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.8
    });
    
    const cloud = new THREE.Points(geometry, material);
    
    const center = geometry.boundingSphere.center;
    cloud.position.sub(center);
    scene.add(cloud);

    const radius = geometry.boundingSphere.radius;
    camera.position.set(radius * 1.5, radius * 1.5, radius * 1.5);
    camera.lookAt(0, 0, 0);

    const rangeSize = document.getElementById('range-size');
    const sizeVal = document.getElementById('size-val');
    rangeSize.oninput = (e) => {
      material.size = parseFloat(e.target.value);
      sizeVal.textContent = material.size.toFixed(1);
    };

    const checkRotate = document.getElementById('check-rotate');
    checkRotate.onchange = (e) => controls.autoRotate = e.target.checked;

    document.getElementById('btn-reset').onclick = () => {
       camera.position.set(radius * 1.5, radius * 1.5, radius * 1.5);
       controls.target.set(0, 0, 0);
       controls.update();
    };

    let frameId;
    const animate = () => {
       if (!container || !container.isConnected) { 
         renderer.dispose();
         geometry.dispose();
         material.dispose();
         return; 
       }
       frameId = requestAnimationFrame(animate);
       controls.update();
       renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!container || !container.isConnected) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', handleResize);
  }
})();
