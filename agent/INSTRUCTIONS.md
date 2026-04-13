# Task: Perfect All Existing Tools

Do NOT add new file format tools. Instead, go through every existing tool in /opt/omniopener/public/tools/ and make each one genuinely useful with working, tested features.

## Priority Order

### CRITICAL — These are stubs (only show file size + download button). Make them actually useful:
appimage-opener.js, bz2-opener.js, crate-opener.js, deb-opener.js, dll-opener.js, dmg-opener.js, dylib-opener.js, egg-opener.js, exe-opener.js, flatpak-opener.js, gem-opener.js, iso-opener.js, msi-opener.js, rar-opener.js, rpm-opener.js, snap-opener.js, so-opener.js, xz-opener.js

For binary system formats (exe, dll, so, msi, dylib, deb, rpm, iso, dmg) that can't be truly opened in a browser, add REAL useful features:
- Full hex viewer (show first 4KB as hex dump with ascii column)
- PE header parser for exe/dll (parse DOS header, PE signature, machine type, timestamp, section count, imports if detectable)
- ELF header parser for so/dylib (magic bytes, class 32/64bit, endianness, machine architecture, entry point)
- File hash display (use SubtleCrypto API to compute SHA-256 of the file client-side)
- Magic bytes identifier (show the first 16 bytes and identify the file format signature)
- Entropy visualization (rough graph of byte distribution)

For archive formats (bz2, xz, rar, crate, egg, gem, snap, flatpak, appimage):
- Use available JS libraries (pako for gz/bz2, libarchive.js if available)
- At minimum: parse and show file headers/metadata, magic bytes, compression info
- Show file hash (SHA-256 via SubtleCrypto)

### HIGH PRIORITY — Add missing features to these working tools:
- zip-opener.js: Add file preview inside ZIP (click file in list to preview text/image files), add search within archive
- tar-opener.js: Same as zip — preview files inside
- pdf-opener.js: Add page thumbnails sidebar, text search within PDF, copy text button
- xlsx-opener.js: Add column sorting, search/filter rows, sheet statistics (sum/avg/min/max for numeric columns)
- docx-opener.js: Add word count, reading time estimate, find text
- json-opener.js: Add JSON path query (jq-like), collapse/expand all nodes, search by key or value
- xml-opener.js: Add XPath query, format/beautify, collapse nodes
- csv-opener.js: Already good — add column statistics (mean, median, std dev for numeric columns)
- log-opener.js: Add regex filter, highlight ERROR/WARN/INFO lines in different colors, line jump
- mp3-opener.js, wav-opener.js, ogg-opener.js, flac-opener.js: Add waveform visualization using Web Audio API + Canvas

## Standards for Each Tool

Every tool must have:
1. A working drag-and-drop zone using OmniTool SDK
2. At least 2-3 meaningful action buttons (Copy, Download, specific to format)
3. Real content display (not just this format not supported)
4. File metadata display (name, size, type)
5. Error handling with clear messages

## Technical Guidelines
- Use OmniTool SDK (window.OmniTool.create) — it's already loaded
- Load dependencies via helpers.loadScript() or helpers.loadScripts()
- Use SubtleCrypto for hashing: crypto.subtle.digest('SHA-256', buffer)
- Use Canvas API for visualizations
- Use Web Audio API for audio waveforms
- CDNs available: cdnjs.cloudflare.com, cdn.jsdelivr.net, unpkg.com

Process one tool at a time. After improving each tool, validate it passes the validation prompt, then commit.
