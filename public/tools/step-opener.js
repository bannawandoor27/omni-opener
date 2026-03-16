(function() {
  'use strict';

  var scene, camera, renderer, controls, animationId, resizeObserver;
  var modelGroup;
  var isAutoRotate = true;
  var isWireframe = false;

  function formatSize(b) {
    return b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : b > 1e3 ? (b / 1024).toFixed(0) + ' KB' : b + ' B';
  }

  function esc(str) {
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.step,.stp',
      dropLabel: 'Drop a .step file here',
      binary: true,
      onInit: function(helpers) {
        // Load dependencies
        helpers.loadScript('https://cdn.jsdelivr.net/npm/three@0.163.0/build/three.min.js', function() {
          // OrbitControls from a version that still has the js/ folder for easy loading
          helpers.loadScript('https://cdn.jsdelivr.net/npm/three@0.149.0/examples/js/controls/OrbitControls.js', function() {
            helpers.loadScript('https://cdn.jsdelivr.net/npm/occt-import-js@0.0.12/dist/occt-import-js.js', function() {
              // Set initial button styles
              var rotateBtn = helpers.getMountEl().querySelector('#omni-action-rotate');
              if (rotateBtn) {
                rotateBtn.style.backgroundColor = isAutoRotate ? 'rgb(239 246 255)' : '';
                rotateBtn.style.borderColor = isAutoRotate ? 'rgb(59 130 246)' : '';
                rotateBtn.style.color = isAutoRotate ? 'rgb(29 78 216)' : '';
              }
            });
          });
        });
      },
      onFile: function(file, content, helpers) {
        if (file.size > 20 * 1024 * 1024) {
          if (!confirm('This file is larger than 20MB. Parsing may be slow. Continue?')) {
            helpers.reset();
            return;
          }
        }

        helpers.showLoading('Parsing step file...');

        // Ensure occtImportJs is available
        if (typeof occtImportJs === 'undefined') {
          var checkOcct = setInterval(function() {
            if (typeof occtImportJs !== 'undefined') {
              clearInterval(checkOcct);
              parseAndRender();
            }
          }, 100);
          return;
        }

        parseAndRender();

        async function parseAndRender() {
          try {
            const occt = await occtImportJs();
            const result = occt.ReadStep(new Uint8Array(content), 0.05);

            if (!result || !result.success || !result.meshes || result.meshes.length === 0) {
              throw new Error('Failed to parse STEP file or file is empty.');
            }

            render3D(result, file, helpers);
          } catch (e) {
            console.error(e);
            helpers.showError('Could not parse step file', e.message || 'Unknown error');
          }
        }
      },
      actions: [
        {
          label: '🔄 Auto-Rotate',
          id: 'rotate',
          onClick: function(helpers, btn) {
            isAutoRotate = !isAutoRotate;
            if (controls) controls.autoRotate = isAutoRotate;
            btn.style.backgroundColor = isAutoRotate ? 'rgb(239 246 255)' : '';
            btn.style.borderColor = isAutoRotate ? 'rgb(59 130 246)' : '';
            btn.style.color = isAutoRotate ? 'rgb(29 78 216)' : '';
          }
        },
        {
          label: '🌐 Wireframe',
          id: 'wire',
          onClick: function(helpers, btn) {
            isWireframe = !isWireframe;
            if (modelGroup) {
              modelGroup.traverse(function(node) {
                if (node.isMesh) {
                  if (Array.isArray(node.material)) {
                    node.material.forEach(m => m.wireframe = isWireframe);
                  } else {
                    node.material.wireframe = isWireframe;
                  }
                }
              });
            }
            btn.style.backgroundColor = isWireframe ? 'rgb(239 246 255)' : '';
            btn.style.borderColor = isWireframe ? 'rgb(59 130 246)' : '';
            btn.style.color = isWireframe ? 'rgb(29 78 216)' : '';
          }
        },
        {
          label: '📋 Copy Stats',
          id: 'copy',
          onClick: function(helpers, btn) {
            var stats = helpers.getState().stats;
            if (stats) {
              var text = 'Model: ' + helpers.getFile().name + '\n' +
                         'Vertices: ' + stats.vertices + '\n' +
                         'Faces: ' + stats.faces + '\n' +
                         'Meshes: ' + stats.meshes;
              helpers.copyToClipboard(text, btn);
            }
          }
        },
        {
          label: '📥 Download',
          id: 'dl',
          onClick: function(helpers) {
            helpers.download(helpers.getFile().name, helpers.getContent());
          }
        }
      ],
      infoHtml: '<strong>Privacy:</strong> 100% client-side. Your files never leave your device. Uses WebAssembly for high-performance CAD parsing.'
    });
  };

  function render3D(result, file, helpers) {
    cleanup();

    var vertexCount = 0;
    var faceCount = 0;
    var meshCount = result.meshes.length;

    result.meshes.forEach(function(m) {
      vertexCount += m.attributes.position.array.length / 3;
      if (m.index) {
        faceCount += m.index.array.length / 3;
      } else {
        faceCount += m.attributes.position.array.length / 9;
      }
    });

    helpers.setState('stats', {
      vertices: vertexCount.toLocaleString(),
      faces: Math.floor(faceCount).toLocaleString(),
      meshes: meshCount.toLocaleString()
    });

    var html = 
      '<div class="flex items-center gap-3 p-3 bg-surface-50 rounded-lg text-sm text-surface-600 mb-4">' +
        '<span class="font-medium">' + esc(file.name) + '</span>' +
        '<span class="text-surface-400">·</span>' +
        '<span>' + formatSize(file.size) + '</span>' +
        '<span class="ml-auto flex items-center gap-4">' +
          '<span>' + vertexCount.toLocaleString() + ' vertices</span>' +
          '<span>' + Math.floor(faceCount).toLocaleString() + ' faces</span>' +
        '</span>' +
      '</div>' +
      '<div class="relative w-full h-[600px] bg-slate-900 rounded-xl overflow-hidden shadow-inner border border-surface-200">' +
        '<div id="step-canvas-mount" class="w-full h-full cursor-move"></div>' +
        '<div class="absolute bottom-4 left-4 pointer-events-none">' +
          '<div class="px-3 py-2 bg-black/50 backdrop-blur-md rounded-lg text-[10px] text-white/80 uppercase tracking-widest font-bold">' +
            'Drag to Rotate • Right Click to Pan • Scroll to Zoom' +
          '</div>' +
        '</div>' +
      '</div>';

    helpers.render(html);

    var mountEl = document.getElementById('step-canvas-mount');
    
    // Setup Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a); // slate-900

    camera = new THREE.PerspectiveCamera(45, mountEl.clientWidth / mountEl.clientHeight, 0.1, 10000);
    
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(mountEl.clientWidth, mountEl.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    mountEl.appendChild(renderer.domElement);

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    var dirLight1 = new THREE.DirectionalLight(0xffffff, 1);
    dirLight1.position.set(100, 100, 100);
    scene.add(dirLight1);
    var dirLight2 = new THREE.DirectionalLight(0xffffff, 0.5);
    dirLight2.position.set(-100, -100, -100);
    scene.add(dirLight2);

    // Controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = isAutoRotate;

    // Build Model
    modelGroup = new THREE.Group();
    result.meshes.forEach(function(m) {
      var geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(m.attributes.position.array, 3));
      if (m.attributes.normal) {
        geometry.setAttribute('normal', new THREE.BufferAttribute(m.attributes.normal.array, 3));
      } else {
        geometry.computeVertexNormals();
      }
      if (m.index) {
        geometry.setIndex(new THREE.BufferAttribute(m.index.array, 1));
      }

      var color = 0x6366f1; // brand indigo
      if (m.color) {
        color = new THREE.Color(m.color[0], m.color[1], m.color[2]);
      }

      var material = new THREE.MeshPhongMaterial({
        color: color,
        specular: 0x111111,
        shininess: 30,
        wireframe: isWireframe,
        side: THREE.DoubleSide
      });

      var mesh = new THREE.Mesh(geometry, material);
      modelGroup.add(mesh);
    });

    // Center and Scale
    var box = new THREE.Box3().setFromObject(modelGroup);
    var center = box.getCenter(new THREE.Vector3());
    var size = box.getSize(new THREE.Vector3());
    
    modelGroup.position.set(-center.x, -center.y, -center.z);
    scene.add(modelGroup);

    var maxDim = Math.max(size.x, size.y, size.z);
    var fov = camera.fov * (Math.PI / 180);
    var cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 2;
    if (cameraZ === 0) cameraZ = 10;
    
    camera.position.set(cameraZ, cameraZ, cameraZ);
    camera.lookAt(0, 0, 0);
    controls.update();

    // Animation
    function animate() {
      if (!document.getElementById('step-canvas-mount')) return;
      animationId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    // Resize
    resizeObserver = new ResizeObserver(function() {
      if (mountEl.clientWidth > 0 && mountEl.clientHeight > 0) {
        camera.aspect = mountEl.clientWidth / mountEl.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(mountEl.clientWidth, mountEl.clientHeight);
      }
    });
    resizeObserver.observe(mountEl);
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
      scene.traverse(function(node) {
        if (node.isMesh) {
          if (node.geometry) node.geometry.dispose();
          if (node.material) {
            if (Array.isArray(node.material)) {
              node.material.forEach(m => m.dispose());
            } else {
              node.material.dispose();
            }
          }
        }
      });
      scene.clear();
    }
    renderer = null; scene = null; camera = null; controls = null;
  }
})();
