(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    let scene, camera, renderer, controls, points, animationId, grid, axes;
    let currentFile = null;
    let pointSize = 0.005;
    let colorMode = 'original'; // 'original', 'height', 'solid'

    const cleanup = () => {
      if (animationId) cancelAnimationFrame(animationId);
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
    };

    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      accept: '.pcd',
      dropLabel: 'Drop a .pcd file here',
      infoHtml: '<strong>PCD Viewer:</strong> Professional Point Cloud Data renderer using Three.js. Supports ASCII and Binary formats with real-time visualization controls.',

      actions: [
        {
          label: '📸 Capture',
          id: 'screenshot',
          onClick: function (h) {
            if (!renderer || !scene || !camera) return;
            h.showLoading('Capturing view...');
            renderer.render(scene, camera);
            renderer.domElement.toBlob(function (blob) {
              h.hideLoading();
              if (blob) {
                const name = currentFile ? currentFile.name.replace(/\.[^/.]+$/, "") : 'point-cloud';
                h.download(`${name}.png`, blob, 'image/png');
              } else {
                h.showError('Capture Failed', 'Failed to generate image from canvas.');
              }
            }, 'image/png');
          }
        },
        {
          label: '🎨 Color Mode',
          id: 'toggle-color',
          onClick: function (h) {
            if (!points) return;
            const modes = ['original', 'height', 'solid'];
            colorMode = modes[(modes.indexOf(colorMode) + 1) % modes.length];
            
            if (colorMode === 'solid') {
              points.material.vertexColors = false;
              points.material.color.setHex(0x3b82f6);
            } else if (colorMode === 'height') {
              points.material.vertexColors = true;
              const pos = points.geometry.attributes.position;
              const count = pos.count;
              const colors = new Float32Array(count * 3);
              let minZ = Infinity, maxZ = -Infinity;
              for (let i = 0; i < count; i++) {
                const z = pos.getZ(i);
                if (z < minZ) minZ = z;
                if (z > maxZ) maxZ = z;
              }
              const range = maxZ - minZ || 1;
              const color = new THREE.Color();
              for (let i = 0; i < count; i++) {
                const hVal = (pos.getZ(i) - minZ) / range;
                color.setHSL(0.66 * (1 - hVal), 1, 0.5);
                colors[i * 3] = color.r;
                colors[i * 3 + 1] = color.g;
                colors[i * 3 + 2] = color.b;
              }
              points.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
            } else {
              points.material.vertexColors = points.geometry.attributes.color ? true : false;
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
          label: '🎯 Reset',
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

      onFile: function _onFile(file, content, h) {
        currentFile = file;
        h.showLoading('Preparing 3D engine...');

        const initScene = () => {
          try {
            if (typeof THREE === 'undefined' || !THREE.PCDLoader || !THREE.OrbitControls) {
              setTimeout(initScene, 100);
              return;
            }

            h.showLoading('Parsing point cloud...');
            const loader = new THREE.PCDLoader();
            const mesh = loader.parse(content);

            if (!mesh || !mesh.geometry || !mesh.geometry.attributes.position) {
              throw new Error('Invalid PCD data: No geometry found.');
            }

            const pointCount = mesh.geometry.attributes.position.count;
            if (pointCount === 0) {
              h.showError('Empty Cloud', 'This file contains zero points.');
              return;
            }

            cleanup();

            const containerId = 'pcd-viewport-' + Math.random().toString(36).substr(2, 9);
            const html = `
              <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 border border-surface-100">
                <span class="font-semibold text-surface-800">${h.escape(file.name)}</span>
                <span class="text-surface-300">|</span>
                <span>${h.formatSize(file.size)}</span>
                <span class="text-surface-300">|</span>
                <span class="bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full text-xs font-medium">${pointCount.toLocaleString()} points</span>
              </div>

              <div id="${containerId}" class="relative group rounded-2xl overflow-hidden border border-surface-200 bg-neutral-950 shadow-2xl" style="height: 600px; min-height: 50vh;">
                <div class="pcd-canvas-host w-full h-full"></div>
                
                <div class="absolute top-4 left-4 flex flex-col gap-2 pointer-events-none">
                  <div class="bg-black/40 backdrop-blur-md border border-white/10 p-3 rounded-lg text-white/90 text-xs font-mono space-y-1">
                    <div class="flex justify-between gap-4"><span>Points:</span> <span class="text-brand-400">${pointCount.toLocaleString()}</span></div>
                    <div class="flex justify-between gap-4"><span>Format:</span> <span class="text-brand-400">PCD</span></div>
                    <div id="pcd-bounds-info"></div>
                  </div>
                </div>

                <div class="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                  <div class="bg-black/60 backdrop-blur-xl px-4 py-2 rounded-full border border-white/10 flex items-center gap-4 text-[10px] text-white/70 uppercase tracking-widest whitespace-nowrap shadow-2xl">
                    <span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-blue-500"></span> Rotate</span>
                    <span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-emerald-500"></span> Pan</span>
                    <span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-amber-500"></span> Zoom</span>
                  </div>
                </div>
              </div>

              <div class="mt-6">
                <div class="flex items-center justify-between mb-3">
                  <h3 class="font-semibold text-surface-800">Metadata & Statistics</h3>
                  <span class="text-xs text-surface-400">Geometry Details</span>
                </div>
                <div class="overflow-x-auto rounded-xl border border-surface-200">
                  <table class="min-w-full text-sm">
                    <thead>
                      <tr class="bg-surface-50">
                        <th class="px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Attribute</th>
                        <th class="px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Value</th>
                        <th class="px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr class="hover:bg-brand-50/50 transition-colors">
                        <td class="px-4 py-2 font-mono text-xs text-brand-600 border-b border-surface-100">points_total</td>
                        <td class="px-4 py-2 text-surface-700 border-b border-surface-100">${pointCount.toLocaleString()}</td>
                        <td class="px-4 py-2 text-surface-400 border-b border-surface-100">Total vertices in buffer</td>
                      </tr>
                      <tr class="even:bg-surface-50 hover:bg-brand-50/50 transition-colors">
                        <td class="px-4 py-2 font-mono text-xs text-brand-600 border-b border-surface-100">attributes</td>
                        <td class="px-4 py-2 text-surface-700 border-b border-surface-100">${Object.keys(mesh.geometry.attributes).join(', ')}</td>
                        <td class="px-4 py-2 text-surface-400 border-b border-surface-100">Available data channels</td>
                      </tr>
                      <tr class="hover:bg-brand-50/50 transition-colors">
                        <td class="px-4 py-2 font-mono text-xs text-brand-600 border-b border-surface-100">bounding_box</td>
                        <td id="pcd-table-bounds" class="px-4 py-2 text-surface-700 border-b border-surface-100">Calculating...</td>
                        <td class="px-4 py-2 text-surface-400 border-b border-surface-100">Physical dimensions</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            `;

            h.render(html);
            const viewport = document.getElementById(containerId);
            const mount = viewport.querySelector('.pcd-canvas-host');

            if (!renderer) {
              scene = new THREE.Scene();
              scene.background = new THREE.Color(0x0a0a0b);
              camera = new THREE.PerspectiveCamera(45, mount.clientWidth / mount.clientHeight, 0.01, 10000);
              renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
              renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
              renderer.setSize(mount.clientWidth, mount.clientHeight);
              controls = new THREE.OrbitControls(camera, renderer.domElement);
              controls.enableDamping = true;
              controls.dampingFactor = 0.08;
              const animate = () => {
                animationId = requestAnimationFrame(animate);
                if (controls) controls.update();
                if (renderer && scene && camera) renderer.render(scene, camera);
              };
              animate();
            }

            points = mesh;
            points.geometry.computeBoundingBox();
            const box = points.geometry.boundingBox;
            const center = new THREE.Vector3();
            box.getCenter(center);
            const size = new THREE.Vector3();
            box.getSize(size);
            const maxDim = Math.max(size.x, size.y, size.z) || 1;
            points.position.set(-center.x, -center.y, -center.z);

            const boundsStr = `${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)}`;
            const boundsEl = document.getElementById('pcd-bounds-info');
            if (boundsEl) boundsEl.textContent = `Size: ${boundsStr}`;
            const tableBoundsEl = document.getElementById('pcd-table-bounds');
            if (tableBoundsEl) tableBoundsEl.textContent = boundsStr;

            points.material.size = maxDim / 250;
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

            grid = new THREE.GridHelper(maxDim * 2, 20, 0x444444, 0x222222);
            grid.rotation.x = Math.PI / 2;
            scene.add(grid);
            axes = new THREE.AxesHelper(maxDim * 0.5);
            scene.add(axes);

            camera.position.set(maxDim * 1.5, maxDim * 1.5, maxDim * 1.5);
            camera.lookAt(0, 0, 0);
            camera.near = maxDim / 1000;
            camera.far = maxDim * 100;
            camera.updateProjectionMatrix();
            mount.appendChild(renderer.domElement);

            const onResize = () => {
              const rect = viewport.getBoundingClientRect();
              if (rect.width === 0 || rect.height === 0) return;
              camera.aspect = rect.width / rect.height;
              camera.updateProjectionMatrix();
              renderer.setSize(rect.width, rect.height);
            };
            const resizeObserver = new ResizeObserver(onResize);
            resizeObserver.observe(viewport);
            h.hideLoading();
          } catch (err) {
            console.error('[PCD Error]', err);
            h.showError('Visualization Failed', 'Could not render point cloud. ' + err.message);
          }
        };
        initScene();
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
        currentFile = null;
      }
    });
  };
})();
