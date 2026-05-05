/**
 * OmniOpener — LAS Point Cloud Toolkit
 * Uses OmniTool SDK and Three.js.
 * REWRITTEN: Production Perfect Edition
 */
(function () {
  'use strict';

  // --- Utilities ---
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024, dm = 2;
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

  // --- Tool Initialization ---
  window.initTool = function (toolConfig, mountEl) {
    let threeResources = null;

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
          label: '📊 Export CSV',
          id: 'export-csv',
          onClick: function (h) {
            const data = h.getState().lasData;
            if (data && data.points) {
              h.showLoading('Preparing CSV export...');
              // Heavy task in setTimeout to keep UI responsive
              setTimeout(() => {
                let csv = 'x,y,z,r,g,b\n';
                const count = Math.min(data.points.length / 3, 100000);
                for (let i = 0; i < count; i++) {
                  const x = data.points[i * 3];
                  const y = data.points[i * 3 + 1];
                  const z = data.points[i * 3 + 2];
                  const r = data.colors ? Math.round(data.colors[i * 3] * 255) : 128;
                  const g = data.colors ? Math.round(data.colors[i * 3 + 1] * 255) : 128;
                  const b = data.colors ? Math.round(data.colors[i * 3 + 2] * 255) : 128;
                  csv += `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)},${r},${g},${b}\n`;
                }
                h.download(h.getFile().name.replace('.las', '.csv'), csv, 'text/csv');
              }, 100);
            }
          }
        },
        {
          label: '🖼️ Screenshot',
          id: 'screenshot',
          onClick: function (h) {
            const canvas = h.getRenderEl().querySelector('canvas');
            if (canvas) {
              try {
                // B10: Use toBlob instead of toDataURL
                canvas.toBlob((blob) => {
                  if (blob) h.download(`las-view-${Date.now()}.png`, blob, 'image/png');
                }, 'image/png');
              } catch (e) {
                // Fallback for older browsers or security restrictions
                h.download(`las-view-${Date.now()}.png`, canvas.toDataURL('image/png'), 'image/png');
              }
            }
          }
        }
      ],

      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.min.js', () => {
          h.loadScript('https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/controls/OrbitControls.js');
        });
      },

      onDestroy: function () {
        // B5: Cleanup Three.js resources
        if (threeResources) {
          if (threeResources.renderer) threeResources.renderer.dispose();
          if (threeResources.geometry) threeResources.geometry.dispose();
          if (threeResources.material) threeResources.material.dispose();
          if (threeResources.frameId) cancelAnimationFrame(threeResources.frameId);
        }
      },

      onFile: function _onFileFn(file, content, h) {
        // B1/B4: Ensure dependencies are ready
        if (typeof THREE === 'undefined' || typeof THREE.OrbitControls === 'undefined') {
          h.showLoading('Loading 3D Engine...');
          setTimeout(function() { _onFileFn(file, content, h); }, 500);
          return;
        }

        h.showLoading('Parsing Lidar Point Cloud...');
        
        setTimeout(() => {
          try {
            const data = parseLAS(content);
            if (!data || data.numPoints === 0) {
              h.showError('Empty LAS File', 'This file contains the LAS header but zero point records.');
              return;
            }
            h.setState('lasData', data);
            threeResources = renderMain(data, file, h);
          } catch (err) {
            console.error('LAS Parse Error:', err);
            h.showError('Failed to parse LAS', 'The file might be an unsupported LAS version or corrupted. ' + err.message);
          }
        }, 100);
      }
    });
  };

  // --- LAS Parsing Logic ---
  function parseLAS(buffer) {
    const view = new DataView(buffer);
    
    // B2: Strict binary handling with DataView
    const sig = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
    if (sig !== 'LASF') throw new Error('Invalid signature: expected LASF');

    const versionMajor = view.getUint8(24);
    const versionMinor = view.getUint8(25);
    const version = `${versionMajor}.${versionMinor}`;
    
    const offsetToData = view.getUint32(96, true);
    const formatId = view.getUint8(104);
    const recordLength = view.getUint16(105, true);
    
    let numPoints = view.getUint32(107, true);
    // Handle LAS 1.4 64-bit point count
    if (numPoints === 0 && versionMajor >= 1 && versionMinor >= 4 && buffer.byteLength > 255) {
      try { numPoints = Number(view.getBigUint64(247, true)); } catch(e) { numPoints = 0; }
    }

    if (numPoints === 0) return null;

    const xScale = view.getFloat64(131, true);
    const yScale = view.getFloat64(139, true);
    const zScale = view.getFloat64(147, true);
    const xOffset = view.getFloat64(155, true);
    const yOffset = view.getFloat64(163, true);
    const zOffset = view.getFloat64(171, true);

    const maxX = view.getFloat64(179, true), minX = view.getFloat64(187, true);
    const maxY = view.getFloat64(195, true), minY = view.getFloat64(203, true);
    const maxZ = view.getFloat64(211, true), minZ = view.getFloat64(219, true);
    
    // B7: Performance limit for browser rendering
    const limit = Math.min(numPoints, 1500000);
    const points = new Float32Array(limit * 3);
    const colors = new Float32Array(limit * 3);
    
    // Colors are available in format IDs 2, 3, 5, 7, 8, 10
    const hasColor = [2, 3, 5, 7, 8, 10].includes(formatId);
    const rangeZ = (maxZ - minZ) || 1;

    let pOff = offsetToData;
    for (let i = 0; i < limit; i++) {
      if (pOff + 12 > buffer.byteLength) break;
      
      const x = view.getInt32(pOff, true) * xScale + xOffset;
      const y = view.getInt32(pOff + 4, true) * yScale + yOffset;
      const z = view.getInt32(pOff + 8, true) * zScale + zOffset;
      
      points[i * 3] = x;
      points[i * 3 + 1] = y;
      points[i * 3 + 2] = z;

      let r = 0, g = 0, b = 0;
      let foundColor = false;
      
      if (hasColor) {
        let colorOffset = 0;
        if (formatId === 2) colorOffset = 20;
        else if (formatId === 3) colorOffset = 28;
        else if (formatId >= 6) colorOffset = 30;

        if (colorOffset > 0 && pOff + colorOffset + 6 <= buffer.byteLength) {
          r = view.getUint16(pOff + colorOffset, true) / 65535;
          g = view.getUint16(pOff + colorOffset + 2, true) / 65535;
          b = view.getUint16(pOff + colorOffset + 4, true) / 65535;
          if (r > 0 || g > 0 || b > 0) foundColor = true;
        }
      } 
      
      // Fallback: Color by elevation if no RGB data
      if (!foundColor) {
        const t = Math.max(0, Math.min(1, (z - minZ) / rangeZ));
        r = 0.2 + t * 0.7;
        g = 0.4 + t * 0.5;
        b = 0.9 - t * 0.4;
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
        version,
        systemId: getCharString(view, 32, 32),
        software: getCharString(view, 64, 32),
        formatId,
        recordLength,
        totalPoints: numPoints,
        bounds: { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] },
        scales: [xScale, yScale, zScale],
        offsets: [xOffset, yOffset, zOffset]
      }
    };
  }

  // --- UI Rendering ---
  function renderMain(data, file, h) {
    const fileSize = formatBytes(file.size);
    
    h.render(`
      <div class="flex flex-col h-[85vh] font-sans text-surface-900">
        <!-- U1: File Info Bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 border border-surface-200 shadow-sm">
          <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${fileSize}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">.las Lidar file</span>
          <div class="ml-auto flex items-center gap-2">
            <span class="px-2 py-0.5 bg-brand-100 text-brand-700 rounded-full text-xs font-bold uppercase tracking-wider">LAS v${data.header.version}</span>
          </div>
        </div>

        <!-- Navigation Tabs -->
        <div class="flex gap-2 mb-4 shrink-0 overflow-x-auto pb-1 no-scrollbar">
          <button id="tab-3d" class="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-bold shadow-md transition-all whitespace-nowrap">3D Viewer</button>
          <button id="tab-meta" class="px-4 py-2 bg-white border border-surface-200 text-surface-600 rounded-lg text-sm font-bold hover:bg-surface-50 transition-all whitespace-nowrap">Header Info</button>
          <button id="tab-table" class="px-4 py-2 bg-white border border-surface-200 text-surface-600 rounded-lg text-sm font-bold hover:bg-surface-50 transition-all whitespace-nowrap">Point Table</button>
        </div>

        <!-- Main Workspace -->
        <div id="las-workspace" class="flex-1 relative min-h-0 bg-white rounded-2xl border border-surface-200 shadow-xl overflow-hidden">
          
          <!-- 3D VIEW -->
          <div id="view-3d" class="absolute inset-0 z-0">
            <div id="three-container" class="w-full h-full bg-slate-950"></div>
            
            <!-- Controls Overlay -->
            <div class="absolute top-4 right-4 w-52 bg-white/95 backdrop-blur-md shadow-2xl rounded-2xl border border-surface-200 p-4 space-y-4">
               <div>
                  <div class="flex justify-between items-center mb-1.5">
                    <label class="text-[10px] font-black text-surface-400 uppercase tracking-widest">Point Size</label>
                    <span id="size-val" class="text-[10px] font-mono font-bold text-brand-600">1.0</span>
                  </div>
                  <input type="range" id="range-size" min="0.1" max="8" step="0.1" value="1" class="w-full h-1.5 bg-surface-200 rounded-lg appearance-none cursor-pointer accent-brand-500">
               </div>
               
               <div class="flex items-center justify-between py-2 border-t border-surface-100 pt-3">
                  <span class="text-[10px] font-black text-surface-400 uppercase tracking-widest">Rotation</span>
                  <label class="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" id="check-rotate" class="sr-only peer">
                    <div class="w-9 h-5 bg-surface-200 rounded-full peer peer-checked:bg-brand-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full"></div>
                  </label>
               </div>

               <div class="pt-2 border-t border-surface-100">
                  <button id="btn-reset" class="w-full py-2 bg-surface-50 text-surface-600 text-[10px] font-black rounded-lg hover:bg-brand-50 hover:text-brand-600 transition-all border border-surface-200 uppercase tracking-tighter">Reset Camera</button>
               </div>
               
               <div class="text-[9px] text-surface-400 italic leading-tight pt-1">
                 Rendering ${Math.min(data.numPoints, 1500000).toLocaleString()} of ${data.numPoints.toLocaleString()} points.
               </div>
            </div>
          </div>

          <!-- METADATA VIEW -->
          <div id="view-meta" class="hidden h-full overflow-y-auto p-6 bg-surface-50/30">
            <div class="max-w-4xl mx-auto space-y-6">
               <div class="flex items-center justify-between mb-2">
                 <h3 class="font-bold text-surface-800 text-lg">LAS Header Metadata</h3>
                 <div class="relative">
                   <input type="text" id="meta-filter" placeholder="Filter metadata..." class="px-3 py-1.5 text-xs border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none w-48">
                 </div>
               </div>
               
               <div class="grid grid-cols-1 md:grid-cols-2 gap-4" id="meta-cards">
                  ${renderMetaCard('File Origin', [
                    ['Generating System', data.header.systemId || 'Unknown'],
                    ['Software', data.header.software || 'Unknown'],
                    ['Point Format ID', data.header.formatId],
                    ['Record Length', `${data.header.recordLength} bytes`]
                  ])}
                  ${renderMetaCard('Statistics', [
                    ['Total Point Records', data.header.totalPoints.toLocaleString()],
                    ['Rendered Points', Math.min(data.numPoints, 1500000).toLocaleString()],
                    ['File Size', fileSize]
                  ])}
               </div>

               <!-- U7: Coordinate Table -->
               <div class="rounded-xl border border-surface-200 overflow-hidden bg-white shadow-sm">
                 <div class="bg-surface-50 px-4 py-3 border-b border-surface-200 flex justify-between items-center">
                    <span class="font-bold text-xs text-surface-600 uppercase tracking-widest">Spatial Bounds & Scaling</span>
                 </div>
                 <div class="overflow-x-auto">
                    <table class="w-full text-sm">
                      <thead>
                        <tr class="bg-surface-50/50 text-left text-surface-400 border-b border-surface-100 text-[11px] uppercase tracking-tighter">
                          <th class="px-6 py-3 font-black">Axis</th>
                          <th class="px-6 py-3 font-black">Min</th>
                          <th class="px-6 py-3 font-black">Max</th>
                          <th class="px-6 py-3 font-black">Scale</th>
                          <th class="px-6 py-3 font-black">Offset</th>
                        </tr>
                      </thead>
                      <tbody class="text-surface-700 font-mono text-xs">
                        ${['X', 'Y', 'Z'].map((axis, i) => `
                          <tr class="border-b border-surface-50 hover:bg-brand-50/30 transition-colors">
                            <td class="px-6 py-4 font-bold text-brand-600">${axis}</td>
                            <td class="px-6 py-4">${data.header.bounds.min[i].toFixed(4)}</td>
                            <td class="px-6 py-4">${data.header.bounds.max[i].toFixed(4)}</td>
                            <td class="px-6 py-4 text-surface-400">${data.header.scales[i].toFixed(7)}</td>
                            <td class="px-6 py-4 text-surface-400">${data.header.offsets[i].toFixed(3)}</td>
                          </tr>
                        `).join('')}
                      </tbody>
                    </table>
                 </div>
               </div>
            </div>
          </div>

          <!-- POINT TABLE VIEW -->
          <div id="view-table" class="hidden h-full flex flex-col bg-white">
            <div class="px-6 py-4 border-b border-surface-200 flex items-center justify-between shrink-0 bg-surface-50/50">
               <div>
                 <h3 class="font-bold text-surface-800">Point Sample View</h3>
                 <p class="text-[11px] text-surface-400 uppercase font-bold tracking-tight">Showing top 250 records</p>
               </div>
               <div class="flex items-center gap-3">
                 <span class="text-xs bg-brand-100 text-brand-700 px-3 py-1 rounded-full font-bold">250 items</span>
               </div>
            </div>
            
            <!-- U7: Table Wrapper -->
            <div class="flex-1 overflow-auto p-4">
               <div class="rounded-xl border border-surface-200 overflow-hidden shadow-sm">
                  <table class="min-w-full text-sm">
                    <thead class="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-surface-200">
                      <tr class="text-left text-surface-600 font-bold text-xs uppercase">
                        <th class="px-4 py-3 bg-surface-50/50">Index</th>
                        <th class="px-4 py-3">X Coordinate</th>
                        <th class="px-4 py-3">Y Coordinate</th>
                        <th class="px-4 py-3">Elevation (Z)</th>
                        <th class="px-4 py-3">Color Preview</th>
                      </tr>
                    </thead>
                    <tbody id="point-rows">
                      ${renderPointRows(data)}
                    </tbody>
                  </table>
               </div>
            </div>
          </div>

        </div>
      </div>
    `);

    // --- Template Helpers ---
    function renderMetaCard(title, items) {
      return `
        <div class="meta-card rounded-xl border border-surface-200 p-5 hover:border-brand-300 transition-all bg-white shadow-sm group">
          <h4 class="text-[10px] font-black text-surface-400 uppercase mb-4 tracking-widest group-hover:text-brand-500">${title}</h4>
          <div class="space-y-3">
            ${items.map(([k, v]) => `
              <div class="flex justify-between items-center text-sm border-b border-surface-50 pb-2 last:border-0 last:pb-0">
                <span class="text-surface-500 font-medium">${k}</span>
                <span class="font-bold text-surface-800 truncate ml-4" title="${v}">${v}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    function renderPointRows(data) {
      let html = '';
      const sampleCount = Math.min(data.numPoints, 250);
      for (let i = 0; i < sampleCount; i++) {
        const r = Math.round((data.colors[i * 3] || 0.5) * 255);
        const g = Math.round((data.colors[i * 3 + 1] || 0.5) * 255);
        const b = Math.round((data.colors[i * 3 + 2] || 0.5) * 255);
        html += `
          <tr class="even:bg-surface-50/50 hover:bg-brand-50/50 transition-colors border-b border-surface-100">
            <td class="px-4 py-2.5 text-surface-400 font-mono text-[10px]">#${(i + 1).toString().padStart(3, '0')}</td>
            <td class="px-4 py-2.5 font-mono text-xs">${data.points[i * 3].toFixed(4)}</td>
            <td class="px-4 py-2.5 font-mono text-xs">${data.points[i * 3 + 1].toFixed(4)}</td>
            <td class="px-4 py-2.5 font-mono text-xs font-bold text-brand-600">${data.points[i * 3 + 2].toFixed(4)}</td>
            <td class="px-4 py-2.5">
              <div class="flex items-center gap-2.5">
                <div class="w-4 h-4 rounded-md border border-surface-200 shadow-inner" style="background-color: rgb(${r},${g},${b})"></div>
                <span class="text-[10px] text-surface-500 font-mono">rgb(${r},${g},${b})</span>
              </div>
            </td>
          </tr>
        `;
      }
      return html;
    }

    // --- Interactivity ---
    const tabBtns = {
      'tab-3d': 'view-3d',
      'tab-meta': 'view-meta',
      'tab-table': 'view-table'
    };

    Object.keys(tabBtns).forEach(id => {
      document.getElementById(id).onclick = function() {
        Object.keys(tabBtns).forEach(tid => {
          const btn = document.getElementById(tid);
          const view = document.getElementById(tabBtns[tid]);
          if (tid === id) {
            btn.className = 'px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-bold shadow-md transition-all whitespace-nowrap scale-105 z-10';
            view.classList.remove('hidden');
          } else {
            btn.className = 'px-4 py-2 bg-white border border-surface-200 text-surface-600 rounded-lg text-sm font-bold hover:bg-surface-50 transition-all whitespace-nowrap';
            view.classList.add('hidden');
          }
        });
      };
    });

    // Metadata Filter (Format Excellence)
    document.getElementById('meta-filter').oninput = function(e) {
      const q = e.target.value.toLowerCase();
      document.querySelectorAll('.meta-card').forEach(card => {
        const text = card.textContent.toLowerCase();
        card.style.display = text.includes(q) ? '' : 'none';
      });
    };

    return initThree(data);
  }

  // --- 3D Engine Initialization ---
  function initThree(data) {
    const container = document.getElementById('three-container');
    if (!container) return null;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020617);

    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000000);
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(data.points, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
    geometry.computeBoundingSphere();

    const material = new THREE.PointsMaterial({ 
      size: 1.0, 
      vertexColors: true, 
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending
    });
    
    const cloud = new THREE.Points(geometry, material);
    
    const center = geometry.boundingSphere.center;
    cloud.position.set(-center.x, -center.y, -center.z);
    scene.add(cloud);

    const radius = geometry.boundingSphere.radius;
    const dist = radius * 1.8;
    camera.position.set(dist, dist, dist);
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
       camera.position.set(dist, dist, dist);
       controls.target.set(0, 0, 0);
       controls.update();
    };

    let frameId;
    const animate = () => {
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

    return { renderer, geometry, material, frameId };
  }
})();
