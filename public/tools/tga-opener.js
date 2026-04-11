(function() {
  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.tga',
      dropLabel: 'Drop a .tga file here',
      binary: true,
      onInit: function(helpers) {
        // No external dependencies needed, we'll use a built-in TGA parser for reliability
      },
      onFile: function(file, content, helpers) {
        helpers.showLoading('Parsing TGA image...');
        try {
          const tga = decodeTGA(content);
          const canvas = tga.canvas;
          
          const formatSize = (b) => b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : b > 1e3 ? (b / 1024).toFixed(0) + ' KB' : b + ' B';
          
          const html = `
            <div class="p-4">
              <div class="flex items-center gap-3 p-3 bg-surface-50 rounded-lg text-sm text-surface-600 mb-4">
                <span class="font-medium">${file.name}</span>
                <span class="text-surface-400">·</span>
                <span>${tga.width} × ${tga.height}</span>
                <span class="text-surface-400">·</span>
                <span>${formatSize(file.size)}</span>
              </div>
              
              <div class="flex flex-col border border-surface-200 rounded-xl overflow-hidden bg-surface-100 shadow-sm">
                <div class="shrink-0 bg-white border-b border-surface-200 px-4 py-2 flex items-center justify-between">
                   <div class="flex items-center gap-2">
                      <span class="text-[10px] font-bold text-surface-400 uppercase bg-surface-50 px-2 py-0.5 rounded border border-surface-100">TGA Preview</span>
                   </div>
                   <div class="flex gap-2">
                      <button id="btn-zoom-in" class="p-1.5 hover:bg-surface-50 rounded text-surface-600 transition-colors" title="Zoom In">➕</button>
                      <button id="btn-zoom-out" class="p-1.5 hover:bg-surface-50 rounded text-surface-600 transition-colors" title="Zoom Out">➖</button>
                      <button id="btn-rotate" class="p-1.5 hover:bg-surface-50 rounded text-surface-600 transition-colors" title="Rotate">🔄</button>
                   </div>
                </div>
                <div class="flex-1 overflow-auto p-12 bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAAAAAA6mKC9AAAAGElEQVQYV2N4DwX/oYBhgDE8BOn4S8VfWAMA6as8f9zEAn8AAAAASUVORK5CYII=')] flex justify-center items-center min-h-[400px]">
                   <div id="img-container" class="transition-all duration-300 ease-out shadow-2xl bg-white" style="transform: scale(1) rotate(0deg)"></div>
                </div>
              </div>
              
              <div class="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="bg-white p-4 rounded-xl border border-surface-200">
                  <h3 class="text-xs font-bold text-surface-400 uppercase mb-3">Image Metadata</h3>
                  <div class="space-y-2">
                    <div class="flex justify-between text-sm">
                      <span class="text-surface-500">Dimensions</span>
                      <span class="font-medium text-surface-900">${tga.width} × ${tga.height}</span>
                    </div>
                    <div class="flex justify-between text-sm">
                      <span class="text-surface-500">Color Depth</span>
                      <span class="font-medium text-surface-900">${tga.pixelDepth} bits</span>
                    </div>
                    <div class="flex justify-between text-sm">
                      <span class="text-surface-500">Image Type</span>
                      <span class="font-medium text-surface-900">${getTypeName(tga.imageType)}</span>
                    </div>
                  </div>
                </div>
                <div class="bg-white p-4 rounded-xl border border-surface-200">
                  <h3 class="text-xs font-bold text-surface-400 uppercase mb-3">Technical Details</h3>
                  <div class="space-y-2">
                    <div class="flex justify-between text-sm">
                      <span class="text-surface-500">Origin</span>
                      <span class="font-medium text-surface-900">${tga.originX}, ${tga.originY}</span>
                    </div>
                    <div class="flex justify-between text-sm">
                      <span class="text-surface-500">Orientation</span>
                      <span class="font-medium text-surface-900">${tga.isTopToBottom ? 'Top-to-Bottom' : 'Bottom-to-Top'}</span>
                    </div>
                    <div class="flex justify-between text-sm">
                      <span class="text-surface-500">Alpha Channel</span>
                      <span class="font-medium text-surface-900">${tga.hasAlpha ? 'Present' : 'None'}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          `;
          
          helpers.render(html);
          document.getElementById('img-container').appendChild(canvas);
          canvas.className = 'max-w-full h-auto rounded';
          
          let scale = 1;
          let rotation = 0;
          const update = () => {
            document.getElementById('img-container').style.transform = `scale(${scale}) rotate(${rotation}deg)`;
          };
          
          document.getElementById('btn-zoom-in').onclick = () => { scale += 0.2; update(); };
          document.getElementById('btn-zoom-out').onclick = () => { if(scale > 0.2) scale -= 0.2; update(); };
          document.getElementById('btn-rotate').onclick = () => { rotation += 90; update(); };
          
        } catch(e) {
          helpers.showError('Could not parse TGA file', e.message);
        }
      },
      actions: [
        { label: '📥 Download as PNG', id: 'dl-png', onClick: function(helpers) {
          const canvas = helpers.getRenderEl().querySelector('canvas');
          if (canvas) {
            helpers.download(helpers.getFile().name.replace(/\.[^/.]+$/, "") + ".png", canvas.toDataURL(), 'image/png');
          }
        } },
        { label: '📋 Copy Metadata', id: 'copy-meta', onClick: function(helpers, btn) {
          const meta = helpers.getRenderEl().innerText;
          helpers.copyToClipboard(meta, btn);
        } }
      ],
      infoHtml: '<strong>Privacy:</strong> 100% client-side. Your TGA files are processed entirely in your browser.'
    });

    function getTypeName(type) {
      switch(type) {
        case 0: return 'No Image Data';
        case 1: return 'Uncompressed Color-mapped';
        case 2: return 'Uncompressed True-color';
        case 3: return 'Uncompressed Black-and-white';
        case 9: return 'Run-length Encoded Color-mapped';
        case 10: return 'Run-length Encoded True-color';
        case 11: return 'Run-length Encoded Black-and-white';
        default: return 'Unknown (' + type + ')';
      }
    }

    function decodeTGA(arrayBuffer) {
      const data = new Uint8Array(arrayBuffer);
      if (data.length < 18) throw new Error('File too small to be a TGA');

      const idLength = data[0];
      const colorMapType = data[1];
      const imageType = data[2];
      const width = data[12] | (data[13] << 8);
      const height = data[14] | (data[15] << 8);
      const pixelDepth = data[16];
      const imageDescriptor = data[17];

      if (width <= 0 || height <= 0) throw new Error('Invalid dimensions: ' + width + 'x' + height);

      const isTopToBottom = (imageDescriptor & 0x20) !== 0;
      const isRightToLeft = (imageDescriptor & 0x10) !== 0;
      const alphaBits = imageDescriptor & 0x0F;
      const hasAlpha = pixelDepth === 32 || alphaBits > 0;

      let offset = 18 + idLength;
      
      // Skip color map
      if (colorMapType === 1) {
        const colorMapLength = data[5] | (data[6] << 8);
        const colorMapEntrySize = data[7];
        offset += colorMapLength * Math.ceil(colorMapEntrySize / 8);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      const imageData = ctx.createImageData(width, height);
      const pixels = imageData.data;

      const bytesPerPixel = pixelDepth / 8;
      const totalPixels = width * height;

      if (imageType === 2 || imageType === 3) {
        // Uncompressed
        for (let i = 0; i < totalPixels; i++) {
          readPixel(data, offset, i, pixels, width, height, pixelDepth, isTopToBottom, isRightToLeft);
          offset += bytesPerPixel;
        }
      } else if (imageType === 10 || imageType === 11) {
        // RLE
        let pixelCount = 0;
        while (pixelCount < totalPixels) {
          const chunkHeader = data[offset++];
          const isRLE = (chunkHeader & 0x80) !== 0;
          const count = (chunkHeader & 0x7F) + 1;

          if (isRLE) {
            for (let i = 0; i < count; i++) {
              readPixel(data, offset, pixelCount + i, pixels, width, height, pixelDepth, isTopToBottom, isRightToLeft);
            }
            offset += bytesPerPixel;
          } else {
            for (let i = 0; i < count; i++) {
              readPixel(data, offset, pixelCount + i, pixels, width, height, pixelDepth, isTopToBottom, isRightToLeft);
              offset += bytesPerPixel;
            }
          }
          pixelCount += count;
        }
      } else {
        throw new Error('Unsupported TGA image type: ' + imageType);
      }

      ctx.putImageData(imageData, 0, 0);

      return {
        canvas, width, height, pixelDepth, imageType, hasAlpha, isTopToBottom,
        originX: data[8] | (data[9] << 8),
        originY: data[10] | (data[11] << 8)
      };
    }

    function readPixel(data, offset, index, pixels, width, height, depth, topToBottom, rightToLeft) {
      const x = index % width;
      const y = Math.floor(index / width);
      
      const targetX = rightToLeft ? (width - 1 - x) : x;
      const targetY = topToBottom ? y : (height - 1 - y);
      const targetIndex = (targetY * width + targetX) * 4;

      if (depth === 32) {
        pixels[targetIndex + 0] = data[offset + 2]; // R
        pixels[targetIndex + 1] = data[offset + 1]; // G
        pixels[targetIndex + 2] = data[offset + 0]; // B
        pixels[targetIndex + 3] = data[offset + 3]; // A
      } else if (depth === 24) {
        pixels[targetIndex + 0] = data[offset + 2]; // R
        pixels[targetIndex + 1] = data[offset + 1]; // G
        pixels[targetIndex + 2] = data[offset + 0]; // B
        pixels[targetIndex + 3] = 255;              // A
      } else if (depth === 16) {
        const val = data[offset + 0] | (data[offset + 1] << 8);
        pixels[targetIndex + 0] = ((val & 0x7C00) >> 10) << 3;
        pixels[targetIndex + 1] = ((val & 0x03E0) >> 5) << 3;
        pixels[targetIndex + 2] = (val & 0x001F) << 3;
        pixels[targetIndex + 3] = (val & 0x8000) ? 255 : 0;
      } else if (depth === 8) {
        const val = data[offset + 0];
        pixels[targetIndex + 0] = val;
        pixels[targetIndex + 1] = val;
        pixels[targetIndex + 2] = val;
        pixels[targetIndex + 3] = 255;
      }
    }
  };
})();
