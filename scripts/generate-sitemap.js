#!/usr/bin/env node
/**
 * Generates sitemap.xml from config.json
 * Run: node scripts/generate-sitemap.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'config.json'), 'utf8'));
const today = new Date().toISOString().split('T')[0];
const BASE = 'https://omniopener.dev';

let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${BASE}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
`;

for (const tool of config.tools) {
  xml += `  <url>
    <loc>${BASE}/tools/${tool.slug}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
`;
}

xml += `</urlset>\n`;

const outPath = path.join(ROOT, 'public', 'sitemap.xml');
fs.writeFileSync(outPath, xml);
console.log(`Sitemap generated: ${config.tools.length} tools → ${outPath}`);
