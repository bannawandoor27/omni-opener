/**
 * OmniOpener — Production Perfect TIFF Toolkit
 * Professional multi-page viewer, metadata extractor, and converter.
 */
(function () {
  'use strict';

  // Helper to format bytes
  function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  // Common TIFF Tags (Tag ID to Name)
  const TIFF_TAGS = {
    254: 'NewSubfileType', 256: 'ImageWidth', 257: 'ImageLength', 258: 'BitsPerSample',
    259: 'Compression', 262: 'PhotometricInterpretation', 270: 'ImageDescription',
    271: 'Make', 272: 'Model', 273: 'StripOffsets', 274: 'Orientation',
    277: 'SamplesPerPixel', 278: 'RowsPerStrip', 279: 'StripByteCounts',
    282: 'XResolution', 283: 'YResolution', 284: 'PlanarConfiguration',
    296: 'ResolutionUnit', 305: 'Software', 306: 'DateTime', 315: 'Artist',
    318: 'WhitePoint', 319: 'PrimaryChromaticities', 320: 'ColorMap',
    33432: 'Copyright', 33434: 'ExposureTime', 33437: 'FNumber',
    34850: 'ExposureProgram', 34855: 'ISOSpeedRatings', 37377: 'ShutterSpeedValue',
    37378: 'ApertureValue', 37380: 'ExposureBiasValue', 37383: 'MeteringMode',
    37385: 'Flash', 37386: 'FocalLength', 40961: 'ColorSpace',
    40962: 'PixelXDimension', 40963: 'PixelYDimension'
  };

  window.initTool = function (toolConfig, mountEl) {
    let currentBlobUrl = null;

    const cleanup = () => {
      if (currentBlobUrl) {
        URL.revokeObjectURL(currentBlobUrl);
        currentBlobUrl = null;
      }
    };

    OmniTool.create(mountEl, toolConfig, {
      accept: '.tif,.tiff',
      binary: true,
      infoHtml: 'Professional multi-page TIFF viewer with metadata extraction and export tools.',
      
      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/utif@3.1.0/UTIF.min.js');
      },

      onDestroy: cleanup,

      onFile: function _onFileFn(file, content, h) {
        cleanup();

        if (typeof UTIF === 'undefined') {
          h.showLoading('Initializing TIFF engine...');
          setTimeout(function() { _onFileFn(file, content, h); }, 300);
          return;
        }

        h.showLoading('Decoding TIFF layers...');

        try {
          const ifds = UTIF.decode(content);
          if (!ifds || ifds.length === 0) {
            h.showError('Empty TIFF file', 'This file contains no valid image layers.');
            return;
          }

          const renderPage = (pageIdx) => {
            h.showLoading(`Rendering page ${pageIdx + 1}...`);
            
            setTimeout(() => {
              try {
                const ifd = ifds[pageIdx];
                UTIF.decodeImage(content, ifd);
                const rgba = UTIF.toRGBA8(ifd);
                
                const canvas = document.createElement('canvas');
                canvas.width = ifd.width;
                canvas.height = ifd.height;
                const ctx = canvas.getContext('2d');
                const imgData = ctx.createImageData(ifd.width, ifd.height);
                imgData.data.set(rgba);
                ctx.putImageData(imgData, 0, 0);

                const metadata = Object.entries(ifd).filter(([k]) => !isNaN(k)).map(([k, v]) => ({
                  id: k,
                  name: TIFF_TAGS[k] || `Tag ${k}`,
                  value: Array.isArray(v) ? v.join(', ') : (typeof v === 'object' ? JSON.stringify(v) : v)
                }));

                const infoBarHtml = `
                  <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">
                    <span class="font-semibold text-surface-800">${h.escape(file.name)}</span>
                    <span class="text-surface-300">|</span>
                    <span>${formatBytes(file.size)}</span>
                    <span class="text-surface-300">|</span>
                    <span class="text-surface-500">${ifd.width} × ${ifd.height} px</span>
                    <span class="text-surface-300">|</span>
                    <span class="bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full text-xs font-medium">Page ${pageIdx + 1} of ${ifds.length}</span>
                  </div>
                `;

                const actionsHtml = `
                  <div class="flex flex-wrap gap-2 mb-6">
                    <button id="btn-prev" class="px-4 py-2 bg-white border border-surface-200 rounded-lg text-sm font-medium text-surface-700 hover:bg-surface-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm" ${pageIdx === 0 ? 'disabled' : ''}>
                      &larr; Previous Page
                    </button>
                    <button id="btn-next" class="px-4 py-2 bg-white border border-surface-200 rounded-lg text-sm font-medium text-surface-700 hover:bg-surface-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm" ${pageIdx === ifds.length - 1 ? 'disabled' : ''}>
                      Next Page &rarr;
                    </button>
                    <div class="flex-grow"></div>
                    <button id="btn-dl-png" class="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 transition-all shadow-sm flex items-center gap-2">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                      Save as PNG
                    </button>
                    <button id="btn-dl-jpg" class="px-4 py-2 bg-surface-800 text-white rounded-lg text-sm font-medium hover:bg-surface-900 transition-all shadow-sm">
                      Save as JPG
                    </button>
                  </div>
                `;

                const viewerHtml = `
                  <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div class="lg:col-span-2 space-y-4">
                      <div class="rounded-xl border border-surface-200 bg-surface-100 p-4 min-h-[400px] flex items-center justify-center overflow-auto shadow-inner">
                        <div id="image-container" class="bg-white shadow-2xl rounded-sm ring-1 ring-black/5"></div>
                      </div>
                    </div>
                    
                    <div class="space-y-6">
                      <div>
                        <div class="flex items-center justify-between mb-3">
                          <h3 class="font-semibold text-surface-800">Metadata (IFD ${pageIdx})</h3>
                          <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${metadata.length} Tags</span>
                        </div>
                        <div class="overflow-x-auto rounded-xl border border-surface-200 max-h-[600px] overflow-y-auto">
                          <table class="min-w-full text-sm">
                            <thead>
                              <tr class="bg-surface-50 border-b border-surface-200">
                                <th class="sticky top-0 bg-surface-50 px-4 py-3 text-left font-semibold text-surface-700">Tag</th>
                                <th class="sticky top-0 bg-surface-50 px-4 py-3 text-left font-semibold text-surface-700">Value</th>
                              </tr>
                            </thead>
                            <tbody class="divide-y divide-surface-100">
                              ${metadata.map(m => `
                                <tr class="hover:bg-brand-50/30 transition-colors">
                                  <td class="px-4 py-2 text-surface-900 font-medium">${h.escape(m.name)} <span class="text-[10px] text-surface-400 block font-normal">ID: ${m.id}</span></td>
                                  <td class="px-4 py-2 text-surface-600 break-all font-mono text-[11px]">${h.escape(m.value)}</td>
                                </tr>
                              `).join('')}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>
                `;

                h.render(`
                  <div class="animate-in fade-in duration-500">
                    ${infoBarHtml}
                    ${actionsHtml}
                    ${viewerHtml}
                  </div>
                `);

                const container = document.getElementById('image-container');
                if (container) {
                  canvas.className = 'max-w-full h-auto block';
                  container.appendChild(canvas);
                }

                // Event Listeners
                document.getElementById('btn-prev')?.addEventListener('click', () => renderPage(pageIdx - 1));
                document.getElementById('btn-next')?.addEventListener('click', () => renderPage(pageIdx + 1));
                
                document.getElementById('btn-dl-png')?.addEventListener('click', () => {
                  canvas.toBlob((blob) => {
                    if (blob) h.download(`${file.name.replace(/\.[^/.]+$/, "")}_p${pageIdx + 1}.png`, blob, 'image/png');
                  }, 'image/png');
                });

                document.getElementById('btn-dl-jpg')?.addEventListener('click', () => {
                  // Create a temporary canvas for JPG to ensure white background (TIFF might have transparency)
                  const jpgCanvas = document.createElement('canvas');
                  jpgCanvas.width = canvas.width;
                  jpgCanvas.height = canvas.height;
                  const jpgCtx = jpgCanvas.getContext('2d');
                  jpgCtx.fillStyle = '#FFFFFF';
                  jpgCtx.fillRect(0, 0, jpgCanvas.width, jpgCanvas.height);
                  jpgCtx.drawImage(canvas, 0, 0);
                  
                  jpgCanvas.toBlob((blob) => {
                    if (blob) h.download(`${file.name.replace(/\.[^/.]+$/, "")}_p${pageIdx + 1}.jpg`, blob, 'image/jpeg', 0.92);
                  }, 'image/jpeg', 0.92);
                });

              } catch (renderErr) {
                console.error(renderErr);
                h.showError('Rendering Error', `Failed to render page ${pageIdx + 1}: ${renderErr.message}`);
              }
            }, 50); // Small timeout to allow UI to show loading state
          };

          renderPage(0);

        } catch (err) {
          console.error(err);
          h.showError('Could not open TIFF file', 'The file might be corrupted or uses an unsupported compression format. Try converting it to a standard format and re-uploading.');
        }
      }
    });
  };
})();
