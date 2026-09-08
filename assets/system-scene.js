/* A small native WebGL study: the portfolio remains readable without this canvas. */
(() => {
  'use strict';

  const canvas = document.querySelector('#system-scene');
  const host = canvas?.closest('[data-scene]');
  if (!canvas || !host) return;

  const toggle = host.querySelector('[data-scene-toggle]') || document.querySelector('[data-scene-toggle]');
  const views = [...document.querySelectorAll('[data-scene-view]')];
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const coarsePointer = window.matchMedia('(pointer: coarse)');
  const label = toggle?.querySelector('[data-scene-toggle-label]');
  const description = document.querySelector('[data-scene-description]');
  const states = {
    system: { turn: 0, separation: 0.63, tilt: 0, description: '세 층으로 나눈 시스템 구성을 살펴봅니다.' },
    data: { turn: 0.52, separation: 0.84, tilt: -0.04, description: '층 사이를 넓혀 안쪽 구조를 살펴봅니다.' },
    recovery: { turn: -0.48, separation: 0.45, tilt: 0.045, description: '층 사이를 좁히고 반대쪽에서 구조를 봅니다.' },
  };

  let gl;
  let resources;
  let frame = 0;
  let lastTime = 0;
  let elapsed = 0;
  let intersecting = true;
  let paused = false;
  let lost = false;
  let targetView = 'system';
  let turn = 0;
  let separation = states.system.separation;
  let tilt = 0;
  let pointerX = 0;
  let pointerY = 0;
  let smoothX = 0;
  let smoothY = 0;
  let dimensions = { width: 0, height: 0 };

  const vertexSource = `
    attribute vec3 aPosition;
    attribute vec3 aNormal;
    uniform mat4 uModel;
    uniform mat4 uViewProjection;
    varying vec3 vWorld;
    varying vec3 vNormal;
    varying vec3 vLocal;
    void main() {
      vec4 world = uModel * vec4(aPosition, 1.0);
      vWorld = world.xyz;
      vLocal = aPosition;
      vNormal = normalize(mat3(uModel) * aNormal);
      gl_Position = uViewProjection * world;
    }
  `;

  const fragmentSource = `
    precision mediump float;
    uniform vec3 uColor;
    uniform vec3 uEye;
    uniform float uRoughness;
    uniform float uMaterial;
    uniform float uOpacity;
    varying vec3 vWorld;
    varying vec3 vNormal;
    varying vec3 vLocal;
    void main() {
      if (uMaterial > 1.5) {
        float alpha = uOpacity;
        if (uMaterial < 2.5) alpha *= exp(-dot(vLocal.xz, vLocal.xz) * 0.56);
        gl_FragColor = vec4(uColor, alpha);
        return;
      }
      if (uMaterial > 0.5) {
        gl_FragColor = vec4(uColor, uOpacity);
        return;
      }

      vec3 n = normalize(vNormal);
      vec3 view = normalize(uEye - vWorld);
      vec3 key = normalize(vec3(-3.8, 6.0, 3.4));
      vec3 fill = normalize(vec3(4.0, 1.5, 0.5));
      vec3 rim = normalize(vec3(0.5, 2.8, -4.0));
      float ndv = max(dot(n, view), 0.0);
      float diffuse = 0.22 + max(dot(n, key), 0.0) * 0.88;
      diffuse += max(dot(n, fill), 0.0) * 0.22;
      vec3 halfway = normalize(key + view);
      float exponent = mix(120.0, 20.0, uRoughness);
      float specular = pow(max(dot(n, halfway), 0.0), exponent);
      float edgeLight = pow(max(dot(n, normalize(rim + view)), 0.0), 28.0);
      float fresnel = pow(1.0 - ndv, 3.0);

      // Broad analytic light reflections keep the bevels legible without texture assets.
      vec3 reflection = reflect(-view, n);
      float softbox = smoothstep(0.60, 0.92, dot(reflection, key));
      float strip = pow(max(0.0, dot(reflection, normalize(vec3(-0.8, 1.4, -0.5)))), 14.0);
      vec3 light = uColor * diffuse;
      light += vec3(1.0, 0.95, 0.84) * (specular * 1.05 + softbox * 0.20);
      light += vec3(0.83, 0.85, 0.65) * (edgeLight * 0.30 + strip * 0.12);
      light += vec3(0.43, 0.43, 0.36) * fresnel * 0.19;
      light *= 0.91 + smoothstep(-1.0, 1.0, vWorld.y) * 0.09;
      light = light / (light + vec3(0.68));
      gl_FragColor = vec4(pow(light, vec3(0.82)), uOpacity);
    }
  `;

  function multiply(a, b) {
    const out = new Float32Array(16);
    for (let column = 0; column < 4; column += 1) {
      for (let row = 0; row < 4; row += 1) {
        out[column * 4 + row] = a[row] * b[column * 4]
          + a[4 + row] * b[column * 4 + 1]
          + a[8 + row] * b[column * 4 + 2]
          + a[12 + row] * b[column * 4 + 3];
      }
    }
    return out;
  }

  function transform(x = 0, y = 0, z = 0, yaw = 0, pitch = 0) {
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const cx = Math.cos(pitch);
    const sx = Math.sin(pitch);
    return new Float32Array([
      cy, 0, -sy, 0,
      sy * sx, cx, cy * sx, 0,
      sy * cx, -sx, cy * cx, 0,
      x, y, z, 1,
    ]);
  }

  function normalize(v) {
    const length = Math.hypot(...v) || 1;
    return v.map((value) => value / length);
  }

  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

  function camera(aspect) {
    const eye = [3.91, 2.82, 5.10];
    const z = normalize([eye[0], eye[1] - 0.05, eye[2]]);
    const x = normalize(cross([0, 1, 0], z));
    const y = cross(z, x);
    const view = new Float32Array([
      x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0,
      -dot(x, eye), -dot(y, eye), -dot(z, eye), 1,
    ]);
    const near = 0.1;
    const far = 35;
    const field = aspect < 0.8 ? 0.64 : 0.57;
    const f = 1 / Math.tan(field / 2);
    const projection = new Float32Array([
      f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1,
      0, 0, (2 * far * near) / (near - far), 0,
    ]);
    return { matrix: multiply(projection, view), eye };
  }

  function contour(width, depth, radius, segments = 10) {
    const points = [];
    for (let corner = 0; corner < 4; corner += 1) {
      const centerX = corner === 0 || corner === 3 ? width / 2 - radius : -width / 2 + radius;
      const centerZ = corner < 2 ? depth / 2 - radius : -depth / 2 + radius;
      for (let step = 0; step <= segments; step += 1) {
        const angle = corner * Math.PI / 2 + (step / segments) * Math.PI / 2;
        points.push([centerX + Math.cos(angle) * radius, centerZ + Math.sin(angle) * radius, Math.cos(angle), Math.sin(angle)]);
      }
    }
    return points;
  }

  function roundedBox(width, height, depth, radius, bevel) {
    const positions = [];
    const normals = [];
    const rings = [];
    const profiles = [];
    const steps = 4;
    for (let step = 0; step <= steps; step += 1) {
      const angle = -Math.PI / 2 + (step / steps) * Math.PI / 2;
      profiles.push({ y: -height / 2 + bevel + Math.sin(angle) * bevel, inset: bevel * (1 - Math.cos(angle)), ny: Math.sin(angle), side: Math.cos(angle) });
    }
    for (let step = 0; step <= steps; step += 1) {
      const angle = (step / steps) * Math.PI / 2;
      profiles.push({ y: height / 2 - bevel + Math.sin(angle) * bevel, inset: bevel * (1 - Math.cos(angle)), ny: Math.sin(angle), side: Math.cos(angle) });
    }
    for (const profile of profiles) {
      rings.push(contour(width - profile.inset * 2, depth - profile.inset * 2, Math.max(0.002, radius - profile.inset)).map(([x, z, nx, nz]) => ({ p: [x, profile.y, z], n: [nx * profile.side, profile.ny, nz * profile.side] })));
    }
    const add = (a, b, c) => {
      for (const vertex of [a, b, c]) {
        positions.push(...vertex.p);
        normals.push(...vertex.n);
      }
    };
    const count = rings[0].length;
    for (let level = 0; level < rings.length - 1; level += 1) {
      for (let point = 0; point < count; point += 1) {
        const next = (point + 1) % count;
        add(rings[level][point], rings[level + 1][point], rings[level][next]);
        add(rings[level][next], rings[level + 1][point], rings[level + 1][next]);
      }
    }
    for (const [index, sign] of [[0, -1], [rings.length - 1, 1]]) {
      const center = { p: [0, sign * height / 2, 0], n: [0, sign, 0] };
      for (let point = 0; point < count; point += 1) add(center, rings[index][point], rings[index][(point + 1) % count]);
    }
    return { positions, normals };
  }

  function ring(width, depth, radius, y, thickness = 0.009) {
    const outside = contour(width, depth, radius);
    const inside = contour(width - thickness * 2, depth - thickness * 2, radius - thickness);
    const positions = [];
    const normals = [];
    for (let i = 0; i < outside.length; i += 1) {
      const j = (i + 1) % outside.length;
      for (const point of [outside[i], inside[i], outside[j], outside[j], inside[i], inside[j]]) {
        positions.push(point[0], y, point[1]);
        normals.push(0, 1, 0);
      }
    }
    return { positions, normals };
  }

  function lines(paths) {
    const positions = [];
    const normals = [];
    for (const path of paths) {
      for (let point = 0; point < path.length - 1; point += 1) {
        positions.push(...path[point], ...path[point + 1]);
        normals.push(0, 1, 0, 0, 1, 0);
      }
    }
    return { positions, normals, lines: true };
  }

  function buildResources() {
    const buffers = [];
    const shaders = [];
    let program;
    try {
      const shader = (kind, source) => {
        const result = gl.createShader(kind);
        if (!result) throw new Error('Shader allocation failed');
        shaders.push(result);
        gl.shaderSource(result, source);
        gl.compileShader(result);
        if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) throw new Error('Shader compilation failed');
        return result;
      };
      program = gl.createProgram();
      if (!program) throw new Error('Program allocation failed');
      gl.attachShader(program, shader(gl.VERTEX_SHADER, vertexSource));
      gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fragmentSource));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Program linking failed');
      gl.useProgram(program);

      const mesh = (geometry) => {
        const buffer = gl.createBuffer();
        if (!buffer) throw new Error('Buffer allocation failed');
        buffers.push(buffer);
        const data = new Float32Array(geometry.positions.length * 2);
        for (let i = 0; i < geometry.positions.length / 3; i += 1) {
          data.set(geometry.positions.slice(i * 3, i * 3 + 3), i * 6);
          data.set(geometry.normals.slice(i * 3, i * 3 + 3), i * 6 + 3);
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        return { buffer, count: data.length / 6, mode: geometry.lines ? gl.LINES : gl.TRIANGLES };
      };

      const boardPaths = [];
      for (const sign of [-1, 1]) {
        for (let i = 0; i < 4; i += 1) {
          const z = (i - 1.5) * 0.15;
          boardPaths.push([[sign * 0.58, 0.153, z], [sign * (0.76 + i * 0.06), 0.153, z], [sign * (0.76 + i * 0.06), 0.153, z + sign * 0.22], [sign * 1.09, 0.153, z + sign * 0.22]]);
        }
      }
      for (let i = -3; i <= 3; i += 1) {
        const x = i * 0.15;
        boardPaths.push([[x, 0.153, -0.5], [x, 0.153, -0.66], [x + 0.09, 0.153, -0.75]]);
        boardPaths.push([[x, 0.153, 0.5], [x, 0.153, 0.66], [x - 0.09, 0.153, 0.75]]);
      }
      const gridPaths = [];
      for (let i = -5; i <= 5; i += 1) {
        gridPaths.push([[-2.15, -1.12, i * 0.38], [2.15, -1.12, i * 0.38]]);
        gridPaths.push([[i * 0.38, -1.12, -1.9], [i * 0.38, -1.12, 1.9]]);
      }

      const meshes = {
        plate: mesh(roundedBox(2.65, 0.26, 2.02, 0.23, 0.065)),
        inset: mesh(roundedBox(2.34, 0.016, 1.71, 0.17, 0.005)),
        rim: mesh(ring(2.54, 1.91, 0.19, 0.128, 0.012)),
        lowerRim: mesh(ring(2.57, 1.94, 0.2, -0.094, 0.016)),
        chip: mesh(roundedBox(1.05, 0.14, 0.86, 0.085, 0.032)),
        chipFace: mesh(roundedBox(0.87, 0.015, 0.69, 0.035, 0.005)),
        chipRim: mesh(ring(0.94, 0.76, 0.055, 0.078, 0.009)),
        pin: mesh(roundedBox(0.14, 0.033, 0.032, 0.009, 0.007)),
        vent: mesh(roundedBox(0.018, 0.057, 0.013, 0.004, 0.004)),
        status: mesh(roundedBox(0.12, 0.02, 0.022, 0.005, 0.004)),
        traces: mesh(lines(boardPaths)),
        grid: mesh(lines(gridPaths)),
        shadow: mesh({ positions: [-3, -1.115, -3, 3, -1.115, -3, -3, -1.115, 3, 3, -1.115, -3, 3, -1.115, 3, -3, -1.115, 3], normals: Array(6).fill([0, 1, 0]).flat() }),
        mark: mesh(lines([
          [[-0.17, 0.091, -0.095], [-0.28, 0.091, 0], [-0.17, 0.091, 0.095]],
          [[0.17, 0.091, -0.095], [0.28, 0.091, 0], [0.17, 0.091, 0.095]],
          [[0.055, 0.091, -0.115], [-0.055, 0.091, 0.115]],
        ])),
      };
      const attributes = {
        position: gl.getAttribLocation(program, 'aPosition'),
        normal: gl.getAttribLocation(program, 'aNormal'),
      };
      const uniforms = Object.fromEntries(['Model', 'ViewProjection', 'Color', 'Eye', 'Roughness', 'Material', 'Opacity'].map((name) => [name, gl.getUniformLocation(program, `u${name}`)]));
      return { program, shaders, buffers, meshes, attributes, uniforms };
    } catch (error) {
      for (const buffer of buffers) gl.deleteBuffer(buffer);
      for (const shader of shaders) gl.deleteShader(shader);
      if (program) gl.deleteProgram(program);
      throw error;
    }
  }

  function updateControls() {
    const isPaused = paused || motion.matches;
    if (toggle) {
      toggle.setAttribute('aria-pressed', String(isPaused));
      const text = motion.matches ? '동작 줄이기 켜짐' : paused ? '움직임 켜기' : '움직임 멈추기';
      toggle.setAttribute('aria-label', text);
      if (label) label.textContent = text;
      else toggle.textContent = text;
      toggle.disabled = motion.matches || lost || !resources;
    }
    for (const button of views) button.setAttribute('aria-pressed', String(button.dataset.sceneView === targetView));
    if (description && description.textContent !== states[targetView].description) description.textContent = states[targetView].description;
  }

  function stop() {
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
    lastTime = 0;
  }

  function fallback() {
    stop();
    resources = null;
    host.dataset.renderer = 'fallback';
    canvas.hidden = true;
    canvas.style.visibility = 'hidden';
    updateControls();
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.7);
    const width = Math.round(rect.width * ratio);
    const height = Math.round(rect.height * ratio);
    if (dimensions.width === width && dimensions.height === height) return;
    dimensions = { width, height };
    canvas.width = width;
    canvas.height = height;
    requestRender();
  }

  function draw(time) {
    frame = 0;
    if (!resources || lost || document.hidden || !intersecting) {
      lastTime = 0;
      return;
    }
    try {
      const delta = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 1 / 60;
      lastTime = time;
      const moving = !paused && !motion.matches;
      if (moving) elapsed += delta;
      const target = states[targetView];
      const interpolation = paused ? 0 : motion.matches ? 1 : 1 - Math.exp(-delta * 8);
      turn += (target.turn - turn) * interpolation;
      separation += (target.separation - separation) * interpolation;
      tilt += (target.tilt - tilt) * interpolation;
      smoothX += ((motion.matches ? 0 : pointerX) - smoothX) * interpolation;
      smoothY += ((motion.matches ? 0 : pointerY) - smoothY) * interpolation;

      const { meshes, uniforms, attributes } = resources;
      const view = camera(Math.max(dimensions.width, 1) / Math.max(dimensions.height, 1));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(resources.program);
      gl.uniformMatrix4fv(uniforms.ViewProjection, false, view.matrix);
      gl.uniform3fv(uniforms.Eye, view.eye);
      gl.enableVertexAttribArray(attributes.position);
      gl.enableVertexAttribArray(attributes.normal);

      const root = transform(0, 0, 0, turn + smoothX * 0.15 + Math.sin(elapsed * 0.19) * 0.075, tilt + smoothY * 0.065);
      const render = (mesh, model, color, roughness = 0.4, material = 0, opacity = 1) => {
        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buffer);
        gl.vertexAttribPointer(attributes.position, 3, gl.FLOAT, false, 24, 0);
        gl.vertexAttribPointer(attributes.normal, 3, gl.FLOAT, false, 24, 12);
        gl.uniformMatrix4fv(uniforms.Model, false, model);
        gl.uniform3fv(uniforms.Color, color);
        gl.uniform1f(uniforms.Roughness, roughness);
        gl.uniform1f(uniforms.Material, material);
        gl.uniform1f(uniforms.Opacity, opacity);
        gl.drawArrays(mesh.mode, 0, mesh.count);
      };
      gl.depthMask(false);
      render(meshes.shadow, root, [0.025, 0.03, 0.018], 1, 2, 0.6);
      render(meshes.grid, root, [0.49, 0.55, 0.4], 1, 3, 0.1);
      gl.depthMask(true);

      for (let layer = 0; layer < 3; layer += 1) {
        const position = layer - 1;
        const floating = Math.sin(elapsed * 0.6 + layer * 0.7) * 0.012;
        const plate = multiply(root, transform(position * -0.065, position * separation + floating, position * -0.025, [0.08, -0.085, 0.045][layer]));
        const local = (x, y, z, yaw = 0) => multiply(plate, transform(x, y, z, yaw));
        render(meshes.plate, plate, layer === 2 ? [0.49, 0.48, 0.43] : [0.32, 0.33, 0.29], 0.28);
        render(meshes.inset, local(0, 0.138, 0), [0.056, 0.068, 0.048], 0.68);
        render(meshes.rim, plate, [0.69, 0.76, 0.46], 0.34, 1, layer === 2 ? 0.76 : 0.43);
        render(meshes.lowerRim, plate, [0.50, 0.61, 0.30], 0.4, 1, 0.34);
        render(meshes.traces, plate, [0.47, 0.59, 0.32], 1, 1, 0.48);

        const chip = local(0, 0.22, 0);
        render(meshes.chip, chip, [0.235, 0.25, 0.21], 0.24);
        render(meshes.chipFace, multiply(chip, transform(0, 0.078, 0)), [0.065, 0.077, 0.055], 0.42);
        render(meshes.chipRim, chip, [0.69, 0.77, 0.43], 0.35, 1, 0.69);
        render(meshes.mark, chip, [0.80, 0.86, 0.65], 1, 1, 0.92);

        for (const side of [-1, 1]) {
          for (let pin = 0; pin < 7; pin += 1) {
            render(meshes.pin, local(side * 0.58, 0.169, (pin - 3) * 0.10), [0.44, 0.49, 0.27], 0.25);
            render(meshes.pin, local((pin - 3) * 0.12, 0.169, side * 0.48, Math.PI / 2), [0.44, 0.49, 0.27], 0.25);
          }
        }
        for (let vent = 0; vent < 14; vent += 1) {
          render(meshes.vent, local(-0.65 + vent * 0.065, -0.004, 1.007), [0.039, 0.049, 0.032], 0.85);
        }
        render(meshes.status, local(0.79, 0.008, 1.012), [0.76, 0.89, 0.43], 0.3, 1, 0.96);
      }

      if (moving) requestRender();
      else lastTime = 0;
    } catch {
      fallback();
    }
  }

  function requestRender() {
    if (!frame && resources && !lost && !document.hidden && intersecting) frame = window.requestAnimationFrame(draw);
  }

  function initialize() {
    try {
      gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: false, powerPreference: 'low-power', preserveDrawingBuffer: false });
      if (!gl) throw new Error('WebGL unavailable');
      resources = buildResources();
      lost = false;
      canvas.hidden = false;
      canvas.style.visibility = '';
      host.dataset.renderer = 'webgl';
      dimensions = { width: 0, height: 0 };
      resize();
      updateControls();
      requestRender();
    } catch {
      fallback();
    }
  }

  toggle?.addEventListener('click', () => {
    paused = !paused;
    updateControls();
    stop();
    if (!paused) requestRender();
  });

  for (const button of views) {
    button.addEventListener('click', () => {
      if (!Object.hasOwn(states, button.dataset.sceneView)) return;
      targetView = button.dataset.sceneView;
      host.dataset.sceneState = targetView;
      if (paused) {
        ({ turn, separation, tilt } = states[targetView]);
        pointerX = 0;
        pointerY = 0;
        smoothX = 0;
        smoothY = 0;
      }
      updateControls();
      requestRender();
    });
  }

  host.addEventListener('pointermove', (event) => {
    if (paused || motion.matches || coarsePointer.matches || event.pointerType === 'touch') return;
    const rect = host.getBoundingClientRect();
    pointerX = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width) * 2 - 1));
    pointerY = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height) * 2 - 1));
    requestRender();
  });
  host.addEventListener('pointerleave', () => {
    pointerX = 0;
    pointerY = 0;
    if (!paused) requestRender();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else requestRender();
  });
  motion.addEventListener('change', () => {
    pointerX = 0;
    pointerY = 0;
    stop();
    updateControls();
    requestRender();
  });
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    lost = true;
    fallback();
  });
  canvas.addEventListener('webglcontextrestored', initialize);

  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
  else window.addEventListener('resize', resize, { passive: true });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      intersecting = entry.isIntersecting;
      if (intersecting) requestRender();
      else stop();
    }, { rootMargin: '40px' }).observe(host);
  }
  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', requestRender);
  initialize();
})();
