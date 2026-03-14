/**
 * OmniOpener — Client-side routing engine
 * Parses URL pathname, loads tool scripts from config.json, renders nav.
 */
(function () {
  'use strict';

  const CONTAINER_ID = 'tool-container';
  const NAV_LINKS_ID = 'nav-links';
  const NAV_CATEGORIES_ID = 'nav-categories';
  const TOOL_GRID_ID = 'tool-grid';
  const SEARCH_INPUT_ID = 'search-input';

  let config = null;

  // ── Bootstrap ──────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    try {
      const res = await fetch('/config.json');
      config = await res.json();
    } catch (e) {
      console.error('[OmniOpener] Failed to load config.json', e);
      return;
    }

    renderNav(config.tools);
    renderToolGrid(config.tools);
    bindSearch(config.tools);
    bindGlobalDrop();

    const slug = getSlugFromPath();
    if (slug) {
      loadTool(slug);
    }
  }

  // ── Routing ────────────────────────────────────────────────
  function getSlugFromPath() {
    // Supports /tools/slug and /tools/slug/
    const match = window.location.pathname.match(/^\/tools\/([a-z0-9\-]+)\/?$/);
    return match ? match[1] : null;
  }

  function navigateTo(slug) {
    window.history.pushState({}, '', '/tools/' + slug);
    loadTool(slug);
  }

  window.addEventListener('popstate', () => {
    const slug = getSlugFromPath();
    if (slug) loadTool(slug);
    else showLanding();
  });

  // ── Tool Loading ───────────────────────────────────────────
  function loadTool(slug) {
    const tool = config.tools.find(t => t.slug === slug);
    if (!tool) {
      showNotFound(slug);
      return;
    }

    // Update SEO
    document.title = tool.title + ' — OmniOpener';
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.content = tool.meta_description;

    // Mark active nav
    document.querySelectorAll('.nav-link').forEach(el => {
      el.classList.toggle('active', el.dataset.slug === slug);
    });

    // Clear container and show tool chrome
    const container = document.getElementById(CONTAINER_ID);
    container.innerHTML = `
      <div class="fade-in">
        <div class="flex items-center gap-3 mb-6">
          <a href="/" class="text-surface-400 hover:text-surface-600 transition-colors" onclick="event.preventDefault(); window.history.pushState({}, '', '/'); location.reload();">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
          </a>
          <span class="text-3xl">${tool.icon || '🔧'}</span>
          <div>
            <h1 class="text-2xl font-bold text-surface-900">${tool.h1}</h1>
            <p class="text-sm text-surface-500">${tool.meta_description}</p>
          </div>
        </div>
        <div class="text-sm text-surface-400 mb-4">Supported formats: ${(tool.formats || []).map(f => '<code class="bg-surface-100 px-1.5 py-0.5 rounded text-xs font-mono">' + f + '</code>').join(' ')}</div>
        <div id="tool-mount" class="min-h-[400px]">
          <div class="flex items-center justify-center h-64 text-surface-400">
            <svg class="animate-spin w-6 h-6 mr-2" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
            Loading tool…
          </div>
        </div>
      </div>
    `;

    // Remove any previously loaded tool script
    const oldScript = document.getElementById('tool-script');
    if (oldScript) oldScript.remove();

    // Load SDK first, then tool script
    const loadToolScript = () => {
      const script = document.createElement('script');
      script.id = 'tool-script';
      script.src = tool.script_url;
      script.onload = () => {
        if (typeof window.initTool === 'function') {
          window.initTool(tool, document.getElementById('tool-mount'));
        }
      };
      script.onerror = () => {
        document.getElementById('tool-mount').innerHTML = `
          <div class="text-center py-12">
            <p class="text-red-500 font-medium">Failed to load tool script</p>
            <p class="text-sm text-surface-400 mt-1">${tool.script_url}</p>
          </div>
        `;
      };
      document.body.appendChild(script);
    };

    // Ensure OmniTool SDK is loaded
    if (typeof window.OmniTool === 'undefined') {
      const sdk = document.createElement('script');
      sdk.src = '/tool-sdk.js';
      sdk.onload = loadToolScript;
      sdk.onerror = () => {
        console.error('[OmniOpener] Failed to load tool-sdk.js');
        loadToolScript(); // Try anyway, tool might not need SDK
      };
      document.body.appendChild(sdk);
    } else {
      loadToolScript();
    }
  }

  function showNotFound(slug) {
    const container = document.getElementById(CONTAINER_ID);
    container.innerHTML = `
      <div class="fade-in text-center py-24">
        <div class="text-6xl mb-4">🔍</div>
        <h1 class="text-2xl font-bold mb-2">Tool not found</h1>
        <p class="text-surface-500 mb-6">No tool matching "<code class="bg-surface-100 px-2 py-0.5 rounded font-mono">${slug}</code>" was found.</p>
        <a href="/" class="inline-flex items-center gap-2 bg-brand-600 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-brand-700 transition-colors" onclick="event.preventDefault(); window.history.pushState({}, '', '/'); location.reload();">
          ← Back to home
        </a>
      </div>
    `;
  }

  function showLanding() {
    location.reload(); // simplest way to restore landing state
  }

  // ── Nav Rendering ──────────────────────────────────────────
  function renderNav(tools) {
    const linksEl = document.getElementById(NAV_LINKS_ID);
    if (!linksEl) return;

    const currentSlug = getSlugFromPath();
    linksEl.innerHTML = tools.map((t, i) => `
      <a href="/tools/${t.slug}" data-slug="${t.slug}"
         class="nav-link flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-surface-600 hover:text-surface-900 slide-in ${t.slug === currentSlug ? 'active' : ''}"
         style="animation-delay: ${i * 40}ms"
         onclick="event.preventDefault(); window.__navigate('${t.slug}');">
        <span class="text-lg">${t.icon || '🔧'}</span>
        <span class="font-medium truncate">${t.title}</span>
      </a>
    `).join('');

    // Categories
    const categories = [...new Set(tools.map(t => t.category).filter(Boolean))];
    const catEl = document.getElementById(NAV_CATEGORIES_ID);
    if (catEl) {
      catEl.innerHTML = categories.map(cat => `
        <div class="px-3 py-1.5 text-sm text-surface-500 capitalize">${cat}</div>
      `).join('');
    }
  }

  // ── Tool Grid (Landing) ────────────────────────────────────
  function renderToolGrid(tools) {
    const grid = document.getElementById(TOOL_GRID_ID);
    if (!grid) return;

    grid.innerHTML = tools.map(t => `
      <a href="/tools/${t.slug}" onclick="event.preventDefault(); window.__navigate('${t.slug}');"
         class="group flex items-center gap-4 p-4 rounded-xl border border-surface-200 bg-white hover:border-brand-300 hover:shadow-lg hover:shadow-brand-500/5 transition-all duration-200">
        <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-50 to-brand-100 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
          ${t.icon || '🔧'}
        </div>
        <div class="text-left">
          <p class="font-semibold text-surface-800 group-hover:text-brand-700 transition-colors">${t.title}</p>
          <p class="text-xs text-surface-400 mt-0.5">${(t.formats || []).join(', ')}</p>
        </div>
      </a>
    `).join('');
  }

  // ── Search ─────────────────────────────────────────────────
  function bindSearch(tools) {
    const input = document.getElementById(SEARCH_INPUT_ID);
    if (!input) return;

    input.addEventListener('input', () => {
      const q = input.value.toLowerCase().trim();
      const filtered = q
        ? tools.filter(t => t.title.toLowerCase().includes(q) || (t.formats || []).some(f => f.includes(q)))
        : tools;
      renderNav(filtered);
      renderToolGrid(filtered);
    });
  }

  // ── Global Drop Zone ───────────────────────────────────────
  function bindGlobalDrop() {
    const zone = document.getElementById('global-drop-zone');
    if (!zone) return;

    ['dragenter', 'dragover'].forEach(evt =>
      zone.addEventListener(evt, e => { e.preventDefault(); zone.classList.add('drag-over'); })
    );
    ['dragleave', 'drop'].forEach(evt =>
      zone.addEventListener(evt, e => { e.preventDefault(); zone.classList.remove('drag-over'); })
    );

    zone.addEventListener('drop', e => {
      const file = e.dataTransfer.files[0];
      if (!file) return;
      const ext = '.' + file.name.split('.').pop().toLowerCase();
      const tool = config.tools.find(t => (t.formats || []).includes(ext));
      if (tool) {
        navigateTo(tool.slug);
        // Store file for the tool to pick up
        window.__droppedFile = file;
      } else {
        zone.innerHTML = `
          <div class="flex flex-col items-center gap-2 py-8">
            <p class="text-lg font-semibold text-surface-700">Format "${ext}" not yet supported</p>
            <p class="text-sm text-surface-400">We're adding new formats every day!</p>
          </div>
        `;
        setTimeout(() => location.reload(), 3000);
      }
    });
  }

  // Expose navigate for onclick handlers
  window.__navigate = navigateTo;
})();
