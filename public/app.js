/**
 * OmniOpener — Client-side SPA engine
 * Handles routing, tool loading, search, category filtering, keyboard shortcuts, SEO.
 */
(function () {
  'use strict';

  var config = null;
  var activeCategory = null;
  var currentSlug = null;
  var loadedScripts = {}; // cache of slug → true

  var $container, $navLinks, $navCategories, $searchInput;
  var $toolCountNum, $navToolCount;
  var lastLoadedSlug = null; // track which tool's initTool is currently live

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    try {
      var res = await fetch('/config.json');
      config = await res.json();
    } catch (e) {
      console.error('[OmniOpener] Failed to load config.json', e);
      return;
    }

    $container = document.getElementById('tool-container');
    $navLinks = document.getElementById('nav-links');
    $navCategories = document.getElementById('nav-categories');
    $searchInput = document.getElementById('search-input');
    $toolCountNum = document.getElementById('tool-count-num');
    $navToolCount = document.getElementById('nav-tool-count');

    if ($toolCountNum) $toolCountNum.textContent = config.tools.length;

    // Detect Ctrl vs Cmd
    var isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    var kbdEl = document.getElementById('search-kbd');
    if (kbdEl && !isMac) kbdEl.innerHTML = 'Ctrl+K';

    renderCategories(config.tools);
    renderNav(config.tools);
    renderToolGrid(config.tools);
    bindSearch();
    bindGlobalDrop();
    bindWindowDrag();
    bindKeyboard();
    bindLogoLink();

    var slug = getSlugFromPath();
    if (slug) loadTool(slug);
  }

  // ── Search Aliases ─────────────────────────────────────
  // Maps common search terms to format extensions or category names
  var SEARCH_ALIASES = {
    // Office
    'excel': ['.xlsx', '.xls', '.csv', '.ods'],
    'spreadsheet': ['.xlsx', '.csv', '.ods'],
    'word': ['.docx', '.doc', '.odt', '.rtf'],
    'powerpoint': ['.pptx', '.odp', '.key'],
    'presentation': ['.pptx', '.odp', '.key'],
    'office': ['.xlsx', '.docx', '.pptx'],
    // Images
    'image': ['images'],        // category match
    'photo': ['.jpg', '.jpeg', '.heic', '.raw', '.tiff'],
    'picture': ['.jpg', '.jpeg', '.png', '.gif'],
    'camera': ['.jpg', '.jpeg', '.heic', '.raw'],
    // Audio/Video
    'audio': ['audio'],         // category match
    'music': ['.mp3', '.flac', '.wav', '.ogg', '.aac'],
    'song': ['.mp3', '.flac', '.wav', '.ogg'],
    'video': ['video'],         // category match
    'movie': ['.mp4', '.mkv', '.avi', '.mov'],
    // Archives
    'archive': ['archives'],    // category match
    'compressed': ['.zip', '.tar', '.gz', '.bz2', '.xz', '.7z', '.rar'],
    // Documents
    'document': ['.pdf', '.docx', '.odt', '.rtf'],
    'ebook': ['.epub', '.mobi'],
    'book': ['.epub', '.mobi', '.pdf'],
    // Code/Data
    'code': ['.json', '.xml', '.yaml', '.html', '.js', '.ts', '.py'],
    'data': ['.csv', '.json', '.xml', '.parquet', '.avro'],
    'database': ['.sqlite', '.sql'],
    'notebook': ['.ipynb'],
    'jupyter': ['.ipynb'],
    // Fonts
    'font': ['.ttf', '.otf', '.woff', '.woff2', '.eot'],
    // 3D/Design
    'vector': ['.svg', '.ai', '.eps'],
    '3d': ['3d'],               // category match
    'model': ['.stl', '.obj', '.fbx', '.gltf', '.glb'],
    // Security
    'certificate': ['.pem', '.crt', '.p12', '.p7s'],
    'key': ['.pem', '.p12'],
    // System
    'windows': ['.exe', '.dll', '.msi'],
    'installer': ['.exe', '.msi', '.deb', '.rpm', '.dmg', '.pkg'],
    'linux': ['.deb', '.rpm', '.appimage', '.snap', '.flatpak'],
    'mac': ['.dmg', '.pkg', '.ipa'],
    'binary': ['.exe', '.dll', '.so', '.dylib', '.bin'],
    // Misc
    'email': ['.eml', '.msg', '.mbox'],
    'comic': ['.cbr', '.cbz'],
    'manga': ['.cbr', '.cbz'],
    'geo': ['.geojson', '.kml', '.gpx', '.shp'],
    'map': ['.geojson', '.kml', '.gpx'],
    'log': ['.log'],
    'config': ['.ini', '.toml', '.yaml', '.yml'],
    'markdown': ['.md'],
    'text': ['.txt', '.md', '.log', '.csv'],
  };

  // MIME type → extension mapping for routing files without extensions
  var MIME_TO_EXT = {
    'image/jpeg': '.jpg', 'image/jpg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
    'image/bmp': '.bmp',
    'image/tiff': '.tiff',
    'image/heic': '.heic', 'image/heif': '.heic',
    'image/avif': '.avif',
    'text/csv': '.csv',
    'application/json': '.json',
    'application/pdf': '.pdf',
    'application/zip': '.zip',
    'application/x-zip-compressed': '.zip',
    'application/x-tar': '.tar',
    'application/gzip': '.gz',
    'application/x-gzip': '.gz',
    'application/x-bzip2': '.bz2',
    'audio/mpeg': '.mp3', 'audio/mp3': '.mp3',
    'audio/wav': '.wav', 'audio/x-wav': '.wav',
    'audio/ogg': '.ogg',
    'audio/flac': '.flac',
    'audio/aac': '.aac',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/x-matroska': '.mkv',
    'text/plain': '.txt',
    'text/html': '.html',
    'text/xml': '.xml',
    'application/xml': '.xml',
    'text/yaml': '.yaml', 'application/x-yaml': '.yaml',
    'text/markdown': '.md',
    'application/epub+zip': '.epub',
    'application/x-sqlite3': '.sqlite',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
    'application/vnd.ms-excel': '.xls',
    'application/msword': '.doc',
    'application/x-msdownload': '.exe',
    'application/x-executable': '.exe',
    'application/x-deb': '.deb',
    'application/x-rpm': '.rpm',
    'application/x-iso9660-image': '.iso',
    'application/font-woff': '.woff',
    'font/woff': '.woff',
    'font/woff2': '.woff2',
    'font/ttf': '.ttf',
    'font/otf': '.otf',
  };

  // ── Routing ────────────────────────────────────────────
  function getSlugFromPath() {
    var match = window.location.pathname.match(/^\/tools\/([a-z0-9\-]+)\/?$/);
    return match ? match[1] : null;
  }

  function navigateTo(slug) {
    window.history.pushState({ slug: slug }, '', '/tools/' + slug);
    loadTool(slug);
  }

  function navigateHome() {
    window.history.pushState({}, '', '/');
    showLanding();
  }

  window.addEventListener('popstate', function () {
    var slug = getSlugFromPath();
    if (slug) loadTool(slug);
    else showLanding();
  });

  function bindLogoLink() {
    var logo = document.getElementById('logo-link');
    if (logo) {
      logo.addEventListener('click', function (e) {
        e.preventDefault();
        navigateHome();
      });
    }
  }

  // ── Show Landing ───────────────────────────────────────
  function showLanding() {
    currentSlug = null;
    document.title = 'OmniOpener \u2014 Free Online File Viewer for 150+ Formats';
    setMeta('description', 'Open, view, and convert 150+ file formats free in your browser \u2014 PDF, DOCX, CSV, MP3, ZIP, STL, and more. No uploads, no installs, 100% private.');
    setMeta('og:title', 'OmniOpener \u2014 Free Online File Viewer for 150+ Formats');
    setMeta('og:description', 'Open, view, and convert 150+ file formats free in your browser. No uploads, no installs \u2014 100% private and client-side.');
    setMeta('og:url', 'https://omniopener.dev');
    setLink('canonical', 'https://omniopener.dev');
    var toolLd = document.getElementById('tool-ld-json');
    if (toolLd) toolLd.remove();

    $container.innerHTML = buildLandingHTML();
    activeCategory = null;
    renderCategories(config.tools);
    renderNav(config.tools);
    renderToolGrid(config.tools);
    bindGlobalDrop();

    document.querySelectorAll('.nav-link').forEach(function (el) {
      el.classList.remove('active');
    });
  }

  function buildLandingHTML() {
    return '<div id="landing" class="fade-in"><div class="max-w-4xl mx-auto text-center py-12">' +
      '<h1 class="text-5xl sm:text-6xl font-extrabold tracking-tight mb-6">' +
        'Open <span class="bg-gradient-to-r from-brand-500 to-purple-600 bg-clip-text text-transparent">any file</span><br>in your browser</h1>' +
      '<p class="text-lg text-surface-500 mb-2 max-w-xl mx-auto leading-relaxed">' +
        'Free online file viewer for <strong class="text-surface-700">150+ formats</strong> \u2014 PDF, Word, Excel, CSV, MP3, ZIP, STL, and more. Drop a file and open it instantly.</p>' +
      '<p class="text-sm text-surface-400 mb-6 max-w-xl mx-auto">' +
        'No uploads. No installs. No sign-ups. Everything runs <strong class="text-surface-600">100% client-side</strong> \u2014 your files never leave your device.</p>' +
      '<div class="flex flex-wrap justify-center gap-4 mb-10 text-sm text-surface-500">' +
        '<span class="flex items-center gap-1.5"><svg class="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg> 100% Private</span>' +
        '<span class="flex items-center gap-1.5"><svg class="w-4 h-4 text-brand-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg> Instant</span>' +
        '<span class="flex items-center gap-1.5"><svg class="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg> Free Forever</span></div>' +
      '<div id="global-drop-zone" class="drop-zone border-2 border-dashed border-surface-300 rounded-2xl p-12 mb-12 cursor-pointer hover:border-brand-400 pulse-glow">' +
        '<div class="flex flex-col items-center gap-4">' +
          '<div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-100 to-brand-200 flex items-center justify-center">' +
            '<svg class="w-8 h-8 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/></svg></div>' +
          '<div><p class="text-lg font-semibold text-surface-700">Drop any file here</p>' +
          '<p class="text-sm text-surface-400 mt-1">We\'ll detect the format and open the right tool automatically</p></div></div></div>' +
      '<div id="landing-categories" class="flex flex-wrap justify-center gap-2 mb-6"></div>' +
      '<div id="tool-grid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-4xl mx-auto"></div>' +
      '<div class="mt-16 pt-8 border-t border-surface-200 text-sm text-surface-400">' +
        '<p>Every tool runs entirely in your browser \u2014 your files never leave your device.</p>' +
        '<p class="mt-2"><a href="https://github.com/bannawandoor27/omni-opener" target="_blank" rel="noopener" class="text-brand-600 hover:underline">Open Source on GitHub</a></p></div>' +
    '</div></div>';
  }

  // ── Tool Loading ───────────────────────────────────────
  function loadTool(slug) {
    var tool = config.tools.find(function (t) { return t.slug === slug; });
    if (!tool) { showNotFound(slug); return; }

    currentSlug = slug;

    // SEO
    document.title = tool.title + ' \u2014 OmniOpener';
    setMeta('description', tool.meta_description);
    setMeta('og:title', tool.title + ' \u2014 OmniOpener');
    setMeta('og:description', tool.meta_description);
    setMeta('og:url', 'https://omniopener.dev/tools/' + slug);
    setLink('canonical', 'https://omniopener.dev/tools/' + slug);
    injectToolStructuredData(tool);

    // Active nav
    document.querySelectorAll('.nav-link').forEach(function (el) {
      el.classList.toggle('active', el.dataset.slug === slug);
    });

    $container.innerHTML =
      '<div class="fade-in">' +
        '<div class="flex items-center gap-3 mb-6">' +
          '<a href="/" id="back-btn" class="text-surface-400 hover:text-surface-600 transition-colors">' +
            '<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg></a>' +
          '<span class="text-3xl">' + (tool.icon || '\uD83D\uDD27') + '</span>' +
          '<div><h1 class="text-2xl font-bold text-surface-900">' + esc(tool.h1 || tool.title) + '</h1>' +
          '<p class="text-sm text-surface-500">' + esc(tool.meta_description) + '</p></div></div>' +
        '<div class="text-sm text-surface-400 mb-4">Supported: ' +
          (tool.formats || []).map(function (f) { return '<code class="bg-surface-100 px-1.5 py-0.5 rounded text-xs font-mono">' + esc(f) + '</code>'; }).join(' ') + '</div>' +
        '<div id="tool-mount" class="min-h-[400px]">' +
          '<div class="flex items-center justify-center h-64 text-surface-400">' +
            '<svg class="animate-spin w-6 h-6 mr-2" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Loading tool\u2026</div></div></div>';

    document.getElementById('back-btn').addEventListener('click', function (e) { e.preventDefault(); navigateHome(); });

    // Load script — browser caches by URL, so reloading is cheap
    var doLoad = function () {
      // Only reuse initTool if it belongs to THIS slug (not a different tool's function)
      if (lastLoadedSlug === slug && typeof window.initTool === 'function') {
        var mount = document.getElementById('tool-mount');
        if (mount) window.initTool(tool, mount);
        return;
      }

      // Reset initTool to prevent stale calls from previous tool
      window.initTool = null;
      lastLoadedSlug = null;

      var old = document.getElementById('tool-script');
      if (old) old.remove();

      var s = document.createElement('script');
      s.id = 'tool-script';
      s.src = tool.script_url + '?v=' + (tool.slug); // cache-busting per tool
      s.onload = function () {
        loadedScripts[slug] = true;
        lastLoadedSlug = slug;
        var mount = document.getElementById('tool-mount');
        if (typeof window.initTool === 'function' && mount) {
          window.initTool(tool, mount);
        }
      };
      s.onerror = function () {
        var m = document.getElementById('tool-mount');
        if (m) m.innerHTML = '<div class="text-center py-12"><p class="text-red-500 font-medium">Failed to load tool script</p><p class="text-sm text-surface-400 mt-1">Check your connection and try again.</p></div>';
      };
      document.body.appendChild(s);
    };

    if (typeof window.OmniTool === 'undefined') {
      var sdk = document.createElement('script');
      sdk.src = '/tool-sdk.js';
      sdk.onload = doLoad;
      sdk.onerror = doLoad; // try anyway
      document.body.appendChild(sdk);
    } else {
      doLoad();
    }
  }

  function showNotFound(slug) {
    $container.innerHTML =
      '<div class="fade-in text-center py-24"><div class="text-6xl mb-4">\uD83D\uDD0D</div>' +
      '<h1 class="text-2xl font-bold mb-2">Tool not found</h1>' +
      '<p class="text-surface-500 mb-6">No tool matching "<code class="bg-surface-100 px-2 py-0.5 rounded font-mono">' + esc(slug) + '</code>"</p>' +
      '<a href="/" id="nf-home" class="inline-flex items-center gap-2 bg-brand-600 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-brand-700 transition-colors">\u2190 Back to home</a></div>';
    document.getElementById('nf-home').addEventListener('click', function (e) { e.preventDefault(); navigateHome(); });
  }

  // ── Categories ─────────────────────────────────────────
  var catIcons = {
    documents: '\uD83D\uDCC4', spreadsheets: '\uD83D\uDCCA', data: '\uD83D\uDD27',
    archives: '\uD83D\uDCE6', packages: '\uD83D\uDCE6', audio: '\uD83C\uDFB5',
    video: '\uD83C\uDFAC', images: '\uD83D\uDDBC\uFE0F', geo: '\uD83D\uDDFA\uFE0F',
    '3d': '\uD83E\uDDCA', email: '\uD83D\uDCE7', text: '\uD83D\uDCCB',
    calendar: '\uD83D\uDCC5', security: '\uD83D\uDD10', system: '\u2699\uFE0F',
    design: '\uD83C\uDFA8', general: '\uD83D\uDCC1', diagrams: '\uD83D\uDCC8'
  };

  function getCats(tools) {
    var m = {};
    tools.forEach(function (t) { var c = t.category || 'general'; m[c] = (m[c] || 0) + 1; });
    return Object.keys(m).sort(function (a, b) { return m[b] - m[a]; }).map(function (k) { return { name: k, count: m[k] }; });
  }

  function renderCategories() {
    var cats = getCats(config.tools);

    function buildPills(cls) {
      return '<button class="cat-pill ' + cls + ' px-2.5 py-1 rounded-lg text-xs font-medium text-surface-600' + (!activeCategory ? ' active' : '') + '" data-cat="">All</button>' +
        cats.map(function (c) {
          return '<button class="cat-pill ' + cls + ' px-2.5 py-1 rounded-lg text-xs font-medium text-surface-600' + (activeCategory === c.name ? ' active' : '') + '" data-cat="' + c.name + '">' +
            (catIcons[c.name] || '\uD83D\uDCC1') + ' ' + cap(c.name) + ' <span class="text-surface-300">' + c.count + '</span></button>';
        }).join('');
    }

    if ($navCategories) {
      $navCategories.innerHTML = buildPills('');
      $navCategories.querySelectorAll('.cat-pill').forEach(bindCatClick);
    }

    var $lc = document.getElementById('landing-categories');
    if ($lc) {
      $lc.innerHTML = '<button class="cat-pill px-3 py-1.5 rounded-full text-sm font-medium border border-surface-200 text-surface-600' + (!activeCategory ? ' active' : '') + '" data-cat="">All ' + config.tools.length + '</button>' +
        cats.map(function (c) {
          return '<button class="cat-pill px-3 py-1.5 rounded-full text-sm font-medium border border-surface-200 text-surface-600' + (activeCategory === c.name ? ' active' : '') + '" data-cat="' + c.name + '">' +
            (catIcons[c.name] || '\uD83D\uDCC1') + ' ' + cap(c.name) + ' <span class="text-surface-400">' + c.count + '</span></button>';
        }).join('');
      $lc.querySelectorAll('.cat-pill').forEach(bindCatClick);
    }
  }

  function bindCatClick(btn) {
    btn.addEventListener('click', function () {
      activeCategory = btn.dataset.cat || null;
      applyFilters();
    });
  }

  // ── Filtering with alias expansion ─────────────────────
  function matchesSearch(t, q) {
    if (!q) return true;
    // Direct matches
    if (t.title.toLowerCase().indexOf(q) !== -1) return true;
    if (t.slug.indexOf(q) !== -1) return true;
    if ((t.meta_description || '').toLowerCase().indexOf(q) !== -1) return true;
    if ((t.category || '').indexOf(q) !== -1) return true;
    if ((t.formats || []).some(function (f) { return f.indexOf(q) !== -1; })) return true;
    // Alias expansion
    var aliases = SEARCH_ALIASES[q];
    if (aliases) {
      return aliases.some(function (alias) {
        // Category match (alias is a category name)
        if ((t.category || '') === alias) return true;
        // Format match
        return (t.formats || []).some(function (f) { return f.indexOf(alias) !== -1; });
      });
    }
    return false;
  }

  function getFiltered() {
    var q = ($searchInput ? $searchInput.value : '').toLowerCase().trim();
    return config.tools.filter(function (t) {
      var mc = !activeCategory || t.category === activeCategory;
      var ms = matchesSearch(t, q);
      return mc && ms;
    });
  }

  function applyFilters() {
    var filtered = getFiltered();
    renderCategories();
    renderNav(filtered);
    renderToolGrid(filtered);
  }

  // ── Nav ────────────────────────────────────────────────
  function renderNav(tools) {
    if (!$navLinks) return;
    if ($navToolCount) $navToolCount.textContent = tools.length;

    $navLinks.innerHTML = tools.map(function (t, i) {
      return '<a href="/tools/' + t.slug + '" data-slug="' + t.slug + '" class="nav-link flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-surface-600 hover:text-surface-900 slide-in' + (t.slug === currentSlug ? ' active' : '') + '" style="animation-delay:' + Math.min(i * 20, 400) + 'ms">' +
        '<span class="text-lg shrink-0">' + (t.icon || '\uD83D\uDD27') + '</span>' +
        '<span class="font-medium truncate">' + esc(t.title) + '</span></a>';
    }).join('');

    // Nav links use natural <a href> navigation so nginx serves pre-rendered HTML
  }

  // ── Grid ───────────────────────────────────────────────
  function renderToolGrid(tools) {
    var $g = document.getElementById('tool-grid');
    if (!$g) return;

    if (!tools.length) {
      $g.innerHTML = '<div class="col-span-full py-12 text-center">' +
        '<div class="text-4xl mb-3">\uD83D\uDD0D</div>' +
        '<p class="text-surface-500 font-medium">No tools match your search.</p>' +
        '<p class="text-surface-400 text-sm mt-1">Try searching "excel", "image", "video", or a file extension like ".csv"</p></div>';
      return;
    }

    $g.innerHTML = tools.map(function (t) {
      return '<a href="/tools/' + t.slug + '" data-slug="' + t.slug + '" class="tool-card group flex items-center gap-4 p-4 rounded-xl border border-surface-200 bg-white hover:border-brand-300 text-left transition-all hover:shadow-sm">' +
        '<div class="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-50 to-brand-100 flex items-center justify-center text-2xl shrink-0 group-hover:scale-110 transition-transform">' + (t.icon || '\uD83D\uDD27') + '</div>' +
        '<div class="min-w-0"><p class="font-semibold text-surface-800 group-hover:text-brand-700 transition-colors truncate">' + esc(t.title) + '</p>' +
        '<p class="text-xs text-surface-400 mt-0.5 truncate">' + (t.formats || []).join(', ') + '</p></div></a>';
    }).join('');

    // Tool cards use natural <a href> navigation so nginx serves pre-rendered HTML
  }

  // ── Search ─────────────────────────────────────────────
  function bindSearch() {
    if (!$searchInput) return;
    $searchInput.addEventListener('input', applyFilters);
  }

  // ── Keyboard ───────────────────────────────────────────
  function bindKeyboard() {
    document.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if ($searchInput) { $searchInput.focus(); $searchInput.select(); }
      }
      if (e.key === 'Escape' && $searchInput && document.activeElement === $searchInput) {
        $searchInput.blur();
        $searchInput.value = '';
        applyFilters();
      }
    });
  }

  // ── Global Drop Zone (homepage hero) ───────────────────
  function bindGlobalDrop() {
    var zone = document.getElementById('global-drop-zone');
    if (!zone) return;

    ['dragenter', 'dragover'].forEach(function (ev) {
      zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.add('drag-over'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.remove('drag-over'); });
    });

    zone.addEventListener('drop', function (e) {
      var file = e.dataTransfer.files[0];
      if (!file) return;
      handleFilePick(file, zone);
    });

    zone.addEventListener('click', function () {
      var inp = document.createElement('input');
      inp.type = 'file';
      inp.addEventListener('change', function () { if (inp.files[0]) handleFilePick(inp.files[0], zone); });
      inp.click();
    });
  }

  // ── Window-level Drag Overlay ──────────────────────────
  // Catches files dragged anywhere on the page, not just the drop zone
  function bindWindowDrag() {
    var overlay = document.getElementById('drag-overlay');
    if (!overlay) return;

    var dragCount = 0;

    document.addEventListener('dragenter', function (e) {
      if (e.dataTransfer && e.dataTransfer.types && Array.from(e.dataTransfer.types).indexOf('Files') !== -1) {
        dragCount++;
        overlay.classList.remove('hidden');
      }
    });

    document.addEventListener('dragleave', function (e) {
      // Only hide when leaving the document entirely
      if (e.clientX === 0 && e.clientY === 0) {
        dragCount = 0;
        overlay.classList.add('hidden');
      }
    });

    document.addEventListener('dragover', function (e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });

    document.addEventListener('drop', function (e) {
      dragCount = 0;
      overlay.classList.add('hidden');
      var zone = document.getElementById('global-drop-zone');
      // Only handle at document level if the drop is NOT inside the SDK drop zone
      if (!e.target.closest('#omni-drop') && !e.target.closest('#global-drop-zone')) {
        var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (file) {
          e.preventDefault();
          handleFilePick(file, zone);
        }
      }
    });
  }

  // ── File Pick & Routing ────────────────────────────────
  function handleFilePick(file, zone) {
    var ext = file.name.indexOf('.') !== -1
      ? '.' + file.name.split('.').pop().toLowerCase()
      : '';

    // 1. Try by extension
    var tool = ext ? config.tools.find(function (t) { return (t.formats || []).indexOf(ext) !== -1; }) : null;

    // 2. Fallback: try by MIME type
    if (!tool && file.type) {
      var mimeExt = MIME_TO_EXT[file.type];
      if (mimeExt) {
        tool = config.tools.find(function (t) { return (t.formats || []).indexOf(mimeExt) !== -1; });
      }
    }

    if (tool) {
      // Warn for large files
      if (file.size > 150 * 1024 * 1024) {
        var mb = (file.size / 1024 / 1024).toFixed(0);
        if (!window.confirm('This file is ' + mb + 'MB. Large files may be slow or crash the tab. Continue?')) return;
      }
      window.__droppedFile = file;
      navigateTo(tool.slug); // SPA nav needed — file object lives in current window only
    } else {
      showUnsupportedFormat(file, ext, zone);
    }
  }

  function showUnsupportedFormat(file, ext, zone) {
    // Find fuzzy suggestions — tools with similar extension or category
    var suggestions = config.tools.filter(function (t) {
      return ext && (t.category === 'general' || (t.formats || []).some(function (f) {
        return f.slice(1, 3) === ext.slice(1, 3); // same first 2 chars of extension
      }));
    }).slice(0, 3);

    var extDisplay = ext || (file.type ? '(' + file.type + ')' : 'unknown format');
    var html = '<div class="flex flex-col items-center gap-4 py-8 text-center">' +
      '<div class="text-4xl">🤔</div>' +
      '<div>' +
        '<p class="text-lg font-semibold text-surface-700">Format not supported: <code class="bg-surface-100 px-2 py-0.5 rounded font-mono text-sm">' + esc(extDisplay) + '</code></p>' +
        '<p class="text-sm text-surface-400 mt-1">' + esc(file.name) + ' · ' + fmtBytes(file.size) + '</p>' +
      '</div>';

    if (suggestions.length) {
      html += '<div class="text-sm text-surface-500">You might want:</div>' +
        '<div class="flex flex-wrap justify-center gap-2">' +
        suggestions.map(function (t) {
          return '<button class="sugg-tool px-3 py-1.5 rounded-lg bg-surface-100 hover:bg-brand-50 hover:text-brand-700 text-sm font-medium transition-colors" data-slug="' + t.slug + '">' + (t.icon || '📁') + ' ' + esc(t.title) + '</button>';
        }).join('') + '</div>';
    }

    html += '<button id="sugg-back" class="text-sm text-brand-600 hover:underline">← Back to home</button></div>';

    if (zone) {
      zone.innerHTML = html;
      zone.querySelectorAll('.sugg-tool').forEach(function (btn) {
        btn.addEventListener('click', function () { window.location.href = '/tools/' + btn.dataset.slug; });
      });
      var backBtn = document.getElementById('sugg-back');
      if (backBtn) backBtn.addEventListener('click', function () { navigateHome(); });
    }
  }

  function fmtBytes(b) {
    return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : b > 1024 ? (b / 1024).toFixed(0) + ' KB' : b + ' B';
  }

  // ── SEO Helpers ────────────────────────────────────────
  function setMeta(name, content) {
    var sel = (name.indexOf('og:') === 0 || name.indexOf('twitter:') === 0) ? 'meta[property="' + name + '"]' : 'meta[name="' + name + '"]';
    var el = document.querySelector(sel);
    if (el) el.setAttribute('content', content);
  }

  function setLink(rel, href) {
    var el = document.querySelector('link[rel="' + rel + '"]');
    if (el) el.setAttribute('href', href);
  }

  function injectToolStructuredData(tool) {
    var old = document.getElementById('tool-ld-json');
    if (old) old.remove();
    var s = document.createElement('script');
    s.type = 'application/ld+json';
    s.id = 'tool-ld-json';
    s.textContent = JSON.stringify({
      '@context': 'https://schema.org', '@type': 'WebApplication',
      'name': tool.title, 'url': 'https://omniopener.dev/tools/' + tool.slug,
      'description': tool.meta_description, 'applicationCategory': 'UtilitiesApplication',
      'operatingSystem': 'Any', 'offers': { '@type': 'Offer', 'price': '0', 'priceCurrency': 'USD' },
      'isPartOf': { '@type': 'WebApplication', 'name': 'OmniOpener', 'url': 'https://omniopener.dev' }
    });
    document.head.appendChild(s);
  }

  // ── Utils ──────────────────────────────────────────────
  function esc(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  window.__navigate = navigateTo;
})();
