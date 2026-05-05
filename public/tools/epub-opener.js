(function() {
  'use strict';

  /**
   * OmniOpener — EPUB Opener Tool
   * A production-grade, client-side EPUB viewer using JSZip and optimized DOM rendering.
   */

  const CREATED_URLS = new Set();

  function formatSize(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function sanitizeHtml(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Remove dangerous tags
    const dangerTags = doc.querySelectorAll('script, iframe, object, embed, link[rel="stylesheet"], style, form, input, button');
    dangerTags.forEach(t => t.remove());
    
    // Clean attributes
    const allElements = doc.querySelectorAll('*');
    allElements.forEach(el => {
      const attrs = Array.from(el.attributes);
      for (const attr of attrs) {
        if (attr.name.startsWith('on')) {
          el.removeAttribute(attr.name);
        } else if ((attr.name === 'href' || attr.name === 'src' || attr.name === 'xlink:href') && 
                   attr.value.toLowerCase().startsWith('javascript:')) {
          el.removeAttribute(attr.name);
        }
      }
    });
    
    return doc.body.innerHTML;
  }

  function resolvePath(base, rel) {
    const stack = base.split('/').filter(p => p);
    if (base && !base.endsWith('/')) {
      stack.pop();
    }
    const parts = rel.split('/');
    for (const part of parts) {
      if (part === '.' || !part) continue;
      if (part === '..') stack.pop();
      else stack.push(part);
    }
    return stack.join('/');
  }

  function cleanupUrls() {
    CREATED_URLS.forEach(url => URL.revokeObjectURL(url));
    CREATED_URLS.clear();
  }

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.epub',
      dropLabel: 'Drop an EPUB book here',
      binary: true,
      infoHtml: '<strong>Secure Reading:</strong> This EPUB reader operates entirely in your browser. No data is sent to any server.',

      onInit: function(helpers) {
        helpers.loadScript('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js');
      },

      onFile: async function _onFile(file, content, helpers) {
        cleanupUrls();
        
        // B1: Check if JSZip is loaded
        if (typeof JSZip === 'undefined') {
          helpers.showLoading('Initializing engine...');
          let attempts = 0;
          const checkZip = setInterval(() => {
            attempts++;
            if (typeof JSZip !== 'undefined') {
              clearInterval(checkZip);
              _onFile(file, content, helpers);
            } else if (attempts > 20) {
              clearInterval(checkZip);
              helpers.showError('Engine timeout', 'The JSZip library failed to load. Please check your connection and try again.');
            }
          }, 500);
          return;
        }

        helpers.showLoading('Parsing EPUB structure...');
        
        try {
          const zip = await JSZip.loadAsync(content);
          
          // Locate Container
          const containerFile = zip.file('META-INF/container.xml');
          if (!containerFile) throw new Error('Missing container descriptor (META-INF/container.xml)');
          
          const containerXml = await containerFile.async('text');
          const containerDoc = new DOMParser().parseFromString(containerXml, 'text/xml');
          const rootfile = containerDoc.querySelector('rootfile');
          if (!rootfile) throw new Error('No rootfile found in EPUB container');
          
          const opfPath = rootfile.getAttribute('full-path');
          const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';
          
          const opfFile = zip.file(opfPath);
          if (!opfFile) throw new Error(`OPF file not found at ${opfPath}`);
          
          // Parse OPF
          const opfXml = await opfFile.async('text');
          const opfDoc = new DOMParser().parseFromString(opfXml, 'text/xml');

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

          const spine = Array.from(opfDoc.querySelectorAll('spine itemref')).map(ref => {
            return manifest[ref.getAttribute('idref')];
          }).filter(Boolean);

          if (spine.length === 0) throw new Error('EPUB spine is empty');

          // Try to find cover
          let coverUrl = null;
          let coverId = opfDoc.querySelector('meta[name="cover"]')?.getAttribute('content');
          if (!coverId) {
            coverId = opfDoc.querySelector('item[properties~="cover-image"]')?.getAttribute('id');
          }
          
          if (coverId && manifest[coverId]) {
            const coverPath = opfDir + manifest[coverId];
            const coverFile = zip.file(coverPath);
            if (coverFile) {
              const coverBlob = await coverFile.async('blob');
              coverUrl = URL.createObjectURL(coverBlob);
              CREATED_URLS.add(coverUrl);
            }
          }

          helpers.setState({
            zip,
            opfDir,
            spine,
            metadata,
            coverUrl,
            currentChapter: 0,
            zoom: 100
          });

          renderViewer(helpers);
        } catch (err) {
          console.error('[EPUB]', err);
          helpers.showError('Could not open EPUB', `The file may be corrupted or in an unsupported format: ${err.message}`);
        }
      },

      actions: [
        {
          label: '📋 Copy Text',
          id: 'copy',
          onClick: function(helpers, btn) {
            const area = document.getElementById('epub-reader-body');
            if (area) helpers.copyToClipboard(area.innerText, btn);
          }
        },
        {
          label: '📥 Download',
          id: 'download',
          onClick: function(helpers) {
            helpers.download(helpers.getFile().name, helpers.getContent(), 'application/epub+zip');
          }
        }
      ],

      onDestroy: function() {
        cleanupUrls();
      }
    });
  };

  function renderViewer(helpers) {
    const { metadata, coverUrl, spine, currentChapter, zoom } = helpers.getState();
    const file = helpers.getFile();

    const html = `
      <div class="animate-in fade-in slide-in-from-bottom-2 duration-500">
        <!-- U1: File Info Bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 border border-surface-100">
          <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(file.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">.epub book</span>
        </div>

        <div class="flex flex-col lg:flex-row gap-6 h-[75vh]">
          <!-- Sidebar: Info & TOC -->
          <div class="w-full lg:w-80 flex flex-col gap-4 overflow-hidden shrink-0">
            <!-- Book Info Card -->
            <div class="bg-white rounded-2xl border border-surface-200 p-5 shadow-sm">
              ${coverUrl ? `
                <div class="aspect-[2/3] w-full mb-4 rounded-xl overflow-hidden shadow-md border border-surface-100 bg-surface-50">
                  <img src="${coverUrl}" class="w-full h-full object-cover">
                </div>
              ` : `
                <div class="aspect-[2/3] w-full mb-4 rounded-xl bg-surface-50 flex items-center justify-center text-surface-300 text-5xl">📚</div>
              `}
              <h2 class="font-bold text-surface-900 text-lg leading-tight line-clamp-2 mb-1" title="${escapeHtml(metadata.title)}">${escapeHtml(metadata.title)}</h2>
              <p class="text-surface-500 text-sm mb-4">${escapeHtml(metadata.creator)}</p>
              
              <div class="space-y-2">
                <div class="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-surface-400">
                  <span>Font Size</span>
                  <span id="zoom-val" class="font-mono text-surface-500">${zoom}%</span>
                </div>
                <input type="range" id="zoom-slider" min="50" max="250" value="${zoom}" 
                       class="w-full h-1.5 bg-surface-200 rounded-lg appearance-none cursor-pointer accent-brand-600">
              </div>
            </div>

            <!-- U10: Section Header with Count -->
            <div class="flex-1 bg-white rounded-2xl border border-surface-200 flex flex-col overflow-hidden shadow-sm">
              <div class="px-4 py-3 border-b border-surface-100 bg-surface-50/50">
                <div class="flex items-center justify-between">
                  <h3 class="font-semibold text-surface-800">Contents</h3>
                  <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${spine.length} items</span>
                </div>
              </div>
              <div class="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                ${spine.map((path, i) => {
                  const name = path.split('/').pop().replace(/\.(x?html?)$/i, '').replace(/[_-]/g, ' ');
                  const isCurrent = i === currentChapter;
                  return `
                    <button class="toc-btn w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all flex items-start gap-3 
                                  ${isCurrent ? 'bg-brand-50 text-brand-700 font-semibold ring-1 ring-brand-100' : 'text-surface-600 hover:bg-surface-50'}" 
                            data-idx="${i}">
                      <span class="text-[10px] font-mono opacity-40 tabular-nums w-4 mt-1 text-right">${i + 1}</span>
                      <span class="truncate">${escapeHtml(name)}</span>
                    </button>
                  `;
                }).join('')}
              </div>
            </div>
          </div>

          <!-- Reader Area -->
          <div class="flex-1 flex flex-col min-w-0 bg-white rounded-2xl border border-surface-200 overflow-hidden shadow-sm">
            <!-- Reader Header -->
            <div class="flex items-center justify-between px-6 py-3 border-b border-surface-100 bg-surface-50/30">
              <div class="text-xs font-semibold text-surface-400 uppercase tracking-widest" id="reader-status">
                Section ${currentChapter + 1} of ${spine.length}
              </div>
              <div class="flex items-center gap-1">
                <button id="btn-prev" class="p-2 hover:bg-surface-100 rounded-lg text-surface-500 transition-colors disabled:opacity-20 disabled:cursor-not-allowed">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
                </button>
                <button id="btn-next" class="p-2 hover:bg-surface-100 rounded-lg text-surface-500 transition-colors disabled:opacity-20 disabled:cursor-not-allowed">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
                </button>
              </div>
            </div>

            <!-- Reader Body -->
            <div id="epub-reader-body" class="flex-1 overflow-y-auto p-8 lg:p-14 leading-relaxed text-surface-800 selection:bg-brand-100 transition-all custom-scrollbar" style="font-size: ${zoom}%">
              <div class="flex flex-col items-center justify-center h-full text-surface-300 animate-pulse">
                <svg class="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
                <p class="italic">Rendering chapter content...</p>
              </div>
            </div>
            
            <!-- Progress Bar -->
            <div class="px-6 py-2 border-t border-surface-100 bg-surface-50/10">
               <div class="h-1 w-full bg-surface-100 rounded-full overflow-hidden">
                 <div id="chapter-progress" class="h-full bg-brand-500 transition-all duration-500" style="width: ${((currentChapter + 1) / spine.length) * 100}%"></div>
               </div>
            </div>
          </div>
        </div>
      </div>

      <style>
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
        
        #epub-reader-body { font-family: 'Georgia', serif; max-width: 800px; margin: 0 auto; }
        #epub-reader-body h1 { font-size: 2.25em; font-weight: 800; color: #0f172a; margin-top: 1.5em; margin-bottom: 0.75em; line-height: 1.2; text-align: center; font-family: ui-sans-serif, system-ui, sans-serif; }
        #epub-reader-body h2 { font-size: 1.75em; font-weight: 700; color: #1e293b; margin-top: 1.25em; margin-bottom: 0.5em; font-family: ui-sans-serif, system-ui, sans-serif; }
        #epub-reader-body h3 { font-size: 1.25em; font-weight: 600; color: #334155; margin-top: 1em; margin-bottom: 0.4em; font-family: ui-sans-serif, system-ui, sans-serif; }
        #epub-reader-body p { margin-bottom: 1.25em; text-indent: 0; }
        #epub-reader-body img { max-width: 100%; height: auto; border-radius: 1rem; box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1); margin: 2.5rem auto; display: block; }
        #epub-reader-body a { color: #2563eb; text-decoration: underline; text-underline-offset: 4px; }
        #epub-reader-body blockquote { border-left: 4px solid #e2e8f0; padding-left: 1.5rem; color: #475569; font-style: italic; margin: 2rem 0; }
      </style>
    `;

    helpers.render(html);

    const renderEl = helpers.getRenderEl();

    renderEl.querySelectorAll('.toc-btn').forEach(btn => {
      btn.onclick = () => loadChapter(helpers, parseInt(btn.dataset.idx));
    });

    renderEl.querySelector('#btn-prev').onclick = () => {
      const { currentChapter } = helpers.getState();
      if (currentChapter > 0) loadChapter(helpers, currentChapter - 1);
    };

    renderEl.querySelector('#btn-next').onclick = () => {
      const { currentChapter, spine } = helpers.getState();
      if (currentChapter < spine.length - 1) loadChapter(helpers, currentChapter + 1);
    };

    const zoomSlider = renderEl.querySelector('#zoom-slider');
    const zoomVal = renderEl.querySelector('#zoom-val');
    const readerBody = renderEl.querySelector('#epub-reader-body');
    
    zoomSlider.oninput = (e) => {
      const val = parseInt(e.target.value);
      helpers.setState({ zoom: val });
      readerBody.style.fontSize = val + '%';
      zoomVal.textContent = val + '%';
    };

    // Load initial chapter
    loadChapter(helpers, currentChapter);
  }

  async function loadChapter(helpers, idx) {
    const state = helpers.getState();
    const { zip, opfDir, spine } = state;
    const renderEl = helpers.getRenderEl();
    const body = renderEl.querySelector('#epub-reader-body');
    const status = renderEl.querySelector('#reader-status');
    const prevBtn = renderEl.querySelector('#btn-prev');
    const nextBtn = renderEl.querySelector('#btn-next');
    const progress = renderEl.querySelector('#chapter-progress');
    
    if (!body) return;

    helpers.setState({ currentChapter: idx });

    // Update UI State immediately
    status.textContent = `Section ${idx + 1} of ${spine.length}`;
    prevBtn.disabled = idx === 0;
    nextBtn.disabled = idx === spine.length - 1;
    if (progress) progress.style.width = `${((idx + 1) / spine.length) * 100}%`;

    // Highlight TOC
    renderEl.querySelectorAll('.toc-btn').forEach((btn, i) => {
      if (i === idx) {
        btn.classList.add('bg-brand-50', 'text-brand-700', 'font-semibold', 'ring-1', 'ring-brand-100');
        btn.classList.remove('text-surface-600', 'hover:bg-surface-50');
        btn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else {
        btn.classList.remove('bg-brand-50', 'text-brand-700', 'font-semibold', 'ring-1', 'ring-brand-100');
        btn.classList.add('text-surface-600', 'hover:bg-surface-50');
      }
    });

    body.innerHTML = `
      <div class="flex flex-col items-center justify-center h-full text-surface-300 animate-pulse">
        <svg class="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
        <p class="italic">Loading chapter content...</p>
      </div>
    `;
    body.scrollTop = 0;

    try {
      const chapterPath = spine[idx];
      const fullPath = opfDir + chapterPath;
      const chapterFile = zip.file(fullPath);
      
      if (!chapterFile) throw new Error(`File not found: ${chapterPath}`);
      
      const rawText = await chapterFile.async('text');
      const parser = new DOMParser();
      const doc = parser.parseFromString(rawText, 'text/html');
      const chapterDir = fullPath.includes('/') ? fullPath.substring(0, fullPath.lastIndexOf('/') + 1) : '';

      // Fix Images: convert to ObjectURLs
      const images = doc.querySelectorAll('img, image');
      for (const img of images) {
        let src = img.getAttribute('src') || img.getAttribute('xlink:href');
        if (src && !src.startsWith('data:') && !src.startsWith('http')) {
          const cleanSrc = src.split('#')[0];
          const imgPath = resolvePath(chapterDir, cleanSrc);
          const imgFile = zip.file(imgPath);
          if (imgFile) {
            const blob = await imgFile.async('blob');
            const url = URL.createObjectURL(blob);
            CREATED_URLS.add(url);
            if (img.tagName.toLowerCase() === 'image') img.setAttribute('xlink:href', url);
            else img.src = url;
          }
        }
      }

      // Fix internal links
      doc.querySelectorAll('a').forEach(a => {
        const href = a.getAttribute('href');
        if (href && !href.startsWith('http') && !href.startsWith('#')) {
          const targetPath = resolvePath(chapterDir, href.split('#')[0]);
          const spineIdx = spine.findIndex(s => (opfDir + s) === targetPath);
          if (spineIdx !== -1) {
            a.onclick = (e) => {
              e.preventDefault();
              loadChapter(helpers, spineIdx);
            };
            a.classList.add('cursor-pointer');
          }
        }
      });

      // B6: Sanitize before inserting
      body.innerHTML = sanitizeHtml(doc.body.innerHTML);
      
    } catch (err) {
      console.error('[EPUB Section]', err);
      body.innerHTML = `
        <div class="flex flex-col items-center justify-center h-full text-center p-8">
          <div class="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-4">
            <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
          </div>
          <h3 class="text-lg font-bold text-surface-900 mb-2">Error loading section</h3>
          <p class="text-surface-500 max-w-xs mx-auto mb-6">${escapeHtml(err.message)}</p>
        </div>
      `;
    }
  }

})();
