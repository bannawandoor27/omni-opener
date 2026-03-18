/**
 * OmniOpener — Tool SDK (ToolBase)
 *
 * Shared framework for all tools. Handles:
 *  - Drag-and-drop zone
 *  - Click-to-browse file input
 *  - Global drop handoff (window.__droppedFile)
 *  - Loading state & error display
 *  - Extensible action bar (buttons)
 *  - Info footer
 *
 * Usage in a tool script:
 *
 *   window.initTool = function(toolConfig, mountEl) {
 *     OmniTool.create(mountEl, toolConfig, {
 *       accept: '.csv,.tsv',
 *       onFile: function(file, content, helpers) {
 *         // content is the file text (or ArrayBuffer if binary:true)
 *         helpers.render('<table>...</table>');
 *       },
 *       actions: [
 *         { label: '📋 Copy', id: 'copy', onClick: function(helpers) { ... } },
 *         { label: '📥 Download', id: 'dl', onClick: function(helpers) { ... } },
 *       ],
 *       // Optional overrides:
 *       binary: false,           // true → FileReader reads as ArrayBuffer
 *       dropLabel: 'Drop a CSV file here',
 *       dropSub: 'or click to browse',
 *       infoHtml: '<strong>Privacy:</strong> All processing happens in your browser.',
 *       // Optional lifecycle hooks:
 *       onInit: function(helpers) {},         // called once after mount
 *       onDestroy: function() {},             // called on cleanup
 *     });
 *   };
 */
