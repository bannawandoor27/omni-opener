/**
 * OmniOpener — CSV/TSV Viewer Tool
 * Uses OmniTool SDK. Renders .csv and .tsv files as interactive tables.
 */
(function () {
  'use strict';

  var parsedData = []; // To store the parsed CSV/TSV data

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.csv,.tsv',
      dropLabel: 'Drop a CSV or TSV file here',
      infoHtml: '<strong>Privacy First:</strong> Your files are processed entirely in your browser. No data is ever sent to a server.',
      
      actions: [
        {
          label: '📋 Copy as JSON', 
          id: 'copy-json', 
          onClick: function (helpers, btn) {
            if (parsedData.length > 0) {
              var jsonStr = JSON.stringify(parsedData, null, 2);
              helpers.copyToClipboard(jsonStr, btn);
            }
          } 
        },
        {
          label: '📥 Download as JSON', 
          id: 'dl-json', 
          onClick: function (helpers) {
            if (parsedData.length > 0) {
              var jsonStr = JSON.stringify(parsedData, null, 2);
              var originalFilename = helpers.getFile().name;
              var newFilename = originalFilename.replace(/\.(csv|tsv)$/i, '.json');
              helpers.download(newFilename, jsonStr, 'application/json');
            }
          }
        },
      ],

      onFile: function (file, content, helpers) {
        helpers.showLoading('Parsing table...');
        
        try {
          var separator = file.name.toLowerCase().endsWith('.tsv') ? '\t' : ',';
          var lines = content.trim().split(/\r?\n/);
          
          if (lines.length === 0) {
            helpers.showError('Empty file', 'The selected file is empty.');
            return;
          }

          var header = lines[0].split(separator);
          var records = [];
          
          for (var i = 1; i < lines.length; i++) {
            var values = lines[i].split(separator);
            // Basic check to skip empty lines
            if (values.length === 1 && values[0] === "") continue;

            var record = {};
            for (var j = 0; j < header.length; j++) {
              record[header[j]] = values[j];
            }
            records.push(record);
          }
          
          parsedData = records;
          
          // Render HTML table
          var tableHtml = '<div class="overflow-x-auto"><table class="w-full text-sm text-left text-surface-500">';
          
          // Table head
          tableHtml += '<thead class="text-xs text-surface-700 uppercase bg-surface-50">';
          tableHtml += '<tr>';
          header.forEach(function(h) {
            tableHtml += '<th scope="col" class="px-6 py-3">' + escapeHtml(h) + '</th>';
          });
          tableHtml += '</tr></thead>';
          
          // Table body
          tableHtml += '<tbody>';
          records.forEach(function(record) {
            tableHtml += '<tr class="bg-white border-b hover:bg-surface-50">';
            header.forEach(function(h) {
              tableHtml += '<td class="px-6 py-4">' + escapeHtml(record[h]) + '</td>';
            });
            tableHtml += '</tr>';
          });
          tableHtml += '</tbody></table></div>';
          
          helpers.render(tableHtml);

        } catch (err) {
          helpers.showError('Failed to parse file', err.message);
          parsedData = [];
        }
      }
    });
  };

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

})();
