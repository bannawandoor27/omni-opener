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
    'x00081030': 'Study Description',
    'x0008103e': 'Series Description',
    'x00080080': 'Institution Name',
    'x00080070': 'Manufacturer',
    'x00081090': 'Manufacturer Model',
    'x00280010': 'Rows',
    'x00280011': 'Columns',
    'x00280100': 'Bits Allocated',
    'x00280101': 'Bits Stored',
    'x00280103': 'Pixel Representation',
    'x00281050': 'Window Center',
    'x00281051': 'Window Width',
    'x00281052': 'Rescale Intercept',
    'x00281053': 'Rescale Slope',
    'x00020010': 'Transfer Syntax UID'
  };

  window.initTool = function (toolConfig, mountEl) {
    let currentBlobUrl = null;

    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      accept: '.dcm',
      dropLabel: 'Drop a DICOM (.dcm) file here',
      infoHtml: '<strong>Private Medical Imaging:</strong> This tool parses DICOM files 100% locally. Your health data never leaves your browser.',

      actions: [
        {
          label: '📋 Copy Metadata',
          id: 'copy-meta',
          onClick: function (h, btn) {
            const meta = h.getState().metadata;
            if (!meta) return;
            const text = Object.entries(meta).map(([tag, obj]) => `${tag} [${obj.name}]: ${obj.value}`).join('\n');
            h.copyToClipboard(text, btn);
          }
        },
        {
          label: '🖼️ Download PNG',
          id: 'dl-png',
          onClick: function (h) {
            const canvas = h.getRenderEl().querySelector('#dicom-canvas');
            if (canvas) {
              canvas.toBlob((blob) => {
                if (blob) h.download(h.getFile().name.replace('.dcm', '.png'), blob, 'image/png');
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
            const draw = h.getState().drawFn;
            if (draw) draw();
          }
        },
        {
          label: '🔄 Reset View',
          id: 'reset-view',
          onClick: function (h) {
            const canvas = h.getRenderEl().querySelector('#dicom-canvas');
            if (canvas) {
              canvas.style.transform = 'scale(1) translate(0px, 0px)';
              h.setState('zoom', 1);
              h.setState('pan', { x: 0, y: 0 });
              
              const wcInput = h.getRenderEl().querySelector('#win-center');
              const wwInput = h.getRenderEl().querySelector('#win-width');
              if (wcInput && wwInput) {
                wcInput.value = h.getState().defaultWC;
                wwInput.value = h.getState().defaultWW;
                const draw = h.getState().drawFn;
                if (draw) draw();
              }
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
        if (currentBlobUrl) {
          URL.revokeObjectURL(currentBlobUrl);
          currentBlobUrl = null;
        }
      },

      onFile: function _onFileFn(file, content, h) {
        if (typeof dicomParser === 'undefined') {
          h.showLoading('Waking up medical engine...');
          setTimeout(function() { _onFileFn(file, content, h); }, 500);
          return;
        }

        h.showLoading('Analyzing DICOM structure...');

        try {
          const byteArray = new Uint8Array(content);
          const dataSet = dicomParser.parseDicom(byteArray);
          const meta = {};

          Object.keys(TAG_DICT).forEach(tag => {
            const element = dataSet.elements[tag];
            if (element) {
              try {
                meta[tag] = {
                  name: TAG_DICT[tag],
                  value: dataSet.string(tag) || '(binary)'
                };
              } catch (e) {
                meta[tag] = { name: TAG_DICT[tag], value: '(error)' };
              }
            }
          });

          h.setState('metadata', meta);
          h.setState('inverted', false);
          h.setState('zoom', 1);
          h.setState('pan', { x: 0, y: 0 });

          renderDicom(dataSet, h, file);
        } catch (err) {
          h.showError('Could not open DICOM file', 'The file may be corrupted, encrypted, or in an unsupported format. Error: ' + err.message);
        }
      }
    });

    function formatSize(bytes) {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function renderDicom(dataSet, h, file) {
      const rows = dataSet.uint16('x00280010');
      const cols = dataSet.uint16('x00280011');
      const bitsAllocated = dataSet.uint16('x00280100');
      const pixelDataElement = dataSet.elements['x7fe00010'];

      if (!rows || !cols || !pixelDataElement) {
        h.showError('Invalid DICOM', 'This file does not contain valid image dimensions or pixel data.');
        return;
      }

      const metaEntries = Object.entries(h.getState().metadata);
      const wcDefault = parseFloat(dataSet.string('x00281050')) || 40;
      const wwDefault = parseFloat(dataSet.string('x00281051')) || 400;
      const ri = parseFloat(dataSet.string('x00281052')) || 0;
      const rs = parseFloat(dataSet.string('x00281053')) || 1;

      h.setState('defaultWC', wcDefault);
      h.setState('defaultWW', wwDefault);

      const html = `
        <div class="p-6 h-full flex flex-col bg-white">
          <!-- U1: File Info Bar -->
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6">
            <span class="font-semibold text-surface-800">${file.name}</span>
            <span class="text-surface-300">|</span>
            <span>${formatSize(file.size)}</span>
            <span class="text-surface-300">|</span>
            <span class="text-surface-500">.dcm (DICOM)</span>
          </div>

          <div class="flex-1 flex flex-col lg:flex-row gap-6 min-h-0">
            <!-- Left: Viewer -->
            <div class="flex-1 flex flex-col gap-4 min-h-0">
              <div class="flex-1 bg-black rounded-2xl border border-surface-200 shadow-xl flex items-center justify-center overflow-hidden relative group" id="viewer-container">
                <canvas id="dicom-canvas" class="transition-transform cursor-grab active:cursor-grabbing origin-center"></canvas>
                
                <div class="absolute top-4 left-4 flex flex-col gap-2">
                   <div class="bg-black/60 backdrop-blur px-3 py-1.5 rounded-lg text-white text-[10px] font-mono border border-white/20">
                     ${cols} × ${rows} • ${bitsAllocated}-bit
                   </div>
                </div>

                <div class="absolute bottom-4 right-4 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div class="bg-black/60 backdrop-blur p-2 rounded-lg text-white text-[10px] border border-white/20">
                    Scroll to zoom • Drag to pan
                  </div>
                </div>
              </div>

              <!-- Controls -->
              <div class="bg-surface-50 p-4 rounded-2xl border border-surface-200 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div class="space-y-2">
                  <div class="flex justify-between items-center">
                    <label class="text-[11px] font-bold text-surface-500 uppercase tracking-wider">Window Center (Brightness)</label>
                    <span id="wc-val" class="text-xs font-mono text-brand-600 font-bold">${wcDefault}</span>
                  </div>
                  <input type="range" id="win-center" min="-1000" max="2000" value="${wcDefault}" 
                    class="w-full h-2 bg-surface-200 rounded-lg appearance-none cursor-pointer accent-brand-600">
                </div>
                <div class="space-y-2">
                  <div class="flex justify-between items-center">
                    <label class="text-[11px] font-bold text-surface-500 uppercase tracking-wider">Window Width (Contrast)</label>
                    <span id="ww-val" class="text-xs font-mono text-brand-600 font-bold">${wwDefault}</span>
                  </div>
                  <input type="range" id="win-width" min="1" max="4000" value="${wwDefault}" 
                    class="w-full h-2 bg-surface-200 rounded-lg appearance-none cursor-pointer accent-brand-600">
                </div>
              </div>
            </div>

            <!-- Right: Metadata -->
            <div class="w-full lg:w-96 flex flex-col gap-4 min-h-0">
              <div class="flex items-center justify-between">
                <h3 class="font-bold text-surface-800 flex items-center gap-2">
                  <span class="w-2 h-6 bg-brand-500 rounded-full"></span>
                  DICOM Tags
                </h3>
                <span class="text-xs bg-brand-100 text-brand-700 px-3 py-1 rounded-full font-bold">${metaEntries.length} items</span>
              </div>
              
              <!-- Search Box -->
              <div class="relative">
                <input type="text" id="tag-search" placeholder="Search tags or values..." 
                  class="w-full pl-9 pr-4 py-2 bg-surface-50 border border-surface-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all">
                <svg class="w-4 h-4 absolute left-3 top-2.5 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>

              <div class="flex-1 overflow-hidden border border-surface-200 rounded-2xl bg-white shadow-sm flex flex-col">
                <div class="overflow-y-auto flex-1 scrollbar-thin">
                  <table class="w-full text-left border-collapse" id="tags-table">
                    <thead class="sticky top-0 bg-white/95 backdrop-blur z-10">
                      <tr>
                        <th class="px-4 py-3 text-[10px] font-bold text-surface-400 uppercase tracking-wider border-b border-surface-100">Tag</th>
                        <th class="px-4 py-3 text-[10px] font-bold text-surface-400 uppercase tracking-wider border-b border-surface-100">Description / Value</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-surface-50">
                      ${metaEntries.map(([tag, obj]) => `
                        <tr class="hover:bg-brand-50/50 transition-colors group">
                          <td class="px-4 py-3 font-mono text-[10px] text-surface-400 align-top">${tag.replace('x', '(').replace(/^(....)(....)$/, '$1,$2)')}</td>
                          <td class="px-4 py-3">
                            <div class="text-[11px] font-bold text-surface-700 group-hover:text-brand-700 transition-colors mb-0.5">${obj.name}</div>
                            <div class="text-[11px] text-surface-500 break-all line-clamp-2" title="${obj.value}">${obj.value}</div>
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
      `;

      h.render(html);

      const canvas = document.getElementById('dicom-canvas');
      const ctx = canvas.getContext('2d');
      const container = document.getElementById('viewer-container');
      
      canvas.width = cols;
      canvas.height = rows;

      // Extract pixel data
      const pixelData = getPixelData(dataSet, pixelDataElement, bitsAllocated);
      if (!pixelData) {
        h.showError('Format Unsupported', 'This DICOM uses a compression format not yet supported in the browser viewer. You can still view the metadata.');
        return;
      }

      const wcInput = document.getElementById('win-center');
      const wwInput = document.getElementById('win-width');
      const wcVal = document.getElementById('wc-val');
      const wwVal = document.getElementById('ww-val');

      function draw() {
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
      }

      h.setState('drawFn', draw);
      draw();

      // Interactions
      wcInput.oninput = draw;
      wwInput.oninput = draw;

      // Zoom & Pan
      let zoom = 1;
      let pan = { x: 0, y: 0 };
      let isDragging = false;
      let lastPos = { x: 0, y: 0 };

      const updateTransform = () => {
        canvas.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;
      };

      container.onwheel = (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        zoom = Math.min(10, Math.max(0.1, zoom * delta));
        updateTransform();
      };

      container.onmousedown = (e) => {
        isDragging = true;
        lastPos = { x: e.clientX, y: e.clientY };
      };

      window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - lastPos.x;
        const dy = e.clientY - lastPos.y;
        pan.x += dx;
        pan.y += dy;
        lastPos = { x: e.clientX, y: e.clientY };
        updateTransform();
      });

      window.addEventListener('mouseup', () => {
        isDragging = false;
      });

      // Search functionality
      const searchInput = document.getElementById('tag-search');
      const tableRows = document.querySelectorAll('#tags-table tbody tr');

      searchInput.oninput = () => {
        const query = searchInput.value.toLowerCase();
        tableRows.forEach(row => {
          const text = row.textContent.toLowerCase();
          row.style.display = text.includes(query) ? '' : 'none';
        });
      };
    }

    function getPixelData(dataSet, element, bits) {
      const byteArray = dataSet.byteArray;
      const offset = element.dataOffset;
      const length = element.length;
      
      if (bits === 16) {
        if (length % 2 !== 0) return null;
        // Use slice to avoid issues with buffer sharing and allow for easier disposal
        const buffer = byteArray.buffer.slice(byteArray.byteOffset + offset, byteArray.byteOffset + offset + length);
        return new Int16Array(buffer);
      } else if (bits === 8) {
        return new Uint8Array(byteArray.buffer.slice(byteArray.byteOffset + offset, byteArray.byteOffset + offset + length));
      }
      return null;
    }
  };
})();
