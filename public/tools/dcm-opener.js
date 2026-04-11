/**
 * OmniOpener — DICOM Toolkit
 * Uses OmniTool SDK and dicom-parser. 
 * Renders medical images and extracts metadata directly in the browser.
 */
(function () {
  'use strict';

  // Common DICOM Tags
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
            if (meta) {
              const text = Object.entries(meta).map(([tag, obj]) => `${tag} [${obj.name}]: ${obj.value}`).join('\n');
              h.copyToClipboard(text, btn);
            }
          }
        },
        {
          label: '🖼️ Download PNG',
          id: 'dl-png',
          onClick: function (h) {
            const canvas = h.getRenderEl().querySelector('canvas');
            if (canvas) {
              h.download(h.getFile().name.replace('.dcm', '.png'), canvas.toDataURL('image/png'), 'image/png');
            }
          }
        },
        {
          label: '🔍 Reset Zoom',
          id: 'reset-zoom',
          onClick: function (h) {
            const img = h.getRenderEl().querySelector('#dicom-canvas');
            if (img) {
              img.style.transform = 'scale(1)';
              h.setState('zoom', 1);
            }
          }
        }
      ],

      onInit: function (h) {
        if (typeof dicomParser === 'undefined') {
          h.loadScript('https://cdn.jsdelivr.net/npm/dicom-parser@1.8.21/dist/dicomParser.min.js');
        }
      },

      onFile: function (file, content, h) {
        if (typeof dicomParser === 'undefined') {
          h.showLoading('Waking up medical engine...');
          setTimeout(() => h.onFile(file, content, h), 500);
          return;
        }

        h.showLoading('Analyzing DICOM structure...');
        
        try {
          const byteArray = new Uint8Array(content);
          const dataSet = dicomParser.parseDicom(byteArray);
          const meta = {};
          
          // Extract all present tags from our dictionary
          Object.keys(TAG_DICT).forEach(tag => {
            const element = dataSet.elements[tag];
            if (element) {
              meta[tag] = {
                name: TAG_DICT[tag],
                value: dataSet.string(tag) || '(binary)'
              };
            }
          });

          h.setState('metadata', meta);
          renderDicom(dataSet, h, file.name);
        } catch (err) {
          h.showError('Failed to parse DICOM', err.message);
        }
      }
    });
  };

  function renderDicom(dataSet, h, filename) {
    const rows = dataSet.uint16('x00280010');
    const cols = dataSet.uint16('x00280011');
    const bitsAllocated = dataSet.uint16('x00280100');
    const pixelDataElement = dataSet.elements['x7fe00010'];

    if (!rows || !cols || !pixelDataElement) {
      h.showError('Incomplete DICOM', 'File lacks dimensions or pixel data.');
      return;
    }

    const html = `
      <div class="flex flex-col lg:flex-row gap-6 p-6 h-full bg-surface-50">
        <!-- Image Viewer -->
        <div class="flex-1 flex flex-col gap-4">
          <div class="bg-black rounded-xl border border-surface-200 shadow-inner flex items-center justify-center overflow-hidden relative group" style="min-height: 500px;">
            <canvas id="dicom-canvas" class="max-w-full max-h-full transition-transform cursor-move"></canvas>
            <div class="absolute bottom-4 left-4 bg-black/60 backdrop-blur px-3 py-1.5 rounded-lg text-white text-[10px] font-mono border border-white/20">
               ${cols} x ${rows} • ${bitsAllocated}-bit
            </div>
          </div>
          <div class="flex items-center gap-4 bg-white p-4 rounded-xl border border-surface-200">
             <div class="flex-1">
                <label class="text-[10px] font-bold text-surface-400 uppercase tracking-tighter">Windowing</label>
                <div class="flex gap-4">
                   <div class="flex-1">
                      <span class="text-[9px] text-surface-500">Center</span>
                      <input type="range" id="win-center" class="w-full h-1.5 bg-surface-100 rounded-lg appearance-none cursor-pointer accent-brand-600">
                   </div>
                   <div class="flex-1">
                      <span class="text-[9px] text-surface-500">Width</span>
                      <input type="range" id="win-width" class="w-full h-1.5 bg-surface-100 rounded-lg appearance-none cursor-pointer accent-brand-600">
                   </div>
                </div>
             </div>
          </div>
        </div>

        <!-- Metadata Sidebar -->
        <div class="w-full lg:w-80 flex flex-col gap-4">
          <div class="bg-white rounded-xl border border-surface-200 flex-1 flex flex-col overflow-hidden">
             <div class="p-3 border-b border-surface-100 bg-surface-50/50 flex justify-between items-center">
                <h3 class="text-xs font-bold text-surface-700 uppercase tracking-wider">DICOM Tags</h3>
                <span class="text-[10px] bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-bold">${Object.keys(h.getState().metadata).length} Tags</span>
             </div>
             <div class="flex-1 overflow-auto p-2">
                <table class="w-full text-left border-collapse">
                   <tbody class="text-[11px]">
                      ${Object.entries(h.getState().metadata).map(([tag, obj]) => `
                        <tr class="border-b border-surface-50 hover:bg-surface-50">
                          <td class="py-2 pr-2 font-mono text-surface-400">${tag.replace('x', '(').replace(/^(....)(....)$/, '$1,$2)')}</td>
                          <td class="py-2">
                            <div class="font-bold text-surface-600">${obj.name}</div>
                            <div class="text-surface-400 truncate max-w-[120px]" title="${obj.value}">${obj.value}</div>
                          </td>
                        </tr>
                      `).join('')}
                   </tbody>
                </table>
             </div>
          </div>
        </div>
      </div>
    `;

    h.render(html);

    const canvas = document.getElementById('dicom-canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = cols;
    canvas.height = rows;

    // Windowing state
    let wc = parseFloat(dataSet.string('x00281050')) || 40;
    let ww = parseFloat(dataSet.string('x00281051')) || 400;
    const ri = parseFloat(dataSet.string('x00281052')) || 0;
    const rs = parseFloat(dataSet.string('x00281053')) || 1;

    const centerInput = document.getElementById('win-center');
    const widthInput = document.getElementById('win-width');
    
    centerInput.min = -1000; centerInput.max = 2000; centerInput.value = wc;
    widthInput.min = 1; widthInput.max = 4000; widthInput.value = ww;

    function update() {
      wc = parseFloat(centerInput.value);
      ww = parseFloat(widthInput.value);
      draw();
    }

    centerInput.oninput = update;
    widthInput.oninput = update;

    // Pixel extraction
    const pixelData = getPixelData(dataSet, pixelDataElement, bitsAllocated);
    if (!pixelData) {
       h.showError('Transfer Syntax Unsupported', 'Compressed pixel data not yet supported in this viewer.');
       return;
    }

    function draw() {
      const imgData = ctx.createImageData(cols, rows);
      const data = imgData.data;
      const l = pixelData.length;
      
      const windowMin = wc - ww / 2;
      const windowMax = wc + ww / 2;

      for (let i = 0; i < l; i++) {
        let val = pixelData[i] * rs + ri;
        // Windowing
        let brightness = ((val - windowMin) * 255) / ww;
        brightness = Math.min(255, Math.max(0, brightness));
        
        const idx = i * 4;
        data[idx] = brightness;     // R
        data[idx + 1] = brightness; // G
        data[idx + 2] = brightness; // B
        data[idx + 3] = 255;        // A
      }
      ctx.putImageData(imgData, 0, 0);
    }

    draw();

    // Interaction (Zoom/Pan)
    let isPanning = false;
    let startX, startY;
    let zoom = 1;

    canvas.onmousedown = (e) => {
      isPanning = true;
      startX = e.clientX; startY = e.clientY;
    };
    window.onmousemove = (e) => {
      if (!isPanning) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      // Just simple scaling for now
    };
    window.onmouseup = () => isPanning = false;

    canvas.onwheel = (e) => {
       e.preventDefault();
       zoom = Math.min(5, Math.max(0.5, zoom + (e.deltaY > 0 ? -0.1 : 0.1)));
       canvas.style.transform = `scale(${zoom})`;
       h.setState('zoom', zoom);
    };
  }

  function getPixelData(dataSet, element, bits) {
    // Basic uncompressed pixel data extraction
    // Supports 8-bit and 16-bit uncompressed
    const byteArray = dataSet.byteArray;
    const offset = element.dataOffset;
    const length = element.length;
    
    if (bits === 16) {
       // Check if it's actually 16-bit (2 bytes per pixel)
       // Some DICOMs might be encapsulated (length = -1 or very small)
       if (length % 2 !== 0) return null; 
       return new Int16Array(byteArray.buffer, byteArray.byteOffset + offset, length / 2);
    } else if (bits === 8) {
       return new Uint8Array(byteArray.buffer, byteArray.byteOffset + offset, length);
    }
    return null;
  }

})();
