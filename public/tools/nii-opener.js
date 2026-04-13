(function () {
  'use strict';

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
              delete cleanHeader.extension; // Usually huge binary blob
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
              h.download(h.getFile().name.replace(/\.nii(\.gz)?$/, '.json'), JSON.stringify(cleanHeader, null, 2), 'application/json');
            }
          }
        },
        {
          label: '🖼️ Save Slice',
          id: 'dl-slice',
          onClick: function (h) {
            const canvas = h.getRenderEl().querySelector('canvas');
            if (canvas) {
              h.download('nifti-slice.png', canvas.toDataURL('image/png'), 'image/png');
            }
          }
        }
      ],

      onInit: function (h) {
        if (typeof nifti === 'undefined') {
          h.loadScript('https://cdn.jsdelivr.net/npm/fflate@0.8.2/lib/browser.min.js', function () {
            h.loadScript('https://cdn.jsdelivr.net/npm/nifti-reader-js@0.6.6/release/browser/nifti-reader-min.js');
          });
        }
      },

      onFile: function (file, content, h) {
        if (typeof nifti === 'undefined') {
          h.showLoading('Loading NIfTI engine...');
          setTimeout(() => h.onFile(file, content, h), 500);
          return;
        }

        h.showLoading('Decompressing and parsing...');

        setTimeout(() => {
          try {
            let data = content;
            if (nifti.isCompressed(data)) {
              data = nifti.decompress(data);
            }

            if (!nifti.isNIFTI(data)) {
              throw new Error('Not a valid NIfTI file');
            }

            const header = nifti.readHeader(data);
            const image = nifti.readImage(header, data);

            h.setState({ header, image });
            renderNifti(h);
          } catch (err) {
            h.showError('NIfTI Error', err.message);
          }
        }, 50);
      }
    });
  };

  function renderNifti(h) {
    const header = h.getState().header;
    const image = h.getState().image;

    // Dimensions
    const dims = header.dims; // [dim, x, y, z, t, ...]
    const nx = dims[1];
    const ny = dims[2];
    const nz = dims[3] || 1;
    const nt = dims[4] || 1;

    const html = `
      <div class="flex flex-col lg:flex-row gap-6 p-6 bg-surface-50 min-h-[600px]">
        <!-- Viewer -->
        <div class="flex-1 flex flex-col gap-4">
          <div class="bg-surface-900 rounded-xl border border-surface-200 shadow-inner flex items-center justify-center overflow-hidden relative" style="min-height: 500px;">
            <canvas id="nii-canvas" class="max-w-full max-h-full image-pixelated"></canvas>
            <div class="absolute bottom-4 left-4 flex gap-2">
               <div class="bg-black/60 backdrop-blur px-3 py-1.5 rounded-lg text-white text-[10px] font-mono border border-white/20">
                  ${nx} x ${ny} x ${nz} ${nt > 1 ? ' x ' + nt : ''}
               </div>
               <div id="slice-label" class="bg-brand-600/80 backdrop-blur px-3 py-1.5 rounded-lg text-white text-[10px] font-mono border border-brand-400/20">
                  Slice: 1 / ${nz}
               </div>
            </div>
          </div>

          <!-- Controls -->
          <div class="bg-white p-4 rounded-xl border border-surface-200 shadow-sm space-y-4">
             <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div class="space-y-1">
                   <label class="text-[10px] font-bold text-surface-400 uppercase">View Plane</label>
                   <select id="view-plane" class="w-full text-xs p-2 bg-surface-50 border border-surface-200 rounded-lg">
                      <option value="axial">Axial (X-Y)</option>
                      <option value="sagittal">Sagittal (Y-Z)</option>
                      <option value="coronal">Coronal (X-Z)</option>
                   </select>
                </div>
                <div class="space-y-1">
                   <label class="text-[10px] font-bold text-surface-400 uppercase">Slice Index</label>
                   <input type="range" id="slice-range" class="w-full h-2 bg-surface-100 rounded-lg appearance-none cursor-pointer accent-brand-600">
                </div>
                <div class="space-y-1">
                   <label class="text-[10px] font-bold text-surface-400 uppercase">Contrast</label>
                   <input type="range" id="contrast-range" min="0.1" max="5" step="0.1" value="1" class="w-full h-2 bg-surface-100 rounded-lg appearance-none cursor-pointer accent-brand-600">
                </div>
                <div class="space-y-1">
                   <label class="text-[10px] font-bold text-surface-400 uppercase">Brightness</label>
                   <input type="range" id="brightness-range" min="-100" max="100" step="1" value="0" class="w-full h-2 bg-surface-100 rounded-lg appearance-none cursor-pointer accent-brand-600">
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
                    <div class="text-xs text-surface-700 font-mono">${dims.slice(1, dims[0] + 1).join(' x ')}</div>
                 </div>
                 <div>
                    <div class="text-[10px] font-bold text-surface-400 uppercase mb-1">Voxel Size</div>
                    <div class="text-xs text-surface-700 font-mono">${header.pixDims.slice(1, dims[0] + 1).map(d => d.toFixed(2)).join(' x ')}</div>
                 </div>
                 <div>
                    <div class="text-[10px] font-bold text-surface-400 uppercase mb-1">Datatype</div>
                    <div class="text-xs text-surface-700 font-mono">${getDataTypeName(header.datatypeCode)} (${header.numBitsPerVoxel} bits)</div>
                 </div>
                 <div>
                    <div class="text-[10px] font-bold text-surface-400 uppercase mb-1">Units</div>
                    <div class="text-xs text-surface-700 font-mono">${getUnits(header.xyzt_units)}</div>
                 </div>
                 <div class="pt-4 border-t border-surface-100">
                    <div class="text-[10px] font-bold text-surface-400 uppercase mb-2 text-surface-400">Attributes</div>
                    <div class="space-y-2">
                       ${['description', 'aux_file', 'intent_name'].map(key => header[key] && header[key].trim() ? `
                          <div>
                             <div class="text-[9px] text-surface-400 font-medium">${key}</div>
                             <div class="text-[11px] text-surface-600 truncate" title="${header[key]}">${header[key]}</div>
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

    viewPlane.onchange = (e) => { plane = e.target.value; updateRange(); draw(); };
    sliceRange.oninput = (e) => { sliceIdx = parseInt(e.target.value); draw(); };
    contrastRange.oninput = (e) => { contrast = parseFloat(e.target.value); draw(); };
    brightnessRange.oninput = (e) => { brightness = parseFloat(e.target.value); draw(); };

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
