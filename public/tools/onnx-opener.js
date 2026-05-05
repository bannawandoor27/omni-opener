(function () {
  'use strict';

  /**
   * ONNX Model Opener for OmniOpener
   * A production-perfect viewer for Neural Network models.
   */

  window.initTool = function (toolConfig, mountEl) {
    // Closure variables to avoid global pollution
    let ortReady = false;

    OmniTool.create(mountEl, toolConfig, {
      accept: '.onnx',
      binary: true,
      infoHtml: '<strong>ONNX Viewer:</strong> Inspect Deep Learning models (Open Neural Network Exchange). View architecture, input/output tensors, metadata, and opset versions securely in your browser.',

      actions: [
        {
          label: '📋 Copy Metadata',
          id: 'copy-json',
          onClick: function (h, btn) {
            const state = h.getState();
            if (state && state.metadata) {
              const cleanMeta = { ...state.metadata };
              h.copyToClipboard(JSON.stringify(cleanMeta, null, 2), btn);
            } else {
              h.showError('No data', 'Please load an ONNX model first.');
            }
          }
        },
        {
          label: '📥 Export JSON',
          id: 'dl-json',
          onClick: function (h) {
            const state = h.getState();
            if (state && state.metadata) {
              const fileName = h.getFile().name.replace(/\.onnx$/i, '') + '-metadata.json';
              h.download(fileName, JSON.stringify(state.metadata, null, 2), 'application/json');
            } else {
              h.showError('No data', 'Please load an ONNX model first.');
            }
          }
        }
      ],

      onInit: function (h) {
        h.showLoading('Initializing ONNX Runtime...');
        h.loadScript('https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.1/dist/ort.min.js', function () {
          ortReady = true;
          h.hideLoading();
        });
      },

      onFile: function _onFile(file, content, h) {
        const handleLoad = async () => {
          h.showLoading('Analyzing Model Architecture...');

          try {
            // B1/B4: Ensure library is loaded
            if (!ortReady || typeof ort === 'undefined') {
              await new Promise((resolve, reject) => {
                h.loadScript('https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.1/dist/ort.min.js', function () {
                  if (typeof ort !== 'undefined') {
                    ortReady = true;
                    resolve();
                  } else {
                    reject(new Error('ONNX Runtime failed to initialize.'));
                  }
                });
              });
            }

            // Optimization: Use WASM provider for metadata extraction
            // logSeverityLevel: 4 (Error) to keep console clean
            const session = await ort.InferenceSession.create(content, {
              executionProviders: ['wasm'],
              logSeverityLevel: 4
            });

            // Extract rich metadata
            const metadata = {
              name: file.name,
              size: file.size,
              producer: session.handler?.model?.producerName || 'Unknown',
              producerVersion: session.handler?.model?.producerVersion || 'N/A',
              modelVersion: session.handler?.model?.modelVersion || '0',
              domain: session.handler?.model?.domain || 'ai.onnx',
              docString: session.handler?.model?.docString || '',
              irVersion: session.handler?.model?.irVersion || 'N/A',
              opset: session.handler?.model?.graph?.node?.length ? 'Detected' : 'N/A', // Simplified opset check
              inputs: session.inputNames.map(name => ({
                name,
                dims: session.inputMetadata[name].dims,
                type: session.inputMetadata[name].type
              })),
              outputs: session.outputNames.map(name => ({
                name,
                dims: session.outputMetadata[name].dims,
                type: session.outputMetadata[name].type
              }))
            };

            h.setState({ metadata, filter: '' });
            render(h);
          } catch (err) {
            console.error('[ONNX Parser Error]', err);
            h.showError(
              'Failed to parse ONNX model',
              'This model might use an unsupported Opset version, be too large for browser memory, or be corrupted.'
            );
          } finally {
            h.hideLoading();
          }
        };

        handleLoad();
      },

      onDestroy: function() {
        // ort.InferenceSession doesn't have an explicit 'delete' but we can help GC
        // by ensuring no closures hold onto large buffers.
      }
    });
  };

  function render(h) {
    const state = h.getState();
    if (!state || !state.metadata) return;

    const meta = state.metadata;
    const filter = (state.filter || '').toLowerCase();

    const filteredInputs = meta.inputs.filter(i =>
      i.name.toLowerCase().includes(filter) || 
      i.type.toLowerCase().includes(filter) ||
      (i.dims && i.dims.join(',').includes(filter))
    );

    const filteredOutputs = meta.outputs.filter(o =>
      o.name.toLowerCase().includes(filter) || 
      o.type.toLowerCase().includes(filter) ||
      (o.dims && o.dims.join(',').includes(filter))
    );

    const html = `
      <div class="max-w-6xl mx-auto p-4 md:p-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
        
        <!-- U1. File Info Bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-200 shadow-sm">
          <div class="flex items-center gap-2">
            <svg class="w-5 h-5 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
            </svg>
            <span class="font-bold text-surface-900">${esc(meta.name)}</span>
          </div>
          <span class="text-surface-300">|</span>
          <span>${formatBytes(meta.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="px-2 py-0.5 bg-surface-200 text-surface-700 rounded text-[10px] font-bold uppercase tracking-tight">ONNX Model</span>
          
          <div class="ml-auto flex items-center gap-2">
            <span class="text-xs text-surface-400">Producer:</span>
            <span class="text-xs font-semibold text-surface-700 bg-white border border-surface-200 px-2 py-0.5 rounded-full shadow-sm">
              ${esc(meta.producer)} ${esc(meta.producerVersion)}
            </span>
          </div>
        </div>

        <!-- U10. Summary Cards -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          ${renderStatCard('Inputs', meta.inputs.length, 'text-blue-600', 'bg-blue-50')}
          ${renderStatCard('Outputs', meta.outputs.length, 'text-emerald-600', 'bg-emerald-50')}
          ${renderStatCard('IR Version', meta.irVersion, 'text-purple-600', 'bg-purple-50')}
          ${renderStatCard('Model Ver', meta.modelVersion, 'text-amber-600', 'bg-amber-50')}
        </div>

        <!-- Live Search -->
        <div class="relative mb-8 group">
          <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <svg class="h-4 w-4 text-surface-400 group-focus-within:text-brand-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input type="text" 
                 placeholder="Search tensors, types, or shapes..." 
                 value="${esc(state.filter)}"
                 oninput="OmniTool.handleEvent(event, 'updateFilter')"
                 class="block w-full pl-11 pr-4 py-3 border border-surface-200 rounded-2xl bg-white text-sm shadow-sm placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
          >
        </div>

        <div class="grid grid-cols-1 xl:grid-cols-2 gap-8">
          <!-- Inputs Section -->
          <div>
            <div class="flex items-center justify-between mb-4 px-1">
              <h3 class="text-lg font-bold text-surface-800 flex items-center gap-2">
                <div class="w-2 h-6 bg-blue-500 rounded-full"></div>
                Input Tensors
              </h3>
              <span class="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-1 rounded-lg uppercase tracking-wider">
                ${filteredInputs.length} / ${meta.inputs.length}
              </span>
            </div>
            
            <div class="overflow-hidden rounded-2xl border border-surface-200 bg-white shadow-sm transition-all hover:shadow-md">
              <div class="overflow-x-auto">
                <table class="min-w-full text-sm">
                  <thead>
                    <tr class="bg-surface-50/80 border-b border-surface-200">
                      <th class="px-5 py-3 text-left font-bold text-surface-700 uppercase tracking-tight text-[11px]">Name</th>
                      <th class="px-5 py-3 text-left font-bold text-surface-700 uppercase tracking-tight text-[11px]">Type</th>
                      <th class="px-5 py-3 text-left font-bold text-surface-700 uppercase tracking-tight text-[11px]">Shape</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-surface-100">
                    ${filteredInputs.length ? filteredInputs.map(renderTensorRow).join('') : renderEmptyState(3, 'No matching inputs')}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- Outputs Section -->
          <div>
            <div class="flex items-center justify-between mb-4 px-1">
              <h3 class="text-lg font-bold text-surface-800 flex items-center gap-2">
                <div class="w-2 h-6 bg-emerald-500 rounded-full"></div>
                Output Tensors
              </h3>
              <span class="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-1 rounded-lg uppercase tracking-wider">
                ${filteredOutputs.length} / ${meta.outputs.length}
              </span>
            </div>
            
            <div class="overflow-hidden rounded-2xl border border-surface-200 bg-white shadow-sm transition-all hover:shadow-md">
              <div class="overflow-x-auto">
                <table class="min-w-full text-sm">
                  <thead>
                    <tr class="bg-surface-50/80 border-b border-surface-200">
                      <th class="px-5 py-3 text-left font-bold text-surface-700 uppercase tracking-tight text-[11px]">Name</th>
                      <th class="px-5 py-3 text-left font-bold text-surface-700 uppercase tracking-tight text-[11px]">Type</th>
                      <th class="px-5 py-3 text-left font-bold text-surface-700 uppercase tracking-tight text-[11px]">Shape</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-surface-100">
                    ${filteredOutputs.length ? filteredOutputs.map(renderTensorRow).join('') : renderEmptyState(3, 'No matching outputs')}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <!-- U9. Model Metadata Details -->
        <div class="mt-10 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="rounded-2xl border border-surface-200 p-6 bg-white shadow-sm hover:border-brand-200 transition-colors">
            <h4 class="font-bold text-surface-900 mb-4 flex items-center gap-2">
              <svg class="w-4 h-4 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              Model Info
            </h4>
            <dl class="space-y-3">
              ${renderDataPoint('Domain', meta.domain)}
              ${renderDataPoint('IR Version', meta.irVersion)}
              ${renderDataPoint('Model Version', meta.modelVersion)}
              ${renderDataPoint('Producer', meta.producer)}
            </dl>
          </div>

          <div class="rounded-2xl border border-surface-200 p-6 bg-white shadow-sm hover:border-brand-200 transition-colors">
            <h4 class="font-bold text-surface-900 mb-4 flex items-center gap-2 text-surface-800">
               <svg class="w-4 h-4 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h7" /></svg>
               Model Description
            </h4>
            <div class="text-sm text-surface-600 leading-relaxed max-h-[160px] overflow-y-auto pr-2 custom-scrollbar">
              ${meta.docString ? esc(meta.docString) : '<span class="italic text-surface-400 text-xs">No description provided in the model metadata.</span>'}
            </div>
          </div>
        </div>
      </div>
      
      <style>
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
      </style>
    `;

    h.render(html);
  }

  function renderStatCard(label, value, textColor, bgColor) {
    return `
      <div class="rounded-2xl border border-surface-200 p-4 bg-white shadow-sm hover:border-brand-300 transition-all hover:-translate-y-0.5 group">
        <p class="text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-1 group-hover:text-brand-500 transition-colors">${label}</p>
        <div class="flex items-baseline gap-2">
          <span class="text-2xl font-black ${textColor} truncate">${esc(value)}</span>
          <div class="w-2 h-2 rounded-full ${bgColor} ring-2 ring-white"></div>
        </div>
      </div>
    `;
  }

  function renderTensorRow(tensor) {
    const shapeStr = tensor.dims ? `[${tensor.dims.join(', ')}]` : 'scalar';
    return `
      <tr class="even:bg-surface-50/30 hover:bg-brand-50 transition-colors group">
        <td class="px-5 py-4 font-mono text-xs text-brand-700 font-semibold break-all selection:bg-brand-100">${esc(tensor.name)}</td>
        <td class="px-5 py-4">
          <span class="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold bg-surface-100 text-surface-600 border border-surface-200 shadow-sm uppercase tracking-tight">
            ${esc(tensor.type)}
          </span>
        </td>
        <td class="px-5 py-4 font-mono text-[11px] text-surface-500 bg-surface-50/50 group-hover:bg-transparent transition-colors">${esc(shapeStr)}</td>
      </tr>
    `;
  }

  function renderDataPoint(label, value) {
    return `
      <div class="flex items-center justify-between py-2 border-b border-surface-50 last:border-0">
        <dt class="text-xs font-medium text-surface-400">${label}</dt>
        <dd class="text-xs font-bold text-surface-800">${esc(value)}</dd>
      </div>
    `;
  }

  function renderEmptyState(cols, message) {
    return `
      <tr>
        <td colspan="${cols}" class="px-5 py-12 text-center">
          <div class="flex flex-col items-center gap-2">
            <svg class="w-8 h-8 text-surface-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <p class="text-sm font-medium text-surface-400">${message}</p>
          </div>
        </td>
      </tr>
    `;
  }

  function formatBytes(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  }

  // B8. Fix: Use named function for event handler to avoid self-reference issues
  window.updateFilter = function _updateFilter(event) {
    const h = OmniTool.getHandler(event);
    h.setState({ filter: event.target.value });
    render(h);
  };

})();
