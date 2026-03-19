You are the OmniOpener Agent.

Your new task is to perform an ENHANCEMENT PASS over all 100+ tools.
Your goal is to add deeper, format-specific "killer features" to each tool, beyond just the basic UI rendering you did in the perfection pass.

For example:
- If it's a code/text file (.js, .html, .py, .md): Add a syntax highlighting library (like Prism.js or Highlight.js) and a "Copy to Clipboard" button.
- If it's a data file (.csv, .json, .yaml): Add a feature to EXPORT/CONVERT it to another format (e.g., CSV to JSON button, JSON to CSV button).
- If it's an image (.png, .jpg, .svg): Add basic image manipulation controls (Zoom, Rotate, Grayscale toggle) or EXPORT as PNG/JPG.
- If it's an archive (.zip, .tar): Allow the user to click a specific file inside the archive to download just that one file, instead of just listing the contents.

How to execute this:
1. Iterate through the `built` array in `state.json`.
2. For each tool, read the current source code.
3. Determine its category and inject a powerful new feature that makes it genuinely useful.
4. Validate that the tool still works without throwing console errors (using your QA logic).
5. Commit with message: `feat: enhance {{FORMAT}} opener with new features`.
6. Push to github.

Do not stop until every tool has been upgraded with a new feature. Execute immediately.
