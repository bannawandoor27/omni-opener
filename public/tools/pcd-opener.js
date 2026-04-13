/**
 * OmniOpener — PCD (Point Cloud) Viewer Tool
 * Uses OmniTool SDK and Three.js to render .pcd files in the browser.
 */
(function () {
  'use strict';

  var scene, camera, renderer, controls, points;
  var animationId;

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      accept: '.pcd',
      dropLabel: 'Drop a .pcd file here',
      infoHtml: '<strong>How it works:</strong> This tool uses Three.js to parse and render Point Cloud Data (.pcd) files directly in your browser. It supports both ASCII and binary PCD formats.',

      actions: [
        {
          label: '📸 Save Image',
          id: 'screenshot',
          onClick: function (h) {
            if (renderer) {
              renderer.render(scene, camera);
              var dataUrl = renderer.domElement.toDataURL('image/png');
              h.download('pointcloud.png', dataUrl, 'image/png');
            }
          }
        },
        {
          label: '📊 Copy Stats',
          id: 'copy-stats',
          onClick: function (h, btn) {
            if (points && points.geometry) {
              var count = points.geometry.attributes.position.count;
              var box = new THREE.Box3().setFromObject(points);
              var size = box.getSize(new THREE.Vector3());
              var text = 'File: ' + h.getFile().name + '\n' +
                         'Points: ' + count.toLocaleString() + '\n' +
                         'Bounds: ' + size.x.toFixed(3) + ' x ' + size.y.toFixed(3) + ' x ' + size.z.toFixed(3);
              h.copyToClipboard(text, btn);
            }
          }
        },
        {
          label: '➕ Bigger',
          id: 'points-plus',
          onClick: function () {
            if (points && points.material) {
              points.material.size *= 1.4;
              points.material.needsUpdate = true;
            }
          }
        },
        {
          label: '➖ Smaller',
          id: 'points-minus',
          onClick: function () {
            if (points && points.material) {
              points.material.size /= 1.4;
              points.material.needsUpdate = true;
            }
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
        h.showLoading('Loading point cloud…');
        
        function tryRender() {
          if (typeof THREE === 'undefined' || typeof THREE.PCDLoader === 'undefined' || typeof THREE.OrbitControls === 'undefined') {
            setTimeout(tryRender, 200);
            return;
          }

          try {
            initScene();
            var loader = new THREE.PCDLoader();
            // PCDLoader.parse expects ArrayBuffer for binary or string for ASCII
            var mesh = loader.parse(content);
            
            if (points) scene.remove(points);
            points = mesh;
            
            // Auto-color if no colors present
            if (!points.material.vertexColors) {
              points.material.color.setHex(0x00ff00);
            }
            points.material.size = 0.01;
            
            scene.add(points);

            // Center and scale
            var box = new THREE.Box3().setFromObject(points);
            var center = box.getCenter(new THREE.Vector3());
            var size = box.getSize(new THREE.Vector3());
            var maxDim = Math.max(size.x, size.y, size.z) || 1;
            
            points.position.x = -center.x;
            points.position.y = -center.y;
            points.position.z = -center.z;
            
            camera.near = maxDim / 1000;
            camera.far = maxDim * 1000;
            camera.position.z = maxDim * 1.5;
            camera.updateProjectionMatrix();

            controls.maxDistance = maxDim * 10;
            controls.reset();
            controls.update();

            h.render('<div id="pcd-viewport" style="width:100%; height:600px; background:#000; position:relative; overflow:hidden; border-radius: 8px;"></div>');
            var container = document.getElementById('pcd-viewport');
            container.appendChild(renderer.domElement);
            
            resizeViewport();
            window.removeEventListener('resize', resizeViewport);
            window.addEventListener('resize', resizeViewport);
          } catch (err) {
            h.showError('Render Error', err.message);
          }
        }

        tryRender();
      },

      onDestroy: function () {
        if (animationId) cancelAnimationFrame(animationId);
        window.removeEventListener('resize', resizeViewport);
        if (renderer) {
          renderer.dispose();
          if (renderer.forceContextLoss) renderer.forceContextLoss();
          if (renderer.domElement && renderer.domElement.parentNode) {
            renderer.domElement.parentNode.removeChild(renderer.domElement);
          }
          renderer = null;
        }
      }
    });
  };

  function initScene() {
    if (renderer) return;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0a);

    camera = new THREE.PerspectiveCamera(45, 1, 0.01, 10000);
    camera.position.set(0, 0, 10);

    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(window.devicePixelRatio);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    animate();
  }

  function animate() {
    animationId = requestAnimationFrame(animate);
    if (controls) controls.update();
    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }
  }

  function resizeViewport() {
    var container = document.getElementById('pcd-viewport');
    if (!container || !renderer) return;
    
    var width = container.clientWidth;
    var height = container.clientHeight || 600;
    
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }

})();
