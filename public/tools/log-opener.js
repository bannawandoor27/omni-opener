/**
 * OmniOpener — Log Toolkit
 * Uses OmniTool SDK, highlight.js, and Chart.js.
 */
(function () {
  'use strict';

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.log,.txt',
      dropLabel: 'Drop a log file here',
      binary: false,
      infoHtml: '<strong>Log Toolkit:</strong> Advanced log analysis with regex filtering, line jumping, and visual density maps.',
      
      onInit: function(helpers) {
        helpers.loadCSS('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css');
        helpers.loadScript('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js');
        helpers.loadScript('https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js');
      },

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
           else stats.info++;
        });

        helpers.setState({ lines, stats, fileName: file.name, view: 'log' });

        renderApp(helpers);
      }
    });

    function renderApp(helpers) {
      const state = helpers.getState();
      const { lines, stats } = state;

      helpers.render(`
        <div class="flex flex-col h-[85vh] border border-surface-700 rounded-xl overflow-hidden bg-[#0d1117] text-surface-300 shadow-2xl font-mono">
          <!-- Toolbar -->
          <div class="shrink-0 bg-[#161b22] border-b border-[#30363d] px-4 py-3 flex flex-wrap items-center justify-between gap-4">
             <div class="flex items-center gap-4">
                <div class="flex p-1 bg-black/20 border border-[#30363d] rounded-lg">
                  <button id="tab-log" class="px-3 py-1 text-[10px] font-bold uppercase border-b-2 ${state.view === 'log' ? 'border-brand-500 text-brand-400' : 'border-transparent text-surface-500'}">Logs</button>
                  <button id="tab-stats" class="px-3 py-1 text-[10px] font-bold uppercase border-b-2 ${state.view === 'stats' ? 'border-brand-500 text-brand-400' : 'border-transparent text-surface-500'}">Stats</button>
                </div>
                <div class="flex gap-1">
                  <button data-level="error" class="log-filter px-2 py-0.5 rounded bg-red-900/20 text-red-400 text-[9px] font-bold border border-red-900/40 hover:bg-red-900/40 transition-colors">ERR: ${stats.error}</button>
                  <button data-level="warn" class="log-filter px-2 py-0.5 rounded bg-yellow-900/20 text-yellow-400 text-[9px] font-bold border border-yellow-900/40 hover:bg-yellow-900/40 transition-colors">WRN: ${stats.warn}</button>
                  <button data-level="info" class="log-filter px-2 py-0.5 rounded bg-blue-900/20 text-blue-400 text-[9px] font-bold border border-blue-900/40 hover:bg-blue-900/40 transition-colors">INF: ${stats.info}</button>
                </div>
             </div>
             
             <div class="flex items-center gap-3">
                <div class="relative">
                  <input type="text" id="log-regex" placeholder="Regex filter..." class="bg-[#0d1117] border border-[#30363d] rounded-lg px-8 py-1.5 text-[11px] focus:ring-2 focus:ring-brand-500/40 outline-none w-48 text-white placeholder:text-surface-600 shadow-inner">
                  <span class="absolute left-3 top-2 text-[10px] opacity-40">/</span>
                </div>
                <div class="flex items-center bg-[#0d1117] border border-[#30363d] rounded-lg px-2 shadow-inner">
                  <span class="text-[9px] font-bold text-surface-600 uppercase mr-2">Go to:</span>
                  <input type="number" id="line-jump" min="1" max="${lines.length}" class="bg-transparent border-none p-0 w-12 text-[11px] text-white focus:ring-0 outline-none" placeholder="Line">
                </div>
             </div>
          </div>

          <!-- Content -->
          <div class="flex-1 overflow-hidden relative">
             <div id="view-log" class="absolute inset-0 overflow-auto p-4 text-[12px] leading-relaxed selection:bg-brand-500/30 ${state.view === 'log' ? '' : 'hidden'}">
                ${lines.slice(0, 2000).map((line, i) => {
                   let cls = "log-line py-0.5 flex group hover:bg-white/5 transition-colors";
                   const up = line.toUpperCase();
                   let levelCls = "info";
                   if (up.includes('ERROR') || up.includes('FATAL') || up.includes('FAIL')) { cls += " text-red-400"; levelCls = "error"; }
                   else if (up.includes('WARN')) { cls += " text-yellow-200"; levelCls = "warn"; }
                   else if (up.includes('DEBUG')) { cls += " text-surface-500"; levelCls = "debug"; }
                   return `
                    <div class="${cls} level-${levelCls}" id="L${i+1}">
                      <span class="opacity-20 mr-4 inline-block w-10 text-right select-none shrink-0 group-hover:opacity-60 transition-opacity">${i+1}</span>
                      <span class="line-content break-all">${escapeHtml(line)}</span>
                    </div>`;
                }).join('')}
                ${lines.length > 2000 ? `<div class="p-8 text-center text-surface-600 italic border-t border-[#30363d] mt-4">Showing first 2,000 lines for performance. Use filters to narrow down.</div>` : ''}
             </div>

             <div id="view-stats" class="absolute inset-0 overflow-auto p-8 bg-[#0d1117] ${state.view === 'stats' ? '' : 'hidden'}">
                <div class="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
                   <div class="bg-[#161b22] p-6 rounded-2xl border border-[#30363d] shadow-xl">
                      <h3 class="text-[10px] font-bold text-surface-500 uppercase tracking-widest mb-6">Log Level Distribution</h3>
                      <div class="h-64 relative"><canvas id="chart-levels"></canvas></div>
                   </div>
                   <div class="bg-[#161b22] p-6 rounded-2xl border border-[#30363d] shadow-xl">
                      <h3 class="text-[10px] font-bold text-surface-500 uppercase tracking-widest mb-6">Log Event Density</h3>
                      <div class="h-64 relative"><canvas id="chart-timeline"></canvas></div>
                   </div>
                </div>
             </div>
          </div>
        </div>
      `);

      // Event Listeners
      document.getElementById('tab-log').onclick = () => { helpers.setState('view', 'log'); renderApp(helpers); };
      document.getElementById('tab-stats').onclick = () => { helpers.setState('view', 'stats'); renderApp(helpers); renderCharts(stats, lines); };

      const regexInput = document.getElementById('log-regex');
      regexInput.oninput = (e) => {
        const val = e.target.value;
        const lineElements = document.querySelectorAll('.log-line');
        if (!val) {
          lineElements.forEach(el => el.style.display = 'flex');
          return;
        }
        try {
          const re = new RegExp(val, 'i');
          lineElements.forEach(el => {
            const content = el.querySelector('.line-content').textContent;
            el.style.display = re.test(content) ? 'flex' : 'none';
          });
        } catch (err) {}
      };

      document.getElementById('line-jump').onkeydown = (e) => {
        if (e.key === 'Enter') {
          const line = e.target.value;
          const el = document.getElementById('L' + line);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add('bg-brand-500/20');
            setTimeout(() => el.classList.remove('bg-brand-500/20'), 2000);
          }
        }
      };

      document.querySelectorAll('.log-filter').forEach(btn => {
        btn.onclick = () => {
          btn.classList.toggle('opacity-30');
          const level = btn.dataset.level;
          const isHidden = btn.classList.contains('opacity-30');
          document.querySelectorAll('.level-' + level).forEach(el => el.style.display = isHidden ? 'none' : 'flex');
        };
      });

      if (state.view === 'stats') renderCharts(stats, lines);
    }

    function renderCharts(stats, lines) {
      const levelCtx = document.getElementById('chart-levels');
      if (!levelCtx) return;
      new Chart(levelCtx, {
        type: 'doughnut',
        data: {
          labels: ['Error', 'Warn', 'Info', 'Debug'],
          datasets: [{
            data: [stats.error, stats.warn, stats.info, stats.debug],
            backgroundColor: ['#f85149', '#e3b341', '#58a6ff', '#8b949e'],
            borderWidth: 0
          }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#8b949e', font: { size: 10 } } } } }
      });

      const timelineCtx = document.getElementById('chart-timeline');
      if (!timelineCtx) return;
      const segments = 30;
      const density = Array.from({ length: segments }).map((_, i) => {
        return lines.slice(Math.floor(i * lines.length / segments), Math.floor((i + 1) * lines.length / segments)).length;
      });
      new Chart(timelineCtx, {
        type: 'line',
        data: {
          labels: Array.from({ length: segments }).map((_, i) => `${Math.round(i*100/segments)}%`),
          datasets: [{ label: 'Density', data: density, borderColor: '#4f46e5', tension: 0.4, fill: true, backgroundColor: 'rgba(79, 70, 229, 0.1)' }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#8b949e', font: { size: 8 } } }, y: { display: false } } }
      });
    }
  };
})();
