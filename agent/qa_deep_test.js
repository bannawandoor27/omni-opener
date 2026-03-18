const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function runDeepQA() {
  const configPath = path.join(__dirname, '../public/config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const tools = config.tools;

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const results = [];
  const baseUrl = 'http://localhost:3000'; // Assuming the app is served here or we use file://

  // We'll use a local server or file protocol. 
  // Given the environment, it's likely we need to serve it or it's already served.
  // Let's assume we can use file:// for now, or start a small express server if needed.
  // Actually, some tools might use fetch() which fails on file://.
  // Let's start a quick express server in the background.

  const express = require('express');
  const app = express();
  app.use(express.static(path.join(__dirname, '../public')));
  // Redirect /tools/* to /index.html for SPA routing
  app.use((req, res, next) => {
    if (req.path.startsWith('/tools/')) {
      res.sendFile(path.join(__dirname, '../public/index.html'));
    } else {
      next();
    }
  });
  const server = app.listen(3000);

  const batchSize = 5;
  for (let i = 0; i < tools.length; i += batchSize) {
    const batch = tools.slice(i, i + batchSize);
    await Promise.all(batch.map(async (tool) => {
      console.log(`Testing tool: ${tool.slug} ...`);
      const page = await browser.newPage();
      
      const errors = [];
      const networkFailures = [];

      page.on('console', msg => {
        if (msg.type() === 'error') errors.push(msg.text());
      });

      page.on('pageerror', err => {
        errors.push(err.message);
      });

      page.on('requestfailed', request => {
        networkFailures.push(`${request.url()} - ${request.failure().errorText}`);
      });

      page.on('response', response => {
        if (response.status() >= 400) {
          networkFailures.push(`${response.url()} - HTTP ${response.status()}`);
        }
      });

      try {
        await page.goto(`${baseUrl}/tools/${tool.slug}`, { waitUntil: 'networkidle0' });

        // Mock file generation and drop
        const format = tool.formats[0] || '.txt';
        
        const success = await page.evaluate(async (format) => {
          function getDummyContent(ext) {
            const textFormats = ['.csv', '.tsv', '.json', '.xml', '.yaml', '.txt', '.log', '.ini', '.sql', '.proto', '.graphql', '.ics', '.vcf', '.md', '.markdown', '.html', '.srt', '.vtt', '.ass', '.lrc', '.pem', '.crt', '.key'];
            if (textFormats.includes(ext)) {
              if (ext === '.json') return '{"test": true}';
              if (ext === '.xml' || ext === '.svg') return '<test>data</test>';
              if (ext === '.yaml') return 'test: true';
              if (ext === '.pem' || ext === '.crt' || ext === '.key') return '-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE7W3uLq+fQ5/Yy1K5...';
              return 'dummy text content';
            }

            // Binary defaults
            const zipB64 = 'UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==';
            const pngB64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
            const pdfB64 = 'JVBERi0xLjAKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqIDIgMCBvYmo8PC9UeXBlL1BhZ2VzL0NvdW50IDAvS2lkc1tdPj5lbmRvYmoKdHJhaWxlcjw8L1NpemUgMy9Sb290IDEgMCBSPj4KJSVFT0Y=';

            if (['.zip', '.jar', '.apk', '.ipa', '.war', '.ear', '.whl', '.nupkg', '.crate', '.7z', '.rar', '.tar', '.gz', '.bz2', '.xz'].includes(ext)) {
               return Uint8Array.from(atob(zipB64), c => c.charCodeAt(0)).buffer;
            }
            if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.heic', '.tiff', '.bmp', '.ico'].includes(ext)) {
               return Uint8Array.from(atob(pngB64), c => c.charCodeAt(0)).buffer;
            }
            if (ext === '.pdf') {
               return Uint8Array.from(atob(pdfB64), c => c.charCodeAt(0)).buffer;
            }
            if (ext === '.wasm') {
               return new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]).buffer;
            }
            if (ext === '.exe' || ext === '.msi' || ext === '.dll') {
               return new Uint8Array([0x4d, 0x5a, 0x00, 0x00]).buffer; // MZ header
            }
            if (ext === '.rpm') {
               return new Uint8Array([0xed, 0xab, 0xee, 0xdb]).buffer;
            }
            if (ext === '.msi') {
               return new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).buffer;
            }

            return new ArrayBuffer(64); // larger buffer
          }
          const content = getDummyContent(format);
          const fileName = 'test' + format;
          const file = new File([content], fileName, { type: 'application/octet-stream' });

          const input = document.querySelector('#omni-file-input');
          if (!input) return false;

          const dataTransfer = new DataTransfer();
          dataTransfer.items.add(file);
          input.files = dataTransfer.files;
          input.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }, format);

        if (!success) {
          errors.push('Could not find file input');
        } else {
          // Wait for render
          await new Promise(r => setTimeout(r, 5000)); // slightly longer wait for complex tools

          const renderStatus = await page.evaluate(() => {
            const renderArea = document.querySelector('#omni-render');
            if (!renderArea) return 'no-render-area';
            if (renderArea.classList.contains('hidden')) return 'hidden';
            if (renderArea.innerHTML.includes('Failed to process file') || renderArea.innerHTML.includes('Error')) return 'error-displayed';
            if (renderArea.innerText.trim().length < 5) return 'empty';
            return 'ok';
          });

          if (renderStatus !== 'ok') {
            errors.push(`Render status: ${renderStatus}`);
          }
        }

      } catch (e) {
        errors.push(`Navigation/Execution error: ${e.message}`);
      }

      results.push({
        slug: tool.slug,
        success: errors.length === 0 && networkFailures.length === 0,
        errors,
        networkFailures
      });

      await page.close();
    }));
  }


  server.close();
  await browser.close();

  fs.writeFileSync(path.join(__dirname, 'qa_deep_results.json'), JSON.stringify(results, null, 2));
  
  const failed = results.filter(r => !r.success);
  console.log(`\nQA Finished. ${results.length} tested, ${results.length - failed.length} passed, ${failed.length} failed.`);
  
  if (failed.length > 0) {
    console.log('\nFailed tools:');
    failed.forEach(f => {
      console.log(`- ${f.slug}:`);
      f.errors.forEach(e => console.log(`  [ERR] ${e}`));
      f.networkFailures.forEach(n => console.log(`  [NET] ${n}`));
    });
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runDeepQA().catch(err => {
  console.error(err);
  process.exit(1);
});
