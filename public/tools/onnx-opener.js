(function () {
  'use strict';

  /**
   * ONNX Model Opener
   * A production-grade viewer for Open Neural Network Exchange models.
   */

  window.initTool = function (toolConfig, mountEl) {
    let ortReady = false;

    OmniTool.create(mountEl, toolConfig, {
      accept: '.onnx',
      binary: true,
      infoHtml: '<strong>ONNX Viewer:</strong> Inspect deep learning models (Open Neural Network Exchange). View model architecture, metadata, input/output tensors, and shapes directly in your browser.',

      actions: [
        {
          label: '📋 Copy Metadata',
          id: 'copy-meta',
          onClick: function (h, btn) {
            const state = h.getState();
            if (!state || !state.metadata) return h.showError('No model loaded');
            h.copyToClipboard(JSON.stringify(state.metadata, null, 2), btn);
          }
        },
        {
          label: '📥 Export JSON',
          id: 'export-json',
          onClick: function (h) {
            const state = h.getState();
            if (!state || !state.metadata) return h.showError('No model loaded');
            const name = (h.getFile().name || 'model').replace(/\.onnx$/i, '') + '.json';
            h.download(name, JSON.stringify(state.metadata, null, 2), 'application/json');
          }
        }
      ],

      onInit: function (h) {
        h.showLoading('Loading ONNX Runtime...');
        h.loadScript('https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.1/dist/ort.min.js', function () {
          ortReady = true;
          h.hideLoading();
        });
      },

      onFile: function _onFile(file, content, h) {
        const analyzeModel = async () => {
          h.showLoading('Analyzing model architecture...');
          
          try {
            if (!ortReady || typeof ort === 'undefined') {
              await new Promise((resolve, reject) => {
                h.loadScript('https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.1/dist/ort.min.js', () => {
                  if (typeof ort !== 'undefined') {
                    ortReady = true;
                    resolve();
                  } else {
                    reject(new Error('ONNX Runtime failed to load'));
                  }
                });
              });
            }

            // Using WASM provider for metadata inspection
            const session = await ort.InferenceSession.create(content, {
              executionProviders: ['wasm'],
              logSeverityLevel: 4
            });

            // Extract session metadata safely
            const metadata = {
              name: file.name,
              size: file.size,
              inputs: session.inputNames.map(name => ({
                name,
                dims: session.inputMetadata[name].dims,
                type: session.inputMetadata[name].type
              })),
              outputs: session.outputNames.map(name => ({
                name,
                dims: session.outputMetadata[name].dims,
                type: session.outputMetadata[name].type
              })),
              // Attempt to reach into internals for extra model info if available
              producer: session.handler?.model?.producerName || 'Unknown',
              producerVersion: session.handler?.model?.producerVersion || 'N/A',
              modelVersion: session.handler?.model?.modelVersion || 'N/A',
              irVersion: session.handler?.model?.irVersion || 'N/A',
              description: session.handler?.model?.docString || ''
            };

            h.setState({ metadata, filter: '' });
            render(h);
          } catch (err) {
            console.error(err);
            h.showError(
              'Could not open ONNX file',
              'The model might be corrupted, use an unsupported opset, or be too large for browser memory. Ensure it is a valid .onnx file.'
            );
          } finally {
            h.hideLoading();
          }
        };

        analyzeModel();
      },

      onDestroy: function (h) {
        // Cleanup if necessary
      }
    });
  };

  function render(h) {
    const state = h.getState();
    if (!state || !state.metadata) return;

    const meta = state.metadata;
    const filter = (state.filter || '').toLowerCase();

    const filterFn = t => 
      t.name.toLowerCase().includes(filter) || 
      t.type.toLowerCase().includes(filter) || 
      (t.dims && t.dims.join(',').includes(filter));

    const filteredInputs = meta.inputs.filter(filterFn);
    const filteredOutputs = meta.outputs.filter(filterFn);

    const html = `
      <div class="p-4 md:p-6 max-w-6xl mx-auto">
        <!-- U1. File info bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 border border-surface-200">
          <span class="font-semibold text-surface-800">${esc(meta.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(meta.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">.onnx file</span>
          ${meta.irVersion !== 'N/A' ? `
            <span class="text-surface-300">|</span>
            <span class="bg-brand-100 text-brand-700 px-2 py-0.5 rounded text-[10px] font-bold">IR v${esc(meta.irVersion)}</span>
          ` : ''}
        </div>

        <!-- Summary Statistics -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          ${renderStatCard('Inputs', meta.inputs.length, 'blue')}
          ${renderStatCard('Outputs', meta.outputs.length, 'emerald')}
          ${renderStatCard('Producer', meta.producer, 'purple')}
          ${renderStatCard('Model Ver', meta.modelVersion, 'amber')}
        </div>

        <!-- Search box -->
        <div class="mb-6">
          <div class="relative">
            <input type="text" 
              placeholder="Search tensors by name, type or shape..." 
              value="${esc(state.filter)}"
              oninput="OmniTool.handleEvent(event, 'updateFilter')"
              class="w-full pl-10 pr-4 py-2 bg-white border border-surface-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all"
            >
            <div class="absolute left-3 top-2.5 text-surface-400">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <!-- Inputs Table -->
          <div>
            <div class="flex items-center justify-between mb-3">
              <h3 class="font-semibold text-surface-800">Input Tensors</h3>
              <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${filteredInputs.length} items</span>
            </div>
            ${renderTensorTable(filteredInputs)}
          </div>

          <!-- Outputs Table -->
          <div>
            <div class="flex items-center justify-between mb-3">
              <h3 class="font-semibold text-surface-800">Output Tensors</h3>
              <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${filteredOutputs.length} items</span>
            </div>
            ${renderTensorTable(filteredOutputs)}
          </div>
        </div>

        <!-- Model Metadata -->
        <div class="mt-8">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-semibold text-surface-800">Model Metadata</h3>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="rounded-xl border border-surface-200 p-4 bg-surface-50/50">
              <div class="space-y-2 text-sm">
                <div class="flex justify-between border-b border-surface-100 pb-2">
                  <span class="text-surface-500">Producer Name</span>
                  <span class="font-medium text-surface-800">${esc(meta.producer)}</span>
                </div>
                <div class="flex justify-between border-b border-surface-100 pb-2">
                  <span class="text-surface-500">Producer Version</span>
                  <span class="font-medium text-surface-800">${esc(meta.producerVersion)}</span>
                </div>
                <div class="flex justify-between border-b border-surface-100 pb-2">
                  <span class="text-surface-500">IR Version</span>
                  <span class="font-medium text-surface-800">${esc(meta.irVersion)}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-surface-500">Model Version</span>
                  <span class="font-medium text-surface-800">${esc(meta.modelVersion)}</span>
                </div>
              </div>
            </div>
            <div class="rounded-xl border border-surface-200 p-4 bg-surface-50/50">
              <h4 class="text-xs font-bold text-surface-400 uppercase mb-2 tracking-wider">Description</h4>
              <div class="text-sm text-surface-600 line-clamp-6 leading-relaxed">
                ${meta.description ? esc(meta.description) : '<span class="italic text-surface-400">No description provided in model.</span>'}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    h.render(html);
  }

  function renderStatCard(label, value, color) {
    const colors = {
      blue: 'bg-blue-50 text-blue-700 border-blue-100',
      emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
      purple: 'bg-purple-50 text-purple-700 border-purple-100',
      amber: 'bg-amber-50 text-amber-700 border-amber-100'
    };
    return `
      <div class="rounded-xl border p-4 shadow-sm ${colors[color] || 'bg-surface-50 border-surface-200'}">
        <div class="text-[10px] font-bold uppercase tracking-wider opacity-70 mb-1">${label}</div>
        <div class="text-xl font-bold truncate">${esc(value)}</div>
      </div>
    `;
  }

  function renderTensorTable(tensors) {
    if (tensors.length === 0) {
      return `
        <div class="rounded-xl border border-dashed border-surface-200 p-8 text-center text-surface-400 text-sm">
          No tensors found matching filter
        </div>
      `;
    }

    return `
      <div class="overflow-x-auto rounded-xl border border-surface-200">
        <table class="min-w-full text-sm">
          <thead>
            <tr>
              <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Name</th>
              <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Type</th>
              <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Shape</th>
            </tr>
          </thead>
          <tbody>
            ${tensors.map(t => `
              <tr class="even:bg-surface-50 hover:bg-brand-50 transition-colors">
                <td class="px-4 py-2 text-surface-700 border-b border-surface-100 font-mono text-xs break-all">${esc(t.name)}</td>
                <td class="px-4 py-2 text-surface-700 border-b border-surface-100">
                  <span class="px-2 py-0.5 rounded bg-surface-100 text-surface-600 text-[10px] font-bold">${esc(t.type)}</span>
                </td>
                <td class="px-4 py-2 text-surface-700 border-b border-surface-100 font-mono text-xs">
                  ${t.dims ? `[${t.dims.join(', ')}]` : 'scalar'}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function formatSize(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function esc(str) {
    if (!str && str !== 0) return '';
    return String(str).replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  }

  // B8. Named function to avoid "this" issues in strict mode
  window.updateFilter = function _updateFilter(event) {
    const h = OmniTool.getHandler(event);
    h.setState({ filter: event.target.value });
    render(h);
  };

})();
