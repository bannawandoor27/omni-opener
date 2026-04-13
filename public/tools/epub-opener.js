(function() {
  'use strict';

  /**
   * OmniOpener — EPUB Opener Tool
   * A production-grade, client-side EPUB viewer using JSZip.
   */

  const CREATED_URLS = new Set();

  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
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
    const scripts = doc.querySelectorAll('script, iframe, object, embed, link[rel="stylesheet"], style');
    scripts.forEach(s => s.remove());
    
    // Remove inline event handlers
    const allElements = doc.querySelectorAll('*');
    allElements.forEach(el => {
      for (let i = 0; i < el.attributes.length; i++) {
        const attr = el.attributes[i];
        if (attr.name.startsWith('on')) {
          el.removeAttribute(attr.name);
        }
        if (attr.name === 'href' && attr.value.toLowerCase().startsWith('javascript:')) {
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

      onFile: async function(file, content, helpers) {
        cleanupUrls();
        
        if (typeof JSZip === 'undefined') {
          helpers.showLoading('Initializing engine...');
          let attempts = 0;
          const checkZip = setInterval(() => {
            attempts++;
            if (typeof JSZip !== 'undefined') {
              clearInterval(checkZip);
              this.onFile(file, content, helpers);
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
          
          // 1. Locate Container
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
          
          // 2. Parse OPF
          const opfXml = await opfFile.async('text');
          const opfDoc = new DOMParser().parseFromString(opfXml, 'text/xml');

          // Metadata
          const metadata = {
            title: opfDoc.querySelector('title, dc\\:title')?.textContent || 'Untitled Book',
            creator: opfDoc.querySelector('creator, dc\\:creator')?.textContent || 'Unknown Author',
            description: opfDoc.querySelector('description, dc\\:description')?.textContent || '',
            language: opfDoc.querySelector('language, dc\\:language')?.textContent || 'en'
          };

          // Manifest
          const manifest = {};
          opfDoc.querySelectorAll('manifest item').forEach(item => {
            manifest[item.getAttribute('id')] = item.getAttribute('href');
          });

          // Spine
          const spine = Array.from(opfDoc.querySelectorAll('spine itemref')).map(ref => {
            return manifest[ref.getAttribute('idref')];
          }).filter(Boolean);

          if (spine.length === 0) throw new Error('EPUB spine is empty - no content found');

          // Cover
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
          helpers.showError('Could not open EPUB', `The file may be corrupted or encrypted: ${err.message}`);
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
            helpers.download(helpers.getFile().name, helpers.getContent());
          }
        }
      ]
    });
  };

  function renderViewer(helpers) {
    const { metadata, coverUrl, spine, currentChapter, zoom } = helpers.getState();
    const file = helpers.getFile();

    const html = `
      <div class="epub-tool-container animate-in fade-in slide-in-from-bottom-2 duration-500">
        <!-- U1: File Info Bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 border border-surface-100">
          <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(file.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">.epub book</span>
        </div>

        <div class="flex flex-col lg:flex-row gap-6 h-[75vh]">
          <!-- Sidebar: Info & Table of Contents -->
          <div class="w-full lg:w-80 flex flex-col gap-4 overflow-hidden shrink-0">
            <!-- Book Metadata Card -->
            <div class="bg-white rounded-2xl border border-surface-200 p-5 shadow-sm">
              ${coverUrl ? `
                <div class="aspect-[2/3] w-full mb-4 rounded-xl overflow-hidden shadow-md border border-surface-100 bg-surface-50">
                  <img src="${coverUrl}" class="w-full h-full object-cover">
                </div>
              ` : `
                <div class="aspect-[2/3] w-full mb-4 rounded-xl bg-surface-100 flex items-center justify-center text-surface-300 text-4xl">📚</div>
              `}
              <h2 class="font-bold text-surface-900 text-lg leading-tight line-clamp-2" title="${escapeHtml(metadata.title)}">${escapeHtml(metadata.title)}</h2>
              <p class="text-surface-500 text-sm mt-1 mb-3">${escapeHtml(metadata.creator)}</p>
              
              <div class="flex items-center gap-2">
                <span class="text-[10px] font-bold uppercase tracking-wider text-surface-400">Font Size</span>
                <input type="range" id="zoom-slider" min="50" max="200" value="${zoom}" class="flex-1 h-1.5 bg-surface-200 rounded-lg appearance-none cursor-pointer accent-brand-600">
                <span class="text-[10px] font-mono text-surface-500 w-8 text-right">${zoom}%</span>
              </div>
            </div>

            <!-- TOC -->
            <div class="flex-1 bg-white rounded-2xl border border-surface-200 flex flex-col overflow-hidden shadow-sm">
              <div class="p-4 border-b border-surface-100">
                <div class="flex items-center justify-between">
                  <h3 class="font-semibold text-surface-800">Contents</h3>
                  <span class="text-[10px] bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-bold uppercase">${spine.length} Sections</span>
                </div>
              </div>
              <div class="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                ${spine.map((path, i) => {
                  const name = path.split('/').pop().replace(/\.(x?html?)$/i, '').replace(/_/g, ' ');
                  return `
                    <button class="toc-btn w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all flex items-start gap-3 ${i === currentChapter ? 'bg-brand-50 text-brand-700 font-semibold shadow-sm' : 'text-surface-600 hover:bg-surface-50'}" data-idx="${i}">
                      <span class="text-xs opacity-40 tabular-nums w-4 mt-0.5">${i + 1}</span>
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
              <div class="text-xs font-medium text-surface-400 uppercase tracking-widest" id="reader-status">
                Section ${currentChapter + 1} of ${spine.length}
              </div>
              <div class="flex items-center gap-2">
                <button id="btn-prev" class="p-2 hover:bg-surface-100 rounded-lg text-surface-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
                </button>
                <button id="btn-next" class="p-2 hover:bg-surface-100 rounded-lg text-surface-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
                </button>
              </div>
            </div>

            <!-- Reader Body -->
            <div id="epub-reader-body" class="flex-1 overflow-y-auto p-8 lg:p-12 leading-relaxed text-surface-800 selection:bg-brand-100 transition-all custom-scrollbar" style="font-size: ${zoom}%">
              <div class="flex flex-col items-center justify-center h-full text-surface-300 animate-pulse italic">
                <svg class="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
                Rendering content...
              </div>
            </div>
            
            <!-- Reader Footer -->
            <div class="px-6 py-3 border-t border-surface-100 bg-surface-50/30 flex justify-center">
               <div class="h-1.5 w-full max-w-xs bg-surface-100 rounded-full overflow-hidden">
                 <div class="h-full bg-brand-500 transition-all duration-300" style="width: ${((currentChapter + 1) / spine.length) * 100}%"></div>
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
        
        #epub-reader-body h1 { font-size: 2em; font-weight: 800; color: #1e293b; margin-top: 1.5em; margin-bottom: 0.5em; line-height: 1.2; }
        #epub-reader-body h2 { font-size: 1.5em; font-weight: 700; color: #334155; margin-top: 1.2em; margin-bottom: 0.4em; }
        #epub-reader-body p { margin-bottom: 1.2em; }
        #epub-reader-body img { max-width: 100%; height: auto; border-radius: 0.75rem; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); margin: 2rem auto; display: block; }
      </style>
    `;

    helpers.render(html);

    // Bind Events
    const renderEl = helpers.getRenderEl();

    renderEl.querySelectorAll('.toc-btn').forEach(btn => {
      btn.onclick = () => loadChapter(helpers, parseInt(btn.dataset.idx));
    });

    renderEl.querySelector('#btn-prev').onclick = () => {
      const state = helpers.getState();
      if (state.currentChapter > 0) loadChapter(helpers, state.currentChapter - 1);
    };

    renderEl.querySelector('#btn-next').onclick = () => {
      const state = helpers.getState();
      if (state.currentChapter < state.spine.length - 1) loadChapter(helpers, state.currentChapter + 1);
    };

    const zoomSlider = renderEl.querySelector('#zoom-slider');
    zoomSlider.oninput = (e) => {
      const val = parseInt(e.target.value);
      helpers.setState({ zoom: val });
      document.getElementById('epub-reader-body').style.fontSize = val + '%';
      e.target.nextElementSibling.textContent = val + '%';
    };

    // Load initial chapter
    loadChapter(helpers, currentChapter);
  }

  async function loadChapter(helpers, idx) {
    const { zip, opfDir, spine, zoom } = helpers.getState();
    const renderEl = helpers.getRenderEl();
    const body = renderEl.querySelector('#epub-reader-body');
    const status = renderEl.querySelector('#reader-status');
    const prevBtn = renderEl.querySelector('#btn-prev');
    const nextBtn = renderEl.querySelector('#btn-next');
    
    if (!body) return;

    helpers.setState({ currentChapter: idx });

    // Update Navigation UI
    status.textContent = `Section ${idx + 1} of ${spine.length}`;
    prevBtn.disabled = idx === 0;
    nextBtn.disabled = idx === spine.length - 1;

    renderEl.querySelectorAll('.toc-btn').forEach((btn, i) => {
      if (i === idx) {
        btn.classList.add('bg-brand-50', 'text-brand-700', 'font-semibold', 'shadow-sm');
        btn.classList.remove('text-surface-600', 'hover:bg-surface-50');
        btn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else {
        btn.classList.remove('bg-brand-50', 'text-brand-700', 'font-semibold', 'shadow-sm');
        btn.classList.add('text-surface-600', 'hover:bg-surface-50');
      }
    });

    body.innerHTML = `
      <div class="flex flex-col items-center justify-center h-full text-surface-300 animate-pulse italic">
        <svg class="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
        Loading section...
      </div>
    `;
    body.scrollTop = 0;

    try {
      const chapterPath = spine[idx];
      const fullPath = opfDir + chapterPath;
      const chapterFile = zip.file(fullPath);
      
      if (!chapterFile) throw new Error(`Chapter file not found: ${chapterPath}`);
      
      const rawText = await chapterFile.async('text');
      const parser = new DOMParser();
      const doc = parser.parseFromString(rawText, 'text/html');
      const chapterDir = fullPath.includes('/') ? fullPath.substring(0, fullPath.lastIndexOf('/') + 1) : '';

      // Fix Images
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

      // Fix Links
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
            a.classList.add('text-brand-600', 'hover:underline', 'cursor-pointer');
          }
        }
      });

      // Render sanitized content
      body.innerHTML = sanitizeHtml(doc.body.innerHTML);
      
    } catch (err) {
      console.error('[EPUB Section]', err);
      body.innerHTML = `
        <div class="p-8 bg-red-50 rounded-2xl border border-red-100 text-red-700">
          <h4 class="font-bold mb-2">Error loading section</h4>
          <p class="text-sm opacity-80">${err.message}</p>
        </div>
      `;
    }
  }

})();
