You are the OmniOpener Agent. Your previous QA pass only checked if the page loaded without errors. Now you must perform an DEEP END-TO-END QA pass on every tool in `public/tools/*.js`.

Write a new Puppeteer script (`qa_deep_test.js`) that does the following for EVERY tool:
1. Navigate to the tool's page locally.
2. Programmatically mock a file drop (create a dummy File object in the browser context matching the expected format/extension).
3. Inject that file into the OmniTool SDK's internal file handler or simulate the drag-and-drop event on the dropzone.
4. Wait for the tool's `onFile` logic to parse the file and render output to the DOM.
5. Check if the DOM actually updated (e.g., check if a table, canvas, or pre block was rendered).
6. Listen for ANY console errors during this active parsing phase.
7. Record any tool that fails to render or throws an error during parsing.

If any tools fail this deep QA pass:
1. Automatically rewrite those specific tools to fix the runtime parsing bugs.
2. Re-run the deep QA pass on the failed tools until they pass.
3. Commit the fixes.

Execute this deep QA pass immediately.

CRITICAL ADDITION TO THE QA PASS:
You MUST also monitor network requests during the deep QA test. 
Many tools (like .snap, .iso, and others) are relying on external CDNs or dynamic imports that are failing to load (e.g., 404s, CORS issues, or broken links). 
In your Puppeteer script:
1. Listen to `page.on('requestfailed', ...)` and `page.on('response', ...)`
2. If ANY tool fails to load a dependency script, worker, or wasm file (HTTP 404 or connection failed), MARK THAT TOOL AS FAILED.
3. Automatically rewrite the tool to use a working CDN (like unpkg, jsdelivr, or cdnjs) or fix the import paths.
4. Do not let any broken dependency slip through!
