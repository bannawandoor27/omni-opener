/**
 * OmniOpener — KTX Texture Viewer (KTX1 / KTX2)
 * High-performance browser-based viewer for KTX and Basis Universal textures.
 */
(function () {
  'use strict';

  var renderer, scene, camera, controls, mesh, texture, animationId, ktx2Loader;
  var resizeHandler, currentMetadata = {};

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.ktx,.ktx2',
      binary: true,
      infoHtml: '<strong>KTX Viewer:</strong> High-performance viewer for KTX and KTX2 (Basis Universal) textures. Supports compressed formats and Basis Universal transcoding. All processing happens in your browser.',

      actions: [
        {
          label: '🖼️ Save as PNG',
          id: 'save-png',
          onClick: function (h) {
            if (!renderer || !scene || !camera) {
              return h.showError('Not Ready', 'The texture has not been loaded yet.');
            }
            renderer.render(scene, camera);
            renderer.domElement.toBlob(function(blob) {
              var fileName = (currentMetadata.filename || 'texture').replace(/\.[^/.]+$/, "");
              h.download(fileName + '.png', blob, 'image/png');
            }, 'image/png');
          }
        },
        {
          label: '📋 Copy Metadata',
          id: 'copy-meta',
          onClick: function (h, btn) {
            if (!currentMetadata.filename) {
              return h.showError('No Data', 'No texture metadata available.');
            }
            h.copyToClipboard(JSON.stringify(currentMetadata, null, 2), btn);
          }
        },
        {
          label: '🔄 Reset View',
          id: 'reset-view',
          onClick: function () {
            if (controls) controls.reset();
          }
        }
      ],

      onInit: function (h) {
        cleanup();
        return h.loadScripts([
          'https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js',
          'https://cdn.jsdelivr.net/npm/three@0.149.0/examples/js/loaders/KTXLoader.js',
          'https://cdn.jsdelivr.net/npm/three@0.149.0/examples/js/loaders/KTX2Loader.js',
          'https://cdn.jsdelivr.net/npm/three@0.149.0/examples/js/controls/OrbitControls.js'
        ]);
      },

      onFile: function _onFile(file, content, h) {
        if (!window.THREE || !THREE.KTXLoader || !THREE.KTX2Loader || !THREE.OrbitControls) {
          h.showLoading('Initializing graphics engine...');
          setTimeout(function() { _onFile(file, content, h); }, 200);
          return;
        }

        if (!content || content.byteLength < 12) {
          return h.showError('Invalid File', 'The file is too small to be a valid KTX texture.');
        }

        try {
          var header = new Uint8Array(content.slice(0, 12));
          var isKTX = header[1] === 0x4B && header[2] === 0x54 && header[3] === 0x58; // 'K' 'T' 'X'
          var isKTX2 = isKTX && header[5] === 0x32; // '2'
          
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
        if (mesh.material) mesh.material.dispose();
        mesh = null;
      }
      if (texture) {
        texture.dispose();
        texture = null;
      }
      if (ktx2Loader && ktx2Loader.dispose) {
        ktx2Loader.dispose();
        ktx2Loader = null;
      }
      scene = camera = controls = null;
      currentMetadata = {};
    }

    function loadKTX1(file, content, h) {
      h.showLoading('Parsing KTX1...');
      try {
        var loader = new THREE.KTXLoader();
        var tex = loader.parse(content);
        renderTexture(tex, 1, file, h);
      } catch (err) {
        h.showError('KTX1 Error', 'The KTX1 variant in this file is not supported.');
      }
    }

    function loadKTX2(file, content, h) {
      h.showLoading('Transcoding KTX2...');
      
      var tempRenderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
      
      if (!ktx2Loader) {
        ktx2Loader = new THREE.KTX2Loader();
        ktx2Loader.setTranscoderPath('https://cdn.jsdelivr.net/npm/three@0.149.0/examples/js/libs/basis/');
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

      var width = texture.image ? (texture.image.width || 0) : 0;
      var height = texture.image ? (texture.image.height || 0) : 0;

      currentMetadata = {
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
              '<p class="text-xs text-surface-500 mt-1">' + currentMetadata.size + ' • ' + currentMetadata.resolution + ' • ' + currentMetadata.version + '</p>',
            '</div>',
            '<div class="px-3 py-1 bg-brand-100 text-brand-700 rounded-lg text-[10px] font-bold uppercase border border-brand-200">' + currentMetadata.format + '</div>',
          '</div>',
          '<div class="relative group rounded-2xl overflow-hidden border border-surface-200 bg-slate-950 shadow-lg">',
            '<div id="ktx-viewport" class="w-full h-[500px] cursor-move"></div>',
            '<div class="absolute bottom-4 left-1/2 -translate-x-1/2 bg-slate-900/80 backdrop-blur px-4 py-2 rounded-full border border-white/10 text-[10px] text-white/70 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">',
              'Orbit: Left Click • Pan: Right Click • Zoom: Scroll',
            '</div>',
          '</div>',
        '</div>'
      ].join(''));

      var container = document.getElementById('ktx-viewport');
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
      var aspect = width / height || 1;
      var geometry = new THREE.PlaneGeometry(
        aspect > 1 ? 1.5 : 1.5 * aspect, 
        aspect > 1 ? 1.5 / aspect : 1.5
      );
      
      var material = new THREE.MeshBasicMaterial({ 
        map: texture, 
        transparent: true, 
        side: THREE.DoubleSide 
      });
      
      mesh = new THREE.Mesh(geometry, material);
      scene.add(mesh);

      controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;

      resizeHandler = function() {
        if (!container || !renderer || !camera) return;
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
      };
      window.addEventListener('resize', resizeHandler);

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
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
})();
