/**
 * OmniOpener — JPEG/JPG Toolkit
 * Uses OmniTool SDK and exifr for EXIF metadata extraction.
 */
(function () {
  'use strict';

  function esc(s) {
    if (s === null || s === undefined) return '';
    const d = document.createElement('div');
    d.appendChild(document.createTextNode(String(s)));
    return d.innerHTML;
  }

  function fmtBytes(b) {
    if (b > 1048576) return (b / 1048576).toFixed(1) + ' MB';
    if (b > 1024) return (b / 1024).toFixed(0) + ' KB';
    return b + ' B';
  }

  function fmtExposure(val) {
    if (!val) return null;
    if (val >= 1) return val + 's';
    return '1/' + Math.round(1 / val) + 's';
  }

  function fmtDate(val) {
    if (!val) return null;
    try {
      const d = val instanceof Date ? val : new Date(val);
      return d.toLocaleString(undefined, {
        year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch (e) { return String(val); }
  }

  function fmtGPS(lat, lng) {
    if (lat == null || lng == null) return null;
    const latStr = Math.abs(lat).toFixed(6) + (lat >= 0 ? '° N' : '° S');
    const lngStr = Math.abs(lng).toFixed(6) + (lng >= 0 ? '° E' : '° W');
    return { display: latStr + ', ' + lngStr, url: `https://maps.google.com/?q=${lat},${lng}` };
  }

  function metaRow(label, value) {
    if (!value && value !== 0) return '';
    return `<tr>
      <td class="py-1 pr-3 text-[11px] text-surface-400 font-medium whitespace-nowrap align-top">${esc(label)}</td>
      <td class="py-1 text-[11px] text-surface-800 break-all">${value}</td>
    </tr>`;
  }

  function sectionHeader(label) {
    return `<tr><td colspan="2" class="pt-3 pb-1 text-[10px] font-bold text-surface-400 uppercase tracking-wider">${esc(label)}</td></tr>`;
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.jpg,.jpeg',
      binary: true,
      dropLabel: 'Drop a JPEG/JPG file here',
      infoHtml: '<strong>JPEG Toolkit:</strong> Photo viewer with full EXIF metadata extraction — camera settings, GPS location, timestamps and more.',

      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/exifr@7.1.3/dist/lite.umd.js');
      },

      onFile: async function (file, content, h) {
        h.showLoading('Reading image data...');

        // Build blob URL for display
        const blob = new Blob([content], { type: file.type || 'image/jpeg' });
        const url = URL.createObjectURL(blob);

        // Load image to get natural dimensions
        const imgEl = new Image();
        await new Promise((res) => { imgEl.onload = res; imgEl.onerror = res; imgEl.src = url; });
        const width = imgEl.naturalWidth || 0;
        const height = imgEl.naturalHeight || 0;

        // Parse EXIF
        let exif = null;
        try {
          if (typeof exifr !== 'undefined') {
            exif = await exifr.parse(content, {
              tiff: true, exif: true, gps: true, ifd1: true,
              translateKeys: true, translateValues: true, reviveValues: true
            });
          }
        } catch (e) { exif = null; }

        // Build metadata rows
        let metaHtml = '';

        // File section
        metaHtml += sectionHeader('File');
        metaHtml += metaRow('Name', esc(file.name));
        metaHtml += metaRow('Size', esc(fmtBytes(file.size)));
        metaHtml += metaRow('Dimensions', width && height ? `${width} × ${height} px` : null);

        if (exif) {
          // Camera section
          const hasCam = exif.Make || exif.Model;
          if (hasCam) {
            metaHtml += sectionHeader('Camera');
            metaHtml += metaRow('Make', esc(exif.Make));
            metaHtml += metaRow('Model', esc(exif.Model));
          }

          // Settings section
          const fNum = exif.FNumber ? `f/${exif.FNumber}` : null;
          const expTime = fmtExposure(exif.ExposureTime);
          const iso = exif.ISO ? `ISO ${exif.ISO}` : null;
          const focal = exif.FocalLength ? `${exif.FocalLength} mm` : null;
          const hasSettings = fNum || expTime || iso || focal;
          if (hasSettings) {
            metaHtml += sectionHeader('Settings');
            metaHtml += metaRow('Aperture', fNum ? esc(fNum) : null);
            metaHtml += metaRow('Exposure', expTime ? esc(expTime) : null);
            metaHtml += metaRow('ISO', iso ? esc(iso) : null);
            metaHtml += metaRow('Focal Length', focal ? esc(focal) : null);
          }

          // Date section
          const dateVal = exif.DateTimeOriginal || exif.DateTime || exif.CreateDate;
          if (dateVal) {
            metaHtml += sectionHeader('Date');
            metaHtml += metaRow('Taken', esc(fmtDate(dateVal)));
          }

          // GPS section
          const gps = fmtGPS(
            exif.GPSLatitude != null ? exif.GPSLatitude : null,
            exif.GPSLongitude != null ? exif.GPSLongitude : null
          );
          if (gps) {
            metaHtml += sectionHeader('GPS');
            metaHtml += metaRow('Coordinates',
              `${esc(gps.display)} <a href="${esc(gps.url)}" target="_blank" rel="noopener" class="text-brand-600 underline">Open in Maps</a>`
            );
          }

          // Software section
          if (exif.Software) {
            metaHtml += sectionHeader('Software');
            metaHtml += metaRow('Software', esc(exif.Software));
          }
        }

        h.render(`
          <div class="flex flex-col lg:flex-row h-[85vh] border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm font-sans">

            <!-- Image Panel -->
            <div class="flex-1 min-h-0 overflow-auto flex flex-col bg-surface-100"
                 style="background-image: url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAAAAAA6mKC9AAAAGElEQVQYV2N4DwX/oYBhgDE8BOn4S8VfWAMA6as8f9zEAn8AAAAASUVORK5CYII='); background-repeat: repeat; image-rendering: pixelated;">
              <!-- Toolbar -->
              <div class="shrink-0 bg-white/90 backdrop-blur border-b border-surface-200 px-4 py-2 flex items-center justify-between gap-2">
                <div class="flex items-center gap-2 min-w-0">
                  <span class="text-xs font-bold text-surface-900 truncate">${esc(file.name)}</span>
                  ${width && height ? `<span class="shrink-0 text-[10px] font-bold text-surface-400 bg-surface-50 border border-surface-100 px-2 py-0.5 rounded">${width} × ${height}</span>` : ''}
                </div>
                <div class="flex items-center gap-2 shrink-0">
                  <button id="btn-zoom-in" class="p-1.5 hover:bg-surface-50 rounded text-surface-600 transition-colors text-sm">＋</button>
                  <button id="btn-zoom-out" class="p-1.5 hover:bg-surface-50 rounded text-surface-600 transition-colors text-sm">－</button>
                  <button id="btn-copy" class="px-2 py-1 border border-surface-200 rounded text-[10px] font-bold text-surface-700 hover:bg-surface-50 transition-colors">Copy</button>
                  <button id="btn-dl" class="px-3 py-1 bg-brand-600 text-white rounded text-[10px] font-bold shadow-sm hover:bg-brand-700 transition-colors">Download</button>
                </div>
              </div>
              <!-- Image -->
              <div class="flex-1 overflow-auto p-8 flex justify-center items-center">
                <img id="jpg-preview" src="${url}"
                     class="max-w-full h-auto shadow-2xl rounded transition-all duration-300 ease-out bg-white"
                     style="transform: scale(1);" />
              </div>
            </div>

            <!-- Metadata Panel -->
            <div class="w-full lg:w-72 xl:w-80 shrink-0 border-t lg:border-t-0 lg:border-l border-surface-200 bg-white overflow-y-auto">
              <div class="px-4 py-3 border-b border-surface-100 bg-surface-50">
                <span class="text-[11px] font-bold text-surface-500 uppercase tracking-wider">Metadata</span>
              </div>
              <div class="px-4 py-2">
                ${metaHtml
                  ? `<table class="w-full border-collapse">${metaHtml}</table>`
                  : '<p class="text-[12px] text-surface-400 py-4">No metadata available.</p>'
                }
              </div>
            </div>

          </div>
        `);

        // Wire up controls
        let scale = 1;
        const imgPreview = document.getElementById('jpg-preview');
        const updateScale = () => { imgPreview.style.transform = `scale(${scale})`; };

        document.getElementById('btn-zoom-in').onclick = () => { scale = Math.min(scale + 0.2, 5); updateScale(); };
        document.getElementById('btn-zoom-out').onclick = () => { scale = Math.max(scale - 0.2, 0.1); updateScale(); };
        document.getElementById('btn-dl').onclick = () => h.download(file.name, content);

        document.getElementById('btn-copy').onclick = async () => {
          try {
            const cb = document.getElementById('btn-copy');
            await navigator.clipboard.write([
              new ClipboardItem({ 'image/jpeg': blob })
            ]);
            cb.textContent = 'Copied!';
            setTimeout(() => { cb.textContent = 'Copy'; }, 2000);
          } catch (e) {
            alert('Clipboard copy not supported in this browser.');
          }
        };
      }
    });
  };
})();
