(function() {
  'use strict';

  /**
   * OmniOpener — MOBI Opener & Viewer
   * A standalone, client-side MOBI/Mobipocket reader.
   * Handles PalmDoc decompression and PDB structure parsing.
   */

  function formatSize(b) {
    return b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : b > 1e3 ? (b / 1024).toFixed(0) + ' KB' : b + ' B';
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Decompresses PalmDoc (LZ77) data.
   * Used in almost all MOBI files for text compression.
   */
  function decompressPalmDoc(data) {
    let out = [];
    let i = 0;
    while (i < data.length) {
      const byte = data[i++];
      if (byte === 0) {
        out.push(0);
      } else if (byte >= 0x01 && byte <= 0x08) {
        // Copy next 'byte' bytes as literals
        for (let j = 0; j < byte && i < data.length; j++) {
          out.push(data[i++]);
        }
      } else if (byte >= 0x09 && byte <= 0x7F) {
        // Literal byte
        out.push(byte);
      } else if (byte >= 0x80 && byte <= 0xBF) {
        // Length-Distance pair (2 bytes)
        if (i >= data.length) break;
        const nextByte = data[i++];
        const combined = ((byte & 0x3F) << 8) | nextByte;
        const distance = combined >> 3;
        const length = (combined & 0x07) + 3;
        const start = out.length - distance;
        for (let j = 0; j < length; j++) {
          if (start + j >= 0) {
            out.push(out[start + j]);
          }
        }
      } else if (byte >= 0xC0) {
        // Space + XORed character
        out.push(32); // Space
        out.push(byte ^ 0x80);
      }
    }
    return new Uint8Array(out);
  }

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.mobi,.prc,.azw',
      dropLabel: 'Drop a .mobi or .azw file here',
      binary: true,
      onInit: function(helpers) {
        // Load a nice serif font for the reading experience
        helpers.loadCSS('https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,200..900;1,8..60,200..900&display=swap');
      },
      onFile: function(file, content, helpers) {
        helpers.showLoading('Parsing MOBI ebook...');
        
        try {
          const view = new DataView(content);
          
          // 1. PDB Header Parsing (Palm Database format)
          if (content.byteLength < 78) throw new Error('File is too small to be a valid MOBI ebook');
          
          const numRecords = view.getUint16(76);
          const recordOffsets = [];
          for (let i = 0; i < numRecords; i++) {
            recordOffsets.push(view.getUint32(78 + i * 8));
          }

          // 2. MOBI Header Parsing (Record 0)
          const rec0Offset = recordOffsets[0];
          // Basic check for MOBI identifier
          let mobiId = '';
          try {
            mobiId = Array.from(new Uint8Array(content, rec0Offset + 16, 4)).map(b => String.fromCharCode(b)).join('');
          } catch(e) {}

          // Some older formats or variations might have different offsets, but we target standard MOBI
          const compression = view.getUint16(rec0Offset);
          const textLength = view.getUint32(rec0Offset + 4);
          const mobiRecordCount = view.getUint16(rec0Offset + 8);
          const encoding = view.getUint32(rec0Offset + 28); // 65001 = UTF-8, 1252 = CP1252
          const firstNonBookIndex = view.getUint32(rec0Offset + 80);
          const fullNameOffset = view.getUint32(rec0Offset + 84);
          const fullNameLength = view.getUint32(rec0Offset + 88);
          const extraFlags = view.getUint32(rec0Offset + 164); // Extra record data flags

          // Get Title from MOBI header metadata
          let title = '';
          const decoder = new TextDecoder(encoding === 65001 ? 'utf-8' : 'windows-1252');
          try {
            const fullNameBytes = new Uint8Array(content, rec0Offset + fullNameOffset, fullNameLength);
            title = decoder.decode(fullNameBytes).trim();
          } catch (e) {
            title = file.name.replace(/\.[^/.]+$/, "");
          }

          // 3. Text Extraction & Decompression
          // Text records usually start at index 1 and go up to firstNonBookIndex - 1
          const lastTextRecord = (firstNonBookIndex > 0 && firstNonBookIndex < numRecords) ? firstNonBookIndex : mobiRecordCount + 1;
          
          let chunks = [];
          for (let i = 1; i < lastTextRecord; i++) {
            const start = recordOffsets[i];
            const end = (i + 1 < recordOffsets.length) ? recordOffsets[i + 1] : content.byteLength;
            let recordData = new Uint8Array(content, start, end - start);

            // Handle "Extra Record Data" trailing bytes
            if (extraFlags > 0) {
              let extraLen = 0;
              // Bit 0: Multibyte character support
              if (extraFlags & 1) {
                let v = 0, m = 1, j = recordData.length - 1;
                while (j >= 0) {
                  let b = recordData[j--];
                  v += (b & 0x7F) * m;
                  if (b & 0x80) break;
                  m <<= 7;
                }
                extraLen = v;
              }
              // Bit 1: TAS
              if (extraFlags & 2) extraLen += 1;
              
              if (extraLen < recordData.length) {
                recordData = recordData.subarray(0, recordData.length - extraLen);
              }
            }

            if (compression === 1) {
              // No compression
              chunks.push(recordData);
            } else if (compression === 2) {
              // PalmDoc compression
              chunks.push(decompressPalmDoc(recordData));
            } else if (compression === 17476) {
              throw new Error('This MOBI file uses HUFF/CDIC compression which is not supported in this viewer.');
            }
          }

          // Combine all chunks into one string
          const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
          const combined = new Uint8Array(totalLength);
          let offset = 0;
          for (const chunk of chunks) {
            combined.set(chunk, offset);
            offset += chunk.length;
          }

          let htmlContent = decoder.decode(combined);

          // 4. Post-processing & Sanitization
          // MOBI uses a subset of HTML. We'll clean up scripts for safety.
          htmlContent = htmlContent.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
          
          // Fix common MOBI tags if needed (like <mbp:pagebreak/>)
          htmlContent = htmlContent.replace(/<mbp:pagebreak\/?>/gi, '<hr class="my-10 border-surface-100" />');

          // 5. Final Render
          helpers.render(`
            <div class="max-w-4xl mx-auto p-4 md:p-8">
              <!-- File Info Bar -->
              <div class="flex flex-wrap items-center gap-3 p-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-100 shadow-sm">
                <div class="flex items-center gap-2 px-2 py-1 bg-white rounded-md border border-surface-200 shadow-sm">
                  <span class="text-lg">📖</span>
                  <span class="font-bold text-surface-900">${escapeHtml(title || 'MOBI Ebook')}</span>
                </div>
                <div class="flex items-center gap-2 text-surface-400">
                  <span class="truncate max-w-[150px]">${escapeHtml(file.name)}</span>
                  <span>·</span>
                  <span>${formatSize(file.size)}</span>
                  <span>·</span>
                  <span>${chunks.length} records</span>
                </div>
              </div>

              <!-- Content Area -->
              <div class="bg-white rounded-3xl border border-surface-200 shadow-xl overflow-hidden">
                <div class="p-8 md:p-16 lg:p-24 bg-white">
                  <article class="mobi-render-root font-serif text-lg md:text-xl leading-relaxed text-surface-900" style="font-family: 'Source Serif 4', serif;">
                    ${htmlContent}
                  </article>
                </div>
              </div>
            </div>

            <style>
              .mobi-render-root h1, .mobi-render-root h2, .mobi-render-root h3 { 
                font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
                font-weight: 800; 
                line-height: 1.2;
                margin-top: 2em;
                margin-bottom: 0.5em;
                color: #111827;
              }
              .mobi-render-root h1 { font-size: 2.25rem; }
              .mobi-render-root h2 { font-size: 1.875rem; }
              .mobi-render-root p { margin-bottom: 1.25em; }
              .mobi-render-root blockquote { 
                border-left: 4px solid #e5e7eb; 
                padding-left: 1.5rem; 
                font-style: italic; 
                color: #4b5563;
                margin: 2rem 0;
              }
              .mobi-render-root img { 
                max-width: 100%; 
                height: auto; 
                border-radius: 0.75rem; 
                margin: 2rem auto;
                display: block;
              }
              /* Hide binary junk that sometimes appears in MOBI records */
              .mobi-render-root a[filepos] { color: #4f46e5; text-decoration: underline; cursor: pointer; }
            </style>
          `);

          helpers.setState({ title, html: htmlContent });

        } catch (e) {
          helpers.showError('Could not parse MOBI file', e.message);
        }
      },
      actions: [
        {
          label: '📋 Copy Text',
          id: 'copy',
          onClick: function(helpers, btn) {
            const html = helpers.getState().html;
            if (html) {
              const tmp = document.createElement('div');
              tmp.innerHTML = html;
              helpers.copyToClipboard(tmp.textContent || tmp.innerText, btn);
            }
          }
        },
        {
          label: '📥 Download Original',
          id: 'dl',
          onClick: function(helpers) {
            helpers.download(helpers.getFile().name, helpers.getContent(), 'application/x-mobipocket-ebook');
          }
        }
      ],
      infoHtml: '<strong>Privacy:</strong> 100% client-side. Your ebook files never leave your computer.'
    });
  };
})();
