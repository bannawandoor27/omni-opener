/**
 * OmniOpener — OBJ 3D Viewer Tool
 * Uses OmniTool SDK and Three.js. Renders .obj files in the browser.
 */
(function () {
  'use strict';

  var renderer, scene, camera, controls, animationId, resizeObserver;

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.obj',
      dropLabel: 'Drop a .obj file here',
      binary: true,
      infoHtml: '<strong>OBJ Viewer:</strong> 100% client-side 3D rendering using Three.js. Your files never leave your device.',

      actions: [
        {
          label: '📸 Capture Screenshot',
          id: 'screenshot',
          onClick: function (helpers) {
            if (renderer && scene && camera) {
              renderer.render(scene, camera);
              var dataUrl = renderer.domElement.toDataURL('image/png');
              helpers.download(helpers.getFile().name.replace('.obj', '.png'), dataUrl, 'image/png');
            }
          }
        },

        {
          label: '📋 Copy Stats',
          id: 'copy-stats',
          onClick: function (h, btn) {
            var stats = h.getState().modelStats;
            if (stats) {
              h.copyToClipboard('Model Stats for ' + h.getFile().name + ':\n' + stats, btn);
            }
          }
        },
        {
          label: '📥 Download',
          id: 'dl',
          onClick: function (h) {
            h.download(h.getFile().name, h.getContent());
          }
        }
      ],

      onInit: function (h) {
        // Load Three.js and loaders sequentially
        h.loadScript('https://cdn.jsdelivr.net/npm/three@0.136.0/build/three.min.js', function () {
          h.loadScript('https://cdn.jsdelivr.net/npm/three@0.136.0/examples/js/loaders/OBJLoader.js', function () {
            h.loadScript('https://cdn.jsdelivr.net/npm/three@0.136.0/examples/js/controls/OrbitControls.js');
          });
        });
      },

      onFile: function (file, content, h) {
        h.showLoading('Preparing 3D scene...');
        
        function tryRender() {
          // Wait for dependencies to be available
          if (typeof THREE !== 'undefined' && THREE.OBJLoader && THREE.OrbitControls) {
            try {
              renderObj(file, content, h);
            } catch (err) {
              h.showError('Failed to render OBJ', err.message);
            }
          } else {
            // Check if we are still viewing the same file before retrying
            if (h.getFile() === file) {
              setTimeout(tryRender, 100);
            }
          }
        }

        tryRender();
      },

      onDestroy: function () {
        cleanup();
      }
    });
  };

  function renderObj(file, content, h) {
    // Cleanup previous scene if any
    cleanup();

        var html = `
      <div class="flex items-center gap-3 p-3 bg-surface-50 rounded-lg text-sm text-surface-600 mb-4">
        <span class="font-medium">${esc(file.name)}</span>
        <span class="text-surface-400">·</span>
        <span>${formatSize(file.size)}</span>
        <span class="text-surface-400">·</span>
        <span id="obj-stats">Calculating...</span>
      </div>
      <div class="relative w-full h-[600px] bg-slate-900 rounded-xl overflow-hidden shadow-inner border border-surface-200">
        <div id="three-container" class="w-full h-full"></div>
        <div class="absolute bottom-4 left-4 flex gap-2">
          <button id="toggle-wireframe" class="px-4 py-2 text-xs font-semibold rounded-lg bg-surface-100 hover:bg-surface-200 transition-colors">Toggle Wireframe</button>
          <button id="toggle-bbox" class="px-4 py-2 text-xs font-semibold rounded-lg bg-surface-100 hover:bg-surface-200 transition-colors">Toggle Bounding Box</button>
          <button id="toggle-rotate" class="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs rounded-lg backdrop-blur-md transition-all border border-white/10">Pause Rotation</button>
          <button id="reset-view" class="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs rounded-lg backdrop-blur-md transition-all border border-white/10">Reset View</button>
        </div>
      </div>`;

    h.render(html);

    var container = document.getElementById('three-container');
    var statsEl = document.getElementById('obj-stats');

    // 1. Scene Setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a); // slate-900

    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 2000);
    camera.position.set(10, 10, 10);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    // 2. Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    var dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(5, 10, 7.5);
    scene.add(dirLight);

    // 3. Controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotate = true;

    // 4. Load Model
    var loader = new THREE.OBJLoader();
    var text = new TextDecoder().decode(content);
    var model = loader.parse(text);

    // Center and Scale
    var box = new THREE.Box3().setFromObject(model);
    var size = box.getSize(new THREE.Vector3());
    var center = box.getCenter(new THREE.Vector3());
    
    model.position.x -= center.x;
    model.position.y -= center.y;
    model.position.z -= center.z;
    
    var maxDim = Math.max(size.x, size.y, size.z);
    var scale = 8 / (maxDim || 1);
    model.scale.setScalar(scale);
    
    scene.add(model);
    // Bounding Box Helper
    var bboxHelper = new THREE.BoxHelper(model, 0xffff00);
    bboxHelper.visible = false;
    scene.add(bboxHelper);

    document.getElementById('toggle-wireframe').addEventListener('click', function () {
      model.traverse(function (node) {
        if (node.isMesh) {
          node.material.wireframe = !node.material.wireframe;
        }
      });
    });
    document.getElementById('toggle-bbox').addEventListener('click', function () {
      bboxHelper.visible = !bboxHelper.visible;
    });


    // 5. Calculate Stats
    var vertices = 0, faces = 0;
    model.traverse(function (node) {
      if (node.isMesh) {
        var geo = node.geometry;
        if (geo.attributes.position) {
          vertices += geo.attributes.position.count;
          faces += geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3;
        }
      }
    });
    var statsText = vertices.toLocaleString() + ' vertices · ' + Math.floor(faces).toLocaleString() + ' faces';
    statsEl.textContent = statsText;
    h.setState('modelStats', statsText);

    // 6. Animation Loop
    function animate() {
      if (!document.getElementById('three-container')) return;
      animationId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    // 7. UI Hooks
    document.getElementById('toggle-rotate').addEventListener('click', function (e) {
      controls.autoRotate = !controls.autoRotate;
      e.target.textContent = controls.autoRotate ? `Pause Rotation` : `Resume Rotation`;
    });
    document.getElementById('reset-view').addEventListener('click', function () {
      controls.reset();
    });

    // 8. Resize Handling
    resizeObserver = new ResizeObserver(function () {
      if (container.clientWidth > 0 && container.clientHeight > 0) {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
      }
    });
    resizeObserver.observe(container);
  }

  function cleanup() {
    if (animationId) cancelAnimationFrame(animationId);
    if (resizeObserver) resizeObserver.disconnect();
    if (renderer) {
      renderer.dispose();
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    }
    if (scene) {
      scene.traverse(function(object) {
        if (object.geometry) object.geometry.dispose();
        if (object.material) {
          if (Array.isArray(object.material)) {
            object.material.forEach(function(material) { material.dispose(); });
          } else {
            object.material.dispose();
          }
        }
      });
      scene.clear();
    }
    renderer = null; scene = null; camera = null; controls = null;
  }

  function formatSize(b) {
    return b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : b > 1e3 ? (b / 1024).toFixed(0) + ' KB' : b + ' B';
  }

  function esc(str) {
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }
})();
