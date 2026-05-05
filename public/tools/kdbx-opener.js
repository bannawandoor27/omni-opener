/**
 * OmniOpener — KDBX (KeePass) Viewer & Converter
 * PRODUCTION PERFECT VERSION
 */
(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    let kdbxLoaded = false;

    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      accept: '.kdbx',
      dropLabel: 'Drop your .kdbx database here',
      infoHtml: '<strong>Privacy First:</strong> Decryption happens entirely in your browser. Your master password and data are never sent to any server.',

      actions: [
        {
          label: '📋 Copy JSON',
          id: 'copy-json',
          onClick: function (h, btn) {
            const db = h.getState().db;
            if (!db) return;
            const data = dbToExport(db);
            h.copyToClipboard(JSON.stringify(data, null, 2), btn);
          }
        },
        {
          label: '📥 Download JSON',
          id: 'dl-json',
          onClick: function (h) {
            const db = h.getState().db;
            if (!db) return;
            const data = dbToExport(db);
            h.download(h.getFile().name.replace('.kdbx', '') + '.json', JSON.stringify(data, null, 2), 'application/json');
          }
        },
        {
          label: '📥 Download CSV',
          id: 'dl-csv',
          onClick: function (h) {
            const db = h.getState().db;
            if (!db) return;
            const data = dbToExport(db);
            if (!data || data.length === 0) return;
            const headers = ['Group', 'Title', 'UserName', 'Password', 'URL', 'Notes'];
            const csv = [
              headers.join(','),
              ...data.map(row => headers.map(header => {
                const val = (row[header] || '').toString();
                return '"' + val.replace(/"/g, '""') + '"';
              }).join(','))
            ].join('\n');
            h.download(h.getFile().name.replace('.kdbx', '') + '.csv', csv, 'text/csv');
          }
        }
      ],

      onInit: function (h) {
        if (typeof kdbxweb === 'undefined') {
          h.loadScript('https://cdn.jsdelivr.net/npm/kdbxweb@2.1.1/dist/kdbxweb.min.js', () => {
            kdbxLoaded = true;
          });
        } else {
          kdbxLoaded = true;
        }
      },

      onFile: function _onFile(file, content, h) {
        if (!kdbxLoaded) {
          h.showLoading('Loading decryption engine...');
          setTimeout(() => _onFile(file, content, h), 100);
          return;
        }
        h.setState({ buffer: content, db: null, entries: null });
        renderUnlockScreen(h);
      },

      onDestroy: function (h) {
        // Clean up any sensitive data in memory if possible
        h.setState({ buffer: null, db: null, entries: null });
      }
    });

    function renderUnlockScreen(h) {
      const file = h.getFile();
      h.render(
        '<div class="max-w-xl mx-auto py-12 px-4">' +
          '<div class="text-center mb-8">' +
            '<div class="inline-flex items-center justify-center w-20 h-20 bg-brand-50 text-brand-600 rounded-full text-4xl mb-4">🔒</div>' +
            '<h2 class="text-2xl font-bold text-surface-900">Database Locked</h2>' +
            '<p class="text-surface-500 mt-2">Enter the master password for <span class="font-medium text-surface-700">' + esc(file.name) + '</span></p>' +
          '</div>' +
          '<div class="bg-white p-8 rounded-2xl border border-surface-200 shadow-sm">' +
            '<div class="space-y-4">' +
              '<div>' +
                '<label class="block text-sm font-medium text-surface-700 mb-1.5">Master Password</label>' +
                '<input type="password" id="kdbx-pass" class="w-full px-4 py-3 bg-surface-50 border border-surface-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:bg-white outline-none transition-all" placeholder="••••••••" autofocus>' +
              '</div>' +
              '<button id="kdbx-unlock-btn" class="w-full py-3.5 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl transition-all shadow-sm active:transform active:scale-[0.98]">Unlock Database</button>' +
            '</div>' +
            '<div class="mt-6 p-4 bg-amber-50 border border-amber-100 rounded-xl flex gap-3">' +
              '<span class="text-amber-500 text-lg">⚠️</span>' +
              '<p class="text-xs text-amber-800 leading-relaxed">Ensure you are the only one who can see your screen. Passwords will be visible once the database is unlocked.</p>' +
            '</div>' +
          '</div>' +
        '</div>'
      );

      const passInput = document.getElementById('kdbx-pass');
      const unlockBtn = document.getElementById('kdbx-unlock-btn');

      const performUnlock = async () => {
        const password = passInput.value;
        if (!password) {
          passInput.focus();
          return;
        }

        h.showLoading('Decrypting & Verifying...');
        
        // Small delay to ensure UI updates
        setTimeout(async () => {
          try {
            const credentials = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString(password));
            const db = await kdbxweb.Kdbx.load(h.getState().buffer, credentials);
            const entries = dbToExport(db);
            h.setState({ db, entries });
            renderEntries(h);
          } catch (err) {
            h.showError('Unlock Failed', 'The master password might be incorrect, or the file is not a valid KDBX database.');
            // Re-render unlock screen after error
            setTimeout(() => renderUnlockScreen(h), 2000);
          }
        }, 50);
      };

      unlockBtn.onclick = performUnlock;
      passInput.onkeydown = (e) => { if (e.key === 'Enter') performUnlock(); };
      passInput.focus();
    }

    function renderEntries(h) {
      const file = h.getFile();
      const entries = h.getState().entries || [];

      h.render(
        '<div class="space-y-6">' +
          // File Info Bar
          '<div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">' +
            '<span class="font-semibold text-surface-800">' + esc(file.name) + '</span>' +
            '<span class="text-surface-300">|</span>' +
            '<span>' + h.formatBytes(file.size) + '</span>' +
            '<span class="text-surface-300">|</span>' +
            '<span class="text-surface-500">.kdbx database</span>' +
          '</div>' +

          '<div class="flex flex-col md:flex-row md:items-center justify-between gap-4">' +
            '<div>' +
              '<h3 class="text-xl font-bold text-surface-900">Database Entries</h3>' +
              '<p class="text-sm text-surface-500">' + entries.length + ' credentials found</p>' +
            '</div>' +
            '<div class="relative min-w-[300px]">' +
              '<input type="text" id="kdbx-filter" class="w-full pl-10 pr-4 py-2 bg-white border border-surface-200 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none transition-all shadow-sm" placeholder="Search by title, user, or group...">' +
              '<span class="absolute left-3.5 top-2.5 text-surface-400">🔍</span>' +
            '</div>' +
          '</div>' +

          '<div class="overflow-hidden border border-surface-200 rounded-2xl bg-white shadow-sm">' +
            '<div class="overflow-x-auto">' +
              '<table class="min-w-full text-sm">' +
                '<thead>' +
                  '<tr class="bg-surface-50 border-b border-surface-200">' +
                    '<th class="px-4 py-4 text-left font-semibold text-surface-700">Group & Title</th>' +
                    '<th class="px-4 py-4 text-left font-semibold text-surface-700">Username</th>' +
                    '<th class="px-4 py-4 text-left font-semibold text-surface-700">Password</th>' +
                    '<th class="px-4 py-4 text-right font-semibold text-surface-700">Actions</th>' +
                  '</tr>' +
                '</thead>' +
                '<tbody id="kdbx-tbody" class="divide-y divide-surface-100"></tbody>' +
              '</table>' +
            '</div>' +
          '</div>' +
        '</div>'
      );

      const filterInput = document.getElementById('kdbx-filter');
      const tbody = document.getElementById('kdbx-tbody');

      const updateList = (query = '') => {
        const q = query.toLowerCase();
        const filtered = entries.filter(e => 
          (e.Title || '').toLowerCase().includes(q) || 
          (e.UserName || '').toLowerCase().includes(q) ||
          (e.Group || '').toLowerCase().includes(q) ||
          (e.URL || '').toLowerCase().includes(q)
        );

        if (filtered.length === 0) {
          tbody.innerHTML = '<tr><td colspan="4" class="px-4 py-16 text-center text-surface-400">' + 
            (entries.length === 0 ? 'No entries found in this database.' : 'No entries match your search.') + 
            '</td></tr>';
          return;
        }

        tbody.innerHTML = filtered.map((e, idx) => {
          const title = e.Title || '<span class="italic opacity-50">Untitled</span>';
          const group = e.Group ? '<div class="text-[10px] uppercase tracking-wider text-surface-400 font-bold mb-0.5">' + esc(e.Group) + '</div>' : '';
          const hasUrl = e.URL && e.URL.startsWith('http');
          
          return (
            '<tr class="even:bg-surface-50/50 hover:bg-brand-50/50 transition-colors group">' +
              '<td class="px-4 py-4">' +
                group +
                '<div class="font-bold text-surface-900">' + esc(title) + '</div>' +
              '</td>' +
              '<td class="px-4 py-4 text-surface-600">' + esc(e.UserName || '-') + '</td>' +
              '<td class="px-4 py-4">' +
                '<div class="flex items-center gap-2">' +
                  '<input type="password" value="' + esc(e.Password || '') + '" readonly class="bg-transparent border-none p-0 text-sm font-mono w-24 focus:outline-none kdbx-pass-field" id="pass-' + idx + '">' +
                  '<button class="toggle-pass text-surface-400 hover:text-brand-600 transition-colors" data-target="pass-' + idx + '" title="Toggle Visibility">👁️</button>' +
                '</div>' +
              '</td>' +
              '<td class="px-4 py-4 text-right">' +
                '<div class="flex items-center justify-end gap-2">' +
                  (hasUrl ? '<a href="' + esc(e.URL) + '" target="_blank" class="p-2 text-surface-400 hover:text-brand-600 hover:bg-white rounded-lg transition-all" title="Open URL">↗️</a>' : '') +
                  '<button class="copy-trigger p-2 text-surface-400 hover:text-brand-600 hover:bg-white rounded-lg transition-all" data-text="' + esc(e.Password || '') + '" title="Copy Password">📋</button>' +
                '</div>' +
              '</td>' +
            '</tr>'
          );
        }).join('');

        // Listeners for copy and toggle
        tbody.querySelectorAll('.copy-trigger').forEach(btn => {
          btn.onclick = () => h.copyToClipboard(btn.dataset.text, btn);
        });

        tbody.querySelectorAll('.toggle-pass').forEach(btn => {
          btn.onclick = () => {
            const input = document.getElementById(btn.dataset.target);
            const isPass = input.type === 'password';
            input.type = isPass ? 'text' : 'password';
            btn.textContent = isPass ? '🙈' : '👁️';
          };
        });
      };

      filterInput.oninput = (e) => updateList(e.target.value);
      updateList();
    }

    // Helper: Recursive extractor for KDBX entries
    function dbToExport(db) {
      const result = [];
      const traverse = (group, path) => {
        const groupName = path ? path + ' / ' + group.name : group.name;
        
        group.entries.forEach(e => {
          const entry = { Group: groupName };
          // Common fields: Title, UserName, Password, URL, Notes
          for (const [key, value] of Object.entries(e.fields)) {
            if (value instanceof kdbxweb.ProtectedValue) {
              entry[key] = value.getText();
            } else if (typeof value === 'string') {
              entry[key] = value;
            } else if (value && typeof value.getText === 'function') {
              entry[key] = value.getText();
            }
          }
          result.push(entry);
        });

        group.groups.forEach(g => traverse(g, groupName));
      };

      const defaultGroup = db.getDefaultGroup();
      if (defaultGroup) {
        traverse(defaultGroup, '');
      }
      return result;
    }

    function esc(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }
  };
})();
