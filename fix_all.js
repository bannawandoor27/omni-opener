const fs = require('fs');
const path = require('path');

const toolsDir = '/opt/omniopener/public/tools';
const files = fs.readdirSync(toolsDir).filter(f => f.endsWith('.js'));

const replacements = [
  ['vkbeautify@0.99.3', 'vkbeautify@0.99.1'],
  ['libarchive.js@1.3.0/dist/libarchive.min.js', 'libarchive.js@1.3.0/main.min.js'],
  ['three@0.163.0/build/three.min.js', 'three@0.160.1/build/three.min.js'],
  ['pptx2html@0.1.3/dist/pptx2html.min.js', 'pptx2html@0.3.4/dist/pptx2html.min.js'],
  ['rtf.js@3.0.9/dist/rtf.min.js', 'rtf.js@3.0.0/dist/RTFJS.bundle.min.js'],
  ['icojs@0.10.0/dist/icojs.browser.js', 'icojs@0.19.1/dist/icojs.browser.js'],
  ['psd@3.4.0/dist/psd.min.js', 'psd@3.2.0/dist/psd.min.js'],
  ['vcf@2.1.0/dist/vcf.min.js', 'vcf@2.1.0/lib/vcard.min.js'],
  ['pdf.js/4.0.379/pdf.min.js', 'pdfjs-dist@4.0.379/build/pdf.min.mjs'],
];

files.forEach(file => {
  const filePath = path.join(toolsDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  replacements.forEach(([oldStr, newStr]) => {
    if (content.includes(oldStr)) {
      content = content.split(oldStr).join(newStr);
      changed = true;
    }
  });

  // Special cases for three.js in glb-opener.js and others
  if (content.includes('three@0.163.0')) {
      content = content.split('three@0.163.0').join('three@0.160.1');
      changed = true;
  }

  // Refactor onFile: async (file, content, h) => { or function(file, content, h) {
  // if it calls this.onFile or helpers.onFile or similar
  // We already identified ogg-opener.js with this.onFile
  if (content.includes('this.onFile(file, content, h)') || content.includes('this.onFile(file, content, helpers)')) {
      // Find onFile: function (file, content, h) {
      content = content.replace(/onFile:\s*async\s*function\s*\(([^)]+)\)\s*\{/, 'onFile: async function _onFile($1) {');
      content = content.replace(/onFile:\s*function\s*\(([^)]+)\)\s*\{/, 'onFile: function _onFile($1) {');
      content = content.split('this.onFile(').join('_onFile(');
      changed = true;
  }
  
  // Also look for other tools that might need this refactor even if I didn't grep them (e.g. if they use helpers.onFile)
  if (content.includes('helpers.onFile(')) {
      content = content.replace(/onFile:\s*async\s*function\s*\(([^)]+)\)\s*\{/, 'onFile: async function _onFile($1) {');
      content = content.replace(/onFile:\s*function\s*\(([^)]+)\)\s*\{/, 'onFile: function _onFile($1) {');
      content = content.split('helpers.onFile(').join('_onFile(');
      changed = true;
  }

  if (file === 'tiff-opener.js') {
      if (content.includes('ctx.createImageData(width, height)')) {
          content = content.replace('ctx.createImageData(width, height)', 'ctx.createImageData(Math.floor(width), Math.floor(height))');
          changed = true;
      }
  }

  if (file === 'mkv-opener.js') {
      // Ensure s.meta exists before accessing it
      // The user said: "The bug where s.meta was undefined is fixed by the SDK's setState update, but ensure the tool works."
      // I'll add a safety check just in case.
      if (content.includes('${escape(s.meta.resolution)}')) {
          content = content.replace(/\$\{escape\(s\.meta\.resolution\)\}/g, '${escape(s.meta ? s.meta.resolution : "Analyzing...")}');
          content = content.replace(/\$\{escape\(s\.meta\.duration\)\}/g, '${escape(s.meta ? s.meta.duration : "Calculating...")}');
          content = content.replace(/\$\{escape\(s\.meta\.codec\)\}/g, '${escape(s.meta ? s.meta.codec : "Detecting...")}');
          changed = true;
      }
  }

  if (changed) {
    console.log(`Updating ${file}`);
    fs.writeFileSync(filePath, content);
  }
});
