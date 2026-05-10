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
      infoHtml: '<strong>ONNX Viewer:</strong> Inspect deep learning models. View architecture, metadata, input/output tensors, and node properties directly in your browser.',

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
        h.showLoading('Preparing environment...');
        h.loadScript('https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.1/dist/ort.min.js', function () {
          ortReady = true;
          h.hideLoading();
        });
      },

      onFile: function _onFile(file, content, h) {
        const analyzeModel = async () => {
          h.showLoading('Analyzing model architecture...');
          
          try {
            // B1 & B4: Ensure ort is loaded
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

            // Using WASM provider for metadata inspection as it's most compatible
            // B3: Proper await for async library call
            const session = await ort.InferenceSession.create(content, {
              executionProviders: ['wasm'],
              logSeverityLevel: 4
            });

            // Extract session metadata safely
            // We use optional chaining and defaults to prevent crashes
            const metadata = {
              name: file.name,
              size: file.size,
              inputs: (session.inputNames || []).map(name => ({
                name,
                dims: session.inputMetadata[name]?.dims || [],
                type: session.inputMetadata[name]?.type || 'unknown'
              })),
              outputs: (session.outputNames || []).map(name => ({
                name,
                dims: session.outputMetadata[name]?.dims || [],
                type: session.outputMetadata[name]?.type || 'unknown'
              })),
              producer: session.handler?.model?.producerName || 'Unknown',
              producerVersion: session.handler?.model?.producerVersion || 'N/A',
              modelVersion: session.handler?.model?.modelVersion || 'N/A',
              irVersion: session.handler?.model?.irVersion || 'N/A',
              description: session.handler?.model?.docString || ''
            };

            h.setState({ metadata, filter: '' });
            render(h);
          } catch (err) {
            console.error('[ONNX Opener Error]', err);
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
        // B5: Cleanup
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
      <div class="p-4 md:p-6 max-w-7xl mx-auto">
        <!-- U1. File info bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-100">
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

        <!-- Summary Cards -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          ${renderStatCard('Inputs', meta.inputs.length, 'blue')}
          ${renderStatCard('Outputs', meta.outputs.length, 'emerald')}
          ${renderStatCard('Producer', meta.producer, 'purple')}
          ${renderStatCard('Model Ver', meta.modelVersion, 'amber')}
        </div>

        <!-- U4/DATA. Search / Filter -->
        <div class="mb-8">
          <div class="relative group">
            <input type="text" 
              placeholder="Search tensors by name, type or shape (e.g. 'float32', '1,3,224')..." 
              value="${esc(state.filter)}"
              oninput="OmniTool.handleEvent(event, 'updateFilter')"
              class="w-full pl-11 pr-4 py-3 bg-white border border-surface-200 rounded-2xl text-sm focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 outline-none transition-all shadow-sm group-hover:border-surface-300"
            >
            <div class="absolute left-4 top-3.5 text-surface-400 group-focus-within:text-brand-500 transition-colors">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 xl:grid-cols-2 gap-8">
          <!-- Inputs Section -->
          <div>
            <div class="flex items-center justify-between mb-4">
              <h3 class="font-bold text-surface-900 flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-blue-500"></span>
                Input Tensors
              </h3>
              <span class="text-xs font-bold bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full">${filteredInputs.length} items</span>
            </div>
            ${renderTensorTable(filteredInputs, 'Inputs')}
          </div>

          <!-- Outputs Section -->
          <div>
            <div class="flex items-center justify-between mb-4">
              <h3 class="font-bold text-surface-900 flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
                Output Tensors
              </h3>
              <span class="text-xs font-bold bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full">${filteredOutputs.length} items</span>
            </div>
            ${renderTensorTable(filteredOutputs, 'Outputs')}
          </div>
        </div>

        <!-- Model Metadata Details -->
        <div class="mt-12 pt-8 border-t border-surface-200">
          <h3 class="font-bold text-surface-900 mb-6 flex items-center gap-2">
            <svg class="w-5 h-5 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            Model Architecture Details
          </h3>
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div class="lg:col-span-1 space-y-4">
              ${renderMetaItem('Producer', meta.producer)}
              ${renderMetaItem('Producer Version', meta.producerVersion)}
              ${renderMetaItem('IR Version', meta.irVersion)}
              ${renderMetaItem('Model Version', meta.modelVersion)}
            </div>
            <div class="lg:col-span-2">
              <div class="rounded-2xl border border-surface-200 p-5 bg-surface-50/30 h-full">
                <h4 class="text-[10px] font-bold text-surface-400 uppercase mb-3 tracking-widest">Model Documentation</h4>
                <div class="text-sm text-surface-600 leading-relaxed whitespace-pre-wrap">
                  ${meta.description ? esc(meta.description) : '<span class="italic text-surface-400">No description provided in this model.</span>'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    h.render(html);
  }

  function renderStatCard(label, value, color) {
    const colorClasses = {
      blue: 'bg-blue-50/50 text-blue-700 border-blue-100 ring-blue-500/5',
      emerald: 'bg-emerald-50/50 text-emerald-700 border-emerald-100 ring-emerald-500/5',
      purple: 'bg-purple-50/50 text-purple-700 border-purple-100 ring-purple-500/5',
      amber: 'bg-amber-50/50 text-amber-700 border-amber-100 ring-amber-500/5'
    };
    
    return `
      <div class="rounded-2xl border p-5 shadow-sm transition-all hover:shadow-md ${colorClasses[color] || 'bg-surface-50 border-surface-200 ring-surface-500/5'}">
        <div class="text-[10px] font-bold uppercase tracking-widest opacity-60 mb-2">${label}</div>
        <div class="text-2xl font-black truncate tracking-tight">${esc(value)}</div>
      </div>
    `;
  }

  function renderMetaItem(label, value) {
    return `
      <div class="flex items-center justify-between p-3.5 rounded-xl border border-surface-100 bg-white shadow-sm hover:border-brand-200 transition-colors">
        <span class="text-xs font-semibold text-surface-500">${label}</span>
        <span class="text-sm font-bold text-surface-800">${esc(value)}</span>
      </div>
    `;
  }

  function renderTensorTable(tensors, type) {
    if (tensors.length === 0) {
      return `
        <div class="rounded-2xl border-2 border-dashed border-surface-200 p-12 text-center">
          <div class="inline-flex items-center justify-center w-12 h-12 rounded-full bg-surface-50 text-surface-400 mb-3">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </div>
          <p class="text-surface-500 text-sm font-medium">No ${type.toLowerCase()} match your search</p>
        </div>
      `;
    }

    // U7. Tables implementation
    return `
      <div class="overflow-hidden rounded-2xl border border-surface-200 shadow-sm">
        <div class="overflow-x-auto">
          <table class="min-w-full text-sm divide-y divide-surface-200">
            <thead class="bg-surface-50/80 backdrop-blur-sm">
              <tr>
                <th class="px-4 py-3.5 text-left font-bold text-surface-600 uppercase tracking-wider text-[10px]">Name</th>
                <th class="px-4 py-3.5 text-left font-bold text-surface-600 uppercase tracking-wider text-[10px]">Type</th>
                <th class="px-4 py-3.5 text-left font-bold text-surface-600 uppercase tracking-wider text-[10px]">Shape</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-surface-100">
              ${tensors.map(t => `
                <tr class="group hover:bg-brand-50/30 transition-colors">
                  <td class="px-4 py-3 text-surface-700 font-mono text-xs break-all max-w-[200px]">${esc(t.name)}</td>
                  <td class="px-4 py-3">
                    <span class="inline-flex items-center px-2.5 py-1 rounded-md bg-surface-100 text-surface-700 text-[10px] font-bold border border-surface-200/50">
                      ${esc(t.type)}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-surface-600 font-mono text-xs whitespace-nowrap">
                    <span class="text-brand-600 font-bold">${t.dims && t.dims.length > 0 ? `[${t.dims.join(', ')}]` : '<span class="text-surface-400 italic">scalar</span>'}</span>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
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

  // B8. Named function reference for events to avoid strict mode "this" issues
  window.updateFilter = function _updateFilter(event) {
    const h = OmniTool.getHandler(event);
    h.setState({ filter: event.target.value });
    render(h);
  };

})();
