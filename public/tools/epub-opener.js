(function() {
  'use strict';

  /**
   * OmniOpener — Production-Grade EPUB Reader
   * High-performance, client-side EPUB viewer with full sanitization and local-only processing.
   */

  let _createdUrls = [];

  function revokeAll() {
    _createdUrls.forEach(url => URL.revokeObjectURL(url));
    _createdUrls = [];
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
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
    
    // Remove scripts, frames, and interactive elements
    const dangerous = doc.querySelectorAll('script, iframe, object, embed, link[rel="stylesheet"], style, form, input, button, noscript');
    dangerous.forEach(n => n.remove());

    // Clean attributes
    const all = doc.querySelectorAll('*');
    all.forEach(el => {
      const attrs = Array.from(el.attributes);
      for (const attr of attrs) {
        const name = attr.name.toLowerCase();
        const value = attr.value.toLowerCase();
        
        if (name.startsWith('on')) {
          el.removeAttribute(attr.name);
        } else if ((name === 'href' || name === 'src' || name === 'xlink:href') && value.startsWith('javascript:')) {
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
      infoHtml: '<strong>Secure & Offline:</strong> Your books are processed locally in your browser. No data ever leaves your device.',

      onInit: function(helpers) {
        helpers.loadScript('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js');
      },

      onFile: async function _onFile(file, content, helpers) {
        revokeAll();

        // B1: Wait for JSZip
        if (typeof JSZip === 'undefined') {
          helpers.showLoading('Starting reader engine...');
          let count = 0;
          const interval = setInterval(() => {
            if (typeof JSZip !== 'undefined') {
              clearInterval(interval);
              _onFile(file, content, helpers);
            } else if (++count > 50) {
              clearInterval(interval);
              helpers.showError('Engine Load Failure', 'Failed to initialize the book reader. Please check your internet connection and try again.');
            }
          }, 200);
          return;
        }

        helpers.showLoading('Opening book archive...');

        try {
          const zip = await JSZip.loadAsync(content);
          
          // 1. Find the OPF file via container.xml
          const containerFile = zip.file('META-INF/container.xml');
          if (!containerFile) throw new Error('Invalid EPUB structure (missing container.xml)');
          
          const containerXml = await containerFile.async('text');
          const containerDoc = new DOMParser().parseFromString(containerXml, 'text/xml');
          const opfPath = containerDoc.querySelector('rootfile')?.getAttribute('full-path');
          if (!opfPath) throw new Error('Could not find package descriptor');

          const opfFile = zip.file(opfPath);
          if (!opfFile) throw new Error(`Package file not found: ${opfPath}`);

          // 2. Parse OPF for metadata and manifest
          const opfXml = await opfFile.async('text');
          const opfDoc = new DOMParser().parseFromString(opfXml, 'text/xml');
          const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';

          const metadata = {
            title: opfDoc.querySelector('title, dc\\:title')?.textContent || 'Untitled Book',
            creator: opfDoc.querySelector('creator, dc\\:creator')?.textContent || 'Unknown Author',
            description: opfDoc.querySelector('description, dc\\:description')?.textContent || '',
            language: opfDoc.querySelector('language, dc\\:language')?.textContent || 'en'
          };

          const manifest = {};
          opfDoc.querySelectorAll('manifest item').forEach(item => {
            manifest[item.getAttribute('id')] = item.getAttribute('href');
          });

          const spine = Array.from(opfDoc.querySelectorAll('spine itemref'))
            .map(ref => manifest[ref.getAttribute('idref')])
            .filter(Boolean);

          if (spine.length === 0) throw new Error('This book appears to have no chapters.');

          // 3. Extract Cover Image
          let coverUrl = null;
          let coverId = opfDoc.querySelector('meta[name="cover"]')?.getAttribute('content');
          if (!coverId) coverId = opfDoc.querySelector('item[properties~="cover-image"]')?.getAttribute('id');
          
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
          console.error('[EPUB ERROR]', err);
          helpers.showError('Failed to Open Book', `This file could not be parsed as a standard EPUB: ${err.message}`);
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
          label: '📥 Save a Copy',
          onClick: (helpers) => helpers.download(helpers.getFile().name, helpers.getContent(), 'application/epub+zip')
        }
      ],

      onDestroy: revokeAll
    });
  };

  function renderApp(helpers) {
    const { metadata, coverUrl, spine, currentChapter, fontSize, theme, tocSearch } = helpers.getState();
    const file = helpers.getFile();

    const themes = {
      light: 'bg-white text-surface-900',
      sepia: 'bg-[#f4ecd8] text-[#5b4636]',
      dark: 'bg-[#1a1a1a] text-[#d1d1d1]'
    };

    const filteredSpine = spine.map((path, i) => ({ path, i, name: path.split('/').pop().replace(/\.(x?html?)$/i, '').replace(/[_-]/g, ' ') }))
      .filter(item => !tocSearch || item.name.toLowerCase().includes(tocSearch.toLowerCase()));

    const html = `
      <div class="max-w-7xl mx-auto animate-in fade-in duration-500">
        <!-- U1: File Info Bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-200">
          <span class="font-bold text-surface-900">${esc(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span class="tabular-nums">${formatBytes(file.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="px-2 py-0.5 bg-brand-100 text-brand-700 rounded text-[10px] font-bold uppercase tracking-wider">EPUB Book</span>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <!-- Left Panel: Info & TOC -->
          <div class="lg:col-span-4 space-y-6 lg:sticky lg:top-4">
            <!-- Metadata Card -->
            <div class="bg-white rounded-2xl border border-surface-200 p-6 shadow-sm overflow-hidden">
              <div class="flex gap-4">
                <div class="w-24 shrink-0 aspect-[2/3] bg-surface-100 rounded-lg overflow-hidden border border-surface-200 shadow-sm">
                  ${coverUrl ? `<img src="${coverUrl}" class="w-full h-full object-cover">` : `<div class="w-full h-full flex items-center justify-center text-3xl opacity-20">📚</div>`}
                </div>
                <div class="flex-1 min-w-0">
                  <h1 class="font-bold text-surface-900 leading-tight mb-1 line-clamp-3" title="${esc(metadata.title)}">${esc(metadata.title)}</h1>
                  <p class="text-surface-500 text-sm truncate">${esc(metadata.creator)}</p>
                </div>
              </div>

              <div class="mt-6 pt-6 border-t border-surface-100 space-y-5">
                <!-- Theme Selector -->
                <div>
                  <label class="text-[10px] font-bold uppercase tracking-widest text-surface-400 mb-2 block">Reading Theme</label>
                  <div class="flex gap-2">
                    ${['light', 'sepia', 'dark'].map(t => `
                      <button class="theme-btn flex-1 py-2 rounded-lg border-2 transition-all ${theme === t ? 'border-brand-500' : 'border-transparent'}" 
                              data-theme="${t}" style="background: ${t === 'light' ? '#fff' : t === 'sepia' ? '#f4ecd8' : '#333'}">
                        <span class="text-xs font-semibold ${t === 'dark' ? 'text-white' : 'text-surface-700'} capitalize">${t}</span>
                      </button>
                    `).join('')}
                  </div>
                </div>

                <!-- Font Size Slider -->
                <div>
                  <div class="flex justify-between items-center mb-2">
                    <label class="text-[10px] font-bold uppercase tracking-widest text-surface-400">Text Size</label>
                    <span class="text-xs font-mono text-surface-600">${fontSize}%</span>
                  </div>
                  <input type="range" id="size-slider" min="70" max="250" value="${fontSize}" 
                         class="w-full h-1.5 bg-surface-200 rounded-lg appearance-none cursor-pointer accent-brand-600">
                </div>
              </div>
            </div>

            <!-- TOC Card -->
            <div class="bg-white rounded-2xl border border-surface-200 flex flex-col h-[50vh] overflow-hidden shadow-sm">
              <div class="p-4 border-b border-surface-100 bg-surface-50/50">
                <div class="flex items-center justify-between mb-3">
                  <h3 class="font-bold text-surface-800">Table of Contents</h3>
                  <span class="text-[10px] bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-bold">${spine.length} Sections</span>
                </div>
                <div class="relative">
                  <input type="text" id="toc-filter" placeholder="Filter chapters..." value="${esc(tocSearch)}"
                         class="w-full pl-9 pr-4 py-2 bg-white border border-surface-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all">
                  <svg class="w-4 h-4 absolute left-3 top-2.5 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                </div>
              </div>
              <div class="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar" id="toc-list">
                ${filteredSpine.length ? filteredSpine.map(item => `
                  <button class="toc-item w-full text-left px-4 py-3 rounded-xl text-sm transition-all flex items-start gap-4 
                                ${item.i === currentChapter ? 'bg-brand-50 text-brand-700 font-bold ring-1 ring-brand-100' : 'text-surface-600 hover:bg-surface-50'}" 
                          data-idx="${item.i}">
                    <span class="text-[10px] font-mono opacity-40 tabular-nums w-4 mt-1 text-right">${item.i + 1}</span>
                    <span class="truncate">${esc(item.name)}</span>
                  </button>
                `).join('') : `
                  <div class="p-8 text-center text-surface-400 text-sm italic">No chapters matching your search</div>
                `}
              </div>
            </div>
          </div>

          <!-- Reader Content -->
          <div class="lg:col-span-8 flex flex-col h-[85vh] bg-white rounded-2xl border border-surface-200 shadow-xl overflow-hidden relative">
            <!-- Reader Navigation Header -->
            <div class="flex items-center justify-between px-6 py-4 border-b border-surface-100 bg-surface-50/30 z-10">
              <div class="flex items-center gap-4">
                <div class="text-xs font-bold text-surface-500 uppercase tracking-widest tabular-nums">
                  Chapter <span id="current-chapter-display">${currentChapter + 1}</span> / ${spine.length}
                </div>
              </div>
              <div class="flex items-center gap-2">
                <button id="prev-btn" class="p-2 hover:bg-surface-200 rounded-lg text-surface-600 transition-colors disabled:opacity-20 disabled:cursor-not-allowed" title="Previous Chapter">
                  <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
                </button>
                <button id="next-btn" class="p-2 hover:bg-surface-200 rounded-lg text-surface-600 transition-colors disabled:opacity-20 disabled:cursor-not-allowed" title="Next Chapter">
                  <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
                </button>
              </div>
            </div>

            <!-- Reading Area -->
            <div id="reader-window" class="flex-1 overflow-y-auto custom-scrollbar transition-colors duration-300 ${themes[theme] || themes.light}">
              <div id="reader-content-area" class="mx-auto max-w-[720px] px-8 py-12 lg:px-16 lg:py-20 leading-[1.8]" style="font-size: ${fontSize}%">
                <!-- Content will be injected here -->
                <div class="flex flex-col items-center justify-center py-24 text-surface-300 animate-pulse">
                  <svg class="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
                  <p class="font-serif italic text-lg text-center">Loading chapter content...</p>
                </div>
              </div>
              
              <div class="max-w-[720px] mx-auto px-8 pb-12 flex justify-between items-center opacity-50 hover:opacity-100 transition-opacity">
                <button id="footer-prev" class="text-xs font-bold uppercase tracking-widest hover:text-brand-600">← Previous</button>
                <button id="go-top" class="p-3 bg-surface-100 rounded-full hover:bg-brand-50 hover:text-brand-600 transition-all">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18"/></svg>
                </button>
                <button id="footer-next" class="text-xs font-bold uppercase tracking-widest hover:text-brand-600">Next →</button>
              </div>
            </div>

            <!-- Global Reading Progress -->
            <div class="h-1.5 w-full bg-surface-100">
              <div id="total-progress-bar" class="h-full bg-brand-500 transition-all duration-700 shadow-[0_0_10px_rgba(37,99,235,0.3)]" style="width: ${((currentChapter + 1) / spine.length) * 100}%"></div>
            </div>
          </div>
        </div>
      </div>

      <style>
        .custom-scrollbar::-webkit-scrollbar { width: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 10px; border: 2px solid transparent; background-clip: content-box; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.2); border: 2px solid transparent; background-clip: content-box; }
        
        #reader-content-area { font-family: 'Georgia', 'Times New Roman', serif; }
        #reader-content-area h1, #reader-content-area h2, #reader-content-area h3 { font-family: system-ui, -apple-system, sans-serif; font-weight: 800; line-height: 1.2; margin: 2em 0 1em; color: inherit; }
        #reader-content-area h1 { font-size: 2.2em; text-align: center; border-bottom: 2px solid currentColor; padding-bottom: 0.5em; opacity: 0.9; }
        #reader-content-area h2 { font-size: 1.8em; margin-top: 1.5em; }
        #reader-content-area p { margin-bottom: 1.5em; }
        #reader-content-area img { max-width: 100%; height: auto; border-radius: 12px; margin: 3rem auto; display: block; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
        #reader-content-area a { color: #2563eb; text-decoration: underline; text-underline-offset: 4px; }
        #reader-content-area blockquote { border-left: 4px solid currentColor; padding-left: 2rem; margin: 2.5rem 0; font-style: italic; opacity: 0.8; }
        
        .theme-btn.border-brand-500 { box-shadow: 0 0 0 1px #2563eb; }
      </style>
    `;

    helpers.render(html);
    const root = helpers.getRenderEl();

    // Event Listeners
    root.querySelectorAll('.toc-item').forEach(btn => {
      btn.onclick = () => jumpToChapter(helpers, parseInt(btn.dataset.idx));
    });

    root.querySelector('#prev-btn').onclick = root.querySelector('#footer-prev').onclick = () => {
      const { currentChapter } = helpers.getState();
      if (currentChapter > 0) jumpToChapter(helpers, currentChapter - 1);
    };

    root.querySelector('#next-btn').onclick = root.querySelector('#footer-next').onclick = () => {
      const { currentChapter, spine } = helpers.getState();
      if (currentChapter < spine.length - 1) jumpToChapter(helpers, currentChapter + 1);
    };

    root.querySelector('#size-slider').oninput = (e) => {
      const val = parseInt(e.target.value);
      helpers.setState({ fontSize: val });
      root.querySelector('#reader-content-area').style.fontSize = val + '%';
      root.querySelector('span.font-mono.text-surface-600').textContent = val + '%';
    };

    root.querySelectorAll('.theme-btn').forEach(btn => {
      btn.onclick = () => {
        const theme = btn.dataset.theme;
        helpers.setState({ theme });
        renderApp(helpers);
      };
    });

    root.querySelector('#toc-filter').oninput = (e) => {
      helpers.setState({ tocSearch: e.target.value });
      // Partial re-render of TOC only for performance
      const list = root.querySelector('#toc-list');
      const { spine, currentChapter } = helpers.getState();
      const search = e.target.value.toLowerCase();
      const filtered = spine.map((path, i) => ({ path, i, name: path.split('/').pop().replace(/\.(x?html?)$/i, '').replace(/[_-]/g, ' ') }))
        .filter(item => !search || item.name.toLowerCase().includes(search));
      
      list.innerHTML = filtered.length ? filtered.map(item => `
        <button class="toc-item w-full text-left px-4 py-3 rounded-xl text-sm transition-all flex items-start gap-4 
                      ${item.i === currentChapter ? 'bg-brand-50 text-brand-700 font-bold ring-1 ring-brand-100' : 'text-surface-600 hover:bg-surface-50'}" 
                data-idx="${item.i}">
          <span class="text-[10px] font-mono opacity-40 tabular-nums w-4 mt-1 text-right">${item.i + 1}</span>
          <span class="truncate">${esc(item.name)}</span>
        </button>
      `).join('') : '<div class="p-8 text-center text-surface-400 text-sm italic">No chapters matching search</div>';
      
      list.querySelectorAll('.toc-item').forEach(btn => {
        btn.onclick = () => jumpToChapter(helpers, parseInt(btn.dataset.idx));
      });
    };

    root.querySelector('#go-top').onclick = () => {
      root.querySelector('#reader-window').scrollTo({ top: 0, behavior: 'smooth' });
    };

    // Load initial content
    loadChapterContent(helpers, currentChapter);
  }

  async function jumpToChapter(helpers, idx) {
    const root = helpers.getRenderEl();
    const { spine } = helpers.getState();
    
    helpers.setState({ currentChapter: idx });
    
    // Update simple UI elements immediately
    root.querySelector('#current-chapter-display').textContent = idx + 1;
    root.querySelector('#total-progress-bar').style.width = `${((idx + 1) / spine.length) * 100}%`;
    root.querySelector('#prev-btn').disabled = root.querySelector('#footer-prev').disabled = (idx === 0);
    root.querySelector('#next-btn').disabled = root.querySelector('#footer-next').disabled = (idx === spine.length - 1);

    // Update TOC highlights
    root.querySelectorAll('.toc-item').forEach(btn => {
      if (parseInt(btn.dataset.idx) === idx) {
        btn.classList.add('bg-brand-50', 'text-brand-700', 'font-bold', 'ring-1', 'ring-brand-100');
        btn.classList.remove('text-surface-600', 'hover:bg-surface-50');
        btn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else {
        btn.classList.remove('bg-brand-50', 'text-brand-700', 'font-bold', 'ring-1', 'ring-brand-100');
        btn.classList.add('text-surface-600', 'hover:bg-surface-50');
      }
    });

    await loadChapterContent(helpers, idx);
  }

  async function loadChapterContent(helpers, idx) {
    const root = helpers.getRenderEl();
    const area = root.querySelector('#reader-content-area');
    const win = root.querySelector('#reader-window');
    if (!area) return;

    const { zip, opfDir, spine } = helpers.getState();
    const path = spine[idx];
    const fullPath = opfDir + path;
    const file = zip.file(fullPath);

    area.innerHTML = `
      <div class="flex flex-col items-center justify-center py-32 text-surface-300 animate-pulse">
        <svg class="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
        <p class="font-serif italic text-lg">Retrieving chapter...</p>
      </div>
    `;
    win.scrollTop = 0;

    try {
      if (!file) throw new Error(`Missing chapter file: ${path}`);
      
      const html = await file.async('text');
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const baseDir = fullPath.includes('/') ? fullPath.substring(0, fullPath.lastIndexOf('/') + 1) : '';

      // Fix Assets (Images)
      const images = Array.from(doc.querySelectorAll('img, image'));
      for (const img of images) {
        let src = img.getAttribute('src') || img.getAttribute('xlink:href');
        if (src && !src.startsWith('data:') && !src.includes('://')) {
          const imgPath = resolvePath(baseDir, src.split('#')[0]);
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

      // Intercept Internal Links
      doc.querySelectorAll('a').forEach(link => {
        const href = link.getAttribute('href');
        if (href && !href.includes('://') && !href.startsWith('#')) {
          const targetPath = resolvePath(baseDir, href.split('#')[0]);
          const targetIdx = spine.findIndex(s => (opfDir + s) === targetPath);
          if (targetIdx !== -1) {
            link.onclick = (e) => {
              e.preventDefault();
              jumpToChapter(helpers, targetIdx);
            };
            link.classList.add('cursor-pointer');
          }
        }
      });

      // B6: Final Sanitize & Render
      area.innerHTML = sanitize(doc.body.innerHTML);

    } catch (err) {
      area.innerHTML = `
        <div class="py-20 text-center">
          <div class="inline-flex p-4 bg-red-50 text-red-600 rounded-full mb-4">
            <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
          </div>
          <h2 class="text-xl font-bold mb-2">Chapter Error</h2>
          <p class="text-surface-500 max-w-sm mx-auto">${esc(err.message)}</p>
        </div>
      `;
    }
  }

})();
