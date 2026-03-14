/**
 * OmniOpener — Markdown to PDF Converter
 * Parses Markdown via marked.js, renders styled HTML, exports to PDF via html2pdf.
 */
(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    mountEl.innerHTML = `
      <div class="space-y-6">
        <!-- Input Area -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Editor -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <label class="text-sm font-semibold text-surface-700">Markdown Input</label>
              <div class="flex gap-2">
                <button id="md-load-file" class="px-3 py-1 text-xs rounded-lg border border-surface-200 bg-white hover:bg-surface-50 transition-colors font-medium">📁 Open File</button>
                <button id="md-paste" class="px-3 py-1 text-xs rounded-lg border border-surface-200 bg-white hover:bg-surface-50 transition-colors font-medium">📋 Paste</button>
              </div>
            </div>
            <textarea id="md-editor" class="w-full h-96 p-4 rounded-xl border border-surface-200 bg-white font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400 transition-all" placeholder="Type or paste your Markdown here..."></textarea>
            <input type="file" id="md-file-input" accept=".md,.markdown,.txt" class="hidden">
          </div>

          <!-- Preview -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <label class="text-sm font-semibold text-surface-700">Preview</label>
              <button id="md-export-pdf" class="px-4 py-1.5 text-xs rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition-colors font-semibold shadow-sm">
                📥 Export PDF
              </button>
            </div>
            <div id="md-preview" class="h-96 overflow-auto rounded-xl border border-surface-200 bg-white p-6">
              <p class="text-surface-400 text-sm">Preview will appear here...</p>
            </div>
          </div>
        </div>

        <!-- Options -->
        <div class="flex items-center gap-6 flex-wrap bg-surface-50 rounded-xl p-4">
          <div class="flex items-center gap-2">
            <label class="text-sm text-surface-600">Paper:</label>
            <select id="md-paper" class="text-sm border border-surface-200 rounded-lg px-2 py-1 bg-white">
              <option value="a4">A4</option>
              <option value="letter">Letter</option>
              <option value="legal">Legal</option>
            </select>
          </div>
          <div class="flex items-center gap-2">
            <label class="text-sm text-surface-600">Font Size:</label>
            <select id="md-fontsize" class="text-sm border border-surface-200 rounded-lg px-2 py-1 bg-white">
              <option value="12">12px</option>
              <option value="14" selected>14px</option>
              <option value="16">16px</option>
            </select>
          </div>
          <div class="flex items-center gap-2">
            <label class="text-sm text-surface-600">Theme:</label>
            <select id="md-theme" class="text-sm border border-surface-200 rounded-lg px-2 py-1 bg-white">
              <option value="light">Light</option>
              <option value="github">GitHub</option>
              <option value="serif">Serif</option>
            </select>
          </div>
        </div>

        <!-- Info -->
        <div class="bg-surface-50 rounded-xl p-4 text-sm text-surface-500">
          <strong class="text-surface-700">Privacy:</strong> Everything runs in your browser. Your Markdown content never leaves your device.
        </div>
      </div>
    `;

    const editor = document.getElementById('md-editor');
    const preview = document.getElementById('md-preview');
    const exportBtn = document.getElementById('md-export-pdf');
    const loadFileBtn = document.getElementById('md-load-file');
    const pasteBtn = document.getElementById('md-paste');
    const fileInput = document.getElementById('md-file-input');
    const fontSizeSelect = document.getElementById('md-fontsize');
    const themeSelect = document.getElementById('md-theme');

    // Load dependencies
    loadScript('https://cdn.jsdelivr.net/npm/marked@12.0.1/marked.min.js', () => {
      loadScript('https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js', () => {
        // Dependencies loaded, set up demo content
        editor.value = getSampleMarkdown();
        renderPreview();
      });
    });

    // Handle dropped file from global drop zone
    if (window.__droppedFile) {
      const reader = new FileReader();
      reader.onload = (e) => {
        editor.value = e.target.result;
        renderPreview();
      };
      reader.readAsText(window.__droppedFile);
      window.__droppedFile = null;
    }

    // Live preview
    let debounceTimer;
    editor.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(renderPreview, 200);
    });

    fontSizeSelect.addEventListener('change', renderPreview);
    themeSelect.addEventListener('change', renderPreview);

    // File loading
    loadFileBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        editor.value = ev.target.result;
        renderPreview();
      };
      reader.readAsText(file);
    });

    // Paste
    pasteBtn.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        editor.value = text;
        renderPreview();
      } catch {
        editor.focus();
      }
    });

    // Export PDF
    exportBtn.addEventListener('click', () => {
      const paper = document.getElementById('md-paper').value;
      const element = preview.cloneNode(true);
      element.style.padding = '20px';

      const opt = {
        margin: 10,
        filename: 'document.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: paper, orientation: 'portrait' }
      };

      exportBtn.textContent = '⏳ Generating...';
      exportBtn.disabled = true;

      html2pdf().set(opt).from(element).save().then(() => {
        exportBtn.textContent = '📥 Export PDF';
        exportBtn.disabled = false;
      });
    });

    function renderPreview() {
      if (typeof marked === 'undefined') return;
      const md = editor.value;
      const html = marked.parse(md);
      const fontSize = fontSizeSelect.value + 'px';
      const theme = themeSelect.value;

      let fontFamily = "'Inter', sans-serif";
      let bgColor = '#fff';
      let textColor = '#1e293b';

      if (theme === 'serif') fontFamily = "'Georgia', 'Times New Roman', serif";
      if (theme === 'github') {
        bgColor = '#fff';
        textColor = '#24292f';
      }

      preview.innerHTML = `
        <div style="font-family: ${fontFamily}; font-size: ${fontSize}; color: ${textColor}; background: ${bgColor}; line-height: 1.7;">
          <style>
            #md-preview h1 { font-size: 2em; font-weight: 700; margin: 0.5em 0 0.3em; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.3em; }
            #md-preview h2 { font-size: 1.5em; font-weight: 600; margin: 0.5em 0 0.3em; }
            #md-preview h3 { font-size: 1.25em; font-weight: 600; margin: 0.5em 0 0.2em; }
            #md-preview p { margin: 0.5em 0; }
            #md-preview ul, #md-preview ol { padding-left: 1.5em; margin: 0.5em 0; }
            #md-preview li { margin: 0.2em 0; }
            #md-preview code { background: #f1f5f9; padding: 0.15em 0.4em; border-radius: 4px; font-size: 0.9em; font-family: 'Fira Code', monospace; }
            #md-preview pre { background: #0f172a; color: #e2e8f0; padding: 1em; border-radius: 8px; overflow-x: auto; margin: 0.8em 0; }
            #md-preview pre code { background: transparent; color: inherit; padding: 0; }
            #md-preview blockquote { border-left: 3px solid #6366f1; padding-left: 1em; margin: 0.8em 0; color: #64748b; }
            #md-preview table { border-collapse: collapse; width: 100%; margin: 0.8em 0; }
            #md-preview th, #md-preview td { border: 1px solid #e2e8f0; padding: 0.5em 0.8em; text-align: left; }
            #md-preview th { background: #f8fafc; font-weight: 600; }
            #md-preview a { color: #6366f1; text-decoration: underline; }
            #md-preview img { max-width: 100%; border-radius: 8px; }
            #md-preview hr { border: none; border-top: 1px solid #e2e8f0; margin: 1.5em 0; }
          </style>
          ${html}
        </div>
      `;
    }

    function getSampleMarkdown() {
      return `# Welcome to OmniOpener

## Markdown to PDF Converter

This tool converts **Markdown** to beautiful **PDF** documents, entirely in your browser.

### Features

- ✅ Live preview as you type
- ✅ Multiple paper sizes (A4, Letter, Legal)
- ✅ Theme selection (Light, GitHub, Serif)
- ✅ Adjustable font sizes
- ✅ **100% client-side** — no data leaves your device

### Code Example

\`\`\`javascript
const greeting = "Hello, World!";
console.log(greeting);
\`\`\`

### A Table

| Feature | Status |
|---------|--------|
| Markdown parsing | ✅ Done |
| PDF export | ✅ Done |
| Syntax highlighting | 🚧 Coming soon |

> **Note:** Drop a \`.md\` file onto the page to load it instantly.

---

*Built with ❤️ by OmniOpener*
`;
    }

    function loadScript(src, cb) {
      if (document.querySelector(`script[src="${src}"]`)) {
        if (cb) cb();
        return;
      }
      const s = document.createElement('script');
      s.src = src;
      s.onload = cb;
      document.head.appendChild(s);
    }
  };
})();
