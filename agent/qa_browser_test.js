const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const express = require('express');

const PORT = 3001;
const ROOT_DIR = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

// 1. Start a simple static server
const app = express();
app.use(express.static(PUBLIC_DIR));
app.use((req, res, next) => {
  if (req.path.startsWith('/tools/')) {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  } else {
    next();
  }
});

const server = app.listen(PORT, () => console.log(`QA Server running on port ${PORT}`));

(async () => {
    let browser;
    try {
        const launchOptions = {
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
            executablePath: '/usr/bin/chromium-browser'
        };

        browser = await puppeteer.launch(launchOptions);
        
        // Read tools from config.json
        const config = JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, 'config.json'), 'utf8'));
        const tools = config.tools;
        
        console.log(`Starting final exhaustive QA pass for ${tools.length} tools...`);
        
        const results = { passed: [], failed: [] };

        for (const tool of tools) {
            process.stdout.write(`Testing [${tool.slug}]... `);
            const page = await browser.newPage();
            
            const errors = [];
            page.on('pageerror', err => {
                errors.push(`PageError: ${err.message}`);
            });
            page.on('console', msg => {
                if (msg.type() === 'error') {
                    const text = msg.text();
                    if (!text.includes('favicon') && !text.includes('Failed to load resource')) {
                        errors.push(`ConsoleError: ${text}`);
                    }
                }
            });

            try {
                await page.goto(`http://localhost:${PORT}/tools/${tool.slug}`, { 
                    waitUntil: 'networkidle0',
                    timeout: 45000 
                });
                
                // Wait for JS initialization
                await new Promise(r => setTimeout(r, 4000));
                
                const mountStatus = await page.evaluate(() => {
                    const mount = document.getElementById('tool-mount');
                    if (!mount) return 'NO_MOUNT_EL';
                    const html = mount.innerHTML;
                    if (html.includes('Loading tool')) return 'STILL_LOADING';
                    if (html.includes('Failed to load tool script')) return 'SCRIPT_LOAD_FAIL';
                    if (html.includes('omni-drop')) return 'MOUNTED_OK';
                    return 'OTHER: ' + html.substring(0, 50);
                });

                if (errors.length > 0) {
                    console.log(`❌ FAILED (${errors.length} errors: ${errors[0].substring(0, 60)})`);
                    results.failed.push({ slug: tool.slug, script_url: tool.script_url, errors });
                } else if (mountStatus !== 'MOUNTED_OK') {
                    console.log(`❌ FAILED (Status: ${mountStatus})`);
                    results.failed.push({ slug: tool.slug, script_url: tool.script_url, errors: [`Mount status: ${mountStatus}`] });
                } else {
                    console.log(`✅ PASSED`);
                    results.passed.push(tool.slug);
                }
            } catch (e) {
                console.log(`❌ CRASHED: ${e.message}`);
                results.failed.push({ slug: tool.slug, script_url: tool.script_url, errors: [e.message] });
            } finally {
                await page.close();
            }
        }

        console.log(`\nQA Pass Finished.`);
        console.log(`Passed: ${results.passed.length}`);
        console.log(`Failed: ${results.failed.length}`);

        fs.writeFileSync(path.join(__dirname, 'qa_results.json'), JSON.stringify(results, null, 2));

    } catch (err) {
        console.error('Fatal error during QA pass:', err);
    } finally {
        if (browser) await browser.close();
        server.close();
        process.exit(0);
    }
})();
