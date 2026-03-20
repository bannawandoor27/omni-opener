/**
 * OmniOpener — HTML Toolkit
 * Uses OmniTool SDK and highlight.js.
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
      accept: '.html,.htm',
      dropLabel: 'Drop an HTML file here',
      binary: false,
      infoHtml: '<strong>HTML Toolkit:</strong> Professional HTML previewer with SEO inspection and accessibility auditing.',
      
      onInit: function(helpers) {
        helpers.loadCSS('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css');
        helpers.loadScript('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js');
      },

      actions: [
        {
          label: '📋 Copy HTML',
          id: 'copy',
          onClick: function (helpers, btn) {
            helpers.copyToClipboard(helpers.getContent(), btn);
          }
        },
        {
          label: '🚀 Open in New Tab',
          id: 'open-tab',
          onClick: function (helpers) {
            const blob = new Blob([helpers.getContent()], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');
          }
        }
      ],

      onFile: function (file, content, helpers) {
        if (typeof hljs === 'undefined') {
          helpers.showLoading('Loading highlighter...');
          setTimeout(() => this.onFile(file, content, helpers), 500);
          return;
        }

        const doc = new DOMParser().parseFromString(content, 'text/html');
        const highlightedCode = hljs.highlight(content.slice(0, 50000), {language: 'xml'}).value;
        
        helpers.render(`
          <div class="flex flex-col h-[85vh] border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm">
            <!-- Header -->
            <div class="shrink-0 bg-surface-50 border-b border-surface-200 px-4 py-2 flex items-center justify-between">
               <div class="flex items-center gap-4">
                  <div class="flex px-1 bg-white border border-surface-200 rounded-lg">
                    <button id="tab-preview" class="px-3 py-1 text-[10px] font-bold uppercase border-b-2 border-brand-500 text-brand-600">Preview</button>
                    <button id="tab-source" class="px-3 py-1 text-[10px] font-bold uppercase border-b-2 border-transparent text-surface-400 hover:text-surface-600">Source</button>
                    <button id="tab-insights" class="px-3 py-1 text-[10px] font-bold uppercase border-b-2 border-transparent text-surface-400 hover:text-surface-600">Insights</button>
                  </div>
               </div>
               <div class="flex items-center gap-2">
                  <button data-size="100%" class="dev-btn p-1 hover:bg-white rounded border border-transparent hover:border-surface-200" title="Desktop">🖥️</button>
                  <button data-size="375px" class="dev-btn p-1 hover:bg-white rounded border border-transparent hover:border-surface-200" title="Mobile">📱</button>
               </div>
            </div>

            <!-- Content -->
            <div class="flex-1 overflow-hidden relative bg-surface-100 flex justify-center">
               <div id="view-preview" class="w-full h-full transition-all duration-300 bg-white shadow-inner">
                  <iframe id="preview-iframe" sandbox="allow-scripts allow-same-origin" class="w-full h-full border-0"></iframe>
               </div>
               <div id="view-source" class="hidden w-full h-full bg-[#282c34] overflow-auto p-6 font-mono text-[12px] leading-relaxed">
                  <pre class="text-surface-100"><code>${highlightedCode}</code></pre>
               </div>
               <div id="view-insights" class="hidden w-full h-full bg-white overflow-auto p-8">
                  <div class="max-w-3xl mx-auto space-y-8">
                     <section>
                        <h3 class="text-xs font-bold text-surface-400 uppercase tracking-widest mb-4">SEO Inspector</h3>
                        <div id="seo-results" class="grid grid-cols-1 md:grid-cols-2 gap-4"></div>
                     </section>
                     <section>
                        <h3 class="text-xs font-bold text-surface-400 uppercase tracking-widest mb-4">Accessibility Audit</h3>
                        <div id="a11y-results" class="space-y-3"></div>
                     </section>
                  </div>
               </div>
            </div>
          </div>
        `);

        const iframe = document.getElementById('preview-iframe');
        iframe.srcdoc = content;

        const tabs = { preview: document.getElementById('tab-preview'), source: document.getElementById('tab-source'), insights: document.getElementById('tab-insights') };
        const views = { preview: document.getElementById('view-preview'), source: document.getElementById('view-source'), insights: document.getElementById('view-insights') };

        Object.keys(tabs).forEach(k => {
           tabs[k].onclick = () => {
              Object.values(tabs).forEach(t => { t.className = "px-3 py-1 text-[10px] font-bold uppercase border-b-2 border-transparent text-surface-400 hover:text-surface-600"; });
              Object.values(views).forEach(v => v.classList.add('hidden'));
              tabs[k].className = "px-3 py-1 text-[10px] font-bold uppercase border-b-2 border-brand-500 text-brand-600";
              views[k].classList.remove('hidden');
              if (k === 'insights') runAudit();
           };
        });

        document.querySelectorAll('.dev-btn').forEach(btn => {
           btn.onclick = () => {
              document.getElementById('view-preview').style.width = btn.getAttribute('data-size');
           };
        });

        function runAudit() {
           const seo = document.getElementById('seo-results');
           const a11y = document.getElementById('a11y-results');
           seo.innerHTML = ''; a11y.innerHTML = '';

           // SEO
           const meta = (name) => doc.querySelector(`meta[name="${name}"], meta[property="${name}"]`)?.getAttribute('content') || 'Missing';
           const seoTags = [
              { label: 'Title', value: doc.title || 'Missing' },
              { label: 'Description', value: meta('description') },
              { label: 'OG Image', value: meta('og:image') },
              { label: 'Viewport', value: meta('viewport') }
           ];
           seoTags.forEach(tag => {
              seo.innerHTML += `<div class="p-3 bg-surface-50 border border-surface-100 rounded-lg"><p class="text-[10px] font-bold text-surface-400 uppercase">${tag.label}</p><p class="text-xs text-surface-700 truncate mt-1" title="${tag.value}">${escapeHtml(tag.value)}</p></div>`;
           });

           // A11y
           const issues = [];
           const images = doc.querySelectorAll('img');
           images.forEach(img => { if(!img.hasAttribute('alt')) issues.push({ type: 'Warning', msg: `Image missing alt text: ${img.src.split('/').pop()}` }); });
           const html = doc.querySelector('html');
           if (!html?.hasAttribute('lang')) issues.push({ type: 'Critical', msg: 'Missing lang attribute on <html> tag' });
           if (issues.length === 0) a11y.innerHTML = '<p class="text-xs text-green-600 font-medium">No basic accessibility issues found!</p>';
           else issues.forEach(iss => {
              a11y.innerHTML += `<div class="flex items-center gap-3 p-3 ${iss.type === 'Critical' ? 'bg-red-50 text-red-700 border-red-100' : 'bg-yellow-50 text-yellow-700 border-yellow-100'} border rounded-lg text-xs font-medium"><span>${iss.type === 'Critical' ? '🔴' : '⚠️'}</span><span>${iss.msg}</span></div>`;
           });
        }
      }
    });
  };
})();

