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

    function formatSize(bytes) {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      accept: '.dcm',
      dropLabel: 'Drop a DICOM file to view imaging and metadata',
      infoHtml: '<strong>Secure Medical Viewer:</strong> All DICOM parsing and rendering happens locally. Your medical data never leaves this device.',

      actions: [
        {
          label: '📋 Copy Metadata',
          id: 'copy-meta',
          onClick: function (h, btn) {
            const meta = h.getState().metadata;
            if (!meta) return;
            const text = meta.map(m => `${m.tag} [${m.name}]: ${m.value}`).join('\n');
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
            if (drawFn) drawFn();
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
                const wcDefault = h.getState().defaultWC || 40;
                const wwDefault = h.getState().defaultWW || 400;
                wcInput.value = wcDefault;
                wwInput.value = wwDefault;
                if (drawFn) drawFn();
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
        cleanupFns.forEach(fn => fn());
        cleanupFns = [];
      },

      onFile: function _onFileFn(file, content, h) {
        if (typeof dicomParser === 'undefined') {
          h.showLoading('Initializing medical imaging engine...');
          setTimeout(function() { _onFileFn(file, content, h); }, 500);
          return;
        }

        h.showLoading('Parsing DICOM dataset...');

        try {
          const byteArray = new Uint8Array(content);
          const dataSet = dicomParser.parseDicom(byteArray);
          
          const meta = [];
          for (const tag in dataSet.elements) {
            const element = dataSet.elements[tag];
            let value = '(binary)';
            try {
              if (element.length < 128) {
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

          h.setState('metadata', meta);
          h.setState('inverted', false);
          h.setState('zoom', 1);
          h.setState('pan', { x: 0, y: 0 });

          const rows = dataSet.uint16('x00280010');
          const cols = dataSet.uint16('x00280011');
          const bitsAllocated = dataSet.uint16('x00280100');
          const pixelDataElement = dataSet.elements['x7fe00010'];

          if (!rows || !cols || !pixelDataElement) {
            h.showError('Unsupported DICOM Format', 'This file contains metadata but no viewable image data (pixel data might be encapsulated or compressed).');
            renderMetadataOnly(meta, file, h);
            return;
          }

          const wcDefault = parseFloat(dataSet.string('x00281050')) || 40;
          const wwDefault = parseFloat(dataSet.string('x00281051')) || 400;
          const ri = parseFloat(dataSet.string('x00281052')) || 0;
          const rs = parseFloat(dataSet.string('x00281053')) || 1;

          h.setState('defaultWC', wcDefault);
          h.setState('defaultWW', wwDefault);

          renderFull(file, h, meta, rows, cols, bitsAllocated, wcDefault, wwDefault, dataSet, pixelDataElement, ri, rs);
        } catch (err) {
          h.showError('Could not open DICOM', 'The file might be corrupted or using an unsupported transfer syntax. Error: ' + err.message);
        }
      }
    });

    function renderMetadataOnly(meta, file, h) {
      const html = `
        <div class="p-6 h-full flex flex-col bg-white">
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6">
            <span class="font-semibold text-surface-800">${file.name}</span>
            <span class="text-surface-300">|</span>
            <span>${formatSize(file.size)}</span>
            <span class="text-surface-300">|</span>
            <span class="text-surface-500">.dcm (DICOM)</span>
          </div>
          <div class="flex-1 overflow-hidden">
            ${renderMetadataTable(meta)}
          </div>
        </div>
      `;
      h.render(html);
      setupMetadataInteractions(h);
    }

    function renderFull(file, h, meta, rows, cols, bitsAllocated, wcDefault, wwDefault, dataSet, pixelDataElement, ri, rs) {
      const html = `
        <div class="p-6 h-full flex flex-col bg-white">
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6">
            <span class="font-semibold text-surface-800">${file.name}</span>
            <span class="text-surface-300">|</span>
            <span>${formatSize(file.size)}</span>
            <span class="text-surface-300">|</span>
            <span class="text-surface-500">.dcm (DICOM)</span>
          </div>

          <div class="flex-1 flex flex-col lg:flex-row gap-6 min-h-0">
            <div class="flex-1 flex flex-col gap-4 min-h-0">
              <div class="flex-1 bg-black rounded-2xl border border-surface-200 shadow-inner flex items-center justify-center overflow-hidden relative group" id="viewer-container">
                <canvas id="dicom-canvas" class="transition-transform cursor-grab active:cursor-grabbing origin-center"></canvas>
                
                <div class="absolute top-4 left-4">
                   <div class="bg-black/60 backdrop-blur px-3 py-1.5 rounded-lg text-white text-[10px] font-mono border border-white/20 flex flex-col gap-0.5">
                     <span>DIM: ${cols} × ${rows}</span>
                     <span>RES: ${bitsAllocated}-bit</span>
                   </div>
                </div>

                <div class="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div class="bg-black/60 backdrop-blur px-3 py-1.5 rounded-lg text-white text-[10px] border border-white/20">
                    Scroll to zoom • Drag to pan
                  </div>
                </div>
              </div>

              <div class="bg-surface-50 p-5 rounded-2xl border border-surface-200 grid grid-cols-1 md:grid-cols-2 gap-8">
                <div class="space-y-3">
                  <div class="flex justify-between items-center">
                    <label class="text-[11px] font-bold text-surface-500 uppercase tracking-widest">Window Center</label>
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

            <div class="w-full lg:w-96 flex flex-col gap-4 min-h-0">
              <div class="flex items-center justify-between">
                <h3 class="font-bold text-surface-800 flex items-center gap-2">
                  <span class="w-1.5 h-5 bg-brand-500 rounded-full"></span>
                  Metadata
                </h3>
                <span class="text-xs bg-brand-100 text-brand-700 px-2.5 py-0.5 rounded-full font-bold">${meta.length} Tags</span>
              </div>
              
              <div class="relative">
                <input type="text" id="tag-search" placeholder="Filter tags or values..." 
                  class="w-full pl-9 pr-4 py-2.5 bg-surface-50 border border-surface-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all">
                <div class="absolute left-3 top-3 text-surface-400">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </div>
              </div>

              <div class="flex-1 overflow-hidden">
                ${renderMetadataTable(meta)}
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

      const pixelData = getPixelData(dataSet, pixelDataElement, bitsAllocated);
      if (!pixelData) {
        h.showError('Encapsulated Data', 'This DICOM uses a compressed format (e.g. JPEG-LS, RLE) that requires a heavy decoder. Showing metadata only.');
        return;
      }

      const wcInput = document.getElementById('win-center');
      const wwInput = document.getElementById('win-width');
      const wcVal = document.getElementById('wc-val');
      const wwVal = document.getElementById('ww-val');

      drawFn = function() {
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
      setupMetadataInteractions(h);
    }

    function renderMetadataTable(meta) {
      return `
        <div class="h-full overflow-hidden border border-surface-200 rounded-2xl bg-white flex flex-col">
          <div class="overflow-y-auto flex-1 scrollbar-thin">
            <table class="min-w-full text-sm" id="tags-table">
              <thead class="sticky top-0 bg-white/95 backdrop-blur z-10 border-b border-surface-200">
                <tr>
                  <th class="px-4 py-3 text-left font-semibold text-surface-700">Tag</th>
                  <th class="px-4 py-3 text-left font-semibold text-surface-700">Data</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-surface-100">
                ${meta.map(m => `
                  <tr class="even:bg-surface-50/50 hover:bg-brand-50 transition-colors group">
                    <td class="px-4 py-3 font-mono text-[10px] text-surface-400 whitespace-nowrap align-top">${m.tag}</td>
                    <td class="px-4 py-3">
                      <div class="text-[11px] font-bold text-surface-800 group-hover:text-brand-700 transition-colors mb-0.5">${m.name}</div>
                      <div class="text-[11px] text-surface-500 break-all line-clamp-2" title="${m.value}">${m.value}</div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    function setupMetadataInteractions(h) {
      const searchInput = document.getElementById('tag-search');
      if (!searchInput) return;
      
      const rows = document.querySelectorAll('#tags-table tbody tr');
      searchInput.oninput = () => {
        const query = searchInput.value.toLowerCase();
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

      const update = () => {
        canvas.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;
      };

      const onWheel = (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        zoom = Math.min(20, Math.max(0.1, zoom * delta));
        h.setState('zoom', zoom);
        update();
      };

      const onMouseDown = (e) => {
        isDragging = true;
        lastPos = { x: e.clientX, y: e.clientY };
      };

      const onMouseMove = (e) => {
        if (!isDragging) return;
        const dx = e.clientX - lastPos.x;
        const dy = e.clientY - lastPos.y;
        pan.x += dx;
        pan.y += dy;
        lastPos = { x: e.clientX, y: e.clientY };
        h.setState('pan', { ...pan });
        update();
      };

      const onMouseUp = () => {
        isDragging = false;
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
        
        if (bits === 16) {
          if (length % 2 !== 0) return null;
          const buffer = byteArray.buffer.slice(byteArray.byteOffset + offset, byteArray.byteOffset + offset + length);
          return new Int16Array(buffer);
        } else if (bits === 8) {
          return new Uint8Array(byteArray.buffer.slice(byteArray.byteOffset + offset, byteArray.byteOffset + offset + length));
        }
      } catch (e) {}
      return null;
    }
  };
})();
