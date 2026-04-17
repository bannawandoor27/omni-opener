/**
 * OmniOpener — Markdown to PDF Converter
 * Uses OmniTool SDK. Parses MD via marked.js, live preview, exports PDF.
 */
(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    // This tool has a custom layout (editor + preview side-by-side),
    // so we use a hybrid approach: SDK for file handling, custom render.

    var ready = false;

    OmniTool.create(mountEl, toolConfig, {
      accept: '.md,.markdown,.txt',
      dropLabel: 'Drop a Markdown file here',
      infoHtml: '<strong>Privacy:</strong> Everything runs in your browser. Your Markdown content never leaves your device.',

      actions: [
        { label: '📥 Export PDF', id: 'export-pdf', onClick: exportPDF },
        { label: '📋 Copy HTML', id: 'copy-html', onClick: function (h, btn) {
          var preview = document.getElementById('md-preview');
          if (preview) h.copyToClipboard(preview.innerHTML, btn);
        }},
      ],

      onInit: function (h) {
        // Load dependencies then show editor
        h.loadScript('https://cdn.jsdelivr.net/npm/marked@12.0.1/marked.min.js', function () {
          h.loadScript('https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js', function () {
            ready = true;
          });
        });
      },

      onFile: function (file, content, h) {
        showEditor(h, content);
      }
    });

    // Also provide a way to open the editor without a file (paste/type mode)
    // We'll add a small "or type here" link below the drop zone
    setTimeout(function () {
      var dropZone = document.getElementById('omni-drop');
      if (dropZone) {
        var link = document.createElement('div');
        link.className = 'text-center mt-3';
        link.innerHTML = '<button id="md-type-btn" class="text-sm text-brand-600 hover:text-brand-700 font-medium underline">or type/paste Markdown directly</button>';
        dropZone.parentNode.insertBefore(link, dropZone.nextSibling);
        document.getElementById('md-type-btn').addEventListener('click', function () {
          // Fake a "file loaded" state to show editor with sample content
          var fakeHelpers = findHelpers();
          if (fakeHelpers) showEditor(fakeHelpers, getSampleMarkdown());
        });
      }
    }, 50);

    function findHelpers() {
      // Re-create a minimal helpers-like shim by accessing the SDK render area
      var renderEl = document.getElementById('omni-render');
      var dropEl = document.getElementById('omni-drop');
      var actionsEl = document.getElementById('omni-actions');
      if (!renderEl) return null;
      return {
        render: function (html) {
          renderEl.innerHTML = html;
          renderEl.classList.remove('hidden');
          if (dropEl) dropEl.classList.add('hidden');
          if (actionsEl) actionsEl.classList.remove('hidden');
          // Also hide the "type/paste" link
          var typeBtn = document.getElementById('md-type-btn');
          if (typeBtn && typeBtn.parentNode) typeBtn.parentNode.style.display = 'none';
        },
        getRenderEl: function () { return renderEl; }
      };
    }

    function showEditor(h, initialContent) {
      h.render(
        '<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">' +
          '<div>' +
            '<div class="flex items-center justify-between mb-2">' +
              '<label class="text-sm font-semibold text-surface-700">Markdown Input</label>' +
              '<button id="md-paste-btn" class="px-3 py-1 text-xs rounded-lg border border-surface-200 bg-white hover:bg-surface-50 transition-colors font-medium">📋 Paste</button>' +
            '</div>' +
            '<textarea id="md-editor" class="w-full h-96 p-4 rounded-xl border border-surface-200 bg-white font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400 transition-all" placeholder="Type or paste Markdown here..."></textarea>' +
          '</div>' +
          '<div>' +
            '<label class="text-sm font-semibold text-surface-700 mb-2 block">Preview</label>' +
            '<div id="md-preview" class="h-96 overflow-auto rounded-xl border border-surface-200 bg-white p-6">' +
              '<p class="text-surface-400 text-sm">Preview appears here…</p>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="flex items-center gap-6 flex-wrap bg-surface-50 rounded-xl p-4">' +
          '<div class="flex items-center gap-2">' +
            '<label class="text-sm text-surface-600">Paper:</label>' +
            '<select id="md-paper" class="text-sm border border-surface-200 rounded-lg px-2 py-1 bg-white"><option value="a4">A4</option><option value="letter">Letter</option><option value="legal">Legal</option></select>' +
          '</div>' +
          '<div class="flex items-center gap-2">' +
            '<label class="text-sm text-surface-600">Font Size:</label>' +
            '<select id="md-fontsize" class="text-sm border border-surface-200 rounded-lg px-2 py-1 bg-white"><option value="12">12px</option><option value="14" selected>14px</option><option value="16">16px</option></select>' +
          '</div>' +
          '<div class="flex items-center gap-2">' +
            '<label class="text-sm text-surface-600">Theme:</label>' +
            '<select id="md-theme" class="text-sm border border-surface-200 rounded-lg px-2 py-1 bg-white"><option value="light">Light</option><option value="github">GitHub</option><option value="serif">Serif</option></select>' +
          '</div>' +
        '</div>'
      );

      var editor = document.getElementById('md-editor');
      var preview = document.getElementById('md-preview');
      var fontSizeSelect = document.getElementById('md-fontsize');
      var themeSelect = document.getElementById('md-theme');
      var pasteBtn = document.getElementById('md-paste-btn');

      editor.value = initialContent || '';
      renderPreview();

      // Live preview
      var debounce;
      editor.addEventListener('input', function () {
        clearTimeout(debounce);
        debounce = setTimeout(renderPreview, 200);
      });
      fontSizeSelect.addEventListener('change', renderPreview);
      themeSelect.addEventListener('change', renderPreview);

      pasteBtn.addEventListener('click', function () {
        navigator.clipboard.readText().then(function (text) {
          editor.value = text;
          renderPreview();
        }).catch(function () { editor.focus(); });
      });

      function renderPreview() {
        if (typeof marked === 'undefined') return;
        var html = marked.parse(editor.value);
        var fontSize = fontSizeSelect.value + 'px';
        var theme = themeSelect.value;
        var fontFamily = theme === 'serif' ? "'Georgia', serif" : "'Inter', sans-serif";

        preview.innerHTML =
          '<div style="font-family:' + fontFamily + ';font-size:' + fontSize + ';color:#1e293b;line-height:1.7;">' +
          '<style>' +
            '#md-preview h1{font-size:2em;font-weight:700;margin:0.5em 0 0.3em;border-bottom:1px solid #e2e8f0;padding-bottom:0.3em}' +
            '#md-preview h2{font-size:1.5em;font-weight:600;margin:0.5em 0 0.3em}' +
            '#md-preview h3{font-size:1.25em;font-weight:600;margin:0.5em 0 0.2em}' +
            '#md-preview p{margin:0.5em 0}' +
            '#md-preview ul,#md-preview ol{padding-left:1.5em;margin:0.5em 0}' +
            '#md-preview code{background:#f1f5f9;padding:0.15em 0.4em;border-radius:4px;font-size:0.9em}' +
            '#md-preview pre{background:#0f172a;color:#e2e8f0;padding:1em;border-radius:8px;overflow-x:auto;margin:0.8em 0}' +
            '#md-preview pre code{background:transparent;color:inherit;padding:0}' +
            '#md-preview blockquote{border-left:3px solid #6366f1;padding-left:1em;margin:0.8em 0;color:#64748b}' +
            '#md-preview table{border-collapse:collapse;width:100%;margin:0.8em 0}' +
            '#md-preview th,#md-preview td{border:1px solid #e2e8f0;padding:0.5em 0.8em;text-align:left}' +
            '#md-preview th{background:#f8fafc;font-weight:600}' +
            '#md-preview a{color:#6366f1;text-decoration:underline}' +
            '#md-preview img{max-width:100%;border-radius:8px}' +
            '#md-preview hr{border:none;border-top:1px solid #e2e8f0;margin:1.5em 0}' +
          '</style>' +
          html + '</div>';
      }
    }

    function exportPDF(h, btn) {
      var preview = document.getElementById('md-preview');
      if (!preview) return;
      var paper = document.getElementById('md-paper');
      var element = preview.cloneNode(true);
      element.style.padding = '20px';

      btn.textContent = '⏳ Generating…';
      btn.disabled = true;

      html2pdf().set({
        margin: 10,
        filename: 'document.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: paper ? paper.value : 'a4', orientation: 'portrait' }
      }).from(element).save().then(function () {
        btn.textContent = '📥 Export PDF';
        btn.disabled = false;
      }).catch(function () {
        btn.textContent = '📥 Export PDF';
        btn.disabled = false;
      });
    }

    function getSampleMarkdown() {
      return '# Welcome to OmniOpener\n\n## Markdown to PDF Converter\n\nThis tool converts **Markdown** to beautiful **PDF** documents, entirely in your browser.\n\n### Features\n\n- ✅ Live preview as you type\n- ✅ Multiple paper sizes (A4, Letter, Legal)\n- ✅ Theme selection (Light, GitHub, Serif)\n- ✅ **100% client-side** — no data leaves your device\n\n### Code Example\n\n```javascript\nconst greeting = \"Hello, World!\";\nconsole.log(greeting);\n```\n\n| Feature | Status |\n|---------|--------|\n| Markdown parsing | ✅ Done |\n| PDF export | ✅ Done |\n\n> **Note:** Drop a `.md` file onto the page to load it instantly.\n\n---\n\n*Built with ❤️ by OmniOpener*\n';
    }
  };
})();
