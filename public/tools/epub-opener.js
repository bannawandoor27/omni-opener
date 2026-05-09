(function() {
  'use strict';

  /**
   * OmniOpener — Production-Grade EPUB Reader
   * High-performance, client-side EPUB viewer with full sanitization and local-only processing.
   */

  let _createdUrls = [];

  function revokeAll() {
    _createdUrls.forEach(url => {
      try { URL.revokeObjectURL(url); } catch (e) {}
    });
    _createdUrls = [];
  }

  function formatBytes(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function sanitize(html) {
    if (!html) return '';
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // B6: Remove scripts, frames, and interactive elements
    const dangerous = doc.querySelectorAll('script, iframe, object, embed, link[rel="stylesheet"], style, form, input, button, noscript, base');
    dangerous.forEach(n => n.remove());

    // Clean attributes
    const all = doc.querySelectorAll('*');
    all.forEach(el => {
      const attrs = Array.from(el.attributes);
      for (const attr of attrs) {
        const name = attr.name.toLowerCase();
        const value = attr.value.toLowerCase();
        
        if (name.startsWith('on') || name === 'style') {
          el.removeAttribute(attr.name);
        } else if ((name === 'href' || name === 'src' || name === 'xlink:href' || name === 'action') && 
                   (value.includes('javascript:') || value.includes('data:text/html'))) {
          el.removeAttribute(attr.name);
        }
      }
    });

    return doc.body.innerHTML;
  }

  function resolvePath(base, relative) {
    if (!relative) return base;
    if (relative.startsWith('/') || relative.includes('://')) return relative;
    
    const stack = base.split('/');
    stack.pop(); // Remove filename or last segment
    
    const parts = relative.split('/');
    for (const part of parts) {
      if (part === '.') continue;
      if (part === '..') stack.pop();
      else stack.push(part);
    }
    return stack.join('/');
  }

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.epub',
      dropLabel: 'Drop EPUB book here',
      binary: true,
      infoHtml: '<strong>Secure & Offline:</strong> Your books are processed locally. No data ever leaves your device.',

      onInit: function(helpers) {
        helpers.loadScript('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js');
      },

      onFile: async function _onFileFn(file, content, helpers) {
        // B5: Revoke previous URLs
        revokeAll();

        // B1: Race condition check for JSZip
        if (typeof JSZip === 'undefined') {
          helpers.showLoading('Starting reader engine...');
          let attempts = 0;
          const checkInterval = setInterval(() => {
            if (typeof JSZip !== 'undefined') {
              clearInterval(checkInterval);
              _onFileFn(file, content, helpers);
            } else if (++attempts > 50) {
              clearInterval(checkInterval);
              helpers.showError('Engine Load Failure', 'Failed to initialize the book reader. Please check your internet connection and try again.');
            }
          }, 200);
          return;
        }

        // B2: Ensure content is treated as binary
        if (!(content instanceof ArrayBuffer)) {
          helpers.showError('Invalid File Content', 'The file content is not in the expected binary format.');
          return;
        }

        helpers.showLoading('Extracting book archive...');

        try {
          const zip = await JSZip.loadAsync(content);
          
          // 1. Find the OPF file via container.xml
          const containerFile = zip.file('META-INF/container.xml');
          if (!containerFile) throw new Error('Invalid EPUB structure (missing container.xml)');
          
          const containerXml = await containerFile.async('text');
          const containerDoc = new DOMParser().parseFromString(containerXml, 'text/xml');
          const opfPath = containerDoc.querySelector('rootfile')?.getAttribute('full-path');
          if (!opfPath) throw new Error('Could not find package descriptor (OPF file)');

          const opfFile = zip.file(opfPath);
          if (!opfFile) throw new Error(`Package file not found: ${opfPath}`);

          // 2. Parse OPF for metadata and manifest
          const opfXml = await opfFile.async('text');
          const opfDoc = new DOMParser().parseFromString(opfXml, 'text/xml');
          const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';

          const metadata = {
            title: opfDoc.querySelector('title, dc\\:title')?.textContent || 'Untitled Book',
            creator: opfDoc.querySelector('creator, dc\\:creator')?.textContent || 'Unknown Author',
            description: opfDoc.querySelector('description, dc\\:description')?.textContent || 'No description available.',
            language: opfDoc.querySelector('language, dc\\:language')?.textContent || 'en',
            publisher: opfDoc.querySelector('publisher, dc\\:publisher')?.textContent || '',
            date: opfDoc.querySelector('date, dc\\:date')?.textContent || ''
          };

          const manifest = {};
          opfDoc.querySelectorAll('manifest item').forEach(item => {
            manifest[item.getAttribute('id')] = item.getAttribute('href');
          });

          const spine = Array.from(opfDoc.querySelectorAll('spine itemref'))
            .map(ref => manifest[ref.getAttribute('idref')])
            .filter(Boolean);

          // U5: Empty state handling
          if (spine.length === 0) {
            helpers.showError('Empty Book', 'This EPUB file does not contain any readable chapters in its spine.');
            return;
          }

          // 3. Extract Cover Image
          let coverUrl = null;
          let coverId = opfDoc.querySelector('meta[name="cover"]')?.getAttribute('content');
          if (!coverId) {
             const coverItem = opfDoc.querySelector('item[properties~="cover-image"]');
             if (coverItem) coverId = coverItem.getAttribute('id');
          }
          
          if (coverId && manifest[coverId]) {
            const coverPath = opfDir + manifest[coverId];
            const coverFile = zip.file(coverPath);
            if (coverFile) {
              const coverBlob = await coverFile.async('blob');
              coverUrl = URL.createObjectURL(coverBlob);
              _createdUrls.push(coverUrl);
            }
          }

          helpers.setState({
            zip,
            opfDir,
            spine,
            metadata,
            coverUrl,
            currentChapter: 0,
            fontSize: 110,
            theme: 'light',
            tocSearch: ''
          });

          renderApp(helpers);
        } catch (err) {
          // U3: Friendly error message
          console.error('[EPUB ERROR]', err);
          helpers.showError('Could not open EPUB file', `The file may be corrupted or in an unsupported variant. Error: ${err.message}`);
        }
      },

      actions: [
        {
          label: '📋 Copy Text',
          onClick: (helpers, btn) => {
            const body = document.getElementById('reader-content-area');
            if (body) helpers.copyToClipboard(body.innerText, btn);
          }
        },
        {
          label: '📥 Download Original',
          onClick: (helpers) => {
             const file = helpers.getFile();
             helpers.download(file.name, helpers.getContent(), 'application/epub+zip');
          }
        }
      ],

      onDestroy: revokeAll
    });
  };

  function renderApp(helpers) {
    const state = helpers.getState();
    const { metadata, coverUrl, spine, currentChapter, fontSize, theme, tocSearch } = state;
    const file = helpers.getFile();

    const themes = {
      light: 'bg-white text-slate-900',
      sepia: 'bg-[#f4ecd8] text-[#5b4636]',
      dark: 'bg-slate-950 text-slate-300'
    };

    const chapters = spine.map((path, i) => {
      let name = path.split('/').pop().replace(/\.(x?html?)$/i, '').replace(/[_-]/g, ' ');
      if (name.length > 50) name = name.substring(0, 47) + '...';
      return { path, i, name };
    });

    const filteredChapters = chapters.filter(c => !tocSearch || c.name.toLowerCase().includes(tocSearch.toLowerCase()));

    const html = `
      <div class="max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700">
        <!-- U1: File Info Bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-200">
          <span class="font-semibold text-surface-800">${esc(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span class="tabular-nums">${formatBytes(file.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">.epub book</span>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <!-- Left Panel: Sidebar -->
          <div class="lg:col-span-4 space-y-6 lg:sticky lg:top-4">
            
            <!-- Metadata Card (U9) -->
            <div class="bg-white rounded-2xl border border-surface-200 p-5 shadow-sm hover:border-brand-300 transition-all">
              <div class="flex gap-4">
                <div class="w-20 shrink-0 aspect-[2/3] bg-surface-100 rounded-lg overflow-hidden border border-surface-200 shadow-sm">
                  ${coverUrl ? `<img src="${coverUrl}" class="w-full h-full object-cover">` : `<div class="w-full h-full flex items-center justify-center text-3xl opacity-20">📚</div>`}
                </div>
                <div class="flex-1 min-w-0">
                  <h1 class="font-bold text-surface-900 leading-tight mb-1 line-clamp-2" title="${esc(metadata.title)}">${esc(metadata.title)}</h1>
                  <p class="text-surface-500 text-sm truncate">${esc(metadata.creator)}</p>
                  ${metadata.publisher ? `<p class="text-surface-400 text-[10px] mt-1 uppercase tracking-wider">${esc(metadata.publisher)}</p>` : ''}
                </div>
              </div>

              <div class="mt-6 pt-6 border-t border-surface-100 space-y-5">
                <!-- Theme Selector -->
                <div>
                  <label class="text-[10px] font-bold uppercase tracking-widest text-surface-400 mb-2 block">Theme</label>
                  <div class="flex gap-2">
                    ${['light', 'sepia', 'dark'].map(t => `
                      <button class="theme-btn flex-1 py-1.5 rounded-lg border-2 transition-all ${theme === t ? 'border-brand-500' : 'border-transparent'}" 
                              data-theme="${t}" style="background: ${t === 'light' ? '#fff' : t === 'sepia' ? '#f4ecd8' : '#0f172a'}">
                        <span class="text-[11px] font-semibold ${t === 'dark' ? 'text-white' : 'text-surface-700'} capitalize">${t}</span>
                      </button>
                    `).join('')}
                  </div>
                </div>

                <!-- Font Size (Zoom control) -->
                <div>
                  <div class="flex justify-between items-center mb-1">
                    <label class="text-[10px] font-bold uppercase tracking-widest text-surface-400">Text Size</label>
                    <span class="text-xs font-mono text-surface-600">${fontSize}%</span>
                  </div>
                  <input type="range" id="size-slider" min="70" max="250" step="5" value="${fontSize}" 
                         class="w-full h-1.5 bg-surface-200 rounded-lg appearance-none cursor-pointer accent-brand-600">
                </div>
              </div>
            </div>

            <!-- TOC Card (U10) -->
            <div class="bg-white rounded-2xl border border-surface-200 flex flex-col h-[60vh] overflow-hidden shadow-sm">
              <div class="p-4 border-b border-surface-100 bg-surface-50/50">
                <div class="flex items-center justify-between mb-3">
                  <h3 class="font-bold text-surface-800">Contents</h3>
                  <span class="text-[10px] bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-bold">${spine.length} items</span>
                </div>
                <div class="relative">
                  <input type="text" id="toc-filter" placeholder="Search chapters..." value="${esc(tocSearch)}"
                         class="w-full pl-9 pr-4 py-2 bg-white border border-surface-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all">
                  <svg class="w-4 h-4 absolute left-3 top-2.5 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                </div>
              </div>
              <div class="flex-1 overflow-y-auto p-2 space-y-0.5 custom-scrollbar" id="toc-list">
                ${filteredChapters.length ? filteredChapters.map(c => `
                  <button class="toc-item w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all flex items-start gap-3 
                                ${c.i === currentChapter ? 'bg-brand-50 text-brand-700 font-bold' : 'text-surface-600 hover:bg-surface-50'}" 
                          data-idx="${c.i}">
                    <span class="text-[10px] font-mono opacity-40 tabular-nums w-5 mt-0.5 text-right">${c.i + 1}</span>
                    <span class="truncate">${esc(c.name)}</span>
                  </button>
                `).join('') : `<div class="p-8 text-center text-surface-400 text-sm italic">No matches found</div>`}
              </div>
            </div>
          </div>

          <!-- Reader Main Area -->
          <div class="lg:col-span-8 flex flex-col h-[85vh] bg-white rounded-2xl border border-surface-200 shadow-xl overflow-hidden relative">
            <!-- Reader Nav Header -->
            <div class="flex items-center justify-between px-6 py-3 border-b border-surface-100 bg-surface-50/30 backdrop-blur-sm z-10">
              <div class="flex items-center gap-4">
                <div class="text-[10px] font-bold text-surface-500 uppercase tracking-widest tabular-nums">
                  Chapter <span id="ch-num">${currentChapter + 1}</span> of ${spine.length}
                </div>
              </div>
              <div class="flex items-center gap-1">
                <button id="prev-btn" class="p-2 hover:bg-surface-200 rounded-lg text-surface-600 transition-colors disabled:opacity-20" title="Previous Chapter">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
                </button>
                <button id="next-btn" class="p-2 hover:bg-surface-200 rounded-lg text-surface-600 transition-colors disabled:opacity-20" title="Next Chapter">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
                </button>
              </div>
            </div>

            <!-- Reading Window -->
            <div id="reader-window" class="flex-1 overflow-y-auto custom-scrollbar transition-colors duration-500 ${themes[theme]}">
              <div id="reader-content-area" class="mx-auto max-w-[680px] px-8 py-16 lg:px-14 lg:py-24 leading-relaxed" style="font-size: ${fontSize}%">
                <!-- Initial loading state -->
                <div class="flex flex-col items-center justify-center py-24 text-surface-400 animate-pulse">
                   <svg class="w-12 h-12 mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
                   <p class="font-serif italic text-lg">Initializing reader...</p>
                </div>
              </div>
              
              <!-- Footer Nav -->
              <div class="max-w-[680px] mx-auto px-8 pb-16 flex justify-between items-center opacity-40 hover:opacity-100 transition-all border-t border-current/10 pt-8 mt-12 mb-8">
                <button id="f-prev" class="text-[10px] font-bold uppercase tracking-widest hover:text-brand-600 transition-colors">← Previous Chapter</button>
                <button id="scroll-top" class="p-2.5 bg-current/5 rounded-full hover:bg-brand-500 hover:text-white transition-all">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18"/></svg>
                </button>
                <button id="f-next" class="text-[10px] font-bold uppercase tracking-widest hover:text-brand-600 transition-colors">Next Chapter →</button>
              </div>
            </div>

            <!-- Progress Bar -->
            <div class="h-1 w-full bg-surface-100">
              <div id="read-progress" class="h-full bg-brand-500 transition-all duration-500" style="width: ${((currentChapter + 1) / spine.length) * 100}%"></div>
            </div>
          </div>
        </div>
      </div>

      <style>
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(100,116,139,0.2); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(100,116,139,0.4); }
        
        #reader-content-area { font-family: 'Georgia', 'Palatino', 'Times New Roman', serif; }
        #reader-content-area h1, #reader-content-area h2, #reader-content-area h3 { font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; font-weight: 800; line-height: 1.25; margin: 2.5em 0 1.2em; color: inherit; }
        #reader-content-area h1 { font-size: 2em; text-align: center; border-bottom: 1px solid currentColor; padding-bottom: 0.5em; opacity: 0.95; }
        #reader-content-area h2 { font-size: 1.6em; border-left: 4px solid currentColor; padding-left: 0.75em; }
        #reader-content-area p { margin-bottom: 1.6em; line-height: 1.85; }
        #reader-content-area img { max-width: 100%; height: auto; border-radius: 8px; margin: 2.5rem auto; display: block; box-shadow: 0 10px 30px -10px rgba(0,0,0,0.15); }
        #reader-content-area a { color: #3b82f6; text-decoration: underline; text-underline-offset: 4px; }
        #reader-content-area blockquote { border-left: 3px solid currentColor; padding: 0.5em 0 0.5em 1.5em; margin: 2rem 0; font-style: italic; opacity: 0.8; font-size: 1.05em; }
        #reader-content-area ul, #reader-content-area ol { margin-bottom: 1.5em; padding-left: 1.5em; }
        #reader-content-area li { margin-bottom: 0.5em; }
      </style>
    `;

    helpers.render(html);
    const root = helpers.getRenderEl();

    // Event Handlers
    const updateTOCList = () => {
      const { spine, currentChapter, tocSearch } = helpers.getState();
      const list = root.querySelector('#toc-list');
      const search = tocSearch.toLowerCase();
      
      const filtered = spine.map((path, i) => {
        let name = path.split('/').pop().replace(/\.(x?html?)$/i, '').replace(/[_-]/g, ' ');
        if (name.length > 50) name = name.substring(0, 47) + '...';
        return { path, i, name };
      }).filter(c => !search || c.name.toLowerCase().includes(search));

      list.innerHTML = filtered.length ? filtered.map(c => `
        <button class="toc-item w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all flex items-start gap-3 
                      ${c.i === currentChapter ? 'bg-brand-50 text-brand-700 font-bold' : 'text-surface-600 hover:bg-surface-50'}" 
                data-idx="${c.i}">
          <span class="text-[10px] font-mono opacity-40 tabular-nums w-5 mt-0.5 text-right">${c.i + 1}</span>
          <span class="truncate">${esc(c.name)}</span>
        </button>
      `).join('') : `<div class="p-8 text-center text-surface-400 text-sm italic">No matches found</div>`;

      list.querySelectorAll('.toc-item').forEach(btn => {
        btn.onclick = () => jumpToChapter(helpers, parseInt(btn.dataset.idx));
      });
    };

    root.querySelector('#toc-filter').oninput = (e) => {
      helpers.setState({ tocSearch: e.target.value });
      updateTOCList();
    };

    root.querySelector('#prev-btn').onclick = root.querySelector('#f-prev').onclick = () => {
      const { currentChapter } = helpers.getState();
      if (currentChapter > 0) jumpToChapter(helpers, currentChapter - 1);
    };

    root.querySelector('#next-btn').onclick = root.querySelector('#f-next').onclick = () => {
      const { currentChapter, spine } = helpers.getState();
      if (currentChapter < spine.length - 1) jumpToChapter(helpers, currentChapter + 1);
    };

    root.querySelector('#size-slider').oninput = (e) => {
      const val = parseInt(e.target.value);
      helpers.setState({ fontSize: val });
      root.querySelector('#reader-content-area').style.fontSize = val + '%';
      root.querySelector('span.font-mono').textContent = val + '%';
    };

    root.querySelectorAll('.theme-btn').forEach(btn => {
      btn.onclick = () => {
        const theme = btn.dataset.theme;
        helpers.setState({ theme });
        renderApp(helpers); // Re-render for global theme change
      };
    });

    root.querySelector('#scroll-top').onclick = () => {
      root.querySelector('#reader-window').scrollTo({ top: 0, behavior: 'smooth' });
    };

    // Initial Chapter Load
    loadChapter(helpers, currentChapter);
  }

  async function jumpToChapter(helpers, idx) {
    const { spine } = helpers.getState();
    helpers.setState({ currentChapter: idx });
    
    const root = helpers.getRenderEl();
    const win = root.querySelector('#reader-window');
    const area = root.querySelector('#reader-content-area');
    
    // UI Feedback
    root.querySelector('#ch-num').textContent = idx + 1;
    root.querySelector('#read-progress').style.width = `${((idx + 1) / spine.length) * 100}%`;
    root.querySelector('#prev-btn').disabled = root.querySelector('#f-prev').disabled = (idx === 0);
    root.querySelector('#next-btn').disabled = root.querySelector('#f-next').disabled = (idx === spine.length - 1);

    // Update Highlights
    root.querySelectorAll('.toc-item').forEach(btn => {
      if (parseInt(btn.dataset.idx) === idx) {
        btn.classList.add('bg-brand-50', 'text-brand-700', 'font-bold');
        btn.classList.remove('text-surface-600');
        btn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else {
        btn.classList.remove('bg-brand-50', 'text-brand-700', 'font-bold');
        btn.classList.add('text-surface-600');
      }
    });

    await loadChapter(helpers, idx);
  }

  async function loadChapter(helpers, idx) {
    const root = helpers.getRenderEl();
    const area = root.querySelector('#reader-content-area');
    const win = root.querySelector('#reader-window');
    if (!area) return;

    const { zip, opfDir, spine } = helpers.getState();
    const path = spine[idx];
    const fullPath = opfDir + path;
    const file = zip.file(fullPath);

    area.innerHTML = `
      <div class="flex flex-col items-center justify-center py-32 text-surface-400 animate-pulse">
        <svg class="w-12 h-12 mb-4 opacity-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
        <p class="font-serif italic text-lg opacity-40">Loading chapter content...</p>
      </div>
    `;
    win.scrollTop = 0;

    try {
      if (!file) throw new Error(`Missing chapter asset: ${path}`);
      
      const rawText = await file.async('text');
      const parser = new DOMParser();
      const doc = parser.parseFromString(rawText, 'text/html');
      const baseDir = fullPath.includes('/') ? fullPath.substring(0, fullPath.lastIndexOf('/') + 1) : '';

      // Resolve Internal Assets (Images/SVGs)
      const images = Array.from(doc.querySelectorAll('img, image'));
      for (const img of images) {
        let src = img.getAttribute('src') || img.getAttribute('xlink:href');
        if (src && !src.startsWith('data:') && !src.includes('://')) {
          const cleanSrc = src.split('#')[0];
          const imgPath = resolvePath(baseDir, cleanSrc);
          const imgFile = zip.file(imgPath);
          if (imgFile) {
            const blob = await imgFile.async('blob');
            const url = URL.createObjectURL(blob);
            _createdUrls.push(url);
            if (img.tagName.toLowerCase() === 'image') img.setAttribute('xlink:href', url);
            else img.src = url;
          }
        }
      }

      // Handle Internal Chapter Linking
      doc.querySelectorAll('a').forEach(link => {
        const href = link.getAttribute('href');
        if (href && !href.includes('://') && !href.startsWith('#')) {
          const cleanHref = href.split('#')[0];
          const targetPath = resolvePath(baseDir, cleanHref);
          // Look for chapter in spine relative to OPF
          const targetIdx = spine.findIndex(s => (opfDir + s) === targetPath);
          if (targetIdx !== -1) {
            link.onclick = (e) => {
              e.preventDefault();
              jumpToChapter(helpers, targetIdx);
            };
            link.classList.add('cursor-pointer', 'text-brand-600');
          }
        }
      });

      // B6: Sanitize and Render
      area.innerHTML = sanitize(doc.body.innerHTML);

    } catch (err) {
      area.innerHTML = `
        <div class="py-24 text-center px-6">
          <div class="inline-flex p-4 bg-red-50 text-red-600 rounded-2xl mb-6">
            <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
          </div>
          <h2 class="text-2xl font-bold text-slate-900 mb-3">Chapter Rendering Failed</h2>
          <p class="text-slate-500 max-w-sm mx-auto mb-8">${esc(err.message)}</p>
          <button onclick="location.reload()" class="px-6 py-2 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all">Reload Reader</button>
        </div>
      `;
    }
  }

})();
