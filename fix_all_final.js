const fs = require('fs');
const path = require('path');

const toolsDir = '/opt/omniopener/public/tools';
const files = fs.readdirSync(toolsDir).filter(f => f.endsWith('.js'));

files.forEach(file => {
  const filePath = path.join(toolsDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  // 1. libarchive.js fixes
  if (content.includes('libarchive.js@1.3.0')) {
      content = content.split('libarchive.js@1.3.0/dist/libarchive.min.js').join('libarchive.js@1.3.0/main.min.js');
      // Fix worker path if it was wrong
      if (content.includes('dist/worker-bundle.js')) {
          // Keep it as is if it's correct, but some might have had wrong paths
      }
      changed = true;
  }

  // 2. SyntaxError: Unexpected token 'export' in libarchive tools
  // If the tool uses Archive.open, it's a libarchive tool.
  // Many of these tools were failing with "Unexpected token 'export'" because they were trying to load a module as a script.
  // Actually, libarchive.js 1.3.0 main.min.js SHOULD be UMD.
  // But maybe the worker-bundle.js is an ES module?
  
  // 3. Fix vcf-opener.js
  if (file === 'vcf-opener.js') {
      content = content.replace("helpers.loadScript('https://cdn.jsdelivr.net/npm/vcf@2.1.0/dist/vcf.min.js')", "helpers.loadScript('https://cdn.jsdelivr.net/npm/vcf@2.1.0/lib/vcard.js')");
      changed = true;
  }

  // 4. Fix stl-opener.js and others using three.js loaders
  if (content.includes('three@0.149.0/examples/js/loaders/STLLoader.js')) {
      content = content.split('three@0.149.0/examples/js/loaders/STLLoader.js').join('three@0.160.1/examples/jsm/loaders/STLLoader.js');
      changed = true;
  }
  if (content.includes('three@0.149.0/examples/js/controls/OrbitControls.js')) {
      content = content.split('three@0.149.0/examples/js/controls/OrbitControls.js').join('three@0.160.1/examples/jsm/controls/OrbitControls.js');
      changed = true;
  }

  if (changed) {
    console.log(`Final fix for ${file}`);
    fs.writeFileSync(filePath, content);
  }
});
