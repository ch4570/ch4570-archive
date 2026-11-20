// Hero scene: an illustrative event pipeline (producer → topic partitions → consumer).
// Failed events detour through a recovery node and are re-processed, mirroring the
// "re-run only the failed work" story. It is a concept animation, not live data.
// three.js is loaded from a pinned CDN build; any failure leaves the static SVG in place.

const THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js";

const COLORS = {
  idle: 0x5ccfe6, // cyan: in flight
  ok: 0xbae67e, // green: processed
  fail: 0xf28779, // coral: failed
  retry: 0xffcc66, // amber: re-processing after recovery
  rail: 0x3a4352,
  node: 0x2a3140,
  nodeEdge: 0x6b7686,
};

export async function mountEventStream(root) {
  const stage = root.querySelector("[data-stage]");
  const status = root.querySelector("[data-stage-status]");
  const injectButton = root.querySelector("[data-inject]");
  const pauseButton = root.querySelector("[data-pause]");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let THREE;
  try {
    THREE = await import(/* webpackIgnore: true */ THREE_URL);
  } catch {
    return false;
  }
  const probe = document.createElement("canvas");
  if (!(probe.getContext("webgl2") || probe.getContext("webgl"))) return false;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.setAttribute("aria-hidden", "true");
  stage.append(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0, 1.4, 17);
  camera.lookAt(0, -0.4, 0);
  const world = new THREE.Group();
  world.rotation.x = -0.18;
  world.position.y = 0.9; // centre the pipeline + recovery loop
  scene.add(world);
  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(4, 6, 8);
  scene.add(key);

  // ---- geometry: created once ----
  const LANES = [1.5, 0, -1.5];
  const X = { producer: -6.4, topicStart: -4.6, topicEnd: 1.4, consumer: 3.4, done: 6.6 };
  const RECOVERY = new THREE.Vector3(1.0, -3.9, 0);

  const nodeMat = new THREE.MeshStandardMaterial({ color: COLORS.node, roughness: 0.7, metalness: 0.1 });
  const edgeMat = new THREE.LineBasicMaterial({ color: COLORS.nodeEdge });
  const addNode = (geometry, position, name) => {
    const mesh = new THREE.Mesh(geometry, nodeMat.clone());
    mesh.position.copy(position);
    mesh.userData.name = name;
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edgeMat));
    world.add(mesh);
    return mesh;
  };
  const nodes = {
    producer: addNode(new THREE.BoxGeometry(1.1, 3.9, 1.1), new THREE.Vector3(X.producer, 0, 0), "producer"),
    consumer: addNode(new THREE.BoxGeometry(1.1, 3.9, 1.1), new THREE.Vector3(X.consumer, 0, 0), "consumer"),
    done: addNode(new THREE.CylinderGeometry(0.7, 0.7, 2.6, 28), new THREE.Vector3(X.done, 0, 0), "store"),
    recovery: addNode(new THREE.TorusGeometry(0.8, 0.16, 12, 48), RECOVERY.clone(), "recovery"),
  };
  const railMat = new THREE.LineBasicMaterial({ color: COLORS.rail });
  LANES.forEach((y) => {
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(X.topicStart, y, 0), new THREE.Vector3(X.topicEnd, y, 0)]);
    world.add(new THREE.Line(g, railMat));
    const tube = new THREE.Mesh(new THREE.BoxGeometry(X.topicEnd - X.topicStart, 0.42, 0.42), new THREE.MeshStandardMaterial({ color: 0x232a36, transparent: true, opacity: 0.55 }));
    tube.position.set((X.topicStart + X.topicEnd) / 2, y, 0);
    tube.userData.name = "topic";
    world.add(tube);
  });
  const dashed = new THREE.LineDashedMaterial({ color: COLORS.retry, dashSize: 0.18, gapSize: 0.14, transparent: true, opacity: 0.6 });
  const recoveryPath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(X.consumer, -1.9, 0), new THREE.Vector3(X.consumer - 0.4, -3.3, 0), RECOVERY.clone().add(new THREE.Vector3(0.9, 0, 0)),
  ]);
  const retryPath = new THREE.CatmullRomCurve3([
    RECOVERY.clone().add(new THREE.Vector3(-0.9, 0, 0)), new THREE.Vector3(X.topicEnd - 1.2, -2.6, 0), new THREE.Vector3(X.topicEnd + 0.4, LANES[2], 0),
  ]);
  [recoveryPath, retryPath].forEach((curve) => {
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(40)), dashed);
    line.computeLineDistances();
    world.add(line);
  });

  // ---- events: one InstancedMesh, mutated in place ----
  const MAX = 160;
  const events = new THREE.InstancedMesh(new THREE.BoxGeometry(0.26, 0.26, 0.26), new THREE.MeshStandardMaterial({ roughness: 0.4 }), MAX);
  events.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  world.add(events);
  const color = new THREE.Color();
  const dummy = new THREE.Object3D();
  const pool = Array.from({ length: MAX }, () => ({ alive: false }));
  for (let i = 0; i < MAX; i += 1) {
    dummy.scale.setScalar(0);
    dummy.updateMatrix();
    events.setMatrixAt(i, dummy.matrix);
    events.setColorAt(i, color.set(COLORS.idle));
  }

  let forcedFailures = 0;
  const spawn = () => {
    const slot = pool.find((p) => !p.alive);
    if (!slot) return;
    const willFail = forcedFailures > 0 || Math.random() < 0.035;
    if (forcedFailures > 0) forcedFailures -= 1;
    Object.assign(slot, { alive: true, lane: Math.floor(Math.random() * LANES.length), t: 0, phase: "flow", fail: willFail, retried: false, speed: 0.16 + Math.random() * 0.05, spin: Math.random() * Math.PI });
  };

  // position per phase. flow: producer → done along a lane (t 0..1)
  const flowPoint = (p, out) => {
    const y = LANES[p.lane];
    const xs = [X.producer + 0.6, X.topicStart, X.topicEnd, X.consumer, X.done - 0.6];
    const seg = Math.min(3, Math.floor(p.t * 4));
    const local = p.t * 4 - seg;
    out.set(THREE.MathUtils.lerp(xs[seg], xs[seg + 1], local), y, 0);
    return out;
  };
  const tmp = new THREE.Vector3();
  const consumerT = 0.75; // where a failing event leaves the lane

  const step = (dt) => {
    pool.forEach((p, i) => {
      if (!p.alive) return;
      p.spin += dt * 2;
      let scale = 1;
      if (p.phase === "flow") {
        p.t += dt * p.speed;
        if (p.fail && !p.retried && p.t >= consumerT) { p.phase = "toRecovery"; p.t = 0; }
        else if (p.t >= 1) { p.alive = false; scale = 0; }
        flowPoint(p, tmp);
        color.set(p.t > consumerT ? COLORS.ok : p.retried ? COLORS.retry : COLORS.idle);
      } else if (p.phase === "toRecovery") {
        p.t += dt * 0.7;
        recoveryPath.getPointAt(THREE.MathUtils.clamp(p.t, 0, 1), tmp);
        color.set(COLORS.fail);
        if (p.t >= 1) { p.phase = "orbit"; p.t = 0; }
      } else if (p.phase === "orbit") {
        p.t += dt * 0.9;
        const a = p.t * Math.PI * 2;
        tmp.set(RECOVERY.x + Math.cos(a) * 0.8, RECOVERY.y + Math.sin(a) * 0.8, 0);
        color.set(COLORS.fail).lerp(new THREE.Color(COLORS.retry), Math.min(1, p.t));
        if (p.t >= 1) { p.phase = "retry"; p.t = 0; }
      } else if (p.phase === "retry") {
        p.t += dt * 0.6;
        retryPath.getPointAt(THREE.MathUtils.clamp(p.t, 0, 1), tmp);
        color.set(COLORS.retry);
        if (p.t >= 1) { p.phase = "flow"; p.retried = true; p.lane = 2; p.t = 0.5; }
      }
      dummy.position.copy(tmp);
      dummy.rotation.set(p.spin, p.spin * 0.7, 0);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      events.setMatrixAt(i, dummy.matrix);
      events.setColorAt(i, color);
    });
    events.instanceMatrix.needsUpdate = true;
    if (events.instanceColor) events.instanceColor.needsUpdate = true;
  };

  // ---- labels: HTML overlay projected from 3D ----
  const labels = [...root.querySelectorAll("[data-label]")];
  const anchors = {
    producer: new THREE.Vector3(X.producer, 2.5, 0),
    topic: new THREE.Vector3((X.topicStart + X.topicEnd) / 2, 2.5, 0),
    consumer: new THREE.Vector3(X.consumer, 2.5, 0),
    store: new THREE.Vector3(X.done, 1.8, 0),
    recovery: new THREE.Vector3(RECOVERY.x, RECOVERY.y - 1.2, 0),
  };
  const placeLabels = () => {
    const { clientWidth: w, clientHeight: h } = stage;
    labels.forEach((label) => {
      const v = anchors[label.dataset.label].clone().applyMatrix4(world.matrixWorld).project(camera);
      const half = label.offsetWidth / 2 + 6;
      const x = Math.min(w - half, Math.max(half, ((v.x + 1) / 2) * w));
      label.style.transform = `translate(${Math.round(x * 2) / 2}px, ${Math.round(((1 - v.y) / 2) * h * 2) / 2}px) translate(-50%, -50%)`;
    });
  };

  // ---- sizing ----
  const resize = () => {
    const { clientWidth: w, clientHeight: h } = stage;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // fit the whole pipeline: ~16 units wide and ~11 units tall
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    camera.position.z = Math.max((w < 520 ? 8.4 : 7.4) / (tan * camera.aspect), 5.0 / tan);
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    placeLabels();
  };
  new ResizeObserver(resize).observe(stage);

  // ---- interaction: parallax + hover highlight ----
  const pointer = new THREE.Vector2(0, 0);
  const target = { x: -0.18, y: 0 };
  const raycaster = new THREE.Raycaster();
  let hovered = null;
  stage.addEventListener("pointermove", (event) => {
    const r = stage.getBoundingClientRect();
    pointer.set(((event.clientX - r.left) / r.width) * 2 - 1, -((event.clientY - r.top) / r.height) * 2 + 1);
    target.y = pointer.x * 0.22;
    target.x = -0.18 + pointer.y * 0.08;
  });
  stage.addEventListener("pointerleave", () => { target.x = -0.18; target.y = 0; pointer.set(9, 9); });
  const updateHover = () => {
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(Object.values(nodes), false)[0]?.object ?? null;
    if (hit === hovered) return;
    if (hovered) hovered.material.emissive?.setHex(0x000000);
    hovered = hit;
    if (hovered) hovered.material.emissive.setHex(0x2a3a4a);
    labels.forEach((label) => label.classList.toggle("is-hot", !!hovered && label.dataset.label === hovered.userData.name));
    stage.style.cursor = hovered ? "help" : "";
  };

  let injections = 0;
  const inject = () => {
    injections += 1;
    // fail events that have not reached the consumer yet, so the detour starts right away
    let marked = 0;
    pool.filter((p) => p.alive && p.phase === "flow" && !p.fail && !p.retried && p.t > 0.45 && p.t < consumerT)
      .sort((a, b) => b.t - a.t).slice(0, 8).forEach((p) => { p.fail = true; marked += 1; });
    forcedFailures += Math.max(2, 10 - marked);
    if (status) status.textContent = `장애 주입 ${injections}회째: 실패한 이벤트가 recovery를 거쳐 다시 처리됩니다. (개념도)`;
    root.classList.add("is-injected");
    setTimeout(() => root.classList.remove("is-injected"), 1600);
  };
  injectButton?.addEventListener("click", inject);
  root.addEventListener("keydown", (event) => {
    if ((event.key === "f" || event.code === "KeyF") && root.contains(event.target) && event.target.tagName === "BUTTON") { event.preventDefault(); inject(); }
  });

  // ---- static frame for reduced motion ----
  if (reduce) {
    for (let i = 0; i < 18; i += 1) { spawn(); }
    pool.forEach((p, i) => { if (p.alive) { p.t = (i % 9) / 9; } });
    const failing = pool.find((p) => p.alive);
    if (failing) { failing.phase = "orbit"; failing.t = 0.3; }
    step(0);
    resize();
    root.classList.add("is-live", "is-static");
    if (injectButton) injectButton.hidden = true;
    return true;
  }

  // ---- loop: setAnimationLoop, paused when hidden or offscreen ----
  let last = performance.now();
  let spawnClock = 0;
  const animate = (now) => {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); // never negative after a resume
    last = now;
    spawnClock += dt;
    while (spawnClock > 0.12) { spawn(); spawnClock -= 0.12; }
    world.rotation.x += (target.x - world.rotation.x) * 0.06;
    world.rotation.y += (target.y - world.rotation.y) * 0.06;
    nodes.recovery.rotation.z += dt * (forcedFailures > 0 ? 2.4 : 0.6);
    step(dt);
    updateHover();
    renderer.render(scene, camera);
    placeLabels();
  };
  // warm-up so the first frame already shows traffic
  for (let i = 0; i < 40; i += 1) { spawnClock += 0.16; while (spawnClock > 0.16) { spawn(); spawnClock -= 0.16; } step(0.16); }
  let visible = true;
  let onscreen = true;
  let paused = false;
  pauseButton?.addEventListener("click", () => {
    paused = !paused;
    pauseButton.setAttribute("aria-pressed", String(paused));
    pauseButton.textContent = paused ? "재생" : "일시정지";
    sync();
  });
  const sync = () => {
    const run = visible && onscreen && !paused;
    if (run) last = performance.now();
    renderer.setAnimationLoop(run ? animate : null);
  };
  document.addEventListener("visibilitychange", () => { visible = !document.hidden; sync(); });
  new IntersectionObserver(([entry]) => { onscreen = entry.isIntersecting; sync(); }).observe(stage);
  resize();
  sync();
  root.classList.add("is-live");
  return true;
}
