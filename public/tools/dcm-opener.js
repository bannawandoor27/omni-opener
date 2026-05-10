(function () {
  'use strict';

  const TAG_DICT = {
    'x00100010': 'Patient Name',
    'x00100020': 'Patient ID',
    'x00100030': 'Patient Birth Date',
    'x00100040': 'Patient Sex',
    'x00080020': 'Study Date',
    'x00080030': 'Study Time',
    'x00080060': 'Modality',
    'x00080070': 'Manufacturer',
    'x00080080': 'Institution Name',
    'x00080081': 'Institution Address',
    'x00081030': 'Study Description',
    'x0008103e': 'Series Description',
    'x00081090': 'Manufacturer Model',
    'x00180015': 'Body Part Examined',
    'x00181030': 'Protocol Name',
    'x0020000d': 'Study Instance UID',
    'x0020000e': 'Series Instance UID',
    'x00200010': 'Study ID',
    'x00200011': 'Series Number',
    'x00200013': 'Instance Number',
    'x00280010': 'Rows',
    'x00280011': 'Columns',
    'x00280100': 'Bits Allocated',
    'x00280101': 'Bits Stored',
    'x00280102': 'High Bit',
    'x00280103': 'Pixel Representation',
    'x00281050': 'Window Center',
    'x00281051': 'Window Width',
    'x00281052': 'Rescale Intercept',
    'x00281053': 'Rescale Slope',
    'x00020010': 'Transfer Syntax UID'
  };

  window.initTool = function (toolConfig, mountEl) {
    let drawFn = null;
    let cleanupFns = [];
    let currentMetadata = [];

    function formatSize(bytes) {
      if (!bytes) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function escapeHtml(str) {
      if (typeof str !== 'string') return String(str);
      return str.replace(/[&<>"']/g, function (m) {
        return {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;'
        }[m];
      });
    }

    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      accept: '.dcm',
      dropLabel: 'Drop a DICOM file to view medical imaging and metadata',
      infoHtml: '<strong>Medical Privacy:</strong> All DICOM processing occurs locally in your browser. No patient data or medical images are ever uploaded.',

      actions: [
        {
          label: '📋 Copy Metadata',
          id: 'copy-meta',
          onClick: function (h, btn) {
            if (!currentMetadata.length) return;
            const text = currentMetadata.map(m => `${m.tag} [${m.name}]: ${m.value}`).join('\n');
            h.copyToClipboard(text, btn);
          }
        },
        {
          label: '🖼️ Download PNG',
          id: 'dl-png',
          onClick: function (h) {
            const canvas = h.getRenderEl().querySelector('#dicom-canvas');
            if (canvas) {
              canvas.toBlob(function (blob) {
                if (blob) {
                  h.download(h.getFile().name.replace(/\.dcm$/i, '') + '.png', blob, 'image/png');
                }
              }, 'image/png');
            }
          }
        },
        {
          label: '🌓 Invert',
          id: 'invert-colors',
          onClick: function (h) {
            const inverted = !h.getState().inverted;
            h.setState('inverted', inverted);
            if (drawFn) drawFn();
          }
        },
        {
          label: '🔄 Reset',
          id: 'reset-view',
          onClick: function (h) {
            const wcInput = h.getRenderEl().querySelector('#win-center');
            const wwInput = h.getRenderEl().querySelector('#win-width');
            if (wcInput && wwInput) {
              wcInput.value = h.getState().defaultWC || 40;
              wwInput.value = h.getState().defaultWW || 400;
              h.setState('zoom', 1);
              h.setState('pan', { x: 0, y: 0 });
              if (drawFn) drawFn();
            }
          }
        }
      ],

      onInit: function (h) {
        if (typeof dicomParser === 'undefined') {
          h.loadScript('https://cdn.jsdelivr.net/npm/dicom-parser@1.8.21/dist/dicomParser.min.js');
        }
      },

      onDestroy: function () {
        cleanupFns.forEach(fn => fn());
        cleanupFns = [];
      },

      onFile: function _onFileFn(file, content, h) {
        if (typeof dicomParser === 'undefined') {
          h.showLoading('Loading medical imaging engine...');
          setTimeout(function () { _onFileFn(file, content, h); }, 500);
          return;
        }

        h.showLoading('Parsing DICOM dataset...');

        // Clear previous state
        cleanupFns.forEach(fn => fn());
        cleanupFns = [];

        try {
          const byteArray = new Uint8Array(content);
          const dataSet = dicomParser.parseDicom(byteArray);
          
          const meta = [];
          for (const tag in dataSet.elements) {
            const element = dataSet.elements[tag];
            let value = '(binary)';
            try {
              if (element.length < 1024) { // Only attempt to read small-ish tags as strings
                value = dataSet.string(tag) || value;
              }
            } catch (e) {}
            
            meta.push({
              tag: tag.replace('x', '(').replace(/^(....)(....)$/, '$1,$2)'),
              rawTag: tag,
              name: TAG_DICT[tag] || 'Unknown Tag',
              value: value
            });
          }

          currentMetadata = meta;
          h.setState('inverted', false);
          h.setState('zoom', 1);
          h.setState('pan', { x: 0, y: 0 });

          const rows = dataSet.uint16('x00280010');
          const cols = dataSet.uint16('x00280011');
          const bitsAllocated = dataSet.uint16('x00280100');
          const pixelDataElement = dataSet.elements['x7fe00010'];

          const wcDefault = parseFloat(dataSet.string('x00281050')) || 40;
          const wwDefault = parseFloat(dataSet.string('x00281051')) || 400;
          const ri = parseFloat(dataSet.string('x00281052')) || 0;
          const rs = parseFloat(dataSet.string('x00281053')) || 1;

          h.setState('defaultWC', wcDefault);
          h.setState('defaultWW', wwDefault);

          renderLayout(file, h, meta, rows, cols, bitsAllocated, wcDefault, wwDefault, dataSet, pixelDataElement, ri, rs);
        } catch (err) {
          h.showError('Could not open DICOM file', 'This file may be corrupted, encrypted, or uses an unsupported DICOM variant. Error: ' + err.message);
        }
      }
    });

    function renderLayout(file, h, meta, rows, cols, bitsAllocated, wcDefault, wwDefault, dataSet, pixelDataElement, ri, rs) {
      const hasImage = rows && cols && pixelDataElement;
      
      const html = `
        <div class="p-6 h-full flex flex-col bg-white">
          <!-- U1. File info bar -->
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6">
            <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
            <span class="text-surface-300">|</span>
            <span>${formatSize(file.size)}</span>
            <span class="text-surface-300">|</span>
            <span class="text-surface-500">.dcm (DICOM)</span>
            ${hasImage ? `
              <span class="text-surface-300">|</span>
              <span class="text-surface-500">${cols} × ${rows} • ${bitsAllocated}-bit</span>
            ` : ''}
          </div>

          <div class="flex-1 flex flex-col lg:flex-row gap-6 min-h-0">
            <!-- Left Side: Viewer (if image exists) -->
            ${hasImage ? `
              <div class="flex-1 flex flex-col gap-4 min-h-0">
                <div class="flex-1 bg-black rounded-2xl border border-surface-200 shadow-inner flex items-center justify-center overflow-hidden relative group" id="viewer-container">
                  <canvas id="dicom-canvas" class="transition-transform cursor-grab active:cursor-grabbing origin-center"></canvas>
                  
                  <!-- Overlays -->
                  <div class="absolute top-4 left-4 pointer-events-none">
                     <div class="bg-black/60 backdrop-blur px-3 py-2 rounded-lg text-white text-[10px] font-mono border border-white/20 flex flex-col gap-1">
                       <div class="text-white/50 border-b border-white/10 pb-1 mb-1 font-bold uppercase tracking-wider">Image Specs</div>
                       <span>DIM: ${cols} × ${rows}</span>
                       <span>BIT: ${bitsAllocated}-bit</span>
                       <span>SRC: ${escapeHtml(file.name)}</span>
                     </div>
                  </div>

                  <div class="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    <div class="bg-black/60 backdrop-blur px-3 py-1.5 rounded-lg text-white text-[10px] border border-white/20">
                      Scroll to zoom • Drag to pan
                    </div>
                  </div>
                </div>

                <!-- Controls -->
                <div class="bg-surface-50 p-5 rounded-2xl border border-surface-200 grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div class="space-y-3">
                    <div class="flex justify-between items-center">
                      <label class="text-[11px] font-bold text-surface-500 uppercase tracking-widest">Window Center (Level)</label>
                      <span id="wc-val" class="text-xs font-mono text-brand-600 font-bold bg-brand-50 px-2 py-0.5 rounded">${wcDefault}</span>
                    </div>
                    <input type="range" id="win-center" min="-1000" max="2000" value="${wcDefault}" 
                      class="w-full h-2 bg-surface-200 rounded-lg appearance-none cursor-pointer accent-brand-600">
                  </div>
                  <div class="space-y-3">
                    <div class="flex justify-between items-center">
                      <label class="text-[11px] font-bold text-surface-500 uppercase tracking-widest">Window Width</label>
                      <span id="ww-val" class="text-xs font-mono text-brand-600 font-bold bg-brand-50 px-2 py-0.5 rounded">${wwDefault}</span>
                    </div>
                    <input type="range" id="win-width" min="1" max="4000" value="${wwDefault}" 
                      class="w-full h-2 bg-surface-200 rounded-lg appearance-none cursor-pointer accent-brand-600">
                  </div>
                </div>
              </div>
            ` : `
              <div class="flex-1 flex items-center justify-center bg-surface-50 rounded-2xl border border-dashed border-surface-200 p-12 text-center">
                <div class="max-w-sm">
                  <div class="w-16 h-16 bg-surface-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg class="w-8 h-8 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  </div>
                  <h3 class="text-lg font-semibold text-surface-900 mb-2">Metadata Only</h3>
                  <p class="text-surface-500 text-sm">This DICOM file contains metadata but the pixel data is either compressed, encapsulated, or missing.</p>
                </div>
              </div>
            `}

            <!-- Right Side: Metadata -->
            <div class="w-full lg:w-96 flex flex-col gap-4 min-h-0">
              <div class="flex items-center justify-between">
                <h3 class="font-bold text-surface-800 flex items-center gap-2">
                  <span class="w-1.5 h-5 bg-brand-500 rounded-full"></span>
                  DICOM Tags
                </h3>
                <span class="text-xs bg-brand-100 text-brand-700 px-2.5 py-0.5 rounded-full font-bold">${meta.length} Tags</span>
              </div>
              
              <div class="relative">
                <input type="text" id="tag-search" placeholder="Search tags or values..." 
                  class="w-full pl-10 pr-4 py-2.5 bg-surface-50 border border-surface-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all">
                <div class="absolute left-3.5 top-3 text-surface-400">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </div>
              </div>

              <div class="flex-1 overflow-hidden">
                <div class="h-full overflow-hidden border border-surface-200 rounded-2xl bg-white flex flex-col">
                  <div class="overflow-y-auto flex-1 scrollbar-thin" id="meta-scroll-area">
                    <table class="min-w-full text-sm" id="tags-table">
                      <thead class="sticky top-0 bg-white/95 backdrop-blur z-10 border-b border-surface-200">
                        <tr>
                          <th class="px-4 py-3 text-left font-semibold text-surface-700">Tag</th>
                          <th class="px-4 py-3 text-left font-semibold text-surface-700">Value</th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-surface-100">
                        ${meta.map(m => `
                          <tr class="even:bg-surface-50/50 hover:bg-brand-50 transition-colors group">
                            <td class="px-4 py-3 font-mono text-[10px] text-surface-400 whitespace-nowrap align-top">
                              ${escapeHtml(m.tag)}
                            </td>
                            <td class="px-4 py-3">
                              <div class="text-[11px] font-bold text-surface-800 group-hover:text-brand-700 transition-colors mb-0.5">${escapeHtml(m.name)}</div>
                              <div class="text-[11px] text-surface-500 break-all line-clamp-2" title="${escapeHtml(m.value)}">${escapeHtml(m.value)}</div>
                            </td>
                          </tr>
                        `).join('')}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;

      h.render(html);

      if (hasImage) {
        setupViewer(h, dataSet, pixelDataElement, rows, cols, bitsAllocated, wcDefault, wwDefault, ri, rs);
      }
      setupMetadataInteractions();
    }

    function setupViewer(h, dataSet, pixelDataElement, rows, cols, bitsAllocated, wcDefault, wwDefault, ri, rs) {
      const canvas = document.getElementById('dicom-canvas');
      const ctx = canvas.getContext('2d');
      const container = document.getElementById('viewer-container');
      
      canvas.width = cols;
      canvas.height = rows;

      const pixelData = getPixelData(dataSet, pixelDataElement, bitsAllocated);
      if (!pixelData) {
        h.showError('Unsupported Image Compression', 'This DICOM file uses a compressed format (e.g. JPEG-LS, JPEG2000, or RLE) which requires a full DICOM library. Showing metadata only.');
        // Re-render metadata only if possible, or just keep the current "Metadata Only" message
        return;
      }

      const wcInput = document.getElementById('win-center');
      const wwInput = document.getElementById('win-width');
      const wcVal = document.getElementById('wc-val');
      const wwVal = document.getElementById('ww-val');

      drawFn = function () {
        const wc = parseFloat(wcInput.value);
        const ww = parseFloat(wwInput.value);
        const inverted = h.getState().inverted;
        
        wcVal.textContent = Math.round(wc);
        wwVal.textContent = Math.round(ww);

        const imgData = ctx.createImageData(cols, rows);
        const data = imgData.data;
        const windowMin = wc - ww / 2;
        const l = pixelData.length;

        for (let i = 0; i < l; i++) {
          let val = pixelData[i] * rs + ri;
          let brightness = ((val - windowMin) * 255) / ww;
          brightness = Math.min(255, Math.max(0, brightness));
          
          if (inverted) brightness = 255 - brightness;

          const idx = i * 4;
          data[idx] = brightness;
          data[idx + 1] = brightness;
          data[idx + 2] = brightness;
          data[idx + 3] = 255;
        }
        ctx.putImageData(imgData, 0, 0);
      };

      drawFn();

      wcInput.oninput = drawFn;
      wwInput.oninput = drawFn;

      setupZoomPan(container, canvas, h);
    }

    function setupMetadataInteractions() {
      const searchInput = document.getElementById('tag-search');
      if (!searchInput) return;
      
      const rows = document.querySelectorAll('#tags-table tbody tr');
      searchInput.oninput = () => {
        const query = searchInput.value.toLowerCase().trim();
        rows.forEach(row => {
          const text = row.textContent.toLowerCase();
          row.style.display = text.includes(query) ? '' : 'none';
        });
      };
    }

    function setupZoomPan(container, canvas, h) {
      let zoom = 1;
      let pan = { x: 0, y: 0 };
      let isDragging = false;
      let lastPos = { x: 0, y: 0 };

      const updateTransform = () => {
        canvas.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;
      };

      const onWheel = (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.min(20, Math.max(0.1, zoom * delta));
        
        // Better zoom centering could be done here but simple scale is okay for now
        zoom = newZoom;
        h.setState('zoom', zoom);
        updateTransform();
      };

      const onMouseDown = (e) => {
        if (e.button !== 0) return; // Only left click
        isDragging = true;
        lastPos = { x: e.clientX, y: e.clientY };
        canvas.classList.add('grabbing');
      };

      const onMouseMove = (e) => {
        if (!isDragging) return;
        const dx = e.clientX - lastPos.x;
        const dy = e.clientY - lastPos.y;
        pan.x += dx;
        pan.y += dy;
        lastPos = { x: e.clientX, y: e.clientY };
        h.setState('pan', { ...pan });
        updateTransform();
      };

      const onMouseUp = () => {
        isDragging = false;
        canvas.classList.remove('grabbing');
      };

      container.addEventListener('wheel', onWheel, { passive: false });
      container.addEventListener('mousedown', onMouseDown);
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);

      cleanupFns.push(() => {
        container.removeEventListener('wheel', onWheel);
        container.removeEventListener('mousedown', onMouseDown);
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      });
    }

    function getPixelData(dataSet, element, bits) {
      try {
        const byteArray = dataSet.byteArray;
        const offset = element.dataOffset;
        const length = element.length;
        
        // dicomParser elements have dataOffset which is the offset into the byteArray
        if (bits === 16) {
          if (length % 2 !== 0) return null;
          // Use DataView or TypedArray buffer slice to handle endianness and alignment
          const buffer = byteArray.buffer.slice(byteArray.byteOffset + offset, byteArray.byteOffset + offset + length);
          // Standard DICOM pixel data is Little Endian by default for Implicit/Explicit VR Little Endian
          // dicomParser handles the transfer syntax, but for pixel data we need to be careful.
          // Most common is Little Endian.
          return new Int16Array(buffer);
        } else if (bits === 8) {
          return new Uint8Array(byteArray.buffer.slice(byteArray.byteOffset + offset, byteArray.byteOffset + offset + length));
        }
      } catch (e) {
        console.error('Error extracting pixel data:', e);
      }
      return null;
    }
  };
})();
