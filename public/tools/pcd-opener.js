(function () {
  'use strict';

  var scene, camera, renderer, controls, points, animationId, grid, axes, resizeObserver;
  var currentFile = null;
  var pointSize = 0.005;
  var colorMode = 'original';

  /**
   * Cleans up Three.js resources and animation loops
   */
  function cleanup() {
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    if (points) {
      if (points.geometry) points.geometry.dispose();
      if (points.material) points.material.dispose();
      if (scene) scene.remove(points);
      points = null;
    }
    if (grid) {
      if (grid.geometry) grid.geometry.dispose();
      if (grid.material) grid.material.dispose();
      if (scene) scene.remove(grid);
      grid = null;
    }
    if (axes) {
      if (scene) scene.remove(axes);
      axes = null;
    }
  }

  /**
   * Escape HTML utility
   */
  function esc(str) {
    if (!str) return '';
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      accept: '.pcd',
      dropLabel: 'Drop a .pcd file here',
      infoHtml: '<strong>PCD Viewer:</strong> Professional Point Cloud Data renderer. Supports ASCII and Binary PCD formats. All processing happens locally in your browser.',

      actions: [
        {
          label: '📸 Capture',
          id: 'screenshot',
          onClick: function (h) {
            if (!renderer || !scene || !camera) return;
            renderer.render(scene, camera);
            renderer.domElement.toBlob(function (blob) {
              if (blob) {
                var name = currentFile ? currentFile.name.replace(/\.[^/.]+$/, "") : 'point-cloud';
                h.download(name + '.png', blob, 'image/png');
              }
            }, 'image/png');
          }
        },
        {
          label: '🎨 Color Mode',
          id: 'toggle-color',
          onClick: function () {
            if (!points) return;
            var modes = ['original', 'height', 'solid'];
            colorMode = modes[(modes.indexOf(colorMode) + 1) % modes.length];
            
            if (colorMode === 'solid') {
              points.material.vertexColors = false;
              points.material.color.setHex(0x3b82f6);
            } else if (colorMode === 'height') {
              points.material.vertexColors = true;
              var pos = points.geometry.attributes.position;
              var count = pos.count;
              var colors = new Float32Array(count * 3);
              var minZ = Infinity, maxZ = -Infinity;
              for (var i = 0; i < count; i++) {
                var z = pos.getZ(i);
                if (z < minZ) minZ = z;
                if (z > maxZ) maxZ = z;
              }
              var range = (maxZ - minZ) || 1;
              var color = new THREE.Color();
              for (var i = 0; i < count; i++) {
                var hVal = (pos.getZ(i) - minZ) / range;
                color.setHSL(0.66 * (1 - hVal), 1, 0.5);
                colors[i * 3] = color.r;
                colors[i * 3 + 1] = color.g;
                colors[i * 3 + 2] = color.b;
              }
              points.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
            } else {
              points.material.vertexColors = !!points.geometry.attributes.color;
              if (!points.material.vertexColors) {
                points.material.color.setHex(0xffffff);
              }
            }
            points.material.needsUpdate = true;
          }
        },
        {
          label: '➕ Bigger',
          id: 'size-inc',
          onClick: function () {
            if (points) {
              pointSize *= 1.5;
              points.material.size = pointSize;
              points.material.needsUpdate = true;
            }
          }
        },
        {
          label: '➖ Smaller',
          id: 'size-dec',
          onClick: function () {
            if (points) {
              pointSize /= 1.5;
              points.material.size = pointSize;
              points.material.needsUpdate = true;
            }
          }
        },
        {
          label: '🌐 Grid',
          id: 'toggle-grid',
          onClick: function () {
            if (grid) grid.visible = !grid.visible;
            if (axes) axes.visible = !axes.visible;
          }
        },
        {
          label: '🎯 Reset View',
          id: 'reset-view',
          onClick: function () {
            if (controls) controls.reset();
          }
        }
      ],

      onInit: function (h) {
        h.loadScripts([
          'https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.min.js',
          'https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/loaders/PCDLoader.js',
          'https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/controls/OrbitControls.js'
        ]);
      },

      onFile: function (file, content, h) {
        currentFile = file;
        h.showLoading('Preparing 3D engine...');

        var checkDeps = function () {
          if (typeof THREE !== 'undefined' && THREE.PCDLoader && THREE.OrbitControls) {
            renderPCD(file, content, h);
          } else {
            setTimeout(checkDeps, 100);
          }
        };
        checkDeps();
      },

      onDestroy: function () {
        cleanup();
        if (renderer) {
          renderer.dispose();
          if (renderer.forceContextLoss) renderer.forceContextLoss();
          if (renderer.domElement) renderer.domElement.remove();
          renderer = null;
        }
        scene = null;
        camera = null;
        controls = null;
      }
    });
  };

  /**
   * Renders the PCD file content into the mount element
   */
  function renderPCD(file, content, h) {
    try {
      var loader = new THREE.PCDLoader();
      var mesh = loader.parse(content);

      if (!mesh || !mesh.geometry || !mesh.geometry.attributes.position) {
        throw new Error('No geometry data found in PCD file.');
      }

      var pointCount = mesh.geometry.attributes.position.count;
      cleanup();

      var containerId = 'pcd-viewport-' + Math.random().toString(36).substr(2, 9);
      var sizeMB = (file.size / (1024 * 1024)).toFixed(2) + ' MB';

      var html = 
        '<div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 border border-surface-100">' +
          '<span class="font-semibold text-surface-800">' + esc(file.name) + '</span>' +
          '<span class="text-surface-300">|</span>' +
          '<span>' + sizeMB + '</span>' +
          '<span class="text-surface-300">|</span>' +
          '<span class="bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full text-xs font-medium">' + pointCount.toLocaleString() + ' points</span>' +
        '</div>' +
        '<div id="' + containerId + '" class="relative rounded-2xl overflow-hidden border border-surface-200 bg-neutral-900" style="height: 500px; min-height: 400px;">' +
          '<div class="pcd-canvas-host w-full h-full"></div>' +
          '<div class="absolute top-4 left-4 pointer-events-none">' +
            '<div class="bg-black/50 backdrop-blur-md border border-white/10 p-3 rounded-lg text-white text-xs font-mono">' +
              '<div>Format: PCD</div>' +
              '<div id="pcd-bounds-info">Size: Calculating...</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="mt-6">' +
          '<h3 class="font-semibold text-surface-800 mb-2">Metadata</h3>' +
          '<div class="rounded-xl border border-surface-200 overflow-hidden">' +
            '<table class="min-w-full text-sm">' +
              '<tr class="border-b border-surface-100"><td class="px-4 py-2 bg-surface-50 font-medium w-1/3">Points</td><td class="px-4 py-2">' + pointCount.toLocaleString() + '</td></tr>' +
              '<tr><td class="px-4 py-2 bg-surface-50 font-medium">Dimensions</td><td id="pcd-table-bounds" class="px-4 py-2">-</td></tr>' +
            '</table>' +
          '</div>' +
        '</div>';

      h.render(html);
      
      var viewport = document.getElementById(containerId);
      var mount = viewport.querySelector('.pcd-canvas-host');

      if (!renderer) {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0a0a0b);
        camera = new THREE.PerspectiveCamera(45, mount.clientWidth / mount.clientHeight, 0.01, 10000);
        renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(mount.clientWidth, mount.clientHeight);
        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        
        var animate = function () {
          animationId = requestAnimationFrame(animate);
          if (controls) controls.update();
          if (renderer && scene && camera) renderer.render(scene, camera);
        };
        animate();
      }

      points = mesh;
      points.geometry.computeBoundingBox();
      var box = points.geometry.boundingBox;
      var center = new THREE.Vector3();
      box.getCenter(center);
      var size = new THREE.Vector3();
      box.getSize(size);
      var maxDim = Math.max(size.x, size.y, size.z) || 1;
      points.position.set(-center.x, -center.y, -center.z);

      var boundsStr = size.x.toFixed(2) + ' × ' + size.y.toFixed(2) + ' × ' + size.z.toFixed(2);
      var bInfo = document.getElementById('pcd-bounds-info');
      if (bInfo) bInfo.textContent = 'Size: ' + boundsStr;
      var tBounds = document.getElementById('pcd-table-bounds');
      if (tBounds) tBounds.textContent = boundsStr;

      points.material.size = maxDim / 300;
      pointSize = points.material.size;
      points.material.sizeAttenuation = true;
      
      if (!points.geometry.attributes.color) {
        points.material.color.setHex(0x3b82f6);
        points.material.vertexColors = false;
      } else {
        points.material.vertexColors = true;
        points.material.color.setHex(0xffffff);
      }
      
      scene.add(points);

      grid = new THREE.GridHelper(maxDim * 2, 20, 0x333333, 0x222222);
      grid.rotation.x = Math.PI / 2;
      scene.add(grid);
      
      axes = new THREE.AxesHelper(maxDim * 0.5);
      scene.add(axes);

      camera.position.set(maxDim * 1.2, maxDim * 1.2, maxDim * 1.2);
      camera.lookAt(0, 0, 0);
      camera.near = maxDim / 1000;
      camera.far = maxDim * 100;
      camera.updateProjectionMatrix();
      
      mount.appendChild(renderer.domElement);

      resizeObserver = new ResizeObserver(function() {
        var rect = viewport.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        camera.aspect = rect.width / rect.height;
        camera.updateProjectionMatrix();
        renderer.setSize(rect.width, rect.height);
      });
      resizeObserver.observe(viewport);

    } catch (err) {
      console.error(err);
      h.showError('Rendering Error', err.message);
    }
  }

})();
