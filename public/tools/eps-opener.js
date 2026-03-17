(function() {
  'use strict';

  /**
   * OmniOpener — EPS (Encapsulated PostScript) Viewer
   * Provides metadata extraction and source code viewing for EPS files.
   */

  function formatSize(b) {
    return b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : b > 1e3 ? (b / 1024).toFixed(0) + ' KB' : b + ' B';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[m]);
  }

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.eps',
      dropLabel: 'Drop a .eps file here',
      binary: false,
      onInit: function(helpers) {
        helpers.loadCSS('https://cdn.jsdelivr.net/npm/prismjs@1.29.0/themes/prism-tomorrow.min.css');
        helpers.loadScript('https://cdn.jsdelivr.net/npm/prismjs@1.29.0/prism.min.js', function() {
          helpers.loadScript('https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-postscript.min.js');
        });
      },
      onFile: function(file, content, helpers) {
        if (file.size > 20 * 1024 * 1024) {
          helpers.render(`
            <div class="p-12 text-center bg-surface-50 rounded-2xl border-2 border-dashed border-surface-200">
              <div class="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
              </div>
              <h3 class="text-xl font-bold text-surface-900 mb-2">Large EPS File</h3>
              <p class="text-surface-600 max-w-md mx-auto mb-8">This file is ${formatSize(file.size)}. Parsing large PostScript files in the browser may be slow.</p>
              <button id="proceed-btn" class="px-8 py-3 bg-brand-600 text-white rounded-xl font-semibold shadow-lg hover:bg-brand-700 transition-all hover:scale-105 active:scale-95">Open Anyway</button>
            </div>
          `);
          document.getElementById('proceed-btn').onclick = () => processEps(file, content, helpers);
          return;
        }

        processEps(file, content, helpers);
      },
      actions: [
        { 
          label: '📋 Copy Code', 
          id: 'copy', 
          onClick: function(helpers, btn) {
            helpers.copyToClipboard(helpers.getContent(), btn);
          } 
        },
        { 
          label: '📥 Download', 
          id: 'dl', 
          onClick: function(helpers) {
            helpers.download(helpers.getFile().name, helpers.getContent(), 'application/postscript');
          } 
        }
      ],
      infoHtml: '<strong>Privacy:</strong> 100% client-side. Your PostScript files are processed entirely in your browser.'
    });
  };

  function processEps(file, content, helpers) {
    helpers.showLoading('Parsing EPS metadata...');
    
    setTimeout(() => {
      try {
        const meta = parseEpsMetadata(content);
        renderEpsView(file, content, meta, helpers);
        
        if (window.Prism) {
          Prism.highlightAllUnder(helpers.getRenderEl());
        }
      } catch (err) {
        helpers.showError('Could not parse EPS file', err.message);
      }
    }, 50);
  }

  function parseEpsMetadata(content) {
    const meta = {
      title: 'Untitled',
      creator: 'Unknown',
      date: 'Unknown',
      pages: '1',
      level: 'Unknown',
      bbox: null,
      width: 0,
      height: 0
    };

    // Scan first 2000 lines for DSC (Document Structuring Conventions) comments
    const lines = content.split(/\r?\n/).slice(0, 2000);
    
    for (let line of lines) {
      line = line.trim();
      if (line.startsWith('%%Title:')) meta.title = line.replace('%%Title:', '').trim();
      else if (line.startsWith('%%Creator:')) meta.creator = line.replace('%%Creator:', '').trim();
      else if (line.startsWith('%%CreationDate:')) meta.date = line.replace('%%CreationDate:', '').trim();
      else if (line.startsWith('%%Pages:')) meta.pages = line.replace('%%Pages:', '').trim();
      else if (line.startsWith('%%LanguageLevel:')) meta.level = line.replace('%%LanguageLevel:', '').trim();
      else if (line.startsWith('%%BoundingBox:')) {
        const parts = line.replace('%%BoundingBox:', '').trim().split(/\s+/);
        if (parts.length === 4) {
          meta.bbox = {
            llx: parseFloat(parts[0]),
            lly: parseFloat(parts[1]),
            urx: parseFloat(parts[2]),
            ury: parseFloat(parts[3])
          };
          meta.width = meta.bbox.urx - meta.bbox.llx;
          meta.height = meta.bbox.ury - meta.bbox.lly;
        }
      }
      else if (line.startsWith('%%HiResBoundingBox:')) {
        const parts = line.replace('%%HiResBoundingBox:', '').trim().split(/\s+/);
        if (parts.length === 4) {
          meta.hiresBbox = {
            llx: parseFloat(parts[0]),
            lly: parseFloat(parts[1]),
            urx: parseFloat(parts[2]),
            ury: parseFloat(parts[3])
          };
          // Prefer hires if available
          meta.width = meta.hiresBbox.urx - meta.hiresBbox.llx;
          meta.height = meta.hiresBbox.ury - meta.hiresBbox.lly;
        }
      }
    }
    return meta;
  }

  function renderEpsView(file, content, meta, helpers) {
    const hasBbox = meta.bbox && !isNaN(meta.width) && !isNaN(meta.height) && meta.width > 0;
    const dimensions = hasBbox ? `${Math.round(meta.width)} × ${Math.round(meta.height)} pt` : 'Unknown Dimensions';
    
    const html = `
      <div class="p-6 max-w-5xl mx-auto">
        <!-- File Info Bar -->
        <div class="flex items-center gap-3 p-4 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-200">
          <div class="w-10 h-10 bg-brand-100 text-brand-600 rounded-lg flex items-center justify-center text-xl">📄</div>
          <div class="flex flex-col">
            <span class="font-bold text-surface-900">${escapeHtml(file.name)}</span>
            <div class="flex items-center gap-2 text-xs text-surface-400">
              <span>${formatSize(file.size)}</span>
              <span>·</span>
              <span>EPS PostScript</span>
            </div>
          </div>
          <div class="ml-auto flex flex-col items-end">
            <span class="px-2 py-0.5 bg-brand-50 text-brand-700 rounded text-[10px] font-black uppercase tracking-wider">Vector Format</span>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <!-- Metadata Cards -->
          <div class="md:col-span-3 grid grid-cols-2 lg:grid-cols-3 gap-4">
            <div class="bg-white p-4 rounded-xl border border-surface-100 shadow-sm">
              <div class="text-[10px] text-surface-400 uppercase font-black tracking-widest mb-1">Title</div>
              <div class="text-sm font-semibold text-surface-800 truncate" title="${escapeHtml(meta.title)}">${escapeHtml(meta.title)}</div>
            </div>
            <div class="bg-white p-4 rounded-xl border border-surface-100 shadow-sm">
              <div class="text-[10px] text-surface-400 uppercase font-black tracking-widest mb-1">Creator</div>
              <div class="text-sm font-semibold text-surface-800 truncate" title="${escapeHtml(meta.creator)}">${escapeHtml(meta.creator)}</div>
            </div>
            <div class="bg-white p-4 rounded-xl border border-surface-100 shadow-sm">
              <div class="text-[10px] text-surface-400 uppercase font-black tracking-widest mb-1">Creation Date</div>
              <div class="text-sm font-semibold text-surface-800 truncate">${escapeHtml(meta.date)}</div>
            </div>
            <div class="bg-white p-4 rounded-xl border border-surface-100 shadow-sm">
              <div class="text-[10px] text-surface-400 uppercase font-black tracking-widest mb-1">Language Level</div>
              <div class="text-sm font-semibold text-surface-800">${escapeHtml(meta.level)}</div>
            </div>
            <div class="bg-white p-4 rounded-xl border border-surface-100 shadow-sm">
              <div class="text-[10px] text-surface-400 uppercase font-black tracking-widest mb-1">Pages</div>
              <div class="text-sm font-semibold text-surface-800">${escapeHtml(meta.pages)}</div>
            </div>
            <div class="bg-white p-4 rounded-xl border border-surface-100 shadow-sm">
              <div class="text-[10px] text-surface-400 uppercase font-black tracking-widest mb-1">Dimensions</div>
              <div class="text-sm font-semibold text-surface-800">${dimensions}</div>
            </div>
          </div>

          <!-- Bounding Box Preview -->
          <div class="bg-white p-4 rounded-xl border border-surface-100 shadow-sm flex flex-col items-center justify-center text-center">
            <div class="text-[10px] text-surface-400 uppercase font-black tracking-widest mb-3 w-full text-left">Canvas Ratio</div>
            ${hasBbox ? `
              <div class="relative border-2 border-brand-200 bg-brand-50/30 rounded flex items-center justify-center mb-2" 
                   style="width: 80px; height: ${Math.min(100, (meta.height / meta.width) * 80)}px; max-height: 100px;">
                <span class="text-[10px] font-mono text-brand-600">${Math.round(meta.width)}x${Math.round(meta.height)}</span>
              </div>
            ` : `
              <div class="w-16 h-16 bg-surface-50 border border-dashed border-surface-200 rounded flex items-center justify-center text-surface-300 text-xs mb-2">?</div>
            `}
            <div class="text-[10px] text-surface-400 italic">Aspect Ratio: ${hasBbox ? (meta.width / meta.height).toFixed(2) : 'N/A'}</div>
          </div>
        </div>

        <!-- Code Viewer -->
        <div class="bg-surface-900 rounded-2xl overflow-hidden shadow-2xl border border-surface-800">
          <div class="flex items-center justify-between px-5 py-3 bg-surface-800/50 border-b border-surface-700/50">
            <div class="flex items-center gap-3">
              <div class="flex gap-1.5">
                <div class="w-2.5 h-2.5 rounded-full bg-red-500/80"></div>
                <div class="w-2.5 h-2.5 rounded-full bg-amber-500/80"></div>
                <div class="w-2.5 h-2.5 rounded-full bg-emerald-500/80"></div>
              </div>
              <span class="text-[11px] font-bold text-surface-400 uppercase tracking-widest ml-2">PostScript Source</span>
            </div>
            <span class="text-[10px] font-mono text-surface-500 bg-surface-900/50 px-2 py-0.5 rounded border border-surface-700">
              ${content.split('\n').length.toLocaleString()} lines
            </span>
          </div>
          <div class="max-h-[600px] overflow-auto custom-scrollbar bg-surface-950">
            <pre class="m-0 p-6 font-mono text-[13px] leading-relaxed selection:bg-brand-500/30 line-numbers"><code class="language-postscript">${escapeHtml(content)}</code></pre>
          </div>
        </div>
      </div>
    `;

    helpers.render(html);
  }
})();
