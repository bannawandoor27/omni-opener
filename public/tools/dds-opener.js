(function() {
  'use strict';

  window.initTool = function(toolConfig, mountEl) {
    let lastPreviewUrl = null;

    OmniTool.create(mountEl, toolConfig, {
      accept: '.dds',
      dropLabel: 'Drop a .dds texture here',
      binary: true,
      onInit: function(helpers) {
        // No external dependencies needed for this format
      },
      onDestroy: function() {
        if (lastPreviewUrl) {
          URL.revokeObjectURL(lastPreviewUrl);
          lastPreviewUrl = null;
        }
      },
      onFile: async function _onFileFn(file, content, helpers) {
        if (lastPreviewUrl) {
          URL.revokeObjectURL(lastPreviewUrl);
          lastPreviewUrl = null;
        }

        helpers.showLoading('Parsing DirectDraw Surface...');
        
        // Small delay to allow UI to show loading state
        await new Promise(r => setTimeout(r, 10));

        try {
          if (!content || content.byteLength < 128) {
            throw new Error('File is too small to be a valid DDS texture.');
          }

          const dds = parseDDS(content);
          
          if (!dds || dds.width === 0 || dds.height === 0) {
            helpers.showError('Invalid Image', 'The DDS file appears to have no dimensions or is corrupted.');
            return;
          }

          const humanSize = (b) => {
            if (b >= 1048576) return (b / 1048576).toFixed(2) + ' MB';
            if (b >= 1024) return (b / 1024).toFixed(1) + ' KB';
            return b + ' bytes';
          };

          const esc = (str) => {
            if (!str) return '';
            return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
          };

          const html = `
            <div class="max-w-6xl mx-auto p-4 md:p-6">
              <!-- U1: File info bar -->
              <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-200">
                <span class="font-semibold text-surface-800">${esc(file.name)}</span>
                <span class="text-surface-300">|</span>
                <span>${humanSize(file.size)}</span>
                <span class="text-surface-300">|</span>
                <span class="text-surface-500">${dds.width} × ${dds.height} px</span>
                <span class="text-surface-300">|</span>
                <span class="px-2 py-0.5 bg-brand-100 text-brand-700 rounded text-[10px] font-bold uppercase tracking-tight">${esc(dds.format)}</span>
              </div>

              <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <!-- Preview Section -->
                <div class="lg:col-span-2 space-y-4">
                  <div class="rounded-2xl border border-surface-200 overflow-hidden bg-white shadow-sm flex flex-col h-full">
                    <div class="px-5 py-3.5 border-b border-surface-100 flex items-center justify-between bg-surface-50/50">
                      <div class="flex items-center gap-2">
                        <svg class="w-4 h-4 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.587-1.587a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                        <h3 class="font-semibold text-surface-800 text-sm">Texture Preview</h3>
                      </div>
                      <div class="flex items-center gap-1.5">
                        <button id="btn-zoom-out" class="p-1.5 hover:bg-white rounded-lg border border-transparent hover:border-surface-200 text-surface-600 transition-all active:scale-95" title="Zoom Out">
                          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"></path></svg>
                        </button>
                        <span id="zoom-label" class="text-xs font-medium text-surface-500 min-w-[3rem] text-center">100%</span>
                        <button id="btn-zoom-in" class="p-1.5 hover:bg-white rounded-lg border border-transparent hover:border-surface-200 text-surface-600 transition-all active:scale-95" title="Zoom In">
                          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                        </button>
                        <div class="w-px h-4 bg-surface-200 mx-1"></div>
                        <button id="btn-bg-toggle" class="p-1.5 hover:bg-white rounded-lg border border-transparent hover:border-surface-200 text-brand-600 transition-all active:scale-95" title="Toggle Transparency Grid">
                          <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5 2a1 1 0 011 1v1h1a1 1 0 010 2H6v1a1 1 0 01-2 0V6H3a1 1 0 010-2h1V3a1 1 0 011-1zm0 10a1 1 0 011 1v1h1a1 1 0 110 2H6v1a1 1 0 11-2 0v-1H3a1 1 0 110-2h1v-1a1 1 0 011-1zM12 2a1 1 0 01.993.883L13 3v1h1a1 1 0 01.117 1.993L14 6h-1v1a1 1 0 01-1.993.117L11 7V6h-1a1 1 0 01-.117-1.993L10 4h1V3a1 1 0 011-1zm0 10a1 1 0 01.993.883L13 13v1h1a1 1 0 01.117 1.993L14 16h-1v1a1 1 0 01-1.993.117L11 15v-1h-1a1 1 0 01-.117-1.993L10 12h1v-1a1 1 0 011-1z" clip-rule="evenodd"></path></svg>
                        </button>
                      </div>
                    </div>
                    <div id="preview-viewport" class="relative flex-1 overflow-auto bg-surface-100 min-h-[400px] flex items-center justify-center p-8 transition-colors border-b border-surface-100">
                      <div id="checkerboard-bg" class="absolute inset-0 opacity-40 pointer-events-none" style="background-image: conic-gradient(#fff 0.25turn, #cbd5e1 0.25turn 0.5turn, #fff 0.5turn 0.75turn, #cbd5e1 0.75turn); background-size: 20px 20px;"></div>
                      <div id="img-container" class="relative transition-transform duration-200 ease-out will-change-transform shadow-xl bg-white ring-1 ring-black/5">
                        <!-- Canvas inserted here via JS -->
                      </div>
                    </div>
                    <div class="px-5 py-3 bg-surface-50/30 flex items-center justify-between text-[11px] text-surface-400 font-mono">
                      <span>ORIGIN: TOP-LEFT</span>
                      <span id="coord-info">0, 0</span>
                    </div>
                  </div>
                </div>

                <!-- Metadata Section -->
                <div class="space-y-6">
                  <!-- U10: Section header with count -->
                  <div class="bg-white p-5 rounded-2xl border border-surface-200 shadow-sm">
                    <div class="flex items-center justify-between mb-4">
                      <h3 class="font-semibold text-surface-800">Properties</h3>
                      <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">Core</span>
                    </div>
                    <div class="space-y-1">
                      ${renderMetaRow('Format', dds.format)}
                      ${renderMetaRow('Dimensions', `${dds.width} × ${dds.height}`)}
                      ${renderMetaRow('Mipmaps', dds.mipmapCount)}
                      ${renderMetaRow('Bit Depth', dds.rgbBitCount ? dds.rgbBitCount + ' bits' : 'Compressed')}
                      ${renderMetaRow('FourCC', dds.fourCC || 'N/A')}
                    </div>
                  </div>

                  <div class="bg-white p-5 rounded-2xl border border-surface-200 shadow-sm">
                    <div class="flex items-center justify-between mb-4">
                      <h3 class="font-semibold text-surface-800">Flags</h3>
                      <span class="text-xs bg-surface-100 text-surface-600 px-2 py-0.5 rounded-full">DDS Header</span>
                    </div>
                    <!-- U7: Table-like list for metadata -->
                    <div class="space-y-1 text-xs font-mono">
                      ${renderMetaRow('Caps', '0x' + dds.caps.toString(16).toUpperCase())}
                      ${renderMetaRow('Caps 2', '0x' + dds.caps2.toString(16).toUpperCase())}
                      ${renderMetaRow('Flags', '0x' + dds.flags.toString(16).toUpperCase())}
                      ${renderMetaRow('Header Size', dds.headerSize + ' bytes')}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          `;

          helpers.render(html);

          function renderMetaRow(label, value) {
            return `
              <div class="flex justify-between items-center py-2 border-b border-surface-50 last:border-0 hover:bg-surface-50 px-2 -mx-2 rounded-lg transition-colors">
                <span class="text-sm text-surface-500 font-medium">${label}</span>
                <span class="text-sm font-semibold text-surface-900">${value}</span>
              </div>
            `;
          }
          
          const container = document.getElementById('img-container');
          const canvas = dds.canvas;
          canvas.className = 'block max-w-none h-auto select-none';
          canvas.style.imageRendering = (dds.width < 128 || dds.height < 128) ? 'pixelated' : 'auto';
          container.appendChild(canvas);

          // Interaction Closure
          let scale = 1;
          let bgVisible = true;

          const updateTransform = () => {
            container.style.transform = `scale(${scale})`;
            const label = document.getElementById('zoom-label');
            if (label) label.textContent = `${Math.round(scale * 100)}%`;
          };

          const el = (id) => document.getElementById(id);
          
          if (el('btn-zoom-in')) el('btn-zoom-in').onclick = () => { scale = Math.min(scale * 1.5, 32); updateTransform(); };
          if (el('btn-zoom-out')) el('btn-zoom-out').onclick = () => { scale = Math.max(scale / 1.5, 0.1); updateTransform(); };
          
          if (el('btn-bg-toggle')) el('btn-bg-toggle').onclick = () => {
            bgVisible = !bgVisible;
            const bg = el('checkerboard-bg');
            if (bg) bg.style.visibility = bgVisible ? 'visible' : 'hidden';
            el('btn-bg-toggle').classList.toggle('text-brand-600', bgVisible);
            el('btn-bg-toggle').classList.toggle('text-surface-400', !bgVisible);
          };

          canvas.onmousemove = (e) => {
            const rect = canvas.getBoundingClientRect();
            const x = Math.floor((e.clientX - rect.left) / (rect.width / canvas.width));
            const y = Math.floor((e.clientY - rect.top) / (rect.height / canvas.height));
            const coordEl = el('coord-info');
            if (coordEl && x >= 0 && x < canvas.width && y >= 0 && y < canvas.height) {
              coordEl.textContent = `${x}, ${y}`;
            }
          };

          helpers.hideLoading();

        } catch (err) {
          console.error('[DDS Opener] Error:', err);
          helpers.showError('Could not render DDS file', 'This format or variant might be unsupported by the browser decoder. ' + (err.message || ''));
        }
      },
      actions: [
        {
          label: 'Download PNG',
          id: 'dl-png',
          icon: 'download',
          onClick: function(helpers) {
            const canvas = helpers.getRenderEl().querySelector('canvas');
            if (!canvas) return;
            helpers.showLoading('Converting to PNG...');
            canvas.toBlob(function(blob) {
              helpers.hideLoading();
              if (blob) {
                const name = helpers.getFile().name.replace(/\.[^/.]+$/, "") + ".png";
                helpers.download(name, blob, 'image/png');
              }
            }, 'image/png');
          }
        },
        {
          label: 'Copy Info',
          id: 'copy-meta',
          icon: 'copy',
          onClick: function(helpers, btn) {
            const lines = Array.from(helpers.getRenderEl().querySelectorAll('.flex.justify-between'))
              .map(el => {
                const key = el.querySelector('span:first-child')?.innerText.trim() || '';
                const val = el.querySelector('span:last-child')?.innerText.trim() || '';
                return `${key}: ${val}`;
              }).filter(l => l && l !== ': ');
            helpers.copyToClipboard(lines.join('\n'), btn);
          }
        }
      ],
      infoHtml: '<strong>Private & Secure:</strong> Textures are processed entirely in your browser. No data is sent to any server.'
    });

    /**
     * @param {ArrayBuffer} buffer 
     */
    function parseDDS(buffer) {
      const header = new Int32Array(buffer, 0, 31);
      // 'DDS ' signature
      if (header[0] !== 0x20534444) throw new Error('Invalid DDS signature');

      const headerSize = header[1];
      const flags = header[2];
      const height = header[3];
      const width = header[4];
      const mipmapCount = Math.max(1, header[7]);
      const caps = header[27];
      const caps2 = header[28];
      
      const pixelFormat = new Int32Array(buffer, 76, 8);
      const pfFlags = pixelFormat[0];
      const pfFourCC = pixelFormat[1];
      const rgbBitCount = pixelFormat[2];
      
      let fourCC = '';
      if (pfFlags & 0x4) {
        fourCC = String.fromCharCode(pfFourCC & 0xFF, (pfFourCC >> 8) & 0xFF, (pfFourCC >> 16) & 0xFF, (pfFourCC >> 24) & 0xFF);
      }

      let format = fourCC || (rgbBitCount + '-bit RGB');
      let offset = 128;
      if (fourCC === 'DX10') {
        offset += 20; // Skip DX10 header extension
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { alpha: true });
      const imageData = ctx.createImageData(width, height);
      const pixels = imageData.data;
      const data = new Uint8Array(buffer, offset);

      if (fourCC === 'DXT1') {
        decompressDXT1(data, width, height, pixels);
      } else if (fourCC === 'DXT3') {
        decompressDXT3(data, width, height, pixels);
      } else if (fourCC === 'DXT5') {
        decompressDXT5(data, width, height, pixels);
      } else if (pfFlags & 0x40 || pfFlags & 0x41) { // Uncompressed RGB or RGBA
        decodeUncompressed(data, width, height, rgbBitCount, pfFlags, pixelFormat, pixels);
      } else {
        throw new Error('Unsupported DDS format: ' + format);
      }

      ctx.putImageData(imageData, 0, 0);

      return {
        canvas, width, height, format, mipmapCount, fourCC, rgbBitCount, caps, caps2, flags, headerSize
      };
    }

    function decodeUncompressed(data, width, height, bitCount, flags, pf, pixels) {
      const rMask = pf[3], gMask = pf[4], bMask = pf[5], aMask = pf[6];
      const hasAlpha = flags & 0x1;
      const bytesPerPixel = bitCount / 8;
      const rShift = getShift(rMask), gShift = getShift(gMask), bShift = getShift(bMask), aShift = getShift(aMask);

      for (let i = 0; i < width * height; i++) {
        let val = 0;
        const base = i * bytesPerPixel;
        if (base + bytesPerPixel > data.length) break;
        
        for (let b = 0; b < bytesPerPixel; b++) {
          val |= (data[base + b] << (b * 8));
        }
        
        const target = i * 4;
        pixels[target + 0] = ((val & rMask) >>> rShift) & 0xFF;
        pixels[target + 1] = ((val & gMask) >>> gShift) & 0xFF;
        pixels[target + 2] = ((val & bMask) >>> bShift) & 0xFF;
        pixels[target + 3] = hasAlpha ? (((val & aMask) >>> aShift) & 0xFF) : 255;
      }
    }
    
    function getShift(mask) {
      if (!mask) return 0;
      let shift = 0;
      while (shift < 32 && !(mask & (1 << shift))) shift++;
      return shift;
    }

    function unpack565(c, out, offset) {
      out[offset + 0] = (((c >> 11) & 0x1F) * 255 / 31) | 0;
      out[offset + 1] = (((c >> 5) & 0x3F) * 255 / 63) | 0;
      out[offset + 2] = ((c & 0x1F) * 255 / 31) | 0;
    }

    function decompressDXT1(data, width, height, pixels) {
      const colors = new Uint8Array(16);
      let offset = 0;
      for (let y = 0; y < height; y += 4) {
        for (let x = 0; x < width; x += 4) {
          if (offset + 8 > data.length) break;
          const c0 = data[offset] | (data[offset + 1] << 8);
          const c1 = data[offset + 2] | (data[offset + 3] << 8);
          offset += 4;
          unpack565(c0, colors, 0);
          unpack565(c1, colors, 4);
          if (c0 > c1) {
            colors[8] = ((2 * colors[0] + colors[4]) / 3) | 0;
            colors[9] = ((2 * colors[1] + colors[5]) / 3) | 0;
            colors[10] = ((2 * colors[2] + colors[6]) / 3) | 0;
            colors[12] = ((colors[0] + 2 * colors[4]) / 3) | 0;
            colors[13] = ((colors[1] + 2 * colors[5]) / 3) | 0;
            colors[14] = ((colors[2] + 2 * colors[6]) / 3) | 0;
          } else {
            colors[8] = ((colors[0] + colors[4]) / 2) | 0;
            colors[9] = ((colors[1] + colors[5]) / 2) | 0;
            colors[10] = ((colors[2] + colors[6]) / 2) | 0;
            colors[12] = 0; colors[13] = 0; colors[14] = 0;
          }
          const indices = data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24);
          offset += 4;
          for (let i = 0; i < 16; i++) {
            const idx = (indices >> (i * 2)) & 0x3;
            const px = x + (i % 4), py = y + (i >> 2);
            if (px < width && py < height) {
              const pidx = (py * width + px) * 4;
              pixels[pidx + 0] = colors[idx * 4 + 0];
              pixels[pidx + 1] = colors[idx * 4 + 1];
              pixels[pidx + 2] = colors[idx * 4 + 2];
              pixels[pidx + 3] = (c0 <= c1 && idx === 3) ? 0 : 255;
            }
          }
        }
      }
    }

    function decompressDXT3(data, width, height, pixels) {
      const colors = new Uint8Array(16);
      let offset = 0;
      for (let y = 0; y < height; y += 4) {
        for (let x = 0; x < width; x += 4) {
          if (offset + 16 > data.length) break;
          const alphaOffset = offset;
          offset += 8;
          const c0 = data[offset] | (data[offset + 1] << 8), c1 = data[offset + 2] | (data[offset + 3] << 8);
          offset += 4;
          unpack565(c0, colors, 0); unpack565(c1, colors, 4);
          colors[8] = ((2 * colors[0] + colors[4]) / 3) | 0; colors[9] = ((2 * colors[1] + colors[5]) / 3) | 0; colors[10] = ((2 * colors[2] + colors[6]) / 3) | 0;
          colors[12] = ((colors[0] + 2 * colors[4]) / 3) | 0; colors[13] = ((colors[1] + 2 * colors[5]) / 3) | 0; colors[14] = ((colors[2] + 2 * colors[6]) / 3) | 0;
          const indices = data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24);
          offset += 4;
          for (let i = 0; i < 16; i++) {
            const idx = (indices >> (i * 2)) & 0x3, alpha4 = (data[alphaOffset + (i >> 1)] >> ((i % 2) * 4)) & 0xF;
            const px = x + (i % 4), py = y + (i >> 2);
            if (px < width && py < height) {
              const pidx = (py * width + px) * 4;
              pixels[pidx + 0] = colors[idx * 4 + 0]; pixels[pidx + 1] = colors[idx * 4 + 1]; pixels[pidx + 2] = colors[idx * 4 + 2];
              pixels[pidx + 3] = (alpha4 << 4) | alpha4;
            }
          }
        }
      }
    }

    function decompressDXT5(data, width, height, pixels) {
      const colors = new Uint8Array(16), alpha = new Uint8Array(8);
      let offset = 0;
      for (let y = 0; y < height; y += 4) {
        for (let x = 0; x < width; x += 4) {
          if (offset + 16 > data.length) break;
          alpha[0] = data[offset]; alpha[1] = data[offset + 1];
          if (alpha[0] > alpha[1]) {
            for (let i = 1; i < 7; i++) alpha[i + 1] = (((7 - i) * alpha[0] + i * alpha[1]) / 7) | 0;
          } else {
            for (let i = 1; i < 5; i++) alpha[i + 1] = (((5 - i) * alpha[0] + i * alpha[1]) / 5) | 0;
            alpha[6] = 0; alpha[7] = 255;
          }
          const alphaIndices = data.slice(offset + 2, offset + 8); offset += 8;
          const c0 = data[offset] | (data[offset + 1] << 8), c1 = data[offset + 2] | (data[offset + 3] << 8);
          offset += 4;
          unpack565(c0, colors, 0); unpack565(c1, colors, 4);
          colors[8] = ((2 * colors[0] + colors[4]) / 3) | 0; colors[9] = ((2 * colors[1] + colors[5]) / 3) | 0; colors[10] = ((2 * colors[2] + colors[6]) / 3) | 0;
          colors[12] = ((colors[0] + 2 * colors[4]) / 3) | 0; colors[13] = ((colors[1] + 2 * colors[5]) / 3) | 0; colors[14] = ((colors[2] + 2 * colors[6]) / 3) | 0;
          const colorIndices = data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24);
          offset += 4;
          for (let i = 0; i < 16; i++) {
            const cIdx = (colorIndices >> (i * 2)) & 0x3, bitPos = i * 3, bytePos = (bitPos / 8) | 0, bitShift = bitPos % 8;
            let aIdx = (alphaIndices[bytePos] >> bitShift);
            if (bitShift > 5 && bytePos < 5) aIdx |= (alphaIndices[bytePos + 1] << (8 - bitShift));
            aIdx &= 0x7;
            const px = x + (i % 4), py = y + (i >> 2);
            if (px < width && py < height) {
              const pidx = (py * width + px) * 4;
              pixels[pidx + 0] = colors[cIdx * 4 + 0]; pixels[pidx + 1] = colors[cIdx * 4 + 1]; pixels[pidx + 2] = colors[cIdx * 4 + 2];
              pixels[pidx + 3] = alpha[aIdx];
            }
          }
        }
      }
    }
  };
})();
