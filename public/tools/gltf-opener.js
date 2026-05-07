(function () {
  'use strict';

  var SCRIPTS = [
    'https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.min.js',
    'https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/loaders/GLTFLoader.js',
    'https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/controls/OrbitControls.js'
  ];

  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    var k = 1024;
    var dm = 2;
    var sizes = ['B', 'KB', 'MB', 'GB'];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  function escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  window.initTool = function (toolConfig, mountEl) {
    var renderer, scene, camera, controls, animationId, mixer, clock, model;
    var resizeHandler = null;

    function cleanup() {
      if (animationId) cancelAnimationFrame(animationId);
      animationId = null;

      if (resizeHandler) {
        window.removeEventListener('resize', resizeHandler);
        resizeHandler = null;
      }

      if (controls) {
        controls.dispose();
        controls = null;
      }

      if (renderer) {
        renderer.dispose();
        if (renderer.domElement && renderer.domElement.parentElement) {
          renderer.domElement.parentElement.removeChild(renderer.domElement);
        }
        renderer = null;
      }

      if (scene) {
        scene.traverse(function (node) {
          if (node.isMesh) {
            if (node.geometry) node.geometry.dispose();
            if (node.material) {
              if (Array.isArray(node.material)) {
                node.material.forEach(function (m) { m.dispose(); });
              } else {
                node.material.dispose();
              }
            }
          }
        });
        scene = null;
      }
      
      mixer = null;
      clock = null;
      model = null;
    }

    OmniTool.create(mountEl, toolConfig, {
      accept: '.glb,.gltf',
      binary: true,
      infoHtml: '<strong>Privacy:</strong> Your 3D models are processed entirely in your browser using Three.js. No data is uploaded to any server.',
      
      actions: [
        {
          label: '📸 Take Screenshot',
          id: 'screenshot',
          onClick: function (h) {
            if (!renderer || !scene || !camera) return;
            renderer.render(scene, camera);
            renderer.domElement.toBlob(function (blob) {
              var name = h.getFile().name.replace(/\.[^/.]+$/, "") + "-screenshot.png";
              h.download(name, blob, 'image/png');
            }, 'image/png');
          }
        },
        {
          label: '📥 Download Model',
          id: 'download',
          onClick: function (h) {
            h.download(h.getFile().name, h.getContent());
          }
        }
      ],

      onInit: function (h) {
        return h.loadScripts(SCRIPTS);
      },

      onFile: function _onFileFn(file, content, h) {
        cleanup();
        
        if (typeof THREE === 'undefined' || !THREE.GLTFLoader) {
          h.showLoading('Loading 3D engine...');
          h.loadScripts(SCRIPTS).then(function() {
            _onFileFn(file, content, h);
          });
          return;
        }

        h.showLoading('Parsing 3D model...');
        var loader = new THREE.GLTFLoader();
        
        loader.parse(content, '', function (gltf) {
          model = gltf.scene;
          var animations = gltf.animations || [];
          
          var stats = {
            vertices: 0,
            triangles: 0,
            meshes: 0,
            materials: new Set()
          };

          model.traverse(function (node) {
            if (node.isMesh) {
              stats.meshes++;
              if (node.geometry) {
                var geo = node.geometry;
                if (geo.attributes.position) stats.vertices += geo.attributes.position.count;
                if (geo.index) stats.triangles += geo.index.count / 3;
                else if (geo.attributes.position) stats.triangles += geo.attributes.position.count / 3;
              }
              if (node.material) {
                var mats = Array.isArray(node.material) ? node.material : [node.material];
                mats.forEach(function (m) { stats.materials.add(m.name || 'Unnamed Material'); });
              }
            }
          });

          h.render(
            '<div class="flex flex-col gap-4">' +
              '<div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 border border-surface-100">' +
                '<span class="font-bold text-surface-800">' + escapeHtml(file.name) + '</span>' +
                '<span class="text-surface-300">|</span>' +
                '<span>' + formatSize(file.size) + '</span>' +
                '<span class="text-surface-300">|</span>' +
                '<span class="text-brand-600 font-medium uppercase tracking-tight text-[11px] bg-brand-50 px-2 py-0.5 rounded-md border border-brand-100">' +
                  file.name.split('.').pop().toUpperCase() + ' MODEL' +
                '</span>' +
              '</div>' +

              '<div class="grid grid-cols-1 lg:grid-cols-12 gap-6">' +
                '<div class="lg:col-span-3 space-y-5">' +
                  '<div class="rounded-xl border border-surface-200 bg-white p-4 shadow-sm">' +
                    '<h3 class="font-semibold text-surface-800 text-sm mb-4 border-b border-surface-50 pb-2">Model Stats</h3>' +
                    '<div class="space-y-3">' +
                      '<div class="flex justify-between items-center text-xs">' +
                        '<span class="text-surface-500 font-medium">Vertices</span>' +
                        '<span class="font-mono text-surface-900 bg-surface-50 px-2 py-1 rounded">' + Math.round(stats.vertices).toLocaleString() + '</span>' +
                      '</div>' +
                      '<div class="flex justify-between items-center text-xs">' +
                        '<span class="text-surface-500 font-medium">Triangles</span>' +
                        '<span class="font-mono text-surface-900 bg-surface-50 px-2 py-1 rounded">' + Math.round(stats.triangles).toLocaleString() + '</span>' +
                      '</div>' +
                      '<div class="flex justify-between items-center text-xs">' +
                        '<span class="text-surface-500 font-medium">Meshes</span>' +
                        '<span class="font-mono text-surface-900 bg-surface-50 px-2 py-1 rounded">' + stats.meshes + '</span>' +
                      '</div>' +
                    '</div>' +
                  '</div>' +

                  '<div class="rounded-xl border border-surface-200 bg-white p-4 shadow-sm">' +
                    '<h3 class="font-semibold text-surface-800 mb-4 text-sm border-b border-surface-50 pb-2">Viewport</h3>' +
                    '<div class="space-y-4">' +
                      '<div class="space-y-2">' +
                        '<div class="flex justify-between">' +
                          '<label class="text-[10px] font-bold text-surface-400 uppercase tracking-wider">Exposure</label>' +
                          '<span id="exp-val" class="text-[10px] text-surface-500 font-mono">1.0x</span>' +
                        '</div>' +
                        '<input type="range" id="exp-slider" min="0" max="4" step="0.1" value="1" class="w-full h-1.5 bg-surface-100 rounded-lg appearance-none cursor-pointer accent-brand-600">' +
                      '</div>' +
                      '<div class="flex flex-col gap-3 pt-2">' +
                        '<label class="flex items-center gap-2 cursor-pointer group">' +
                          '<input type="checkbox" id="wire-check" class="w-4 h-4 rounded border-surface-300 text-brand-600 focus:ring-brand-500">' +
                          '<span class="text-xs text-surface-600 font-medium">Wireframe</span>' +
                        '</label>' +
                        '<label class="flex items-center gap-2 cursor-pointer group">' +
                          '<input type="checkbox" id="auto-check" class="w-4 h-4 rounded border-surface-300 text-brand-600 focus:ring-brand-500">' +
                          '<span class="text-xs text-surface-600 font-medium">Auto-Rotation</span>' +
                        '</label>' +
                      '</div>' +
                    '</div>' +
                  '</div>' +

                  (animations.length > 0 ? 
                    '<div class="rounded-xl border border-surface-200 bg-white p-4 shadow-sm">' +
                      '<h3 class="font-semibold text-surface-800 text-sm mb-3 border-b border-surface-50 pb-2">Animations</h3>' +
                      '<select id="anim-select" class="w-full text-xs bg-surface-50 border border-surface-200 rounded-lg px-2 py-2.5 outline-none">' +
                        '<option value="-1">Static</option>' +
                        animations.map(function(anim, i) { return '<option value="' + i + '">' + escapeHtml(anim.name || 'Clip ' + i) + '</option>'; }).join('') +
                      '</select>' +
                    '</div>' : ''
                  ) +
                '</div>' +

                '<div class="lg:col-span-9 h-[600px] bg-[#0f172a] rounded-2xl overflow-hidden border border-surface-200 shadow-lg relative">' +
                  '<div id="canvas-container" class="w-full h-full cursor-grab active:cursor-grabbing"></div>' +
                '</div>' +
              '</div>' +
            '</div>'
          );

          var container = document.getElementById('canvas-container');
          if (!container) return;

          scene = new THREE.Scene();
          scene.background = new THREE.Color(0x0f172a);

          camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.01, 10000);
          
          renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
          renderer.setPixelRatio(window.devicePixelRatio);
          renderer.setSize(container.clientWidth, container.clientHeight);
          renderer.toneMapping = THREE.ACESFilmicToneMapping;
          renderer.toneMappingExposure = 1.0;
          renderer.outputEncoding = THREE.sRGBEncoding;
          container.appendChild(renderer.domElement);

          scene.add(new THREE.AmbientLight(0xffffff, 0.6));
          var dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
          dirLight.position.set(5, 10, 7);
          scene.add(dirLight);

          scene.add(model);

          var box = new THREE.Box3().setFromObject(model);
          var center = box.getCenter(new THREE.Vector3());
          var size = box.getSize(new THREE.Vector3());
          var maxDim = Math.max(size.x, size.y, size.z);
          var fov = camera.fov * (Math.PI / 180);
          var cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 2.2;

          camera.position.set(center.x, center.y + (maxDim * 0.1), center.z + cameraZ);
          camera.updateProjectionMatrix();

          controls = new THREE.OrbitControls(camera, renderer.domElement);
          controls.target.copy(center);
          controls.enableDamping = true;
          controls.update();

          if (animations.length > 0) {
            mixer = new THREE.AnimationMixer(model);
            clock = new THREE.Clock();
          }

          document.getElementById('wire-check').onchange = function (e) {
            model.traverse(function (node) {
              if (node.isMesh && node.material) {
                var mats = Array.isArray(node.material) ? node.material : [node.material];
                mats.forEach(function (m) { m.wireframe = e.target.checked; });
              }
            });
          };

          document.getElementById('auto-check').onchange = function (e) {
            controls.autoRotate = e.target.checked;
          };

          document.getElementById('exp-slider').oninput = function (e) {
            var val = parseFloat(e.target.value);
            renderer.toneMappingExposure = val;
            document.getElementById('exp-val').textContent = val.toFixed(1) + 'x';
          };

          var animSelect = document.getElementById('anim-select');
          if (animSelect) {
            animSelect.onchange = function (e) {
              mixer.stopAllAction();
              var idx = parseInt(e.target.value);
              if (idx >= 0) mixer.clipAction(animations[idx]).play();
            };
          }

          function animate() {
            if (!renderer) return;
            animationId = requestAnimationFrame(animate);
            if (mixer && clock) mixer.update(clock.getDelta());
            controls.update();
            renderer.render(scene, camera);
          }
          animate();

          resizeHandler = function () {
            if (!container || !renderer || !camera) return;
            camera.aspect = container.clientWidth / container.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(container.clientWidth, container.clientHeight);
          };
          window.addEventListener('resize', resizeHandler);

        }, undefined, function (error) {
          h.showError('Rendering Error', 'Could not parse the 3D model. The file may be corrupt or unsupported.');
          console.error(error);
        });
      },

      onDestroy: function () {
        cleanup();
      }
    });
  };
})();
