(function () {
  'use strict';

  function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  }

  function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return unsafe;
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      accept: '.nii,.nii.gz',
      dropLabel: 'Drop a NIfTI (.nii, .nii.gz) file here',
      infoHtml: '<strong>Medical Imaging Privacy:</strong> This tool parses NIfTI files 100% locally using nifti-reader-js. No data is ever uploaded.',

      actions: [
        {
          label: '📋 Copy Header',
          id: 'copy-header',
          onClick: function (h, btn) {
            const header = h.getState().header;
            if (header) {
              const cleanHeader = Object.assign({}, header);
              delete cleanHeader.extension; 
              h.copyToClipboard(JSON.stringify(cleanHeader, null, 2), btn);
            }
          }
        },
        {
          label: '📥 Download Header',
          id: 'dl-header',
          onClick: function (h) {
            const header = h.getState().header;
            if (header) {
              const cleanHeader = Object.assign({}, header);
              delete cleanHeader.extension;
              const jsonStr = JSON.stringify(cleanHeader, null, 2);
              const blob = new Blob([jsonStr], { type: 'application/json' });
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
              canvas.toBlob(function(blob) {
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
        // Any specific cleanup for NIfTI can go here
      },

      onFile: function _onFileFn(file, content, h) {
        if (typeof window.nifti === 'undefined') {
          h.showLoading('Loading NIfTI engine...');
          setTimeout(function() { _onFileFn(file, content, h); }, 500);
          return;
        }

        h.showLoading('Decompressing and parsing NIfTI...');

        setTimeout(() => {
          try {
            let data = content;
            if (window.nifti.isCompressed(data)) {
              data = window.nifti.decompress(data);
            }

            if (!window.nifti.isNIFTI(data)) {
              h.showError('Could not open nii file', 'The file may be corrupted or in an unsupported variant. Try saving it again and re-uploading.');
              return;
            }

            const header = window.nifti.readHeader(data);
            const image = window.nifti.readImage(header, data);

            h.setState({ header, image, file });
            renderNifti(h);
          } catch (err) {
            h.showError('Could not open nii file', 'Error during parsing: ' + err.message);
          }
        }, 50);
      }
    });
  };

  function renderNifti(h) {
    const state = h.getState();
    const header = state.header;
    const image = state.image;
    const file = state.file;

    // Dimensions
    const dims = header.dims; // [dim, x, y, z, t, ...]
    const nx = dims[1];
    const ny = dims[2];
    const nz = dims[3] || 1;
    const nt = dims[4] || 1;

    if (nx === 0 || ny === 0) {
      h.render(`
        <div class="flex flex-col items-center justify-center py-12 px-4 text-center">
          <div class="w-16 h-16 bg-surface-100 rounded-full flex items-center justify-center mb-4">
            <svg class="w-8 h-8 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
          </div>
          <h3 class="text-lg font-medium text-surface-900 mb-1">Empty NIfTI File</h3>
          <p class="text-surface-500 max-w-sm">The file was parsed successfully but contains no image dimensions.</p>
        </div>
      `);
      return;
    }

    const fileSizeStr = formatBytes(file.size);

    const html = `
      <!-- File Info Bar -->
      <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">
        <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
        <span class="text-surface-300">|</span>
        <span>${fileSizeStr}</span>
        <span class="text-surface-300">|</span>
        <span class="text-surface-500">.nii NIfTI Image</span>
      </div>

      <div class="flex flex-col lg:flex-row gap-6 p-6 bg-surface-50 min-h-[600px] rounded-xl border border-surface-200">
        <!-- Viewer -->
        <div class="flex-1 flex flex-col gap-4">
          <div class="bg-surface-900 rounded-xl border border-surface-200 shadow-inner flex items-center justify-center overflow-hidden relative" style="min-height: 500px;">
            <canvas id="nii-canvas" class="max-w-full max-h-full image-pixelated"></canvas>
            <div class="absolute bottom-4 left-4 flex gap-2">
               <div class="bg-black/60 backdrop-blur px-3 py-1.5 rounded-lg text-white text-[10px] font-mono border border-white/20 shadow-sm">
                  ${nx} x ${ny} x ${nz} ${nt > 1 ? ' x ' + nt : ''}
               </div>
               <div id="slice-label" class="bg-brand-600/80 backdrop-blur px-3 py-1.5 rounded-lg text-white text-[10px] font-mono border border-brand-400/20 shadow-sm">
                  Slice: 1 / ${nz}
               </div>
            </div>
          </div>

          <!-- Controls -->
          <div class="bg-white p-4 rounded-xl border border-surface-200 shadow-sm space-y-4">
             <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div class="space-y-1">
                   <label class="text-[10px] font-bold text-surface-400 uppercase">View Plane</label>
                   <select id="view-plane" class="w-full text-xs p-2 bg-surface-50 border border-surface-200 rounded-lg outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all">
                      <option value="axial">Axial (X-Y)</option>
                      <option value="sagittal">Sagittal (Y-Z)</option>
                      <option value="coronal">Coronal (X-Z)</option>
                   </select>
                </div>
                <div class="space-y-1">
                   <label class="text-[10px] font-bold text-surface-400 uppercase">Slice Index</label>
                   <input type="range" id="slice-range" class="w-full h-2 bg-surface-100 rounded-lg appearance-none cursor-pointer accent-brand-600 outline-none focus:ring-2 focus:ring-brand-500">
                </div>
                <div class="space-y-1">
                   <label class="text-[10px] font-bold text-surface-400 uppercase">Contrast</label>
                   <input type="range" id="contrast-range" min="0.1" max="5" step="0.1" value="1" class="w-full h-2 bg-surface-100 rounded-lg appearance-none cursor-pointer accent-brand-600 outline-none focus:ring-2 focus:ring-brand-500">
                </div>
                <div class="space-y-1">
                   <label class="text-[10px] font-bold text-surface-400 uppercase">Brightness</label>
                   <input type="range" id="brightness-range" min="-100" max="100" step="1" value="0" class="w-full h-2 bg-surface-100 rounded-lg appearance-none cursor-pointer accent-brand-600 outline-none focus:ring-2 focus:ring-brand-500">
                </div>
             </div>
          </div>
        </div>

        <!-- Metadata Sidebar -->
        <div class="w-full lg:w-80 flex flex-col gap-4">
           <div class="bg-white rounded-xl border border-surface-200 flex-1 flex flex-col overflow-hidden shadow-sm">
              <div class="p-3 border-b border-surface-100 bg-surface-50/50 flex justify-between items-center">
                 <h3 class="text-xs font-bold text-surface-700 uppercase tracking-wider font-mono">NIfTI Header</h3>
              </div>
              <div class="flex-1 overflow-auto p-4 space-y-4">
                 <div>
                    <div class="text-[10px] font-bold text-surface-400 uppercase mb-1">Dimensions</div>
                    <div class="text-xs text-surface-700 font-mono bg-surface-50 p-2 rounded border border-surface-100">${dims.slice(1, dims[0] + 1).join(' x ')}</div>
                 </div>
                 <div>
                    <div class="text-[10px] font-bold text-surface-400 uppercase mb-1">Voxel Size</div>
                    <div class="text-xs text-surface-700 font-mono bg-surface-50 p-2 rounded border border-surface-100">${header.pixDims.slice(1, dims[0] + 1).map(d => d.toFixed(2)).join(' x ')}</div>
                 </div>
                 <div>
                    <div class="text-[10px] font-bold text-surface-400 uppercase mb-1">Datatype</div>
                    <div class="text-xs text-surface-700 font-mono bg-surface-50 p-2 rounded border border-surface-100">${getDataTypeName(header.datatypeCode)} (${header.numBitsPerVoxel} bits)</div>
                 </div>
                 <div>
                    <div class="text-[10px] font-bold text-surface-400 uppercase mb-1">Units</div>
                    <div class="text-xs text-surface-700 font-mono bg-surface-50 p-2 rounded border border-surface-100">${getUnits(header.xyzt_units)}</div>
                 </div>
                 <div class="pt-4 border-t border-surface-100">
                    <div class="text-[10px] font-bold text-surface-400 uppercase mb-2">Attributes</div>
                    <div class="space-y-2">
                       ${['description', 'aux_file', 'intent_name'].map(key => header[key] && header[key].trim() ? `
                          <div class="bg-surface-50 p-2 rounded border border-surface-100">
                             <div class="text-[9px] text-surface-400 font-medium uppercase tracking-wider mb-0.5">${key}</div>
                             <div class="text-[11px] text-surface-600 truncate" title="${escapeHtml(header[key])}">${escapeHtml(header[key])}</div>
                          </div>
                       ` : '').join('')}
                    </div>
                 </div>
              </div>
           </div>
        </div>
      </div>
      <style>
        .image-pixelated { image-rendering: pixelated; image-rendering: crisp-edges; }
      </style>
    `;

    h.render(html);

    const canvas = document.getElementById('nii-canvas');
    const ctx = canvas.getContext('2d');
    const sliceRange = document.getElementById('slice-range');
    const viewPlane = document.getElementById('view-plane');
    const contrastRange = document.getElementById('contrast-range');
    const brightnessRange = document.getElementById('brightness-range');
    const sliceLabel = document.getElementById('slice-label');

    // Typed data
    let typedData;
    if (header.datatypeCode === 2) typedData = new Uint8Array(image);
    else if (header.datatypeCode === 4) typedData = new Int16Array(image);
    else if (header.datatypeCode === 8) typedData = new Int32Array(image);
    else if (header.datatypeCode === 16) typedData = new Float32Array(image);
    else if (header.datatypeCode === 64) typedData = new Float64Array(image);
    else if (header.datatypeCode === 512) typedData = new Uint16Array(image);
    else typedData = new Float32Array(image);

    // Initial state
    let plane = 'axial';
    let sliceIdx = Math.floor(nz / 2);
    let contrast = 1;
    let brightness = 0;

    // Pre-calculate statistics for normalization
    let min = header.cal_min || 0;
    let max = header.cal_max || 0;
    if (max === 0) {
      min = typedData[0]; max = typedData[0];
      const step = Math.max(1, Math.floor(typedData.length / 10000));
      for (let i = 0; i < typedData.length; i += step) {
        if (typedData[i] < min) min = typedData[i];
        if (typedData[i] > max) max = typedData[i];
      }
    }
    const dataRange = (max - min) || 1;

    function updateRange() {
      if (plane === 'axial') {
        sliceRange.max = nz - 1;
        sliceIdx = Math.min(sliceIdx, nz - 1);
      } else if (plane === 'sagittal') {
        sliceRange.max = nx - 1;
        sliceIdx = Math.min(sliceIdx, nx - 1);
      } else {
        sliceRange.max = ny - 1;
        sliceIdx = Math.min(sliceIdx, ny - 1);
      }
      sliceRange.value = sliceIdx;
    }

    function draw() {
      let width, height;
      if (plane === 'axial') { width = nx; height = ny; }
      else if (plane === 'sagittal') { width = ny; height = nz; }
      else { width = nx; height = nz; }

      canvas.width = width;
      canvas.height = height;

      const imgData = ctx.createImageData(width, height);
      const data = imgData.data;

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
          norm = Math.max(0, Math.min(255, norm));

          const pIdx = ((height - 1 - y) * width + x) * 4; // Flip Y for medical orientation
          data[pIdx] = norm;
          data[pIdx + 1] = norm;
          data[pIdx + 2] = norm;
          data[pIdx + 3] = 255;
        }
      }
      ctx.putImageData(imgData, 0, 0);
      sliceLabel.textContent = `Slice: ${sliceIdx + 1} / ${parseInt(sliceRange.max) + 1}`;
    }

    viewPlane.addEventListener('change', (e) => { plane = e.target.value; updateRange(); draw(); });
    sliceRange.addEventListener('input', (e) => { sliceIdx = parseInt(e.target.value, 10); draw(); });
    contrastRange.addEventListener('input', (e) => { contrast = parseFloat(e.target.value); draw(); });
    brightnessRange.addEventListener('input', (e) => { brightness = parseFloat(e.target.value); draw(); });

    updateRange();
    draw();
  }

  function getDataTypeName(code) {
    const types = { 2: 'Uint8', 4: 'Int16', 8: 'Int32', 16: 'Float32', 32: 'Complex64', 64: 'Float64', 128: 'RGB24', 256: 'Int8', 512: 'Uint16', 768: 'Uint32' };
    return types[code] || 'Unknown';
  }

  function getUnits(code) {
    const units = { 1: 'Unknown', 2: 'mm', 3: 'micron', 8: 'sec', 16: 'msec', 24: 'usec', 32: 'hz', 48: 'ppm', 64: 'rads' };
    const space = code & 0x07;
    const time = code & 0x38;
    return (units[space] || 'mm') + (time ? ' / ' + (units[time] || 'sec') : '');
  }

})();