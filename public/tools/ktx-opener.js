/**
 * OmniOpener — KTX Texture Viewer (KTX1 / KTX2)
 * High-performance browser-based viewer for KTX and Basis Universal textures.
 */
(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    let renderer, scene, camera, controls, mesh, texture, animationId, ktx2Loader, resizeObserver;

    function cleanup() {
      if (animationId) cancelAnimationFrame(animationId);
      if (resizeObserver) resizeObserver.disconnect();
      if (renderer) {
        renderer.dispose();
        if (renderer.domElement && renderer.domElement.parentNode) {
          renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
        renderer = null;
      }
      if (mesh) {
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) mesh.material.dispose();
        mesh = null;
      }
      if (texture) {
        texture.dispose();
        texture = null;
      }
      scene = camera = controls = null;
    }

    OmniTool.create(mountEl, toolConfig, {
      accept: '.ktx,.ktx2',
      binary: true,
      infoHtml: '<strong>KTX Viewer:</strong> High-performance viewer for KTX and KTX2 (Basis Universal) textures. Supports compressed formats and Basis Universal transcoding. All processing happens in your browser.',

      actions: [
        {
          label: '🖼️ Save as PNG',
          id: 'save-png',
          onClick: function (h) {
            const state = h.getState();
            if (!state.renderer || !state.scene || !state.camera) {
              return h.showError('Not Ready', 'The texture has not been loaded yet.');
            }
            state.renderer.render(state.scene, state.camera);
            state.renderer.domElement.toBlob(function(blob) {
              const fileName = (h.getFile().name || 'texture').replace(/\.[^/.]+$/, "");
              h.download(fileName + '.png', blob, 'image/png');
            }, 'image/png');
          }
        },
        {
          label: '📋 Copy Metadata',
          id: 'copy-meta',
          onClick: function (h, btn) {
            const meta = h.getState().metadata;
            if (!meta) return h.showError('No Data', 'No texture metadata available.');
            h.copyToClipboard(JSON.stringify(meta, null, 2), btn);
          }
        },
        {
          label: '🔄 Reset View',
          id: 'reset-view',
          onClick: function (h) {
            const state = h.getState();
            if (state.controls) state.controls.reset();
          }
        }
      ],

      onInit: function (h) {
        cleanup();
        const threeVer = '0.147.0';
        const baseUrl = 'https://cdn.jsdelivr.net/npm/three@' + threeVer;
        return h.loadScripts([
          baseUrl + '/build/three.min.js',
          baseUrl + '/examples/js/loaders/KTXLoader.js',
          baseUrl + '/examples/js/loaders/KTX2Loader.js',
          baseUrl + '/examples/js/controls/OrbitControls.js'
        ]);
      },

      onFile: function (file, content, h) {
        h.showLoading('Initializing graphics engine...');
        const threeVer = '0.147.0';
        const baseUrl = 'https://cdn.jsdelivr.net/npm/three@' + threeVer;
        
        h.loadScripts([
          baseUrl + '/build/three.min.js',
          baseUrl + '/examples/js/loaders/KTXLoader.js',
          baseUrl + '/examples/js/loaders/KTX2Loader.js',
          baseUrl + '/examples/js/controls/OrbitControls.js'
        ]).then(() => {
          if (!content || content.byteLength < 12) {
            return h.showError('Invalid File', 'The file is too small to be a valid KTX texture.');
          }

          try {
            const header = new Uint8Array(content.slice(0, 12));
            const isKTX = header[1] === 0x4B && header[2] === 0x54 && header[3] === 0x58; // 'K' 'T' 'X'
            const isKTX2 = isKTX && header[5] === 0x32; // '2'
            
            if (isKTX2) {
              loadKTX2(file, content, h);
            } else if (isKTX) {
              loadKTX1(file, content, h);
            } else {
              throw new Error('Missing KTX magic identifier');
            }
          } catch (err) {
            h.showError('Parsing Error', err.message);
          }
        }).catch(err => {
          h.showError('Dependency Error', 'Failed to load 3D rendering components.');
        });
      },

      onDestroy: function () {
        cleanup();
        if (ktx2Loader) {
          ktx2Loader.dispose();
          ktx2Loader = null;
        }
      }
    });

    function loadKTX1(file, content, h) {
      h.showLoading('Parsing KTX1...');
      try {
        const loader = new THREE.KTXLoader();
        const tex = loader.parse(content);
        renderTexture(tex, 1, file, h);
      } catch (err) {
        h.showError('KTX1 Error', 'The KTX1 variant in this file is not supported.');
      }
    }

    function loadKTX2(file, content, h) {
      h.showLoading('Transcoding KTX2...');
      
      const tempRenderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
      
      if (!ktx2Loader) {
        ktx2Loader = new THREE.KTX2Loader();
        ktx2Loader.setTranscoderPath('https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/libs/basis/');
      }
      
      ktx2Loader.detectSupport(tempRenderer);

      ktx2Loader.parse(content, function(tex) {
        tempRenderer.dispose();
        renderTexture(tex, 2, file, h);
      }, function(err) {
        tempRenderer.dispose();
        h.showError('KTX2 Error', 'Transcoding failed or format unsupported by your GPU.');
      });
    }

    function renderTexture(tex, version, file, h) {
      cleanup();
      texture = tex;

      const width = texture.image ? (texture.image.width || 0) : 0;
      const height = texture.image ? (texture.image.height || 0) : 0;

      const metadata = {
        filename: file.name,
        size: (file.size / 1024).toFixed(1) + ' KB',
        version: 'KTX' + version,
        resolution: width + ' × ' + height,
        format: texture.format || 'Unknown'
      };

      h.render([
        '<div class="space-y-4 p-4">',
          '<div class="flex items-center justify-between bg-surface-50 p-4 rounded-xl border border-surface-200">',
            '<div>',
              '<h3 class="font-bold text-surface-900">' + esc(file.name) + '</h3>',
              '<p class="text-xs text-surface-500 mt-1">' + metadata.size + ' • ' + metadata.resolution + ' • ' + metadata.version + '</p>',
            '</div>',
            '<div class="px-3 py-1 bg-brand-100 text-brand-700 rounded-lg text-[10px] font-bold uppercase border border-brand-200">' + metadata.format + '</div>',
          '</div>',
          '<div class="relative group rounded-2xl overflow-hidden border border-surface-200 bg-slate-950 shadow-lg">',
            '<div id="ktx-viewport" class="w-full h-[500px] cursor-move"></div>',
            '<div class="absolute bottom-4 left-1/2 -translate-x-1/2 bg-slate-900/80 backdrop-blur px-4 py-2 rounded-full border border-white/10 text-[10px] text-white/70 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">',
              'Orbit: Left Click • Pan: Right Click • Zoom: Scroll',
            '</div>',
          '</div>',
        '</div>'
      ].join(''));

      const container = h.getRenderEl().querySelector('#ktx-viewport');
      if (!container) return;

      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x020617);

      camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
      camera.position.z = 2;

      renderer = new THREE.WebGLRenderer({ 
        antialias: true, 
        alpha: true, 
        preserveDrawingBuffer: true 
      });
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.setSize(container.clientWidth, container.clientHeight);
      container.appendChild(renderer.domElement);

      texture.needsUpdate = true;
      const aspect = width / height || 1;
      const geometry = new THREE.PlaneGeometry(
        aspect > 1 ? 1.5 : 1.5 * aspect, 
        aspect > 1 ? 1.5 / aspect : 1.5
      );
      
      const material = new THREE.MeshBasicMaterial({ 
        map: texture, 
        transparent: true, 
        side: THREE.DoubleSide 
      });
      
      mesh = new THREE.Mesh(geometry, material);
      scene.add(mesh);

      controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;

      h.setState({
        renderer: renderer,
        scene: scene,
        camera: camera,
        controls: controls,
        metadata: metadata
      });

      resizeObserver = new ResizeObserver(function() {
        if (!container.clientWidth || !container.clientHeight || !renderer) return;
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
      });
      resizeObserver.observe(container);

      function animate() {
        if (!renderer) return;
        animationId = requestAnimationFrame(animate);
        if (controls) controls.update();
        renderer.render(scene, camera);
      }
      
      animate();
      h.showLoading(false);
    }
  };

  function esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
})();
