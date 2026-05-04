(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.vtt',
      dropLabel: 'Drop WebVTT Subtitles',
      binary: false,
      infoHtml: '<strong>VTT Viewer:</strong> View, search, and convert WebVTT subtitle files directly in your browser.',
      
      onInit: function(helpers) {
        helpers.loadCSS('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css');
        helpers.loadScript('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js');
      },

      actions: [
        {
          label: '📋 Copy SRT',
          id: 'copy-srt',
          onClick: function (h, btn) {
            h.copyToClipboard(vttToSrt(h.getContent()), btn);
          }
        },
        {
          label: '📥 Download SRT',
          id: 'download-srt',
          onClick: function (h) {
            const file = h.getFile();
            const name = file ? file.name.replace(/\.vtt$/i, '.srt') : 'subtitles.srt';
            h.download(name, vttToSrt(h.getContent()));
          }
        }
      ],

      onFile: function (file, content, h) {
        h.showLoading('Parsing subtitles...');
        
        // Small delay to ensure hljs is ready
        setTimeout(function() {
          const cues = parseVTT(content);
          
          const render = function(view) {
            let innerContent = '';
            if (view === 'cues') {
              if (cues.length === 0) {
                innerContent = '<div class="p-8 text-center text-surface-400">No subtitle cues found.</div>';
              } else {
                innerContent = cues.map(function(cue, i) {
                  return '<div class="p-3 bg-surface-50 rounded-lg border border-surface-100 hover:border-brand-300 transition-colors">' +
                    '<div class="flex items-center gap-4 text-xs font-mono text-brand-600 mb-1">' +
                      '<span class="opacity-50">#' + (i + 1) + '</span>' +
                      '<span>' + esc(cue.start) + ' &rarr; ' + esc(cue.end) + '</span>' +
                    '</div>' +
                    '<div class="text-surface-700 whitespace-pre-wrap">' + esc(cue.text.join('\n')) + '</div>' +
                  '</div>';
                }).join('');
              }
            } else {
              const highlighted = (typeof hljs !== 'undefined') 
                ? hljs.highlightAuto(content.slice(0, 50000)).value 
                : esc(content.slice(0, 50000));
              innerContent = '<pre class="hljs p-4 rounded-xl text-sm font-mono overflow-auto max-h-full"><code>' + highlighted + '</code></pre>';
            }

            h.render(
              '<div class="flex flex-col h-[75vh]">' +
                '<div class="flex items-center justify-between p-4 border-b border-surface-200 bg-surface-50">' +
                  '<div class="flex gap-2">' +
                    '<button id="tab-cues" class="px-4 py-1.5 text-sm font-medium rounded-lg ' + (view === 'cues' ? 'bg-brand-600 text-white' : 'text-surface-600 hover:bg-surface-200') + '">Cues</button>' +
                    '<button id="tab-raw" class="px-4 py-1.5 text-sm font-medium rounded-lg ' + (view === 'raw' ? 'bg-brand-600 text-white' : 'text-surface-600 hover:bg-surface-200') + '">Raw Source</button>' +
                  '</div>' +
                  '<div class="text-sm text-surface-500 font-mono">' + cues.length + ' cues</div>' +
                '</div>' +
                '<div id="vtt-body" class="flex-1 overflow-auto p-4 space-y-3 bg-white">' +
                  innerContent +
                '</div>' +
              '</div>'
            );

            document.getElementById('tab-cues').onclick = function() { render('cues'); };
            document.getElementById('tab-raw').onclick = function() { render('raw'); };
          };

          render('cues');
        }, 100);
      }
    });
  };

  function parseVTT(content) {
    const lines = content.split(/\r?\n/);
    const cues = [];
    let currentCue = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.indexOf('-->') !== -1) {
        const parts = line.split('-->');
        currentCue = {
          start: parts[0].trim(),
          end: parts[1].split(' ')[0].trim(),
          text: []
        };
        cues.push(currentCue);
      } else if (currentCue && line !== '') {
        currentCue.text.push(line);
      } else if (line === '' && currentCue) {
        currentCue = null;
      }
    }
    return cues;
  }

  function vttToSrt(vtt) {
    const cues = parseVTT(vtt);
    return cues.map(function(cue, i) {
      const fixTime = function(t) {
        t = t.replace('.', ',');
        const parts = t.split(':');
        if (parts.length === 2) return '00:' + t;
        return t;
      };
      return (i + 1) + '\n' + fixTime(cue.start) + ' --> ' + fixTime(cue.end) + '\n' + cue.text.join('\n') + '\n';
    }).join('\n');
  }

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }
})();