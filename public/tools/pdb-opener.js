/**
 * OmniOpener — PDB Molecular Viewer
 * Uses OmniTool SDK and Three.js for high-performance 3D molecular visualization.
 */
(function () {
  'use strict';

  // Standard CPK coloring for atoms
  var CPK = {
    'H': 0xffffff, 'C': 0x909090, 'N': 0x3050f8, 'O': 0xff0d0d,
    'S': 0xffff30, 'P': 0xff8000, 'FE': 0xdd7700, 'CL': 0x1ff01f,
    'MG': 0x8aff00, 'CA': 0x3dff00, 'ZN': 0x7d80b0, 'F': 0x90e050,
    'BR': 0xa62929, 'I': 0x940094, 'HE': 0xd9ffff, 'LI': 0xcc80ff,
    'NA': 0xab5cf2, 'K': 0x8f40d4, 'AL': 0xbfa6a6, 'SI': 0xf0c8a0,
    'B': 0xffb5b5, 'BE': 0xc2ff00, 'TI': 0xbfc2c7, 'CR': 0x8a99c7,
    'MN': 0x9c7ac7, 'CO': 0xf090a0, 'NI': 0x50d050, 'CU': 0xc88033,
    'AU': 0xffd123, 'AG': 0xc0c0c0
  };

  var autoSpin = true;

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.pdb',
      dropLabel: 'Drop a .pdb file here',
      dropSub: 'Visualize molecular structures in 3D',
      binary: false,
      infoHtml: '<strong>Privacy First:</strong> This molecular viewer runs entirely in your browser. Your structural data never leaves your device.',

      onInit: function (h) {
        if (typeof THREE === 'undefined') {
          h.loadScript('https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js');
        }
      },

      onFile: function (file, content, h) {
        if (!content || !content.trim()) {
          h.showError('Empty File', 'This PDB file has no content.');
          return;
        }

        h.showLoading('Parsing molecular data...');

        // Small delay to ensure dependencies are ready and UI updates
        setTimeout(function () {
          if (typeof THREE === 'undefined') {
            h.showError('Dependency Error', 'Three.js failed to load. Please check your connection.');
            return;
          }

          try {
            var data = parsePDB(content);
            if (data.atoms.length === 0) {
              h.showError('No Atoms Found', 'No valid atom records found in this PDB file.');
              return;
            }
            renderViewer(data, file, h, content);
          } catch (e) {
            console.error(e);
            h.showError('Processing Error', 'The file could not be parsed as a valid PDB.');
          }
        }, 100);
      },

      actions: [
        {
          label: '📋 Copy content',
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
        },
        {
          label: '📸 Save Image',
          id: 'screenshot',
          onClick: function (h) {
            var canvas = h.getRenderEl().querySelector('canvas');
            if (canvas) {
              var url = canvas.toDataURL('image/png');
              var name = h.getFile().name.replace(/\.[^/.]+$/, "") + '.png';
              h.download(name, url, 'image/png');
            } else {
              h.showError('Capture Error', 'Viewer canvas not found.');
            }
          }
        },
        {
          label: '🔄 Toggle Spin',
          id: 'spin',
          onClick: function () {
            autoSpin = !autoSpin;
          }
        }
      ]
    });
  };

  function parsePDB(text) {
    var atoms = [];
    var bonds = [];
    var atomMap = {};
    var lines = text.split('\n');
    var truncated = false;

    var MAX_LINES = 100000;
    if (lines.length > MAX_LINES) truncated = true;
    var limit = Math.min(lines.length, MAX_LINES);

    for (var i = 0; i < limit; i++) {
      var line = lines[i];
      if (line.startsWith('ATOM  ') || line.startsWith('HETATM')) {
        var serial = parseInt(line.substring(6, 11).trim(), 10);
        if (isNaN(serial)) continue;
        var x = parseFloat(line.substring(30, 38));
        var y = parseFloat(line.substring(38, 46));
        var z = parseFloat(line.substring(46, 54));
        if (isNaN(x) || isNaN(y) || isNaN(z)) continue;

        var element = line.substring(76, 78).trim().toUpperCase();
        if (!element) {
          element = line.substring(12, 14).trim().replace(/[0-9]/g, '').toUpperCase();
        }

        var resName = line.substring(17, 20).trim();
        var chain = line.substring(21, 22).trim();

        var atom = { serial: serial, x: x, y: y, z: z, element: element, resName: resName, chain: chain };
        atoms.push(atom);
        atomMap[serial] = atom;
      } else if (line.startsWith('CONECT')) {
        var from = parseInt(line.substring(6, 11).trim(), 10);
        if (isNaN(from)) continue;
        var tos = [
          parseInt(line.substring(11, 16).trim(), 10),
          parseInt(line.substring(16, 21).trim(), 10),
          parseInt(line.substring(21, 26).trim(), 10),
          parseInt(line.substring(26, 31).trim(), 10)
        ].filter(function (n) { return !isNaN(n); });

        for (var j = 0; j < tos.length; j++) {
          var to = tos[j];
          if (from < to && atomMap[to]) {
            bonds.push([from, to]);
          }
        }
      }
    }

    if (bonds.length === 0 && atoms.length > 0 && atoms.length < 4000) {
      for (var i = 0; i < atoms.length; i++) {
        for (var k = i + 1; k < atoms.length; k++) {
          var a1 = atoms[i], a2 = atoms[k];
          var dx = a1.x - a2.x;
          var dy = a1.y - a2.y;
          var dz = a1.z - a2.z;
          if ((dx * dx + dy * dy + dz * dz) < 4.0) {
            bonds.push([a1.serial, a2.serial]);
          }
        }
      }
    }

    return { atoms: atoms, bonds: bonds, atomMap: atomMap, truncated: truncated };
  }

  function renderViewer(data, file, h, content) {
    var atoms = data.atoms;
    var bonds = data.bonds;
    var atomMap = data.atomMap;
    
    var residues = new Set();
    var chains = new Set();
    atoms.forEach(function(a) {
      residues.add(a.chain + a.resName);
      chains.add(a.chain || 'A');
    });

    var lines = content.split('\n');
    var displayLines = lines.slice(0, 5000); 
    if (lines.length > 5000) {
      displayLines.push('\n... (Content truncated for performance) ...');
    }

    var html = 
      '<div class="flex flex-col h-[700px] font-sans">' +
        '<div class="flex items-center gap-4 mb-4 border-b border-surface-200 px-2">' +
          '<button id="tab-3d" class="px-4 py-2 font-medium text-brand-600 border-b-2 border-brand-600 transition-colors focus:outline-none">3D Viewer</button>' +
          '<button id="tab-raw" class="px-4 py-2 font-medium text-surface-500 border-b-2 border-transparent hover:text-surface-700 transition-colors focus:outline-none">Raw Data</button>' +
        '</div>' +

        '<div id="view-3d" class="flex-1 flex flex-col min-h-0">' +
          '<div class="flex items-center justify-between mb-3 px-1">' +
            '<div class="flex flex-wrap gap-2">' +
              '<span class="text-xs bg-brand-100 text-brand-700 px-2.5 py-1 rounded-full font-medium">' + atoms.length.toLocaleString() + ' atoms</span>' +
              '<span class="text-xs bg-surface-100 text-surface-700 px-2.5 py-1 rounded-full font-medium">' + residues.size + ' residues</span>' +
              '<span class="text-xs bg-surface-100 text-surface-700 px-2.5 py-1 rounded-full font-medium">' + chains.size + ' chains</span>' +
            '</div>' +
          '</div>' +
          '<div class="flex-1 rounded-xl overflow-hidden border border-surface-200 relative bg-slate-950 group shadow-inner">' +
            '<div id="three-container" class="absolute inset-0 cursor-grab active:cursor-grabbing"></div>' +
            '<button id="pdb-reset" class="absolute top-4 right-4 px-3 py-1.5 bg-white/10 hover:bg-white/20 backdrop-blur text-white text-xs font-medium rounded-lg border border-white/20 transition-all z-10">Reset View</button>' +
          '</div>' +
        '</div>' +

        '<div id="view-raw" class="flex-1 flex flex-col min-h-0 hidden">' +
          '<div class="flex-1 rounded-xl overflow-hidden border border-surface-200 flex flex-col min-h-0 bg-gray-950 shadow-inner">' +
            '<div class="flex-1 overflow-auto p-4">' +
              '<pre class="text-sm font-mono text-gray-300 leading-relaxed m-0">' + 
                displayLines.map(function(l) { return esc(l); }).join('\n') + 
              '</pre>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    h.render(html);

    var renderEl = h.getRenderEl();
    var tab3d = renderEl.querySelector('#tab-3d');
    var tabRaw = renderEl.querySelector('#tab-raw');
    var view3d = renderEl.querySelector('#view-3d');
    var viewRaw = renderEl.querySelector('#view-raw');

    tab3d.addEventListener('click', function () {
      tab3d.className = 'px-4 py-2 font-medium text-brand-600 border-b-2 border-brand-600 focus:outline-none';
      tabRaw.className = 'px-4 py-2 font-medium text-surface-500 border-b-2 border-transparent hover:text-surface-700 focus:outline-none';
      view3d.classList.remove('hidden');
      viewRaw.classList.add('hidden');
      window.dispatchEvent(new Event('resize'));
    });

    tabRaw.addEventListener('click', function () {
      tabRaw.className = 'px-4 py-2 font-medium text-brand-600 border-b-2 border-brand-600 focus:outline-none';
      tab3d.className = 'px-4 py-2 font-medium text-surface-500 border-b-2 border-transparent hover:text-surface-700 focus:outline-none';
      viewRaw.classList.remove('hidden');
      view3d.classList.add('hidden');
    });

    // Three.js
    var mount = renderEl.querySelector('#three-container');
    var width = mount.clientWidth || 800;
    var height = mount.clientHeight || 500;

    var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(45, width / height, 1, 5000);
    
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    var l1 = new THREE.DirectionalLight(0xffffff, 1);
    l1.position.set(1, 1, 1);
    scene.add(l1);

    var group = new THREE.Group();
    scene.add(group);

    var minX = Infinity, minY = Infinity, minZ = Infinity;
    var maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    atoms.forEach(function(a) {
      if (a.x < minX) minX = a.x; if (a.x > maxX) maxX = a.x;
      if (a.y < minY) minY = a.y; if (a.y > maxY) maxY = a.y;
      if (a.z < minZ) minZ = a.z; if (a.z > maxZ) maxZ = a.z;
    });
    var cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
    var span = Math.max(maxX - minX, maxY - minY, maxZ - minZ);

    var elementTypes = {};
    atoms.forEach(function(a) {
      if (!elementTypes[a.element]) elementTypes[a.element] = [];
      elementTypes[a.element].push(a);
    });

    var sphereGeom = new THREE.SphereGeometry(0.4, 16, 16);
    
    Object.keys(elementTypes).forEach(function(el) {
      var elAtoms = elementTypes[el];
      var color = CPK[el] || 0xcccccc;
      var mat = new THREE.MeshPhongMaterial({ color: color, shininess: 80 });
      var mesh = new THREE.InstancedMesh(sphereGeom, mat, elAtoms.length);
      
      var matrix = new THREE.Matrix4();
      var pos = new THREE.Vector3();
      elAtoms.forEach(function(a, i) {
        pos.set(a.x - cx, a.y - cy, a.z - cz);
        matrix.setPosition(pos);
        mesh.setMatrixAt(i, matrix);
      });
      group.add(mesh);
    });

    if (bonds.length > 0) {
      var bondMat = new THREE.MeshPhongMaterial({ color: 0x888888, shininess: 50 });
      var bondGeom = new THREE.CylinderGeometry(0.1, 0.1, 1, 8);
      var bondMesh = new THREE.InstancedMesh(bondGeom, bondMat, bonds.length);
      
      var m = new THREE.Matrix4();
      var q = new THREE.Quaternion();
      var scale = new THREE.Vector3();
      var center = new THREE.Vector3();
      var up = new THREE.Vector3(0, 1, 0);

      bonds.forEach(function(pair, i) {
        var a1 = atomMap[pair[0]], a2 = atomMap[pair[1]];
        if (!a1 || !a2) return;
        
        var v1 = new THREE.Vector3(a1.x - cx, a1.y - cy, a1.z - cz);
        var v2 = new THREE.Vector3(a2.x - cx, a2.y - cy, a2.z - cz);
        var dist = v1.distanceTo(v2);
        
        center.copy(v1).add(v2).multiplyScalar(0.5);
        var dir = new THREE.Vector3().subVectors(v2, v1).normalize();
        q.setFromUnitVectors(up, dir);
        
        scale.set(1, dist, 1);
        m.compose(center, q, scale);
        bondMesh.setMatrixAt(i, m);
      });
      group.add(bondMesh);
    }

    camera.position.z = (span * 1.5) || 50;
    camera.lookAt(0, 0, 0);

    var isDragging = false, lastX = 0, lastY = 0;
    var onMouseDown = function (e) { isDragging = true; lastX = e.clientX; lastY = e.clientY; };
    var onMouseMove = function (e) {
      if (isDragging) {
        group.rotation.y += (e.clientX - lastX) * 0.007;
        group.rotation.x += (e.clientY - lastY) * 0.007;
        lastX = e.clientX; lastY = e.clientY;
      }
    };
    var onMouseUp = function () { isDragging = false; };
    var onWheel = function (e) {
      e.preventDefault();
      camera.position.z = Math.max(span * 0.1, camera.position.z + e.deltaY * 0.05);
    };

    mount.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    mount.addEventListener('wheel', onWheel, { passive: false });

    renderEl.querySelector('#pdb-reset').onclick = function () {
      group.rotation.set(0, 0, 0);
      camera.position.z = (span * 1.5) || 50;
    };

    var animationId;
    function animate() {
      if (!mount.isConnected) {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        renderer.dispose();
        cancelAnimationFrame(animationId);
        return;
      }
      animationId = requestAnimationFrame(animate);
      if (autoSpin && !isDragging) group.rotation.y += 0.002;
      renderer.render(scene, camera);
    }
    animate();

    var onResize = function () {
      if (!mount.isConnected) return;
      var newW = mount.clientWidth;
      var newH = mount.clientHeight;
      if (newW > 0 && newH > 0) {
        camera.aspect = newW / newH;
        camera.updateProjectionMatrix();
        renderer.setSize(newW, newH);
      }
    };
    window.addEventListener('resize', onResize);
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
