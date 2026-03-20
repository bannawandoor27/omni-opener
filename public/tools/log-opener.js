/**
 * OmniOpener — Log Toolkit
 * Uses OmniTool SDK, highlight.js, and Chart.js.
 */
(function () {
  'use strict';

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.log,.txt',
      dropLabel: 'Drop a .log file here',
      binary: false,
      infoHtml: '<strong>Log Toolkit:</strong> Professional log viewer with error analysis, level filtering, and visual statistics.',
      
      onInit: function(helpers) {
        helpers.loadCSS('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css');
        helpers.loadScript('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js');
        helpers.loadScript('https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js');
      },

      actions: [
        {
          label: '📋 Copy Errors',
          id: 'copy-errors',
          onClick: function (h, btn) {
             const lines = h.getContent().split('\n');
             const errors = lines.filter(l => l.toUpperCase().includes('ERROR') || l.toUpperCase().includes('FATAL')).join('\n');
             if (errors) h.copyToClipboard(errors, btn);
             else h.showError('No errors found');
          }
        }
      ],

      onFile: function _onFile(file, content, helpers) {
        if (typeof hljs === 'undefined' || typeof Chart === 'undefined') {
          helpers.showLoading('Loading log engines...');
          setTimeout(() => _onFile(file, content, helpers), 500);
          return;
        }

        const lines = content.split(/\r?\n/);
        const stats = { error: 0, warn: 0, info: 0, debug: 0 };
        lines.forEach(l => {
           const up = l.toUpperCase();
           if (up.includes('ERROR') || up.includes('FATAL') || up.includes('FAIL')) stats.error++;
           else if (up.includes('WARN')) stats.warn++;
           else if (up.includes('DEBUG')) stats.debug++;
           else if (up.includes('INFO')) stats.info++;
        });

        helpers.render(`
          <div class="flex flex-col h-[85vh] border border-surface-200 rounded-xl overflow-hidden bg-[#0d1117] text-surface-300 shadow-xl font-mono">
            <!-- Toolbar -->
            <div class="shrink-0 bg-[#161b22] border-b border-[#30363d] px-4 py-2 flex items-center justify-between">
               <div class="flex items-center gap-4">
                  <div class="flex px-1 bg-surface-900 border border-[#30363d] rounded-lg">
                    <button id="tab-log" class="px-3 py-1 text-[10px] font-bold uppercase border-b-2 border-brand-500 text-brand-400">Logs</button>
                    <button id="tab-stats" class="px-3 py-1 text-[10px] font-bold uppercase border-b-2 border-transparent text-surface-500 hover:text-surface-300">Stats</button>
                  </div>
                  <div id="log-filters" class="flex gap-2">
                    <button data-level="error" class="log-filter px-2 py-0.5 rounded bg-red-900/30 text-red-400 text-[10px] font-bold border border-red-900/50">ERR: ${stats.error}</button>
                    <button data-level="warn" class="log-filter px-2 py-0.5 rounded bg-yellow-900/30 text-yellow-400 text-[10px] font-bold border border-yellow-900/50">WRN: ${stats.warn}</button>
                  </div>
               </div>
               <div class="relative">
                  <input type="text" id="log-highlight" placeholder="Highlight keyword..." class="bg-[#0d1117] border border-[#30363d] rounded px-3 py-1 text-[10px] focus:outline-none focus:ring-1 focus:ring-brand-500 w-48 text-white">
               </div>
            </div>

            <!-- Content Area -->
            <div class="flex-1 overflow-hidden relative">
               <div id="view-log" class="absolute inset-0 overflow-auto p-4 text-[12px] leading-relaxed selection:bg-brand-500/30">
                  ${lines.map((line, i) => {
                     let cls = "log-line";
                     const up = line.toUpperCase();
                     if (up.includes('ERROR') || up.includes('FATAL') || up.includes('FAIL')) cls += " text-red-400 level-error";
                     else if (up.includes('WARN')) cls += " text-yellow-200 level-warn";
                     return `<div class="${cls}" data-index="${i}"><span class="opacity-20 mr-4 inline-block w-8 text-right select-none">${i+1}</span><span class="line-content">${escapeHtml(line)}</span></div>`;
                  }).join('')}
               </div>
               <div id="view-stats" class="absolute inset-0 hidden overflow-auto p-8 bg-[#0d1117]">
                  <div class="max-w-4xl mx-auto space-y-8">
                     <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div class="bg-[#161b22] p-6 rounded-2xl border border-[#30363d]">
                           <h3 class="text-[10px] font-bold text-surface-500 uppercase tracking-widest mb-6">Level Distribution</h3>
                           <div class="h-48 relative"><canvas id="chart-levels"></canvas></div>
                        </div>
                        <div class="bg-[#161b22] p-6 rounded-2xl border border-[#30363d]">
                           <h3 class="text-[10px] font-bold text-surface-500 uppercase tracking-widest mb-6">Density Timeline</h3>
                           <div class="h-48 relative"><canvas id="chart-timeline"></canvas></div>
                        </div>
                     </div>
                  </div>
               </div>
            </div>
          </div>
        `);

        const tabLog = document.getElementById('tab-log');
        const tabStats = document.getElementById('tab-stats');
        const viewLog = document.getElementById('view-log');
        const viewStats = document.getElementById('view-stats');

        tabLog.onclick = () => {
           tabLog.className = "px-3 py-1 text-[10px] font-bold uppercase border-b-2 border-brand-500 text-brand-400";
           tabStats.className = "px-3 py-1 text-[10px] font-bold uppercase border-b-2 border-transparent text-surface-500 hover:text-surface-300";
           viewLog.classList.remove('hidden');
           viewStats.classList.add('hidden');
           document.getElementById('log-filters').classList.remove('opacity-30', 'pointer-events-none');
        };

        tabStats.onclick = () => {
           tabStats.className = "px-3 py-1 text-[10px] font-bold uppercase border-b-2 border-brand-500 text-brand-400";
           tabLog.className = "px-3 py-1 text-[10px] font-bold uppercase border-b-2 border-transparent text-surface-500 hover:text-surface-300";
           viewStats.classList.remove('hidden');
           viewLog.classList.add('hidden');
           document.getElementById('log-filters').classList.add('opacity-30', 'pointer-events-none');
           renderCharts();
        };

        document.getElementById('log-highlight').oninput = (e) => {
           const term = e.target.value.toLowerCase();
           document.querySelectorAll('.line-content').forEach(el => {
              const txt = el.textContent;
              if (term && txt.toLowerCase().includes(term)) {
                 const regex = new RegExp(`(${term})`, 'gi');
                 el.innerHTML = escapeHtml(txt).replace(regex, '<mark class="bg-brand-500/50 text-white rounded-sm">$1</mark>');
              } else { el.innerHTML = escapeHtml(txt); }
           });
        };

        document.querySelectorAll('.log-filter').forEach(f => {
           f.onclick = () => {
              f.classList.toggle('opacity-40');
              const level = f.getAttribute('data-level');
              const isHidden = f.classList.contains('opacity-40');
              document.querySelectorAll(`.level-${level}`).forEach(l => { l.style.display = isHidden ? 'none' : 'block'; });
           };
        });

        function renderCharts() {
           // Level Chart
           new Chart(document.getElementById('chart-levels'), {
              type: 'doughnut',
              data: {
                 labels: ['Error', 'Warn', 'Info', 'Debug'],
                 datasets: [{
                    data: [stats.error, stats.warn, stats.info, stats.debug],
                    backgroundColor: ['#f85149', '#e3b341', '#58a6ff', '#8b949e'],
                    borderWidth: 0
                 }]
              },
              options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#8b949e', font: { size: 10 } } } } }
           });

           // Timeline Chart (Simulated density)
           const segments = 20;
           const density = Array.from({ length: segments }).map((_, i) => {
              const chunk = lines.slice(Math.floor(i * lines.length / segments), Math.floor((i + 1) * lines.length / segments));
              return chunk.length;
           });
           new Chart(document.getElementById('chart-timeline'), {
              type: 'line',
              data: {
                 labels: Array.from({ length: segments }).map((_, i) => `${Math.round(i*100/segments)}%`),
                 datasets: [{ label: 'Log Density', data: density, borderColor: '#4f46e5', tension: 0.4, fill: true, backgroundColor: 'rgba(79, 70, 229, 0.1)' }]
              },
              options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#8b949e', font: { size: 8 } } }, y: { display: false } } }
           });
        }
      }
    });
  };
})();

