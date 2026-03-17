/**
 * OmniOpener — NuGet Package (.nupkg) Opener
 * Uses JSZip to extract metadata and file list from NuGet packages.
 */
(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      accept: '.nupkg',
      dropLabel: 'Drop a .nupkg file here',
      infoHtml: '<strong>How it works:</strong> This tool parses NuGet packages (.nupkg) as ZIP archives, extracts metadata from the included .nuspec file, and lists all packaged contents directly in your browser.',

      onInit: function (h) {
        if (typeof JSZip === 'undefined') {
          h.loadScript('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js');
        }
      },

      onFile: function (file, content, h) {
        h.showLoading('Extracting package…');
        // Small delay to ensure jszip is ready
        setTimeout(function () {
          try {
            var zip = new JSZip();
            zip.loadAsync(content).then(function (zipContent) {
              renderNupkg(zipContent, h);
            }).catch(function (err) {
              h.showError('Invalid NUPKG file', err.message);
            });
          } catch (err) {
            h.showError('Failed to parse package', err.message);
          }
        }, 100);
      },

      actions: [
        {
          label: '📋 Copy Metadata', id: 'copy-meta', onClick: function (h, btn) {
            var meta = h.getState().metadata;
            if (meta) {
              var text = Object.keys(meta).map(function (k) { return k + ': ' + meta[k]; }).join('\n');
              h.copyToClipboard(text, btn);
            }
          }
        },
        {
          label: '📥 Download .nuspec', id: 'dl-nuspec', onClick: function (h) {
            var specText = h.getState().specText;
            var specName = h.getState().specName || 'package.nuspec';
            if (specText) h.download(specName, specText, 'application/xml');
          }
        }
      ]
    });
  };

  /**
   * Render the NuGet package details
   */
  function renderNupkg(zip, h) {
    var nuspecFile = null;
    var fileList = [];

    zip.forEach(function (relativePath, file) {
      fileList.push({ path: relativePath, size: file._data ? file._data.uncompressedSize : 0 });
      if (relativePath.toLowerCase().endsWith('.nuspec')) {
        nuspecFile = file;
      }
    });

    if (!nuspecFile) {
      h.showError('Incomplete package', 'No .nuspec file found inside the package.');
      return;
    }

    h.setState('specName', nuspecFile.name);

    nuspecFile.async('string').then(function (xmlStr) {
      h.setState('specText', xmlStr);
      var parser = new DOMParser();
      var xmlDoc = parser.parseFromString(xmlStr, 'text/xml');
      var metadata = xmlDoc.getElementsByTagName('metadata')[0];

      if (!metadata) {
        h.showError('Invalid .nuspec', 'Metadata section not found in .nuspec.');
        return;
      }

      var meta = {};
      var keys = ['id', 'version', 'authors', 'description', 'projectUrl', 'licenseUrl', 'tags', 'dependencies', 'owners', 'releaseNotes', 'copyright', 'summary'];
      keys.forEach(function (key) {
        var el = metadata.getElementsByTagName(key)[0];
        if (el) {
          if (key === 'dependencies') {
            var deps = Array.from(el.getElementsByTagName('dependency')).map(function (d) {
              return d.getAttribute('id') + ' (' + (d.getAttribute('version') || '*') + ')';
            });
            meta[key] = deps.join(', ');
          } else {
            meta[key] = el.textContent.trim();
          }
        }
      });

      h.setState('metadata', meta);

      var html = '<div class="p-6 space-y-8">';

      // Header Info
      html += '<div class="flex items-start gap-4">' +
        '<div class="w-16 h-16 bg-brand-50 rounded-xl flex items-center justify-center text-3xl">📦</div>' +
        '<div>' +
          '<h2 class="text-xl font-bold text-surface-900">' + esc(meta.id || 'Unknown Package') + '</h2>' +
          '<p class="text-brand-600 font-medium">' + esc(meta.version || '0.0.0') + '</p>' +
        '</div>' +
      '</div>';

      // Meta Grid
      html += '<div class="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4 border-t border-b border-surface-100 py-6">';
      if (meta.authors) html += '<div><span class="text-xs uppercase font-semibold text-surface-400">Authors</span><p class="text-surface-700">' + esc(meta.authors) + '</p></div>';
      if (meta.owners) html += '<div><span class="text-xs uppercase font-semibold text-surface-400">Owners</span><p class="text-surface-700">' + esc(meta.owners) + '</p></div>';
      if (meta.tags) html += '<div><span class="text-xs uppercase font-semibold text-surface-400">Tags</span><p class="text-surface-700">' + esc(meta.tags) + '</p></div>';
      if (meta.copyright) html += '<div><span class="text-xs uppercase font-semibold text-surface-400">Copyright</span><p class="text-surface-700">' + esc(meta.copyright) + '</p></div>';
      if (meta.projectUrl) html += '<div class="md:col-span-2"><span class="text-xs uppercase font-semibold text-surface-400">Project URL</span><p><a href="' + esc(meta.projectUrl) + '" target="_blank" class="text-brand-600 hover:underline break-all">' + esc(meta.projectUrl) + '</a></p></div>';
      if (meta.dependencies) html += '<div class="md:col-span-2"><span class="text-xs uppercase font-semibold text-surface-400">Dependencies</span><p class="text-surface-600 text-sm mt-1">' + esc(meta.dependencies) + '</p></div>';
      html += '</div>';

      // Description
      if (meta.description) {
        html += '<div>' +
          '<h3 class="text-sm font-semibold text-surface-900 mb-2">Description</h3>' +
          '<div class="text-surface-600 leading-relaxed text-sm bg-surface-50 p-4 rounded-lg whitespace-pre-wrap">' + esc(meta.description) + '</div>' +
        '</div>';
      }

      // File List
      html += '<div>' +
        '<h3 class="text-sm font-semibold text-surface-900 mb-2">Package Contents (' + fileList.length + ')</h3>' +
        '<div class="max-h-80 overflow-y-auto border border-surface-100 rounded-lg">' +
          '<table class="w-full text-left text-xs border-collapse">' +
            '<thead class="bg-surface-50 sticky top-0">' +
              '<tr><th class="p-2 border-b">Path</th><th class="p-2 border-b text-right">Size</th></tr>' +
            '</thead>' +
            '<tbody>' +
              fileList.sort(function (a, b) { return a.path.localeCompare(b.path); }).map(function (f) {
                return '<tr class="hover:bg-surface-50"><td class="p-2 border-b font-mono">' + esc(f.path) + '</td><td class="p-2 border-b text-right text-surface-400">' + formatSize(f.size) + '</td></tr>';
              }).join('') +
            '</tbody>' +
          '</table>' +
        '</div>' +
      '</div>';

      html += '</div>';
      h.render(html);
    }).catch(function (err) {
      h.showError('Failed to read .nuspec', err.message);
    });
  }

  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    var k = 1024;
    var sizes = ['B', 'KB', 'MB', 'GB'];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function esc(str) {
    if (!str) return '';
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

})();
