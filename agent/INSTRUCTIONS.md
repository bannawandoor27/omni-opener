Go through each tool in /opt/omniopener/public/tools/ one at a time. For each tool:

1. Read the current tool file carefully
2. Identify ALL interactive features (buttons, tables, search boxes, players, viewers, etc.)
3. For each feature, make sure it ACTUALLY WORKS end-to-end — not just renders but is fully functional
4. Improve the UI/UX to be beautiful and intuitive:
   - Action buttons must be clearly visible, properly labeled, and give feedback on click
   - Tables must have working sort, scroll, and proper column widths
   - Search/filter boxes must filter content in real time as you type
   - File info bar must always show filename + human-readable size
   - Loading states must appear before heavy operations
   - Error messages must be friendly and suggest what to try
   - Empty states must be handled (empty file, zero rows, etc.)
5. Fix one feature at a time — do not rush. Make each feature polished before moving on.
6. After improving each tool, write it back to its file.
7. When all tools are improved, do: cd /opt/omniopener && git add -A && git commit -m feat: ui/ux polish — all features functional and tested && git push origin main

Start with the simplest tools first (txt-opener, log-opener, json-opener, csv-opener) then move to complex ones.
