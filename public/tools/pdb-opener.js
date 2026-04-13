/**
 * OmniOpener — PDB Molecular Viewer
 * Uses OmniTool SDK and Three.js for high-performance 3D molecular visualization.
 */
(function() {
  'use strict';

  // Standard CPK coloring for atoms
  const CPK = {
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

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.pdb',
      dropLabel: 'Drop a .pdb file here',
      dropSub: 'Visualize molecular structures in 3D',
      binary: false,
      onInit: function(helpers) {
        helpers.loadScript('https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js');
      },
      onFile: function(file, content, helpers) {
        if (typeof THREE === 'undefined') {
          helpers.showLoading('Initializing 3D engine...');
          setTimeout(() => this.onFile(file, content, helpers), 200);
          return;
        }

        helpers.showLoading('Parsing molecular data...');
        try {
          const data = parsePDB(content);
          renderViewer(data, file, helpers);
        } catch (e) {
          helpers.showError('Could not parse PDB file', e.message);
        }
      },
      actions: [
        {
          label: '📋 Copy Atoms',
          id: 'copy',
          onClick: function(helpers, btn) {
            helpers.copyToClipboard(helpers.getContent(), btn);
          }
        },
        {
          label: '📥 Download PDB',
          id: 'dl',
          onClick: function(helpers) {
            helpers.download(helpers.getFile().name, helpers.getContent());
          }
        },
        {
          label: '📸 Save Image',
          id: 'png',
          onClick: function(helpers) {
            const canvas = helpers.getRenderEl().querySelector('canvas');
            if (canvas) {
              const url = canvas.toDataURL('image/png');
              helpers.download(helpers.getFile().name.replace('.pdb', '.png'), url, 'image/png');
            }
          }
        },
        {
          label: '🔄 Toggle Spin',
          id: 'spin',
          onClick: function() {
            autoSpin = !autoSpin;
          }
        }
      ],
      infoHtml: '<strong>Privacy First:</strong> This molecular viewer runs entirely in your browser. Your structural data never leaves your device.'
    });
  };

  function parsePDB(text) {
    const atoms = [];
    const bonds = [];
    const atomMap = {};
    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('ATOM  ') || line.startsWith('HETATM')) {
        const serial = parseInt(line.substring(6, 11).trim());
        const x = parseFloat(line.substring(30, 38));
        const y = parseFloat(line.substring(38, 46));
        const z = parseFloat(line.substring(46, 54));
        
        let element = line.substring(76, 78).trim().toUpperCase();
        if (!element) {
          element = line.substring(12, 14).trim().replace(/[0-9]/g, '').toUpperCase();
        }

        const resName = line.substring(17, 20).trim();
        const chain = line.substring(21, 22).trim();
        
        const atom = { serial, x, y, z, element, resName, chain };
        atoms.push(atom);
        atomMap[serial] = atom;
      } else if (line.startsWith('CONECT')) {
        const from = parseInt(line.substring(6, 11).trim());
        const tos = [
          parseInt(line.substring(11, 16).trim()),
          parseInt(line.substring(16, 21).trim()),
          parseInt(line.substring(21, 26).trim()),
          parseInt(line.substring(26, 31).trim())
        ].filter(n => !isNaN(n));
        
        for (const to of tos) {
          if (from < to && atomMap[to]) {
            bonds.push([from, to]);
          }
        }
      }
    }

    if (bonds.length === 0 && atoms.length > 0 && atoms.length < 2000) {
      for (let i = 0; i < atoms.length; i++) {
        for (let j = i + 1; j < atoms.length; j++) {
          const a1 = atoms[i], a2 = atoms[j];
          const d2 = Math.pow(a1.x - a2.x, 2) + Math.pow(a1.y - a2.y, 2) + Math.pow(a1.z - a2.z, 2);
          if (d2 < 4.0) {
             bonds.push([a1.serial, a2.serial]);
          }
        }
      }
    }

    return { atoms, bonds, atomMap };
  }

  function renderViewer(data, file, helpers) {
    const { atoms, bonds, atomMap } = data;
    if (atoms.length === 0) throw new Error('No valid atom records found in this PDB file.');

    const residues = new Set(atoms.map(a => a.chain + a.resName));
    const chains = new Set(atoms.map(a => a.chain || 'A'));

    helpers.render(`
      <div class="flex flex-col h-[75vh] min-h-[500px] font-sans">
        <div class="flex items-center gap-3 p-3 bg-surface-50 border-b border-surface-200 text-xs text-surface-600">
          <div class="flex items-center gap-2 px-2 py-1 bg-white rounded border border-surface-100 shadow-sm">
            <span class="font-bold text-surface-900">${esc(file.name)}</span>
            <span class="text-surface-300">·</span>
            <span>${(file.size / 1024).toFixed(1)} KB</span>
          </div>
          <div class="flex items-center gap-4 ml-auto">
            <div class="flex flex-col items-end">
              <span class="font-bold text-brand-600">${atoms.length.toLocaleString()}</span>
              <span class="text-[9px] uppercase tracking-wider text-surface-400">Atoms</span>
            </div>
            <div class="flex flex-col items-end">
              <span class="font-bold text-surface-700">${residues.size}</span>
              <span class="text-[9px] uppercase tracking-wider text-surface-400">Residues</span>
            </div>
            <div class="flex flex-col items-end">
              <span class="font-bold text-surface-700">${chains.size}</span>
              <span class="text-[9px] uppercase tracking-wider text-surface-400">Chains</span>
            </div>
          </div>
        </div>

        <div id="three-container" class="flex-1 bg-slate-950 relative overflow-hidden group cursor-grab active:cursor-grabbing">
          <div class="absolute bottom-4 left-4 flex gap-2 pointer-events-none opacity-60 group-hover:opacity-100 transition-opacity">
            <div class="px-2 py-1 bg-black/40 backdrop-blur text-white text-[10px] rounded border border-white/10">Drag to Orbit</div>
            <div class="px-2 py-1 bg-black/40 backdrop-blur text-white text-[10px] rounded border border-white/10">Scroll to Zoom</div>
          </div>
          <button id="pdb-reset" class="absolute top-4 right-4 px-3 py-1 bg-white/10 hover:bg-white/20 backdrop-blur text-white text-[10px] font-bold rounded border border-white/10 transition-all z-10">
            Reset View
          </button>
        </div>
      </div>
    `);

    const mount = helpers.getRenderEl().querySelector('#three-container');
    const width = mount.clientWidth;
    const height = mount.clientHeight;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 1, 5000);
    
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const l1 = new THREE.DirectionalLight(0xffffff, 1);
    l1.position.set(1, 1, 1);
    scene.add(l1);
    const l2 = new THREE.DirectionalLight(0xffffff, 0.5);
    l2.position.set(-1, -1, -1);
    scene.add(l2);

    const group = new THREE.Group();
    scene.add(group);

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    atoms.forEach(a => {
      minX = Math.min(minX, a.x); maxX = Math.max(maxX, a.x);
      minY = Math.min(minY, a.y); maxY = Math.max(maxY, a.y);
      minZ = Math.min(minZ, a.z); maxZ = Math.max(maxZ, a.z);
    });
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
    const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ);

    const elements = [...new Set(atoms.map(a => a.element))];
    const sphereGeom = new THREE.SphereBufferGeometry(0.4, 12, 12);
    
    elements.forEach(el => {
      const elAtoms = atoms.filter(a => a.element === el);
      const color = CPK[el] || 0xcccccc;
      const mat = new THREE.MeshPhongMaterial({ color, shininess: 100 });
      const mesh = new THREE.InstancedMesh(sphereGeom, mat, elAtoms.length);
      
      const matrix = new THREE.Matrix4();
      elAtoms.forEach((a, i) => {
        matrix.setPosition(a.x - cx, a.y - cy, a.z - cz);
        mesh.setMatrixAt(i, matrix);
      });
      group.add(mesh);
    });

    const bondMat = new THREE.MeshPhongMaterial({ color: 0x888888, shininess: 30 });
    const bondGeom = new THREE.CylinderBufferGeometry(0.1, 0.1, 1, 6);
    
    bonds.forEach(pair => {
      const a1 = atomMap[pair[0]], a2 = atomMap[pair[1]];
      if (!a1 || !a2) return;
      
      const v1 = new THREE.Vector3(a1.x - cx, a1.y - cy, a1.z - cz);
      const v2 = new THREE.Vector3(a2.x - cx, a2.y - cy, a2.z - cz);
      const dist = v1.distanceTo(v2);
      
      const mesh = new THREE.Mesh(bondGeom, bondMat);
      mesh.position.copy(v1).add(v2).multiplyScalar(0.5);
      mesh.lookAt(v2);
      mesh.rotateX(Math.PI / 2);
      mesh.scale.set(1, dist, 1);
      group.add(mesh);
    });

    camera.position.z = span * 1.5 || 50;
    camera.lookAt(0, 0, 0);

    let isDragging = false, lastX = 0, lastY = 0;
    const onMouseDown = (e) => { isDragging = true; lastX = e.clientX; lastY = e.clientY; };
    const onMouseMove = (e) => {
      if (isDragging) {
        group.rotation.y += (e.clientX - lastX) * 0.007;
        group.rotation.x += (e.clientY - lastY) * 0.007;
        lastX = e.clientX; lastY = e.clientY;
      }
    };
    const onMouseUp = () => isDragging = false;
    const onWheel = (e) => {
      e.preventDefault();
      camera.position.z = Math.max(span * 0.1, camera.position.z + e.deltaY * 0.05);
    };

    mount.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    mount.addEventListener('wheel', onWheel, { passive: false });

    helpers.getRenderEl().querySelector('#pdb-reset').onclick = () => {
      group.rotation.set(0, 0, 0);
      camera.position.z = span * 1.5 || 50;
    };

    function animate() {
      if (!mount.isConnected) {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        renderer.dispose();
        return;
      }
      requestAnimationFrame(animate);
      if (autoSpin && !isDragging) group.rotation.y += 0.002;
      renderer.render(scene, camera);
    }
    animate();

    const onResize = () => {
      if (!mount.isConnected) {
        window.removeEventListener('resize', onResize);
        return;
      }
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener('resize', onResize);
  }

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

})();
