/**
 * OmniOpener — KDBX (KeePass) Viewer & Converter
 * Uses OmniTool SDK and kdbxweb.
 */
(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      accept: '.kdbx',
      dropLabel: 'Drop a .kdbx file here',
      infoHtml: '<strong>Security:</strong> All decryption happens locally in your browser. Your master password and database content never leave your device.',

      actions: [
        {
          label: '📋 Copy JSON',
          id: 'copy-json',
          onClick: function (h, btn) {
            const db = h.getState().db;
            if (!db) return;
            h.copyToClipboard(JSON.stringify(dbToExport(db), null, 2), btn);
          }
        },
        {
          label: '📥 Download JSON',
          id: 'dl-json',
          onClick: function (h) {
            const db = h.getState().db;
            if (!db) return;
            h.download(h.getFile().name + '.json', JSON.stringify(dbToExport(db), null, 2), 'application/json');
          }
        },
        {
          label: '📥 Download CSV',
          id: 'dl-csv',
          onClick: function (h) {
            const db = h.getState().db;
            if (!db) return;
            const data = dbToExport(db);
            if (data.length === 0) return;
            const headers = ['Group', 'Title', 'UserName', 'Password', 'URL', 'Notes'];
            const csv = [
              headers.join(','),
              ...data.map(row => headers.map(h => '"' + (row[h] || '').replace(/"/g, '""') + '"').join(','))
            ].join('\n');
            h.download(h.getFile().name + '.csv', csv, 'text/csv');
          }
        }
      ],

      onInit: function (h) {
        if (typeof kdbxweb === 'undefined') {
          h.loadScript('https://cdn.jsdelivr.net/npm/kdbxweb@2.1.1/dist/kdbxweb.min.js');
        }
      },

      onFile: function (file, content, h) {
        h.setState({ buffer: content, db: null });
        renderPasswordPrompt(h);
      }
    });
  };

  // ── UI Components ─────────────────────────────────────

  function renderPasswordPrompt(h) {
    h.render(
      '<div class="flex flex-col items-center justify-center py-16 gap-6">' +
        '<div class="text-center">' +
          '<div class="text-4xl mb-4">🔒</div>' +
          '<h3 class="text-xl font-semibold text-surface-900">Database Locked</h3>' +
          '<p class="text-sm text-surface-500 mt-1">Enter the master password for: <span class="font-medium">' + esc(h.getFile().name) + '</span></p>' +
        '</div>' +
        '<div class="flex flex-col w-full max-w-sm gap-3">' +
          '<input type="password" id="kdbx-password" class="w-full px-4 py-3 border border-surface-200 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none transition-all shadow-sm" placeholder="Master Password" autofocus>' +
          '<button id="kdbx-unlock" class="w-full px-6 py-3 bg-brand-600 text-white rounded-xl font-semibold hover:bg-brand-700 transition-colors shadow-sm">Unlock Database</button>' +
        '</div>' +
      '</div>'
    );

    const btn = document.getElementById('kdbx-unlock');
    const input = document.getElementById('kdbx-password');

    const unlock = async () => {
      const password = input.value;
      if (!password) return;
      
      h.showLoading('Decrypting database...');
      
      // Delay to let the loading spinner show
      setTimeout(async () => {
        try {
          const credentials = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString(password));
          const db = await kdbxweb.Kdbx.load(h.getState().buffer, credentials);
          h.setState({ db: db });
          renderDatabase(h, db);
        } catch (err) {
          h.showError('Decryption Failed', 'Invalid password or corrupted file. ' + (err.message || ''));
          setTimeout(() => renderPasswordPrompt(h), 2500);
        }
      }, 50);
    };

    btn.onclick = unlock;
    input.onkeydown = (e) => { if (e.key === 'Enter') unlock(); };
    input.focus();
  }

  function renderDatabase(h, db) {
    const entries = dbToExport(db);
    
    h.render(
      '<div class="p-6">' +
        '<div class="flex items-center justify-between mb-6">' +
          '<h2 class="text-lg font-bold text-surface-900">Database Entries (' + entries.length + ')</h2>' +
          '<div class="relative w-64">' +
            '<input type="text" id="kdbx-search" placeholder="Search entries..." class="w-full pl-9 pr-4 py-2 text-sm border border-surface-200 rounded-lg focus:ring-1 focus:ring-brand-500 outline-none">' +
            '<span class="absolute left-3 top-2.5 text-surface-400">🔍</span>' +
          '</div>' +
        '</div>' +
        '<div class="overflow-hidden border border-surface-100 rounded-xl bg-surface-50">' +
          '<table class="w-full text-sm text-left border-collapse">' +
            '<thead class="bg-surface-100 text-surface-600 font-medium">' +
              '<tr>' +
                '<th class="px-4 py-3">Title / Group</th>' +
                '<th class="px-4 py-3">Username</th>' +
                '<th class="px-4 py-3">Password</th>' +
                '<th class="px-4 py-3 text-right">Link</th>' +
              '</tr>' +
            '</thead>' +
            '<tbody id="kdbx-table-body" class="bg-white divide-y divide-surface-100"></tbody>' +
          '</table>' +
        '</div>' +
      '</div>'
    );

    const searchInput = document.getElementById('kdbx-search');
    const tbody = document.getElementById('kdbx-table-body');

    const updateTable = (filter = '') => {
      const term = filter.toLowerCase();
      const filtered = entries.filter(e => 
        (e.Title || '').toLowerCase().includes(term) || 
        (e.UserName || '').toLowerCase().includes(term) ||
        (e.Group || '').toLowerCase().includes(term)
      );

      tbody.innerHTML = filtered.map(e => {
        const title = e.Title || '(Untitled)';
        const group = e.Group ? '<span class="text-xs text-surface-400 block">' + esc(e.Group) + '</span>' : '';
        const url = e.URL;
        
        return (
          '<tr class="hover:bg-surface-50 transition-colors">' +
            '<td class="px-4 py-3 font-medium text-surface-900">' + esc(title) + group + '</td>' +
            '<td class="px-4 py-3 text-surface-600">' + esc(e.UserName || '') + '</td>' +
            '<td class="px-4 py-3">' +
              '<button class="copy-pass px-2 py-1 bg-surface-100 hover:bg-brand-50 hover:text-brand-600 rounded text-xs font-medium transition-colors" data-pass="' + esc(e.Password || '') + '">📋 Copy</button>' +
            '</td>' +
            '<td class="px-4 py-3 text-right">' +
              (url ? '<a href="' + esc(url) + '" target="_blank" class="text-brand-600 hover:underline">Open ↗</a>' : '-') +
            '</td>' +
          '</tr>'
        );
      }).join('');

      if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="px-4 py-12 text-center text-surface-400">No matching entries found</td></tr>';
      }

      // Bind copy buttons
      tbody.querySelectorAll('.copy-pass').forEach(btn => {
        btn.onclick = () => h.copyToClipboard(btn.dataset.pass, btn);
      });
    };

    searchInput.oninput = (e) => updateTable(e.target.value);
    updateTable();
  }

  // ── Data Helpers ──────────────────────────────────────

  function dbToExport(db) {
    const result = [];
    const iterate = (group, path) => {
      const groupName = path ? path + ' / ' + group.name : group.name;
      
      group.entries.forEach(e => {
        const entry = { Group: groupName };
        for (const [key, value] of Object.entries(e.fields)) {
          if (value instanceof kdbxweb.ProtectedValue) {
            entry[key] = value.getText();
          } else if (typeof value === 'string') {
            entry[key] = value;
          }
        }
        result.push(entry);
      });

      group.groups.forEach(g => iterate(g, groupName));
    };

    iterate(db.getDefaultGroup(), '');
    return result;
  }

  function esc(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

})();
