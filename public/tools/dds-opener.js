(function() {
  window.initTool = function(toolConfig, mountEl) {
    let lastPreviewUrl = null;

    OmniTool.create(mountEl, toolConfig, {
      accept: '.dds',
      dropLabel: 'Drop a .dds file here',
      binary: true,
      onInit: function(helpers) {
        // Self-contained parser
      },
      onDestroy: function() {
        if (lastPreviewUrl) {
          URL.revokeObjectURL(lastPreviewUrl);
          lastPreviewUrl = null;
        }
      },
      onFile: async function _onFile(file, content, helpers) {
        if (lastPreviewUrl) {
          URL.revokeObjectURL(lastPreviewUrl);
          lastPreviewUrl = null;
        }

        helpers.showLoading('Analyzing DirectDraw Surface header...');
        
        // Ensure UI updates
        await new Promise(r => setTimeout(r, 16));

        try {
          const dds = parseDDS(content);
          
          if (!dds || dds.width === 0 || dds.height === 0) {
            helpers.showError('Empty Image', 'The DDS file appears to have no dimensions.');
            return;
          }

          const humanSize = (b) => {
            if (b >= 1048576) return (b / 1048576).toFixed(2) + ' MB';
            if (b >= 1024) return (b / 1024).toFixed(1) + ' KB';
            return b + ' bytes';
          };

          const html = `
            <div class="p-4 md:p-6 max-w-6xl mx-auto">
              <!-- U1: File info bar -->
              <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-100 shadow-sm">
                <span class="font-semibold text-surface-800">${esc(file.name)}</span>
                <span class="text-surface-300">|</span>
                <span>${humanSize(file.size)}</span>
                <span class="text-surface-300">|</span>
                <span class="text-surface-500">${dds.width} × ${dds.height} px</span>
                <span class="text-surface-300">|</span>
                <span class="px-2 py-0.5 bg-brand-100 text-brand-700 rounded text-[10px] font-bold uppercase tracking-tight">${esc(dds.format)}</span>
              </div>

              <!-- Main Preview Section -->
              <div class="flex flex-col gap-6">
                <div class="rounded-2xl border border-surface-200 overflow-hidden bg-white shadow-sm">
                  <div class="px-5 py-3.5 border-b border-surface-100 flex items-center justify-between bg-surface-50/50">
                    <div class="flex items-center gap-2">
                      <svg class="w-4 h-4 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.587-1.587a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                      <h3 class="font-semibold text-surface-800 text-sm">Texture Preview</h3>
                    </div>
                    <div class="flex items-center gap-1">
                      <button id="btn-zoom-out" class="p-1.5 hover:bg-white rounded-lg border border-transparent hover:border-surface-200 text-surface-600 transition-all active:scale-95" title="Zoom Out">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"></path></svg>
                      </button>
                      <button id="btn-zoom-reset" class="px-2 py-1 hover:bg-white rounded-lg border border-transparent hover:border-surface-200 text-surface-600 text-xs font-medium transition-all active:scale-95">100%</button>
                      <button id="btn-zoom-in" class="p-1.5 hover:bg-white rounded-lg border border-transparent hover:border-surface-200 text-surface-600 transition-all active:scale-95" title="Zoom In">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                      </button>
                      <div class="w-px h-4 bg-surface-200 mx-1"></div>
                      <button id="btn-rotate" class="p-1.5 hover:bg-white rounded-lg border border-transparent hover:border-surface-200 text-surface-600 transition-all active:scale-95" title="Rotate 90°">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                      </button>
                      <button id="btn-bg-toggle" class="p-1.5 hover:bg-white rounded-lg border border-transparent hover:border-surface-200 text-surface-600 transition-all active:scale-95" title="Toggle Transparency Grid">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                      </button>
                    </div>
                  </div>
                  <div id="preview-viewport" class="relative overflow-auto bg-surface-100 min-h-[400px] flex items-center justify-center p-8 transition-colors">
                    <div id="checkerboard-bg" class="absolute inset-0 opacity-40 pointer-events-none" style="background-image: conic-gradient(#fff 0.25turn, #e5e7eb 0.25turn 0.5turn, #fff 0.5turn 0.75turn, #e5e7eb 0.75turn); background-size: 24px 24px;"></div>
                    <div id="img-container" class="relative transition-transform duration-200 ease-out will-change-transform shadow-2xl bg-white ring-1 ring-black/5">
                      <!-- Canvas inserted here -->
                    </div>
                  </div>
                </div>

                <!-- U10: Metadata Section -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div class="bg-white p-5 rounded-2xl border border-surface-200 shadow-sm">
                    <div class="flex items-center justify-between mb-4">
                      <h3 class="font-semibold text-surface-800">Texture Details</h3>
                      <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">Core Info</span>
                    </div>
                    <div class="space-y-0.5">
                      <div class="flex justify-between items-center py-2 border-b border-surface-50 hover:bg-surface-50 px-2 rounded-lg transition-colors">
                        <span class="text-sm text-surface-500 font-medium">Resolution</span>
                        <span class="text-sm font-semibold text-surface-900 font-mono">${dds.width} × ${dds.height}</span>
                      </div>
                      <div class="flex justify-between items-center py-2 border-b border-surface-50 hover:bg-surface-50 px-2 rounded-lg transition-colors">
                        <span class="text-sm text-surface-500 font-medium">Encoding</span>
                        <span class="text-sm font-semibold text-surface-900">${esc(dds.format)}</span>
                      </div>
                      <div class="flex justify-between items-center py-2 border-b border-surface-50 hover:bg-surface-50 px-2 rounded-lg transition-colors">
                        <span class="text-sm text-surface-500 font-medium">Mipmaps</span>
                        <span class="text-sm font-semibold text-surface-900">${dds.mipmapCount}</span>
                      </div>
                      <div class="flex justify-between items-center py-2 hover:bg-surface-50 px-2 rounded-lg transition-colors">
                        <span class="text-sm text-surface-500 font-medium">Aspect Ratio</span>
                        <span class="text-sm font-semibold text-surface-900">${(dds.width / dds.height).toFixed(3)}:1</span>
                      </div>
                    </div>
                  </div>

                  <div class="bg-white p-5 rounded-2xl border border-surface-200 shadow-sm">
                    <div class="flex items-center justify-between mb-4">
                      <h3 class="font-semibold text-surface-800">DDS Header Flags</h3>
                      <span class="text-xs bg-surface-100 text-surface-600 px-2 py-0.5 rounded-full">Internal</span>
                    </div>
                    <div class="space-y-0.5 font-mono text-xs">
                      <div class="flex justify-between items-center py-2 border-b border-surface-50 hover:bg-surface-50 px-2 rounded-lg transition-colors">
                        <span class="text-surface-400 uppercase tracking-tighter">Pixel FourCC</span>
                        <span class="font-bold text-surface-700">${esc(dds.fourCC || 'None')}</span>
                      </div>
                      <div class="flex justify-between items-center py-2 border-b border-surface-50 hover:bg-surface-50 px-2 rounded-lg transition-colors">
                        <span class="text-surface-400 uppercase tracking-tighter">RGB Bit Count</span>
                        <span class="font-bold text-surface-700">${dds.rgbBitCount} bits</span>
                      </div>
                      <div class="flex justify-between items-center py-2 border-b border-surface-50 hover:bg-surface-50 px-2 rounded-lg transition-colors">
                        <span class="text-surface-400 uppercase tracking-tighter">Header Size</span>
                        <span class="font-bold text-surface-700">${dds.headerSize} bytes</span>
                      </div>
                      <div class="flex justify-between items-center py-2 hover:bg-surface-50 px-2 rounded-lg transition-colors">
                        <span class="text-surface-400 uppercase tracking-tighter">Caps/Flags</span>
                        <span class="font-bold text-surface-700">0x${dds.caps.toString(16)} / 0x${dds.flags.toString(16)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          `;

          helpers.render(html);
          
          const container = document.getElementById('img-container');
          const canvas = dds.canvas;
          canvas.className = 'block max-w-none h-auto select-none';
          canvas.style.imageRendering = 'pixelated';
          container.appendChild(canvas);

          // Interaction Closure
          let scale = 1;
          let rotation = 0;
          let bgVisible = true;

          const updateTransform = () => {
            container.style.transform = `scale(${scale}) rotate(${rotation}deg)`;
            const resetBtn = document.getElementById('btn-zoom-reset');
            if (resetBtn) resetBtn.textContent = `${Math.round(scale * 100)}%`;
          };

          const el = (id) => document.getElementById(id);
          if (el('btn-zoom-in')) el('btn-zoom-in').onclick = () => { scale = Math.min(scale + 0.2, 8); updateTransform(); };
          if (el('btn-zoom-out')) el('btn-zoom-out').onclick = () => { scale = Math.max(scale - 0.2, 0.1); updateTransform(); };
          if (el('btn-zoom-reset')) el('btn-zoom-reset').onclick = () => { scale = 1; updateTransform(); };
          if (el('btn-rotate')) el('btn-rotate').onclick = () => { rotation = (rotation + 90) % 360; updateTransform(); };
          if (el('btn-bg-toggle')) el('btn-bg-toggle').onclick = () => {
            bgVisible = !bgVisible;
            const bg = el('checkerboard-bg');
            if (bg) bg.style.visibility = bgVisible ? 'visible' : 'hidden';
            el('btn-bg-toggle').classList.toggle('text-brand-600', bgVisible);
          };

          helpers.hideLoading();

        } catch (err) {
          console.error('DDS Parse Error:', err);
          helpers.showError('Rendering Failed', 'Our browser-based decoder could not process this DDS file. It may use an unsupported compression like BC7/DX10 or be corrupted.');
        }
      },
      actions: [
        {
          label: 'Export as PNG',
          id: 'dl-png',
          icon: 'download',
          onClick: function(helpers) {
            const canvas = helpers.getRenderEl().querySelector('canvas');
            if (!canvas) return;
            helpers.showLoading('Generating PNG...');
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
          label: 'Copy Details',
          id: 'copy-meta',
          icon: 'copy',
          onClick: function(helpers, btn) {
            const lines = Array.from(helpers.getRenderEl().querySelectorAll('.flex.justify-between'))
              .map(el => {
                const key = el.querySelector('span:first-child').innerText.trim();
                const val = el.querySelector('span:last-child').innerText.trim();
                return `${key}: ${val}`;
              });
            helpers.copyToClipboard(lines.join('\n'), btn);
          }
        }
      ],
      infoHtml: '<strong>Fast & Private:</strong> DDS textures are decoded using optimized JavaScript in your browser. No image data ever leaves your device.'
    });

    function esc(str) {
      if (!str) return '';
      return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function parseDDS(buffer) {
      const header = new Int32Array(buffer, 0, 31);
      if (header[0] !== 0x20534444) throw new Error('Invalid DDS signature');

      const headerSize = header[1];
      const flags = header[2];
      const height = header[3];
      const width = header[4];
      const mipmapCount = Math.max(1, header[7]);
      const caps = header[27];
      
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
      if (fourCC === 'DX10') offset += 20;

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
      } else if (pfFlags & 0x40) {
        decodeUncompressed(data, width, height, rgbBitCount, pfFlags, pixelFormat, pixels);
      } else {
        throw new Error('Unsupported format: ' + format);
      }

      ctx.putImageData(imageData, 0, 0);

      return {
        canvas, width, height, format, mipmapCount, fourCC, rgbBitCount, caps, flags, headerSize
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
        for (let b = 0; b < bytesPerPixel; b++) val |= (data[base + b] << (b * 8));
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
      while (!(mask & (1 << shift))) shift++;
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
          const c0 = data[offset] | (data[offset + 1] << 8);
          const c1 = data[offset + 2] | (data[offset + 3] << 8);
          offset += 4;
          unpack565(c0, colors, 0);
          unpack565(c1, colors, 4);
          if (c0 > c1) {
            colors[8] = (2 * colors[0] + colors[4]) / 3;
            colors[9] = (2 * colors[1] + colors[5]) / 3;
            colors[10] = (2 * colors[2] + colors[6]) / 3;
            colors[12] = (colors[0] + 2 * colors[4]) / 3;
            colors[13] = (colors[1] + 2 * colors[5]) / 3;
            colors[14] = (colors[2] + 2 * colors[6]) / 3;
          } else {
            colors[8] = (colors[0] + colors[4]) / 2;
            colors[9] = (colors[1] + colors[5]) / 2;
            colors[10] = (colors[2] + colors[6]) / 2;
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
          const alphaOffset = offset;
          offset += 8;
          const c0 = data[offset] | (data[offset + 1] << 8), c1 = data[offset + 2] | (data[offset + 3] << 8);
          offset += 4;
          unpack565(c0, colors, 0); unpack565(c1, colors, 4);
          colors[8] = (2 * colors[0] + colors[4]) / 3; colors[9] = (2 * colors[1] + colors[5]) / 3; colors[10] = (2 * colors[2] + colors[6]) / 3;
          colors[12] = (colors[0] + 2 * colors[4]) / 3; colors[13] = (colors[1] + 2 * colors[5]) / 3; colors[14] = (colors[2] + 2 * colors[6]) / 3;
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
          alpha[0] = data[offset]; alpha[1] = data[offset + 1];
          if (alpha[0] > alpha[1]) for (let i = 1; i < 7; i++) alpha[i + 1] = (((7 - i) * alpha[0] + i * alpha[1]) / 7) | 0;
          else {
            for (let i = 1; i < 5; i++) alpha[i + 1] = (((5 - i) * alpha[0] + i * alpha[1]) / 5) | 0;
            alpha[6] = 0; alpha[7] = 255;
          }
          const alphaIndices = data.slice(offset + 2, offset + 8); offset += 8;
          const c0 = data[offset] | (data[offset + 1] << 8), c1 = data[offset + 2] | (data[offset + 3] << 8);
          offset += 4;
          unpack565(c0, colors, 0); unpack565(c1, colors, 4);
          colors[8] = (2 * colors[0] + colors[4]) / 3; colors[9] = (2 * colors[1] + colors[5]) / 3; colors[10] = (2 * colors[2] + colors[6]) / 3;
          colors[12] = (colors[0] + 2 * colors[4]) / 3; colors[13] = (colors[1] + 2 * colors[5]) / 3; colors[14] = (colors[2] + 2 * colors[6]) / 3;
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
