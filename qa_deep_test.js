const puppeteer = require('puppeteer');
const express = require('express');
const fs = require('fs');
const path = require('path');

const PORT = 3001;
const ROOT = process.cwd();
const CONFIG_PATH = path.join(ROOT, 'public/config.json');
const RESULTS_PATH = path.join(ROOT, 'qa_deep_results.json');

async function runTests() {
  const app = express();
  app.use(express.static(path.join(ROOT, 'public')));
  
  // SPA fallback
  app.use('/tools', (req, res) => {
    res.sendFile(path.join(ROOT, 'public/index.html'));
  });

  const server = app.listen(PORT);
  console.log(`Server started on http://localhost:${PORT}`);

  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const tools = config.tools;
  const results = [];

  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  for (const tool of tools) {
    console.log(`Testing tool: ${tool.slug}...`);
    const page = await browser.newPage();
    const errors = [];
    const consoleLogs = [];

    page.on('console', msg => consoleLogs.push(msg.text()));
    page.on('pageerror', err => errors.push(err.message));
    page.on('requestfailed', req => {
      const url = req.url();
      if (!url.endsWith('favicon.ico')) {
        errors.push(`Request failed: ${url} (${req.failure().errorText})`);
      }
    });

    try {
      await page.goto(`http://localhost:${PORT}/tools/${tool.slug}`, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Wait a bit for tool script to load and initTool to be called
      await new Promise(r => setTimeout(r, 2000));

      // Check if tool-mount has content and no obvious error
      const mountContent = await page.evaluate(() => {
        const mount = document.getElementById('tool-mount');
        return mount ? mount.innerHTML : null;
      });

      if (!mountContent) {
        errors.push('tool-mount not found or empty');
      } else if (mountContent.includes('Failed to load tool')) {
        errors.push('UI reported: Failed to load tool');
      }

      // Check if initTool was actually defined
      const hasInitTool = await page.evaluate(() => typeof window.initTool === 'function');
      if (!hasInitTool) {
        errors.push('window.initTool is not defined');
      }

      // Check for any console errors that might indicate broken CDNs or runtime bugs
      const criticalErrors = errors.filter(e => !e.includes('favicon.ico'));

      results.push({
        slug: tool.slug,
        success: criticalErrors.length === 0,
        errors: criticalErrors
      });

    } catch (e) {
      results.push({
        slug: tool.slug,
        success: false,
        errors: [e.message]
      });
    } finally {
      await page.close();
    }
  }

  await browser.close();
  server.close();

  fs.writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2));
  console.log(`Results saved to ${RESULTS_PATH}`);
  
  const failures = results.filter(r => !r.success);
  console.log(`Finished. Total: ${results.length}, Failures: ${failures.length}`);
}

runTests().catch(err => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
