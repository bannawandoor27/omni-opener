/**
 * OmniOpener — KTX Texture Viewer (KTX1 / KTX2)
 * Uses OmniTool SDK and Three.js. Supports Basis Universal textures.
 */
(function () {
  'use strict';

  let renderer, scene, camera, controls, mesh, animationId;
  let resizeHandler, metadata = {};

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.ktx,.ktx2',
      binary: true,
      infoHtml: '<strong>KTX Viewer:</strong> High-performance viewer for KTX1 and KTX2 (Basis Universal) textures. Supports compressed formats and mipmaps. All processing happens in your browser.',

      actions: [
        {
          label: '🖼️ Save as PNG',
          id: 'save-png',
          onClick: function (h) {
            if (!renderer || !scene || !camera) return;
            renderer.render(scene, camera);
            const dataUrl = renderer.domElement.toDataURL('image/png');
            h.download('texture-export.png', dataUrl, 'image/png');
          }
        },
        {
          label: '📊 Copy Metadata',
          id: 'copy-meta',
          onClick: function (h, btn) {
            h.copyToClipboard(JSON.stringify(metadata, null, 2), btn);
          }
        }
      ],

      onInit: function (h) {
        h.loadScripts([
          'https://cdn.jsdelivr.net/npm/three@0.137.0/build/three.min.js',
          'https://cdn.jsdelivr.net/npm/three@0.137.0/examples/js/loaders/KTXLoader.js',
          'https://cdn.jsdelivr.net/npm/three@0.137.0/examples/js/loaders/KTX2Loader.js',
          'https://cdn.jsdelivr.net/npm/three@0.137.0/examples/js/controls/OrbitControls.js'
        ]);
      },

      onFile: function _onFileFn(file, content, h) {
        if (!window.THREE || !THREE.KTXLoader || !THREE.KTX2Loader || !THREE.OrbitControls) {
          h.showLoading('Loading graphics engine...');
          setTimeout(() => _onFileFn(file, content, h), 300);
          return;
        }

        h.showLoading('Analyzing texture...');

        try {
          const header = new Uint8Array(content.slice(0, 12));
          const isKTX2 = header[1] === 0x4B && header[2] === 0x54 && header[3] === 0x58 && header[5] === 0x32;
          
          if (isKTX2) {
            loadKTX2(content, file, h);
          } else {
            loadKTX1(content, file, h);
          }
        } catch (err) {
          h.showError('Parsing Error', err.message);
        }
      },

      onDestroy: function () {
        cleanup();
      }
    });

    function cleanup() {
      if (animationId) cancelAnimationFrame(animationId);
      if (resizeHandler) {
        window.removeEventListener('resize', resizeHandler);
        resizeHandler = null;
      }
      if (renderer) {
        if (renderer.domElement && renderer.domElement.parentNode) {
          renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
        renderer.dispose();
        renderer = null;
      }
      if (mesh) {
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          if (mesh.material.map) mesh.material.map.dispose();
          mesh.material.dispose();
        }
        mesh = null;
      }
      scene = null;
      camera = null;
      controls = null;
    }

    function loadKTX1(content, file, h) {
      const loader = new THREE.KTXLoader();
      try {
        const texture = loader.parse(content);
        renderTexture(texture, 1, file, h);
      } catch (err) {
        h.showError('KTX1 Error', err.message);
      }
    }

    function loadKTX2(content, file, h) {
      const tempRenderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
      const loader = new THREE.KTX2Loader();
      loader.setTranscoderPath('https://cdn.jsdelivr.net/npm/three@0.137.0/examples/js/libs/basis/');
      loader.detectSupport(tempRenderer);

      loader.parse(content, (texture) => {
        renderTexture(texture, 2, file, h);
        tempRenderer.dispose();
      }, (err) => {
        h.showError('KTX2 Error', err.message || 'Transcoding failed.');
        tempRenderer.dispose();
      });
    }

    function renderTexture(texture, version, file, h) {
      cleanup();

      const width = texture.image.width || 0;
      const height = texture.image.height || 0;
      const mipmaps = texture.mipmaps ? texture.mipmaps.length : 1;

      metadata = {
        filename: file.name,
        version: 'KTX' + version,
        width: width,
        height: height,
        mipmaps: mipmaps,
        format: texture.format
      };

      h.render(`
        <div class="flex flex-col h-[650px] bg-slate-900 rounded-xl overflow-hidden border border-surface-200 shadow-2xl relative font-sans">
          <div id="ktx-viewport" class="flex-1 w-full h-full cursor-move"></div>
          
          <div class="absolute top-4 left-4 p-4 bg-slate-900/90 backdrop-blur-md rounded-xl border border-slate-700 shadow-xl pointer-events-none transition-opacity opacity-90">
            <h3 class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Texture Info</h3>
            <div class="space-y-1">
              <p class="text-xs font-bold text-white truncate max-w-[200px]">${esc(file.name)}</p>
              <div class="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px]">
                <span class="text-slate-500">Format:</span> <span class="text-brand-400 font-mono">KTX${version}</span>
                <span class="text-slate-500">Dimensions:</span> <span class="text-slate-300 font-mono">${width} × ${height}</span>
                <span class="text-slate-500">Mipmaps:</span> <span class="text-slate-300 font-mono">${mipmaps}</span>
              </div>
            </div>
          </div>
          
          <div class="absolute bottom-4 left-1/2 -translate-x-1/2 bg-slate-900/60 backdrop-blur px-4 py-1.5 rounded-full border border-slate-700/50 shadow-lg flex gap-4 items-center">
             <span class="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Drag: Rotate • Right Click: Pan • Scroll: Zoom</span>
          </div>
        </div>
      `);

      const container = document.getElementById('ktx-viewport');
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0f172a);

      const aspect = container.clientWidth / container.clientHeight;
      camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
      camera.position.z = 1.5;

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.setSize(container.clientWidth, container.clientHeight);
      container.appendChild(renderer.domElement);

      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.needsUpdate = true;

      const texAspect = width / height;
      const geometry = new THREE.PlaneGeometry(texAspect > 1 ? 1 : texAspect, texAspect > 1 ? 1 / texAspect : 1);
      const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
      mesh = new THREE.Mesh(geometry, material);
      scene.add(mesh);

      controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;

      resizeHandler = () => {
        if (!container || !renderer) return;
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
      };
      window.addEventListener('resize', resizeHandler);

      function animate() {
        if (!renderer) return;
        animationId = requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
      }
      animate();
    }
  };

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }
})();
