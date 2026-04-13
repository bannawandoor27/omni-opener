/**
 * OmniOpener — PDB Molecular Viewer
 * Uses OmniTool SDK and Three.js for professional 3D molecular visualization.
 */
(function () {
  'use strict';

  const CPK_COLORS = {
    'H': 0xffffff, 'C': 0x909090, 'N': 0x3050f8, 'O': 0xff0d0d,
    'S': 0xffff30, 'P': 0xff8000, 'FE': 0xdd7700, 'CL': 0x1ff01f,
    'MG': 0x8aff00, 'CA': 0x3dff00, 'ZN': 0x7d80b0, 'F': 0x90e050,
    'BR': 0xa62929, 'I': 0x940094, 'HE': 0xd9ffff, 'LI': 0xcc80ff,
    'NA': 0xab5cf2, 'K': 0x8f40d4, 'AL': 0xbfa6a6, 'SI': 0xf0c8a0,
    'B': 0xffb5b5, 'BE': 0xc2ff00, 'TI': 0xbfc2c7, 'CR': 0x8a99c7,
    'MN': 0x9c7ac7, 'CO': 0xf090a0, 'NI': 0x50d050, 'CU': 0xc88033,
    'AU': 0xffd123, 'AG': 0xc0c0c0
  };

  let autoSpin = true;
  let currentGroup = null;

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.pdb',
      dropLabel: 'Drop a .pdb file here',
      dropSub: 'Analyze and visualize molecular structures in 3D',
      binary: false,
      infoHtml: '<strong>Security:</strong> All molecular processing occurs locally in your browser. No structural data is transmitted to any server.',

      onInit: function (h) {
        if (typeof THREE === 'undefined') {
          h.loadScript('https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js');
        }
      },

      onFile: async function (file, content, h) {
        if (!content || !content.trim()) {
          h.showError('Empty File', 'This PDB file contains no data.');
          return;
        }

        h.showLoading('Analyzing structural records...');

        // Ensure Three.js is ready
        let attempts = 0;
        while (typeof THREE === 'undefined' && attempts < 50) {
          await new Promise(r => setTimeout(r, 100));
          attempts++;
        }

        if (typeof THREE === 'undefined') {
          h.showError('Dependency Error', 'Could not load visualization engine. Please check your internet connection.');
          return;
        }

        try {
          const data = parsePDB(content);
          if (data.atoms.length === 0) {
            h.showError('No Atoms Found', 'No valid ATOM or HETATM records were identified in this file.');
            return;
          }
          renderLayout(data, file, h, content);
        } catch (err) {
          console.error('[PDB Viewer]', err);
          h.showError('Processing Failed', 'An error occurred while parsing the molecular data. The file might be malformed.');
        }
      },

      actions: [
        {
          label: '📸 Save Image',
          id: 'screenshot',
          onClick: function (h) {
            const canvas = h.getRenderEl().querySelector('canvas');
            if (canvas) {
              const url = canvas.toDataURL('image/png');
              const name = h.getFile().name.replace(/\.[^/.]+$/, "") + '_render.png';
              h.download(name, url, 'image/png');
            } else {
              h.showError('Capture Error', 'The 3D viewer is not currently active.');
            }
          }
        },
        {
          label: '🔄 Toggle Spin',
          id: 'spin',
          onClick: function () {
            autoSpin = !autoSpin;
          }
        },
        {
          label: '📋 Copy Data',
          id: 'copy',
          onClick: function (h, btn) {
            h.copyToClipboard(h.getContent(), btn);
          }
        },
        {
          label: '📥 Download PDB',
          id: 'download',
          onClick: function (h) {
            h.download(h.getFile().name, h.getContent());
          }
        }
      ]
    });
  };

  function parsePDB(text) {
    const atoms = [];
    const bonds = [];
    const atomMap = {};
    const metadata = { title: '', author: '', date: '', method: '' };
    const lines = text.split('\n');
    
    // Performance limit for parsing/rendering
    const MAX_ATOMS = 50000;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('TITLE ')) metadata.title += line.substring(10).trim() + ' ';
      else if (line.startsWith('AUTHOR')) metadata.author += line.substring(10).trim() + ' ';
      else if (line.startsWith('EXPDTA')) metadata.method = line.substring(10).trim();
      else if (line.startsWith('REVDAT')) metadata.date = line.substring(10, 20).trim();
      else if (line.startsWith('ATOM  ') || line.startsWith('HETATM')) {
        if (atoms.length >= MAX_ATOMS) continue;
        
        const serial = parseInt(line.substring(6, 11).trim(), 10);
        const x = parseFloat(line.substring(30, 38));
        const y = parseFloat(line.substring(38, 46));
        const z = parseFloat(line.substring(46, 54));
        if (isNaN(serial) || isNaN(x) || isNaN(y) || isNaN(z)) continue;

        let element = line.substring(76, 78).trim().toUpperCase();
        if (!element) {
          element = line.substring(12, 14).trim().replace(/[0-9]/g, '').toUpperCase();
        }

        const resName = line.substring(17, 20).trim();
        const chain = line.substring(21, 22).trim() || 'A';
        const resSeq = parseInt(line.substring(22, 26).trim(), 10);

        const atom = { serial, x, y, z, element, resName, chain, resSeq, type: line.startsWith('ATOM') ? 'ATOM' : 'HET' };
        atoms.push(atom);
        atomMap[serial] = atom;
      } else if (line.startsWith('CONECT')) {
        const from = parseInt(line.substring(6, 11).trim(), 10);
        if (isNaN(from)) continue;
        const tos = [
          parseInt(line.substring(11, 16).trim(), 10),
          parseInt(line.substring(16, 21).trim(), 10),
          parseInt(line.substring(21, 26).trim(), 10),
          parseInt(line.substring(26, 31).trim(), 10)
        ].filter(n => !isNaN(n));

        for (const to of tos) {
          if (from < to && atomMap[to]) {
            bonds.push([from, to]);
          }
        }
      }
    }

    // Heuristic bonds if CONECT records are missing and atom count is reasonable
    if (bonds.length === 0 && atoms.length > 0 && atoms.length < 5000) {
      const thresholdSq = 1.9 * 1.9; // ~1.9 Angstroms
      for (let i = 0; i < atoms.length; i++) {
        for (let k = i + 1; k < atoms.length; k++) {
          const a1 = atoms[i], a2 = atoms[k];
          const dx = a1.x - a2.x, dy = a1.y - a2.y, dz = a1.z - a2.z;
          const distSq = dx * dx + dy * dy + dz * dz;
          if (distSq < thresholdSq) bonds.push([a1.serial, a2.serial]);
        }
      }
    }

    return { atoms, bonds, atomMap, metadata, truncated: atoms.length >= MAX_ATOMS };
  }

  function renderLayout(data, file, h, content) {
    const { atoms, bonds, metadata } = data;
    const sizeStr = h.formatBytes ? h.formatBytes(content.length) : (content.length / 1024).toFixed(1) + ' KB';
    
    const residues = new Set(atoms.map(a => `${a.chain}-${a.resSeq}`));
    const chains = new Set(atoms.map(a => a.chain));
    const elementCounts = atoms.reduce((acc, a) => { acc[a.element] = (acc[a.element] || 0) + 1; return acc; }, {});

    const html = `
      <div class="flex flex-col gap-4 animate-in fade-in duration-500">
        <!-- File Info Bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600">
          <span class="font-semibold text-surface-800">${esc(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${sizeStr}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">Protein Data Bank (.pdb)</span>
          ${data.truncated ? '<span class="ml-auto text-amber-600 font-medium">⚠️ Large file: showing first 50k atoms</span>' : ''}
        </div>

        <!-- Navigation Tabs -->
        <div class="flex items-center gap-2 border-b border-surface-200">
          <button id="tab-3d" class="px-4 py-2 text-sm font-medium border-b-2 border-brand-500 text-brand-600 focus:outline-none">3D Visualizer</button>
          <button id="tab-data" class="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-surface-500 hover:text-surface-700 focus:outline-none">Atom Records</button>
          <button id="tab-raw" class="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-surface-500 hover:text-surface-700 focus:outline-none">Raw File</button>
        </div>

        <!-- Views Container -->
        <div id="view-3d" class="flex flex-col lg:flex-row gap-4 h-[650px]">
          <div class="flex-1 rounded-2xl overflow-hidden border border-surface-200 bg-slate-950 relative shadow-inner group">
            <div id="three-container" class="absolute inset-0 cursor-grab active:cursor-grabbing"></div>
            <div class="absolute top-4 left-4 flex gap-2 pointer-events-none">
              <span class="px-2 py-1 bg-black/40 backdrop-blur rounded text-[10px] text-white uppercase tracking-wider font-bold">Interactive 3D</span>
            </div>
            <div class="absolute bottom-4 right-4 flex gap-2">
              <button id="btn-reset" class="px-3 py-1.5 bg-white/10 hover:bg-white/20 backdrop-blur text-white text-xs font-medium rounded-lg border border-white/20 transition-all">Reset View</button>
            </div>
          </div>
          
          <div class="w-full lg:w-72 flex flex-col gap-4 overflow-y-auto pr-1">
            <div class="rounded-xl border border-surface-200 p-4 bg-white shadow-sm">
              <h3 class="text-xs font-bold text-surface-400 uppercase tracking-widest mb-3">Model Statistics</h3>
              <div class="grid grid-cols-2 gap-3">
                <div class="p-3 bg-surface-50 rounded-lg">
                  <div class="text-lg font-bold text-surface-800">${atoms.length.toLocaleString()}</div>
                  <div class="text-[10px] text-surface-500 uppercase font-medium">Atoms</div>
                </div>
                <div class="p-3 bg-surface-50 rounded-lg">
                  <div class="text-lg font-bold text-surface-800">${residues.size.toLocaleString()}</div>
                  <div class="text-[10px] text-surface-500 uppercase font-medium">Residues</div>
                </div>
                <div class="p-3 bg-surface-50 rounded-lg">
                  <div class="text-lg font-bold text-surface-800">${chains.size}</div>
                  <div class="text-[10px] text-surface-500 uppercase font-medium">Chains</div>
                </div>
                <div class="p-3 bg-surface-50 rounded-lg">
                  <div class="text-lg font-bold text-surface-800">${bonds.length.toLocaleString()}</div>
                  <div class="text-[10px] text-surface-500 uppercase font-medium">Bonds</div>
                </div>
              </div>
            </div>

            <div class="rounded-xl border border-surface-200 p-4 bg-white shadow-sm flex-1">
              <div class="flex items-center justify-between mb-3">
                <h3 class="text-xs font-bold text-surface-400 uppercase tracking-widest">Composition</h3>
                <span class="text-[10px] bg-brand-50 text-brand-700 px-1.5 py-0.5 rounded font-bold">${Object.keys(elementCounts).length} Elements</span>
              </div>
              <div class="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                ${Object.entries(elementCounts).sort((a, b) => b[1] - a[1]).map(([el, count]) => `
                  <div class="flex items-center justify-between text-sm">
                    <div class="flex items-center gap-2">
                      <div class="w-3 h-3 rounded-full border border-surface-200" style="background-color: #${(CPK_COLORS[el] || 0xcccccc).toString(16).padStart(6, '0')}"></div>
                      <span class="font-medium text-surface-700">${el}</span>
                    </div>
                    <span class="text-surface-400 tabular-nums">${count.toLocaleString()}</span>
                  </div>
                `).join('')}
              </div>
            </div>
            
            ${metadata.title ? `
              <div class="rounded-xl border border-brand-100 p-4 bg-brand-50/30">
                <h3 class="text-xs font-bold text-brand-600 uppercase tracking-widest mb-1">PDB Header</h3>
                <p class="text-sm text-brand-900 font-medium leading-tight">${esc(metadata.title.trim())}</p>
                ${metadata.method ? `<p class="text-[10px] text-brand-500 mt-2">Method: ${esc(metadata.method)}</p>` : ''}
              </div>
            ` : ''}
          </div>
        </div>

        <div id="view-data" class="hidden h-[650px] flex flex-col gap-3">
          <div class="flex items-center justify-between px-1">
            <h3 class="font-semibold text-surface-800">Atom Trajectory Records</h3>
            <div class="relative w-64">
              <input type="text" id="atom-search" placeholder="Filter by residue or element..." class="w-full pl-8 pr-4 py-1.5 text-xs rounded-lg border border-surface-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20">
              <svg class="absolute left-2.5 top-2 w-3.5 h-3.5 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            </div>
          </div>
          <div class="flex-1 overflow-x-auto rounded-xl border border-surface-200 bg-white">
            <table class="min-w-full text-xs tabular-nums">
              <thead class="sticky top-0 bg-white/95 backdrop-blur z-10">
                <tr class="text-surface-500 font-semibold border-b border-surface-200 text-left">
                  <th class="px-4 py-3">Serial</th>
                  <th class="px-4 py-3">Type</th>
                  <th class="px-4 py-3">Element</th>
                  <th class="px-4 py-3">Residue</th>
                  <th class="px-4 py-3">Seq</th>
                  <th class="px-4 py-3">X</th>
                  <th class="px-4 py-3">Y</th>
                  <th class="px-4 py-3">Z</th>
                </tr>
              </thead>
              <tbody id="atom-table-body" class="divide-y divide-surface-100">
                ${atoms.slice(0, 1000).map(a => `
                  <tr class="hover:bg-brand-50/50 transition-colors">
                    <td class="px-4 py-2 font-mono text-surface-400">${a.serial}</td>
                    <td class="px-4 py-2"><span class="px-1.5 py-0.5 rounded ${a.type === 'ATOM' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'} font-bold text-[10px]">${a.type}</span></td>
                    <td class="px-4 py-2 font-bold text-surface-800">${a.element}</td>
                    <td class="px-4 py-2 font-medium">${a.resName}</td>
                    <td class="px-4 py-2 text-surface-500">${a.resSeq}</td>
                    <td class="px-4 py-2 text-surface-600">${a.x.toFixed(3)}</td>
                    <td class="px-4 py-2 text-surface-600">${a.y.toFixed(3)}</td>
                    <td class="px-4 py-2 text-surface-600">${a.z.toFixed(3)}</td>
                  </tr>
                `).join('')}
                ${atoms.length > 1000 ? `<tr><td colspan="8" class="px-4 py-4 text-center text-surface-400 italic bg-surface-50 border-t">Only showing first 1,000 records for performance. Use "Copy Data" for full set.</td></tr>` : ''}
              </tbody>
            </table>
          </div>
        </div>

        <div id="view-raw" class="hidden">
          <div class="rounded-xl overflow-hidden border border-surface-200 shadow-sm">
            <pre class="p-4 text-sm font-mono bg-gray-950 text-gray-100 overflow-x-auto leading-relaxed max-h-[650px] overflow-y-auto">${esc(content.split('\n').slice(0, 2000).join('\n'))}${content.split('\n').length > 2000 ? '\n\n... [TRUNCATED] ...' : ''}</pre>
          </div>
        </div>
      </div>
    `;

    h.render(html);
    const renderEl = h.getRenderEl();

    // Tab Switching Logic
    const tabs = {
      '3d': { btn: renderEl.querySelector('#tab-3d'), view: renderEl.querySelector('#view-3d') },
      'data': { btn: renderEl.querySelector('#tab-data'), view: renderEl.querySelector('#view-data') },
      'raw': { btn: renderEl.querySelector('#tab-raw'), view: renderEl.querySelector('#view-raw') }
    };

    Object.keys(tabs).forEach(id => {
      tabs[id].btn.addEventListener('click', () => {
        Object.keys(tabs).forEach(key => {
          tabs[key].btn.classList.toggle('border-brand-500', key === id);
          tabs[key].btn.classList.toggle('text-brand-600', key === id);
          tabs[key].btn.classList.toggle('border-transparent', key !== id);
          tabs[key].btn.classList.toggle('text-surface-500', key !== id);
          tabs[key].view.classList.toggle('hidden', key !== id);
        });
        if (id === '3d') window.dispatchEvent(new Event('resize'));
      });
    });

    // Atom Record Filtering
    const searchInput = renderEl.querySelector('#atom-search');
    const tableBody = renderEl.querySelector('#atom-table-body');
    if (searchInput && tableBody) {
      searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const rows = tableBody.querySelectorAll('tr:not(:last-child)');
        rows.forEach(row => {
          const text = row.textContent.toLowerCase();
          row.style.display = text.includes(query) ? '' : 'none';
        });
      });
    }

    // Initialize 3D Viewer
    initThree(data, renderEl);
  }

  function initThree(data, renderEl) {
    const { atoms, bonds } = data;
    const mount = renderEl.querySelector('#three-container');
    if (!mount) return;

    const width = mount.clientWidth || 800;
    const height = mount.clientHeight || 500;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, width / height, 1, 10000);
    
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(100, 100, 100);
    scene.add(dirLight);
    
    const backLight = new THREE.DirectionalLight(0xffffff, 0.3);
    backLight.position.set(-100, -100, -100);
    scene.add(backLight);

    const group = new THREE.Group();
    scene.add(group);
    currentGroup = group;

    // Calculate center and scale
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    atoms.forEach(a => {
      if (a.x < minX) minX = a.x; if (a.x > maxX) maxX = a.x;
      if (a.y < minY) minY = a.y; if (a.y > maxY) maxY = a.y;
      if (a.z < minZ) minZ = a.z; if (a.z > maxZ) maxZ = a.z;
    });
    const center = new THREE.Vector3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
    const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ);

    // Group atoms by element for InstancedMesh optimization
    const elGroups = atoms.reduce((acc, a) => {
      if (!acc[a.element]) acc[a.element] = [];
      acc[a.element].push(a);
      return acc;
    }, {});

    const sphereGeom = new THREE.SphereGeometry(0.35, 12, 12);
    Object.keys(elGroups).forEach(el => {
      const elAtoms = elGroups[el];
      const color = CPK_COLORS[el] || 0xcccccc;
      const mat = new THREE.MeshPhongMaterial({ color, shininess: 60 });
      const mesh = new THREE.InstancedMesh(sphereGeom, mat, elAtoms.length);
      
      const matrix = new THREE.Matrix4();
      elAtoms.forEach((a, i) => {
        matrix.setPosition(a.x - center.x, a.y - center.y, a.z - center.z);
        mesh.setMatrixAt(i, matrix);
      });
      group.add(mesh);
    });

    // Render bonds
    if (bonds.length > 0) {
      const bondGeom = new THREE.CylinderGeometry(0.1, 0.1, 1, 8);
      const bondMat = new THREE.MeshPhongMaterial({ color: 0x999999, shininess: 30 });
      const mesh = new THREE.InstancedMesh(bondGeom, bondMat, bonds.length);
      
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const s = new THREE.Vector3(1, 1, 1);
      const p = new THREE.Vector3();
      const up = new THREE.Vector3(0, 1, 0);

      bonds.forEach((pair, i) => {
        const a1 = data.atomMap[pair[0]], a2 = data.atomMap[pair[1]];
        if (!a1 || !a2) return;
        
        const v1 = new THREE.Vector3(a1.x - center.x, a1.y - center.y, a1.z - center.z);
        const v2 = new THREE.Vector3(a2.x - center.x, a2.y - center.y, a2.z - center.z);
        const dist = v1.distanceTo(v2);
        
        p.copy(v1).add(v2).multiplyScalar(0.5);
        const dir = new THREE.Vector3().subVectors(v2, v1).normalize();
        q.setFromUnitVectors(up, dir);
        s.set(1, dist, 1);
        
        m.compose(p, q, s);
        mesh.setMatrixAt(i, m);
      });
      group.add(mesh);
    }

    camera.position.z = span * 1.5 || 50;
    camera.lookAt(0, 0, 0);

    // Simple Controls
    let isDragging = false, lastX = 0, lastY = 0;
    const onDown = (e) => { isDragging = true; lastX = e.clientX; lastY = e.clientY; };
    const onMove = (e) => {
      if (isDragging) {
        group.rotation.y += (e.clientX - lastX) * 0.006;
        group.rotation.x += (e.clientY - lastY) * 0.006;
        lastX = e.clientX; lastY = e.clientY;
      }
    };
    const onUp = () => isDragging = false;
    const onWheel = (e) => {
      e.preventDefault();
      camera.position.z = Math.max(span * 0.1, camera.position.z + e.deltaY * 0.05);
    };

    mount.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    mount.addEventListener('wheel', onWheel, { passive: false });

    renderEl.querySelector('#btn-reset').onclick = () => {
      group.rotation.set(0, 0, 0);
      camera.position.z = span * 1.5 || 50;
    };

    let animId;
    const animate = () => {
      if (!mount.isConnected) {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        renderer.dispose();
        cancelAnimationFrame(animId);
        return;
      }
      animId = requestAnimationFrame(animate);
      if (autoSpin && !isDragging) group.rotation.y += 0.003;
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!mount.isConnected) return;
      const w = mount.clientWidth, h = mount.clientHeight;
      if (w > 0 && h > 0) {
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
    };
    window.addEventListener('resize', handleResize);
  }

  function esc(str) {
    if (!str) return '';
    return str.toString()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

})();
