(function () {
  'use strict';

  /**
   * OmniOpener NIfTI (.nii, .nii.gz) Tool
   * A high-performance medical imaging viewer using nifti-reader-js.
   */

  function formatBytes(bytes) {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return unsafe;
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      accept: '.nii,.nii.gz',
      dropLabel: 'Drop a NIfTI (.nii, .nii.gz) medical image here',
      infoHtml: '<strong>Privacy First:</strong> Medical images are processed entirely in your browser. No data is sent to any server.',

      actions: [
        {
          label: '📋 Copy Header',
          id: 'copy-header',
          onClick: function (h, btn) {
            const state = h.getState();
            if (state.headerJson) {
              h.copyToClipboard(state.headerJson, btn);
            }
          }
        },
        {
          label: '📥 Download JSON',
          id: 'dl-header',
          onClick: function (h) {
            const state = h.getState();
            if (state.headerJson) {
              const blob = new Blob([state.headerJson], { type: 'application/json' });
              h.download(h.getFile().name.replace(/\.nii(\.gz)?$/, '.json'), blob, 'application/json');
            }
          }
        },
        {
          label: '🖼️ Save Slice',
          id: 'dl-slice',
          onClick: function (h) {
            const canvas = h.getRenderEl().querySelector('#nii-canvas');
            if (canvas) {
              canvas.toBlob(function (blob) {
                h.download('nifti-slice.png', blob, 'image/png');
              }, 'image/png');
            }
          }
        }
      ],

      onInit: function (h) {
        if (typeof window.nifti === 'undefined') {
          h.loadScript('https://cdn.jsdelivr.net/npm/fflate@0.8.2/lib/browser.min.js', function () {
            h.loadScript('https://cdn.jsdelivr.net/npm/nifti-reader-js@0.6.6/release/browser/nifti-reader-min.js');
          });
        }
      },

      onDestroy: function (h) {
        const state = h.getState();
        if (state.rafId) cancelAnimationFrame(state.rafId);
      },

      onFile: function _onFileFn(file, content, h) {
        if (typeof window.nifti === 'undefined' || typeof window.fflate === 'undefined') {
          h.showLoading('Initializing NIfTI engine...');
          setTimeout(function () { _onFileFn(file, content, h); }, 300);
          return;
        }

        h.showLoading('Decompressing and parsing NIfTI data...');

        // Move to microtask to ensure loading UI shows
        setTimeout(() => {
          try {
            let data = content;
            if (window.nifti.isCompressed(data)) {
              data = window.nifti.decompress(data);
            }

            if (!window.nifti.isNIFTI(data)) {
              h.showError('Invalid NIfTI File', 'The file does not appear to be a valid NIfTI-1 or NIfTI-2 image.');
              return;
            }

            const header = window.nifti.readHeader(data);
            const image = window.nifti.readImage(header, data);

            // Clean header for display/copy
            const displayHeader = Object.assign({}, header);
            delete displayHeader.extension;
            const headerJson = JSON.stringify(displayHeader, null, 2);

            h.setState({ 
              header, 
              image, 
              file, 
              headerJson,
              plane: 'axial',
              sliceIdx: Math.floor((header.dims[3] || 1) / 2),
              contrast: 1,
              brightness: 0
            });

            renderNifti(h);
          } catch (err) {
            console.error(err);
            h.showError('Parse Error', 'Could not parse NIfTI file: ' + err.message);
          }
        }, 10);
      }
    });
  };

  function renderNifti(h) {
    const state = h.getState();
    const { header, image, file } = state;

    const dims = header.dims; // [dim, x, y, z, t, ...]
    const nx = dims[1];
    const ny = dims[2];
    const nz = dims[3] || 1;
    const nt = dims[4] || 1;

    if (!nx || !ny) {
      h.render(`
        <div class="flex flex-col items-center justify-center py-20 text-center">
          <div class="w-20 h-20 bg-surface-100 rounded-full flex items-center justify-center mb-6">
            <svg class="w-10 h-10 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
          </div>
          <h3 class="text-xl font-semibold text-surface-900 mb-2">No Image Data</h3>
          <p class="text-surface-500 max-w-md">The file was parsed, but it contains no valid image dimensions (0x0).</p>
        </div>
      `);
      return;
    }

    const html = `
      <!-- U1: File Info Bar -->
      <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-100">
        <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
        <span class="text-surface-300">|</span>
        <span>${formatBytes(file.size)}</span>
        <span class="text-surface-300">|</span>
        <span class="px-2 py-0.5 bg-brand-100 text-brand-700 rounded text-xs font-medium">NIfTI Image</span>
        <span class="ml-auto text-xs text-surface-400 font-mono">${nx}x${ny}x${nz}${nt > 1 ? 'x' + nt : ''}</span>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <!-- Viewer Column -->
        <div class="lg:col-span-8 space-y-4">
          <div class="relative bg-black rounded-2xl overflow-hidden border border-surface-200 shadow-xl aspect-square flex items-center justify-center group">
            <canvas id="nii-canvas" class="max-w-full max-h-full image-pixelated transition-transform cursor-crosshair"></canvas>
            
            <!-- Overlay Info -->
            <div class="absolute top-4 left-4 flex flex-col gap-2 pointer-events-none">
              <div class="bg-black/40 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-lg text-white text-[10px] font-mono shadow-lg">
                <span class="text-white/60 mr-1">DIM:</span> ${nx} × ${ny} × ${nz}
              </div>
            </div>

            <div class="absolute bottom-4 left-4 right-4 flex justify-between items-end pointer-events-none">
              <div id="slice-label" class="bg-brand-600/90 backdrop-blur-md border border-brand-400/30 px-3 py-1.5 rounded-lg text-white text-xs font-bold shadow-lg">
                Slice: -- / --
              </div>
              <div class="bg-black/40 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-lg text-white text-[10px] font-mono shadow-lg">
                ${getDataTypeName(header.datatypeCode)} • ${header.numBitsPerVoxel} bit
              </div>
            </div>
          </div>

          <!-- Controls Card -->
          <div class="bg-white rounded-2xl border border-surface-200 p-6 shadow-sm space-y-6">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div class="space-y-4">
                <div class="flex items-center justify-between">
                  <label class="text-xs font-bold text-surface-500 uppercase tracking-wider">Navigation</label>
                  <span id="nav-val" class="text-xs font-mono text-brand-600 font-bold">--</span>
                </div>
                <div class="flex items-center gap-4">
                   <select id="view-plane" class="flex-none w-32 px-3 py-2 bg-surface-50 border border-surface-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-brand-500 transition-all cursor-pointer">
                      <option value="axial">Axial</option>
                      <option value="sagittal">Sagittal</option>
                      <option value="coronal">Coronal</option>
                   </select>
                   <input type="range" id="slice-range" class="flex-1 h-1.5 bg-surface-100 rounded-lg appearance-none cursor-pointer accent-brand-600">
                </div>
              </div>

              <div class="grid grid-cols-2 gap-4">
                <div class="space-y-3">
                  <div class="flex items-center justify-between">
                    <label class="text-[10px] font-bold text-surface-400 uppercase tracking-widest">Contrast</label>
                  </div>
                  <input type="range" id="contrast-range" min="0.1" max="5" step="0.1" value="1" class="w-full h-1.5 bg-surface-100 rounded-lg appearance-none cursor-pointer accent-surface-600">
                </div>
                <div class="space-y-3">
                  <div class="flex items-center justify-between">
                    <label class="text-[10px] font-bold text-surface-400 uppercase tracking-widest">Brightness</label>
                  </div>
                  <input type="range" id="brightness-range" min="-100" max="100" step="1" value="0" class="w-full h-1.5 bg-surface-100 rounded-lg appearance-none cursor-pointer accent-surface-600">
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Sidebar Column -->
        <div class="lg:col-span-4 space-y-6">
          <div class="bg-white rounded-2xl border border-surface-200 overflow-hidden shadow-sm">
            <div class="px-4 py-3 bg-surface-50/50 border-b border-surface-100 flex items-center justify-between">
              <h3 class="text-xs font-bold text-surface-800 uppercase tracking-wider">Image Metadata</h3>
              <span class="text-[10px] bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-bold">NIFTI-1</span>
            </div>
            
            <div class="p-4 space-y-4 max-h-[600px] overflow-y-auto custom-scrollbar">
              <div class="grid grid-cols-1 gap-3">
                ${renderMetaRow('Voxel Size', header.pixDims.slice(1, dims[0] + 1).map(d => d.toFixed(2)).join(' × ') + ' ' + getUnits(header.xyzt_units).split('/')[0].trim())}
                ${renderMetaRow('Intent', header.intent_name || 'None')}
                ${renderMetaRow('Description', header.description || 'None')}
                ${renderMetaRow('Aux File', header.aux_file || 'None')}
              </div>

              <div class="mt-6">
                <div class="flex items-center justify-between mb-2">
                   <h4 class="text-[10px] font-bold text-surface-400 uppercase tracking-widest">Header Raw</h4>
                   <button id="toggle-raw" class="text-[10px] text-brand-600 font-bold hover:underline">Expand</button>
                </div>
                <div id="raw-container" class="hidden rounded-xl overflow-hidden border border-surface-200">
                  <pre class="p-3 text-[10px] font-mono bg-gray-950 text-gray-300 overflow-x-auto leading-relaxed max-h-48">${escapeHtml(state.headerJson)}</pre>
                </div>
              </div>
            </div>
          </div>

          <div class="bg-brand-50 rounded-2xl border border-brand-100 p-4">
             <div class="flex gap-3">
                <div class="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-600 flex-none">
                   <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                </div>
                <div>
                   <h4 class="text-xs font-bold text-brand-800 mb-1">Viewer Tips</h4>
                   <p class="text-[11px] text-brand-700 leading-relaxed">
                      Toggle the <b>View Plane</b> to see cross-sections. Use <b>Contrast</b> to bring out soft tissue details.
                   </p>
                </div>
             </div>
          </div>
        </div>
      </div>

      <style>
        .image-pixelated { 
          image-rendering: pixelated; 
          image-rendering: crisp-edges; 
        }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
      </style>
    `;

    h.render(html);

    setupLogic(h);
  }

  function renderMetaRow(label, value) {
    if (!value || value === 'None') return '';
    return `
      <div class="group border-b border-surface-50 pb-2 last:border-0">
        <div class="text-[10px] text-surface-400 font-bold uppercase mb-0.5 tracking-tighter">${label}</div>
        <div class="text-xs text-surface-700 truncate font-medium group-hover:text-brand-600 transition-colors" title="${escapeHtml(value)}">${escapeHtml(value)}</div>
      </div>
    `;
  }

  function setupLogic(h) {
    const state = h.getState();
    const { header, image } = state;
    const canvas = document.getElementById('nii-canvas');
    const ctx = canvas.getContext('2d');
    
    const sliceRange = document.getElementById('slice-range');
    const viewPlane = document.getElementById('view-plane');
    const contrastRange = document.getElementById('contrast-range');
    const brightnessRange = document.getElementById('brightness-range');
    const sliceLabel = document.getElementById('slice-label');
    const navVal = document.getElementById('nav-val');
    const toggleRaw = document.getElementById('toggle-raw');
    const rawContainer = document.getElementById('raw-container');

    const nx = header.dims[1];
    const ny = header.dims[2];
    const nz = header.dims[3] || 1;

    // Typed data initialization
    let typedData;
    try {
      if (header.datatypeCode === 2) typedData = new Uint8Array(image);
      else if (header.datatypeCode === 4) typedData = new Int16Array(image);
      else if (header.datatypeCode === 8) typedData = new Int32Array(image);
      else if (header.datatypeCode === 16) typedData = new Float32Array(image);
      else if (header.datatypeCode === 64) typedData = new Float64Array(image);
      else if (header.datatypeCode === 512) typedData = new Uint16Array(image);
      else if (header.datatypeCode === 768) typedData = new Uint32Array(image);
      else typedData = new Float32Array(image);
    } catch (e) {
      console.error('Buffer view creation failed', e);
      typedData = new Uint8Array(image);
    }

    // Min/Max for normalization
    let min = header.cal_min || 0;
    let max = header.cal_max || 0;
    if (max === 0 || max <= min) {
      min = typedData[0]; 
      max = typedData[0];
      const step = Math.max(1, Math.floor(typedData.length / 50000));
      for (let i = 0; i < typedData.length; i += step) {
        if (typedData[i] < min) min = typedData[i];
        if (typedData[i] > max) max = typedData[i];
      }
    }
    const dataRange = (max - min) || 1;

    function updateNav() {
      const plane = h.getState().plane;
      let limit = 0;
      if (plane === 'axial') limit = nz;
      else if (plane === 'sagittal') limit = nx;
      else if (plane === 'coronal') limit = ny;

      sliceRange.max = limit - 1;
      const currentIdx = Math.min(h.getState().sliceIdx, limit - 1);
      sliceRange.value = currentIdx;
      
      sliceLabel.textContent = `Slice: ${currentIdx + 1} / ${limit}`;
      navVal.textContent = `${currentIdx + 1} of ${limit}`;
    }

    function draw() {
      const { plane, sliceIdx, contrast, brightness } = h.getState();
      
      let width, height;
      if (plane === 'axial') { width = nx; height = ny; }
      else if (plane === 'sagittal') { width = ny; height = nz; }
      else { width = nx; height = nz; }

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      const imgData = ctx.createImageData(width, height);
      const data = imgData.data;

      // Tight loop for rendering
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          let idx = 0;
          if (plane === 'axial') {
            idx = (sliceIdx * nx * ny) + (y * nx) + x;
          } else if (plane === 'sagittal') {
            idx = (y * nx * ny) + (x * nx) + sliceIdx;
          } else {
            idx = (y * nx * ny) + (sliceIdx * nx) + x;
          }

          const val = typedData[idx] || 0;
          let norm = ((val - min) / dataRange) * 255;
          norm = (norm - 128) * contrast + 128 + brightness;
          
          if (norm < 0) norm = 0;
          else if (norm > 255) norm = 255;

          const pIdx = ((height - 1 - y) * width + x) * 4; // Radiologic orientation (flip Y)
          data[pIdx] = norm;
          data[pIdx + 1] = norm;
          data[pIdx + 2] = norm;
          data[pIdx + 3] = 255;
        }
      }
      ctx.putImageData(imgData, 0, 0);
    }

    // Event listeners
    viewPlane.addEventListener('change', (e) => {
      h.setState({ plane: e.target.value, sliceIdx: 0 });
      updateNav();
      draw();
    });

    sliceRange.addEventListener('input', (e) => {
      const idx = parseInt(e.target.value, 10);
      h.setState({ sliceIdx: idx });
      updateNav();
      draw();
    });

    contrastRange.addEventListener('input', (e) => {
      h.setState({ contrast: parseFloat(e.target.value) });
      draw();
    });

    brightnessRange.addEventListener('input', (e) => {
      h.setState({ brightness: parseFloat(e.target.value) });
      draw();
    });

    toggleRaw.addEventListener('click', () => {
      const hidden = rawContainer.classList.toggle('hidden');
      toggleRaw.textContent = hidden ? 'Expand' : 'Collapse';
    });

    // Initial render
    updateNav();
    draw();
  }

  function getDataTypeName(code) {
    const types = { 
      2: 'Uint8', 4: 'Int16', 8: 'Int32', 16: 'Float32', 
      32: 'Complex64', 64: 'Float64', 128: 'RGB24', 256: 'Int8', 
      512: 'Uint16', 768: 'Uint32' 
    };
    return types[code] || 'Unknown';
  }

  function getUnits(code) {
    const units = { 
      1: 'Unknown', 2: 'mm', 3: 'micron', 8: 'sec', 
      16: 'msec', 24: 'usec', 32: 'hz', 48: 'ppm', 64: 'rads' 
    };
    const space = code & 0x07;
    const time = code & 0x38;
    return (units[space] || 'mm') + (time ? ' / ' + (units[time] || 'sec') : '');
  }

})();
