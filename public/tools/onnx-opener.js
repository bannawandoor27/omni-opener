(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.onnx',
      binary: true,
      infoHtml: '<strong>ONNX Viewer:</strong> Inspect ONNX (Open Neural Network Exchange) models directly in your browser. View model metadata, input/output shapes, and operator versions without uploading any data.',
      
      actions: [
        {
          label: '📋 Copy Metadata',
          id: 'copy-json',
          onClick: function (h, btn) {
            const state = h.getState();
            if (state && state.metadata) {
              h.copyToClipboard(JSON.stringify(state.metadata, null, 2), btn);
            } else {
              h.showError('No data', 'Please load an ONNX file first.');
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
              h.showError('No data', 'Please load an ONNX file first.');
            }
          }
        }
      ],

      onInit: function (h) {
        h.showLoading('Preparing ONNX runtime...');
        h.loadScript('https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.1/dist/ort.min.js', function() {
          h.hideLoading();
        });
      },

      onFile: function (file, content, h) {
        const loadModel = async () => {
          h.showLoading('Analyzing ONNX model structure...');
          
          try {
            if (typeof ort === 'undefined') {
              await new Promise((resolve, reject) => {
                h.loadScript('https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.1/dist/ort.min.js', function() {
                  if (typeof ort !== 'undefined') resolve();
                  else reject(new Error('Failed to load ONNX Runtime library.'));
                });
              });
            }

            // Optimization: we only need the model metadata, so we use a session
            // with WASM execution provider. We don't actually run inference.
            const session = await ort.InferenceSession.create(content, {
              executionProviders: ['wasm'],
              logSeverityLevel: 4
            });

            const metadata = {
              name: file.name,
              size: file.size,
              producer: session.handler?.model?.producerName || 'Unknown',
              producerVersion: session.handler?.model?.producerVersion || 'Unknown',
              modelVersion: session.handler?.model?.modelVersion || 'Unknown',
              domain: session.handler?.model?.domain || 'Unknown',
              description: session.handler?.model?.docString || '',
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
            console.error('[ONNX Error]', err);
            h.showError('Could not open ONNX file', 'The model might be corrupted, use an unsupported Opset, or exceed browser memory limits. Error: ' + err.message);
          } finally {
            h.hideLoading();
          }
        };

        loadModel();
      }
    });
  };

  function render(h) {
    const state = h.getState();
    const meta = state.metadata;
    const filter = (state.filter || '').toLowerCase();

    const filteredInputs = meta.inputs.filter(i => 
      i.name.toLowerCase().includes(filter) || i.type.toLowerCase().includes(filter)
    );
    const filteredOutputs = meta.outputs.filter(o => 
      o.name.toLowerCase().includes(filter) || o.type.toLowerCase().includes(filter)
    );

    const html = `
      <div class="max-w-5xl mx-auto p-4 md:p-6 animate-in fade-in duration-500">
        <!-- U1. File Info Bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-100">
          <span class="font-semibold text-surface-800">${esc(meta.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatBytes(meta.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">.onnx model</span>
          <span class="ml-auto px-2 py-0.5 bg-brand-100 text-brand-700 rounded text-xs font-medium">${esc(meta.producer)} ${esc(meta.producerVersion)}</span>
        </div>

        <!-- Summary Grid -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          ${renderStatCard('Inputs', meta.inputs.length, 'bg-blue-50 text-blue-700')}
          ${renderStatCard('Outputs', meta.outputs.length, 'bg-green-50 text-green-700')}
          ${renderStatCard('Model Version', meta.modelVersion, 'bg-purple-50 text-purple-700')}
          ${renderStatCard('Domain', meta.domain || 'ai.onnx', 'bg-orange-50 text-orange-700')}
        </div>

        <!-- Search Bar -->
        <div class="relative mb-6">
          <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg class="h-4 w-4 text-surface-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input type="text" 
                 placeholder="Search inputs, outputs, or types..." 
                 value="${esc(state.filter)}"
                 oninput="OmniTool.handleEvent(event, 'setFilter')"
                 class="block w-full pl-10 pr-3 py-2 border border-surface-200 rounded-xl bg-white text-sm placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
          >
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <!-- Inputs Table -->
          <section>
            <div class="flex items-center justify-between mb-3 px-1">
              <h3 class="font-bold text-surface-800 flex items-center gap-2">
                <span class="w-1.5 h-5 bg-blue-500 rounded-full"></span>
                Model Inputs
              </h3>
              <span class="text-xs bg-surface-100 text-surface-600 px-2 py-0.5 rounded-full">${filteredInputs.length} items</span>
            </div>
            <div class="overflow-x-auto rounded-xl border border-surface-200 bg-white shadow-sm">
              <table class="min-w-full text-sm">
                <thead>
                  <tr class="bg-surface-50/50 border-b border-surface-200">
                    <th class="px-4 py-3 text-left font-semibold text-surface-700">Name</th>
                    <th class="px-4 py-3 text-left font-semibold text-surface-700">Type</th>
                    <th class="px-4 py-3 text-left font-semibold text-surface-700">Shape</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-surface-100">
                  ${filteredInputs.length ? filteredInputs.map(renderRow).join('') : renderEmptyRow(3)}
                </tbody>
              </table>
            </div>
          </section>

          <!-- Outputs Table -->
          <section>
            <div class="flex items-center justify-between mb-3 px-1">
              <h3 class="font-bold text-surface-800 flex items-center gap-2">
                <span class="w-1.5 h-5 bg-green-500 rounded-full"></span>
                Model Outputs
              </h3>
              <span class="text-xs bg-surface-100 text-surface-600 px-2 py-0.5 rounded-full">${filteredOutputs.length} items</span>
            </div>
            <div class="overflow-x-auto rounded-xl border border-surface-200 bg-white shadow-sm">
              <table class="min-w-full text-sm">
                <thead>
                  <tr class="bg-surface-50/50 border-b border-surface-200">
                    <th class="px-4 py-3 text-left font-semibold text-surface-700">Name</th>
                    <th class="px-4 py-3 text-left font-semibold text-surface-700">Type</th>
                    <th class="px-4 py-3 text-left font-semibold text-surface-700">Shape</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-surface-100">
                  ${filteredOutputs.length ? filteredOutputs.map(renderRow).join('') : renderEmptyRow(3)}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        ${meta.description ? `
          <section class="mt-8">
            <h3 class="font-bold text-surface-800 mb-3 px-1">Model Description</h3>
            <div class="rounded-xl border border-surface-200 p-5 bg-surface-50/30 text-surface-600 text-sm leading-relaxed whitespace-pre-wrap">
              ${esc(meta.description)}
            </div>
          </section>
        ` : ''}
      </div>
    `;

    h.render(html);
  }

  function renderStatCard(label, value, colorClass) {
    return `
      <div class="rounded-xl border border-surface-200 p-4 bg-white shadow-sm hover:border-brand-300 transition-all group">
        <p class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1 group-hover:text-brand-500 transition-colors">${label}</p>
        <div class="flex items-center gap-2">
          <span class="text-xl font-bold text-surface-800 truncate">${esc(value)}</span>
          <span class="w-1.5 h-1.5 rounded-full ${colorClass.split(' ')[0].replace('bg-', 'bg-').replace('-50', '-500')}"></span>
        </div>
      </div>
    `;
  }

  function renderRow(item) {
    const shape = item.dims ? `[${item.dims.join(', ')}]` : 'N/A';
    return `
      <tr class="hover:bg-brand-50/30 transition-colors group">
        <td class="px-4 py-3 font-mono text-xs text-brand-700 font-medium break-all">${esc(item.name)}</td>
        <td class="px-4 py-3">
          <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-surface-100 text-surface-600 uppercase">
            ${esc(item.type)}
          </span>
        </td>
        <td class="px-4 py-3 font-mono text-xs text-surface-500">${esc(shape)}</td>
      </tr>
    `;
  }

  function renderEmptyRow(cols) {
    return `
      <tr>
        <td colspan="${cols}" class="px-4 py-8 text-center text-surface-400 text-sm">
          No matches found for the current filter
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
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  }

  window.setFilter = function(event) {
    const h = OmniTool.getHandler(event);
    h.setState({ filter: event.target.value });
    render(h);
  };

})();