(function () {
  'use strict';

  var OmniTool = {};

  /**
   * Create a tool instance.
   * @param {HTMLElement} mountEl   - The #tool-mount element
   * @param {Object}      config   - Tool metadata from config.json
   * @param {Object}      opts     - Tool-specific options
   */
  OmniTool.create = function (mountEl, config, opts) {
    opts = opts || {};
    var accept = opts.accept || (config.formats || []).map(function (f) { return f; }).join(',');
    var binary = opts.binary || false;
    var dropLabel = opts.dropLabel || 'Drop a file here';
    var dropSub = opts.dropSub || 'or click to browse';
    var infoHtml = opts.infoHtml || '<strong>Privacy:</strong> Everything runs 100% client-side. No data leaves your device.';
    var actions = opts.actions || [];

    // State
    var state = { file: null, content: null, rendered: false };

    // ── Build DOM ────────────────────────────────────────
    mountEl.innerHTML = '';

    // Drop zone
    var dropZone = el('div', {
      id: 'omni-drop',
      className: 'drop-zone border-2 border-dashed border-surface-300 rounded-2xl p-10 text-center cursor-pointer hover:border-brand-400 transition-all'
    });
    dropZone.innerHTML =
      '<div class="flex flex-col items-center gap-3">' +
        '<span class="text-4xl">' + (config.icon || '📁') + '</span>' +
        '<p class="font-semibold text-surface-700">' + esc(dropLabel) + '</p>' +
        '<p class="text-sm text-surface-400">' + esc(dropSub) + '</p>' +
      '</div>';

    var fileInput = el('input', { type: 'file', accept: accept, className: 'hidden', id: 'omni-file-input' });
    dropZone.appendChild(fileInput);

    // Action bar (hidden until file loaded)
    var actionBar = el('div', {
      id: 'omni-actions',
      className: 'hidden flex items-center gap-3 flex-wrap'
    });
    var filenameSpan = el('span', { id: 'omni-filename', className: 'ml-auto text-sm text-surface-400 truncate max-w-xs' });

    // Render area
    var renderArea = el('div', {
      id: 'omni-render',
      className: 'hidden rounded-xl border border-surface-200 bg-white overflow-auto',
      style: 'min-height: 400px;'
    });

    // Info footer
    var infoArea = el('div', {
      className: 'bg-surface-50 rounded-xl p-4 text-sm text-surface-500'
    });
    infoArea.innerHTML = infoHtml;

    // Assemble
    var wrapper = el('div', { className: 'space-y-6' });
    wrapper.appendChild(dropZone);
    wrapper.appendChild(actionBar);
    wrapper.appendChild(renderArea);
    wrapper.appendChild(infoArea);
    mountEl.appendChild(wrapper);

    // ── Helpers object (passed to callbacks) ─────────────
    var helpers = {
      /** Replace render area content */
      render: function (html) {
        renderArea.innerHTML = html;
        renderArea.classList.remove('hidden');
        dropZone.classList.add('hidden');
        actionBar.classList.remove('hidden');
        state.rendered = true;
      },
      /** Append to render area */
      append: function (html) {
        renderArea.insertAdjacentHTML('beforeend', html);
      },
      /** Get the render area DOM element */
      getRenderEl: function () { return renderArea; },
      /** Get the mount element */
      getMountEl: function () { return mountEl; },
      /** Show loading spinner in render area */
      showLoading: function (msg) {
        renderArea.classList.remove('hidden');
        renderArea.innerHTML =
          '<div class="flex items-center justify-center h-64 text-surface-400">' +
            '<svg class="animate-spin w-6 h-6 mr-3" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>' +
            '<span>' + esc(msg || 'Processing…') + '</span>' +
          '</div>';
      },
      /** Show error in render area */
      showError: function (title, detail) {
        renderArea.classList.remove('hidden');
        renderArea.innerHTML =
          '<div class="p-8 text-center">' +
            '<p class="text-red-500 font-medium">' + esc(title) + '</p>' +
            (detail ? '<p class="text-sm text-surface-400 mt-1">' + esc(detail) + '</p>' : '') +
          '</div>';
      },
      /** Hide loading spinner / clear render area */
      hideLoading: function () {
        renderArea.innerHTML = '';
        renderArea.classList.add('hidden');
        dropZone.classList.remove('hidden');
        actionBar.classList.add('hidden');
      },
      /** Get current file */
      getFile: function () { return state.file; },
      /** Get current file content */
      getContent: function () { return state.content; },
      /** Get current state */
      getState: function () { return state; },
      /** Set arbitrary state key or merge object */
      setState: function (key, val) {
        if (typeof key === 'object' && key !== null) {
          for (var k in key) { state[k] = key[k]; }
        } else {
          state[key] = val;
        }
      },
      /** Dynamically load a script from CDN */
      loadScript: function (src, cb) {
        if (document.querySelector('script[src="' + src + '"]')) {
          if (cb) cb();
          return;
        }
        var s = document.createElement('script');
        s.src = src;
        // Support ESM modules if URL contains /esm/ or ends with .mjs or .module.js or from certain providers
        if (src.indexOf('/esm/') !== -1 || src.indexOf('.mjs') !== -1 || src.indexOf('.module.js') !== -1 || src.indexOf('pdf.min.mjs') !== -1) {
          s.type = 'module';
        }
        s.crossOrigin = 'anonymous'; // Essential for ESM and better error reports
        s.onload = function () { if (cb) cb(); };
        s.onerror = function () { helpers.showError('Failed to load dependency', src); };
        document.head.appendChild(s);
      },
      /** Dynamically load multiple scripts in order */
      loadScripts: function (scripts, cb) {
        var self = this;
        function loadNext(index) {
          if (index >= scripts.length) {
            if (cb) cb();
            return;
          }
          self.loadScript(scripts[index], function () {
            loadNext(index + 1);
          });
        }
        loadNext(0);
      },
      /** Dynamically load a CSS file */
      loadCSS: function (href) {
        if (document.querySelector('link[href="' + href + '"]')) return;
        var l = document.createElement('link');
        l.rel = 'stylesheet';
        l.href = href;
        document.head.appendChild(l);
      },
      /** Trigger a file download */
      download: function (filename, content, mimeType) {
        var blob = (content instanceof Blob) ? content : new Blob([content], { type: mimeType || 'text/plain' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      },
      /** Copy text to clipboard */
      copyToClipboard: function (text, btnEl) {
        navigator.clipboard.writeText(text).then(function () {
          if (btnEl) {
            var orig = btnEl.textContent;
            btnEl.textContent = '✓ Copied!';
            setTimeout(function () { btnEl.textContent = orig; }, 1500);
          }
        });
      },
      /** Reset to the drop zone state */
      reset: function () {
        state = { file: null, content: null, rendered: false };
        dropZone.classList.remove('hidden');
        renderArea.classList.add('hidden');
        renderArea.innerHTML = '';
        actionBar.classList.add('hidden');
        filenameSpan.textContent = '';
      },
      /** Access the config object */
      config: config
    };

    // ── Build action buttons ─────────────────────────────
    actions.forEach(function (a) {
      var btn = el('button', {
        id: a.id ? 'omni-action-' + a.id : undefined,
        className: 'px-3 py-1.5 rounded-lg border border-surface-200 bg-white text-sm font-medium hover:bg-surface-50 transition-colors'
      });
      btn.textContent = a.label;
      btn.addEventListener('click', function () {
        if (a.onClick) a.onClick(helpers, btn);
      });
      actionBar.appendChild(btn);
    });

    // Reset button
    var resetBtn = el('button', {
      className: 'px-3 py-1.5 rounded-lg border border-surface-200 bg-white text-sm font-medium hover:bg-surface-50 transition-colors'
    });
    resetBtn.textContent = '🔄 New File';
    resetBtn.addEventListener('click', function () {
      helpers.reset();
      if (opts.onInit) opts.onInit(helpers);
    });
    actionBar.appendChild(resetBtn);
    actionBar.appendChild(filenameSpan);

    // ── File handling ────────────────────────────────────
    function processFile(file) {
      state.file = file;
      filenameSpan.textContent = file.name;

      var reader = new FileReader();
      reader.onload = function (e) {
        state.content = e.target.result;
        try {
          if (opts.onFile) opts.onFile(file, state.content, helpers);
        } catch (err) {
          helpers.showError('Failed to process file', err.message);
        }
      };
      reader.onerror = function () {
        helpers.showError('Failed to read file', 'The file could not be read.');
      };

      if (binary) {
        reader.readAsArrayBuffer(file);
      } else {
        reader.readAsText(file);
      }
    }

    // Click to browse
    dropZone.addEventListener('click', function (e) {
      if (e.target !== fileInput) fileInput.click();
    });
    fileInput.addEventListener('change', function (e) {
      if (e.target.files[0]) processFile(e.target.files[0]);
    });

    // Drag and drop
    ['dragenter', 'dragover'].forEach(function (evt) {
      dropZone.addEventListener(evt, function (e) { e.preventDefault(); dropZone.classList.add('drag-over'); });
    });
    ['dragleave', 'drop'].forEach(function (evt) {
      dropZone.addEventListener(evt, function (e) { e.preventDefault(); dropZone.classList.remove('drag-over'); });
    });
    dropZone.addEventListener('drop', function (e) {
      if (e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]);
    });

    // Global drop handoff
    if (window.__droppedFile) {
      processFile(window.__droppedFile);
      window.__droppedFile = null;
    }

    // ── Lifecycle ────────────────────────────────────────
    if (opts.onInit) {
      var res = opts.onInit(helpers);
      if (res && res.then) {
        res.catch(function (err) {
          helpers.showError('Initialization Error', err.message);
        });
      }
    }

    return helpers;
  };

  // ── Utilities ──────────────────────────────────────────
  function el(tag, attrs) {
    var e = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'className') e.className = attrs[k];
        else if (k === 'style') e.style.cssText = attrs[k];
        else if (attrs[k] !== undefined) e.setAttribute(k, attrs[k]);
      });
    }
    return e;
  }

  function esc(str) {
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // Expose globally
  window.OmniTool = OmniTool;
})();
