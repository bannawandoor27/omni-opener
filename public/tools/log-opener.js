/**
 * OmniOpener — LOG Viewer Tool
 * Uses OmniTool SDK. Renders .log files with lazy-loading and line numbers.
 */
(function () {
  'use strict';

  const INITIAL_LOAD_COUNT = 1000;
  const LOAD_INCREMENT = 500;
  const SCROLL_THRESHOLD = 200; // pixels from bottom to trigger loading

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.log',
      dropLabel: 'Drop a .log file here',
      binary: false,
      infoHtml: '<strong>Log Viewer:</strong> Displays the content of log files with lazy-loading and line numbers.',

      onFile: function (file, content, helpers) {
        helpers.showLoading('Loading log file...');

        const allLines = content.split(/\r?\n/);
        let currentLineIndex = 0;
        let logContainerEl;

        const renderLines = (startIndex, count) => {
          let linesToRender = '';
          const endIndex = Math.min(startIndex + count, allLines.length);

          for (let i = startIndex; i < endIndex; i++) {
            const lineNumber = i + 1;
            const lineContent = allLines[i];
            linesToRender += `<span class="line-number text-surface-400 select-none w-12 inline-block text-right pr-2">${lineNumber}</span><span class="line-content">${escapeHtml(lineContent)}</span>\n`;
          }
          currentLineIndex = endIndex;
          return linesToRender;
        };

        const loadMoreLines = () => {
          if (currentLineIndex < allLines.length) {
            const newLinesHtml = renderLines(currentLineIndex, LOAD_INCREMENT);
            if (newLinesHtml) {
              const preEl = logContainerEl.querySelector('pre');
              if (preEl) { // Ensure preEl exists before appending
                preEl.innerHTML += newLinesHtml;
              }
            }
          }
        };

        const debounce = (func, delay) => {
          let timeout;
          return function(...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), delay);
          };
        };

        const handleScroll = debounce(() => {
          if (logContainerEl.scrollTop + logContainerEl.clientHeight >= logContainerEl.scrollHeight - SCROLL_THRESHOLD) {
            loadMoreLines();
          }
        }, 100); // Debounce by 100ms

        // Initial render
        const initialLinesHtml = renderLines(0, INITIAL_LOAD_COUNT);

        const renderHtml = `
          <div class="p-4 bg-surface-50 text-surface-800 rounded-lg shadow-inner h-full flex flex-col">
            <div class="flex-grow overflow-auto" id="log-container">
              <pre class="whitespace-pre-wrap font-mono text-sm leading-tight">${initialLinesHtml}</pre>
            </div>
          </div>
        `;
        helpers.render(renderHtml);

        // Attach scroll listener after rendering
        logContainerEl = mountEl.querySelector('#log-container');

        if (logContainerEl) {
          logContainerEl.addEventListener('scroll', handleScroll);
        } else {
          helpers.showError('Error: Could not find log container element.');
        }

        // Clean up event listener when tool is removed/reloaded
        helpers.onCleanup(() => {
          if (logContainerEl) {
            logContainerEl.removeEventListener('scroll', handleScroll);
          }
        });
      }
    });
  };
})();