// =========================
// 0) 기본 세팅
// =========================
const sceneContainer = document.getElementById("scene-container");
const hud = document.getElementById("hud");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 200000);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio || 1);
sceneContainer.appendChild(renderer.domElement);

// OrbitControls
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 10;
controls.maxDistance = 5000;
controls.target.set(0, 0, 0);

camera.position.set(0, 80, 220);
controls.update();

// 조명
const sunLight = new THREE.PointLight(0xffffff, 2.6, 0, 0);
sunLight.position.set(0, 0, 0);
scene.add(sunLight);

const ambient = new THREE.AmbientLight(0x202020);
scene.add(ambient);

// 시간/상태
const clock = new THREE.Clock();
let timeSpeed = 1.0;          // 공전/자전 가속
let mode = "orbit";           // orbit | ship
let followPlanet = null;      // 자동 추적 대상(planet mesh)
let trackingEnabled = true;
let cameraView = "third";     // third | first

// UI 엘리먼트
const zoomSlider = document.getElementById("zoom-slider");
const speedSlider = document.getElementById("speed-slider");
const chkTrack = document.getElementById("chk-track");
const btnOrbit = document.getElementById("mode-orbit");
const btnShip = document.getElementById("mode-ship");
const btnReset = document.getElementById("btn-reset");

// =========================
// 1) 실제 텍스처 로딩 (CDN)
// =========================
const texLoader = new THREE.TextureLoader();
texLoader.crossOrigin = "anonymous";

// three.js 예제 텍스처 (웹에서 바로 로드)
const TEX = {
  sun:    "https://threejs.org/examples/textures/planets/sun.jpg",
  mercury:"https://threejs.org/examples/textures/planets/mercury.jpg",
  venus:  "https://threejs.org/examples/textures/planets/venus.jpg",
  earth:  "https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg",
  earthSpec:"https://threejs.org/examples/textures/planets/earth_specular_2048.jpg",
  earthNormal:"https://threejs.org/examples/textures/planets/earth_normal_2048.jpg",
  mars:   "https://threejs.org/examples/textures/planets/mars_1024.jpg",
  jupiter:"https://threejs.org/examples/textures/planets/jupiter2_1024.jpg",
  saturn: "https://threejs.org/examples/textures/planets/saturn.jpg",
  saturnRing:"https://threejs.org/examples/textures/planets/saturnringcolor.jpg",
};

// =========================
// 2) 별 배경 (더 “깊은 우주” 느낌)
// =========================
function createStars() {
  const starGeometry = new THREE.BufferGeometry();
  const starCount = 24000;
  const positions = new Float32Array(starCount * 3);

  for (let i = 0; i < starCount; i++) {
    const r = 12000;
    const x = THREE.MathUtils.randFloatSpread(r);
    const y = THREE.MathUtils.randFloatSpread(r);
    const z = THREE.MathUtils.randFloatSpread(r);
    positions[i * 3 + 0] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
  }

  starGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const starMaterial = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 1.0,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.95
  });

  const stars = new THREE.Points(starGeometry, starMaterial);
  scene.add(stars);
}
createStars();

// =========================
// 3) 태양: 텍스처 + Glow/Halo
// =========================
const solarSystem = new THREE.Group();
scene.add(solarSystem);

// 태양 메쉬
const sun = new THREE.Mesh(
  new THREE.SphereGeometry(12, 64, 64),
  new THREE.MeshStandardMaterial({
    map: texLoader.load(TEX.sun),
    emissive: new THREE.Color(0xff6a00),
    emissiveIntensity: 1.1,
    roughness: 0.9,
    metalness: 0.0
  })
);
solarSystem.add(sun);

// Glow 스프라이트(항상 카메라를 바라보는 Halo)
function makeGlowSprite(colorHex, size) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");

  const grad = ctx.createRadialGradient(128, 128, 8, 128, 128, 128);
  grad.addColorStop(0.0, "rgba(255,180,80,0.90)");
  grad.addColorStop(0.25, "rgba(255,140,40,0.45)");
  grad.addColorStop(0.6, "rgba(255,90,0,0.18)");
  grad.addColorStop(1.0, "rgba(0,0,0,0.0)");

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({
    map: tex,
    color: colorHex,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(size, size, 1);
  return sprite;
}

const sunGlow = makeGlowSprite(0xffffff, 120);
sunGlow.position.set(0, 0, 0);
solarSystem.add(sunGlow);

// 태양 Corona(살짝 큰 구체, Additive)
const corona = new THREE.Mesh(
  new THREE.SphereGeometry(14.5, 64, 64),
  new THREE.MeshBasicMaterial({
    color: 0xff8a2a,
    transparent: true,
    opacity: 0.07,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  })
);
solarSystem.add(corona);

// =========================
// 4) 행성: 실제 텍스처 + 궤도 + 클릭 대상 등록
// =========================
const planetDefs = [
  { name: "Mercury", r: 2.1, dist: 22, map: TEX.mercury, orbit: 0.040, rot: 0.020 },
  { name: "Venus",   r: 3.2, dist: 34, map: TEX.venus,   orbit: 0.016, rot: 0.012 },
  { name: "Earth",   r: 3.4, dist: 50, map: TEX.earth,   orbit: 0.010, rot: 0.030, spec: TEX.earthSpec, normal: TEX.earthNormal },
  { name: "Mars",    r: 2.7, dist: 70, map: TEX.mars,    orbit: 0.008, rot: 0.026 },
  { name: "Jupiter", r: 9.6, dist: 120,map: TEX.jupiter, orbit: 0.003, rot: 0.045 },
  { name: "Saturn",  r: 8.5, dist: 170,map: TEX.saturn,  orbit: 0.001, rot: 0.040, ring: TEX.saturnRing },
];

const planets = [];
const orbitGroups = [];   // 공전 그룹(회전)
const clickTargets = [];  // Raycaster 대상

function createOrbitLine(radius, segments = 256) {
  const curve = new THREE.EllipseCurve(0, 0, radius, radius, 0, Math.PI * 2, false, 0);
  const pts = curve.getPoints(segments).map(p => new THREE.Vector3(p.x, 0, p.y)); // XZ
  const geom = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({ color: 0x2b2b2b, transparent: true, opacity: 0.85 });
  const line = new THREE.LineLoop(geom, mat);
  return line;
}

planetDefs.forEach(def => {
  // 공전 그룹
  const g = new THREE.Group();
  solarSystem.add(g);

  // 궤도선
  const orbitLine = createOrbitLine(def.dist, 512);
  solarSystem.add(orbitLine);

  // 재질
  const matOpt = {
    map: texLoader.load(def.map),
    roughness: 0.95,
    metalness: 0.0
  };

  // 지구만 스펙/노멀 추가로 “실사감” 강화
  if (def.spec) matOpt.specularMap = texLoader.load(def.spec);
  if (def.normal) matOpt.normalMap = texLoader.load(def.normal);
  // MeshStandardMaterial엔 specularMap이 직접 먹진 않지만(스펙은 물리 기반),
  // 그래도 지구는 normalMap만으로도 체감 차이 큼.
  const planetMat = new THREE.MeshStandardMaterial(matOpt);

  const planet = new THREE.Mesh(new THREE.SphereGeometry(def.r, 48, 48), planetMat);
  planet.position.set(def.dist, 0, 0);
  planet.userData = { ...def };

  // 라벨/이름
  planet.name = def.name;

  g.add(planet);

  // 토성 고리
  if (def.ring) {
    const ringTex = texLoader.load(def.ring);
    ringTex.wrapS = ringTex.wrapT = THREE.ClampToEdgeWrapping;

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(def.r * 1.4, def.r * 2.4, 128),
      new THREE.MeshBasicMaterial({
        map: ringTex,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide
      })
    );
    ring.rotation.x = Math.PI / 2;
    planet.add(ring);
  }

  planets.push(planet);
  orbitGroups.push(g);
  clickTargets.push(planet);
});

// =========================
// 5) 우주선: 오브젝트 + 키보드 조작 + 카메라(1/3인칭)
// =========================
const ship = new THREE.Group();
ship.position.set(0, 0, 260);
scene.add(ship);

// 간단하지만 “우주선 느낌” 나는 형태(동체 + 노즈 + 날개 + 엔진광)
const body = new THREE.Mesh(
  new THREE.CylinderGeometry(1.6, 2.2, 10, 24),
  new THREE.MeshStandardMaterial({ color: 0x9aa3b2, roughness: 0.35, metalness: 0.7 })
);
body.rotation.z = Math.PI / 2;
ship.add(body);

const nose = new THREE.Mesh(
  new THREE.ConeGeometry(2.2, 5, 24),
  new THREE.MeshStandardMaterial({ color: 0xeaeaea, roughness: 0.25, metalness: 0.65 })
);
nose.position.x = 7.0;
nose.rotation.z = -Math.PI / 2;
ship.add(nose);

const wingMat = new THREE.MeshStandardMaterial({ color: 0x5b6a7a, roughness: 0.4, metalness: 0.6 });
const wing1 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4.0, 10.0), wingMat);
wing1.position.set(-1.2, 0, 0);
ship.add(wing1);

const wing2 = wing1.clone();
wing2.position.set(-1.2, 0, 0);
wing2.rotation.x = Math.PI / 2;
ship.add(wing2);

// 엔진 glow (뒤쪽 스프라이트)
const engineGlow = makeGlowSprite(0x66aaff, 20);
engineGlow.position.set(-7.0, 0, 0);
ship.add(engineGlow);

// 조작 상태/물리
const key = {};
let shipVel = new THREE.Vector3(0, 0, 0);
let shipSpeed = 0;
let yaw = 0;
let pitch = 0;

window.addEventListener("keydown", (e) => { key[e.code] = true; });
window.addEventListener("keyup", (e) => { key[e.code] = false; });

function setShipMode(on) {
  mode = on ? "ship" : "orbit";
  btnShip.classList.toggle("active", mode === "ship");
  btnOrbit.classList.toggle("active", mode === "orbit");

  // orbit 모드에서만 OrbitControls 사용
  controls.enabled = (mode === "orbit");

  if (mode === "ship") {
    // 카메라를 우주선 주변으로 스냅
    followPlanet = null;
  } else {
    // orbit 복귀 시 태양으로 기본 타겟
    controls.target.set(0, 0, 0);
    controls.update();
  }
}

function toggleCameraView() {
  cameraView = (cameraView === "third") ? "first" : "third";
}

// =========================
// 6) 행성 클릭 → 카메라 자동 포커스/추적 (Raycaster + 보간)
// =========================
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

let camAnim = null; // {t:0..1, startPos, endPos, startTarget, endTarget, dur}

function animateCameraTo(targetPos, distance = 40, duration = 0.9) {
  const dir = camera.position.clone().sub(controls.target).normalize();
  const endPos = targetPos.clone().add(dir.multiplyScalar(distance));

  camAnim = {
    t: 0,
    dur: duration,
    startPos: camera.position.clone(),
    endPos,
    startTarget: controls.target.clone(),
    endTarget: targetPos.clone()
  };
}

function onClick(e) {
  // UI 패널 위 클릭은 무시
  const rect = renderer.domElement.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

  mouse.set(x, y);
  raycaster.setFromCamera(mouse, camera);
  const hit = raycaster.intersectObjects(clickTargets, true);

  if (hit.length > 0) {
    const obj = hit[0].object;
    // planet mesh일 가능성이 높지만, 자식이 찍히면 부모를 찾음
    const planet = (obj.userData && obj.userData.dist) ? obj : obj.parent;
    if (planet && planet.userData && planet.userData.dist) {
      followPlanet = planet;
      trackingEnabled = chkTrack.checked;

      // 포커스 거리: 행성 크기 기반
      const dist = Math.max(planet.userData.r * 12, 35);
      animateCameraTo(planet.getWorldPosition(new THREE.Vector3()), dist, 0.8);
    }
  }
}
renderer.domElement.addEventListener("click", onClick);

// =========================
// 7) UI 이벤트
// =========================
speedSlider.addEventListener("input", (ev) => {
  // 0~40 → 0~4
  timeSpeed = Number(ev.target.value) / 10;
});

zoomSlider.addEventListener("input", (ev) => {
  // Orbit 모드에서만 의미 있게 적용
  const t = Number(ev.target.value); // 1~100
  const dist = THREE.MathUtils.lerp(controls.maxDistance, controls.minDistance, t / 100);

  const dir = camera.position.clone().sub(controls.target).normalize();
  camera.position.copy(controls.target.clone().add(dir.multiplyScalar(dist)));
  controls.update();
});

chkTrack.addEventListener("change", (ev) => {
  trackingEnabled = ev.target.checked;
});

btnOrbit.addEventListener("click", () => setShipMode(false));
btnShip.addEventListener("click", () => setShipMode(true));

btnReset.addEventListener("click", () => {
  followPlanet = null;
  animateCameraTo(new THREE.Vector3(0, 0, 0), 220, 0.9);
});

// =========================
// 8) 반응형
// =========================
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio || 1);
});

// =========================
// 9) 업데이트 루프
// =========================
function updatePlanets(dt) {
  // 태양 자전/코로나
  sun.rotation.y += 0.15 * dt;
  corona.rotation.y -= 0.05 * dt;

  // 행성 자전/공전
  for (let i = 0; i < planets.length; i++) {
    const p = planets[i];
    const g = orbitGroups[i];

    p.rotation.y += p.userData.rot * timeSpeed * dt * 6.0;
    g.rotation.y += p.userData.orbit * timeSpeed * dt * 6.0;
  }
}

function updateCameraAnim(dt) {
  if (!camAnim) return;

  camAnim.t += dt / camAnim.dur;
  const t = Math.min(camAnim.t, 1);

  // easeInOut
  const k = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

  camera.position.lerpVectors(camAnim.startPos, camAnim.endPos, k);
  controls.target.lerpVectors(camAnim.startTarget, camAnim.endTarget, k);
  controls.update();

  if (t >= 1) camAnim = null;
}

function updateShip(dt) {
  // SHIP 모드에서만
  if (mode !== "ship") return;

  // 회전(요/피치)
  const rotSpeed = 1.2; // rad/s
  if (key["ArrowLeft"])  yaw += rotSpeed * dt;
  if (key["ArrowRight"]) yaw -= rotSpeed * dt;
  if (key["ArrowUp"])    pitch += rotSpeed * 0.8 * dt;
  if (key["ArrowDown"])  pitch -= rotSpeed * 0.8 * dt;

  // 피치 제한(뒤집힘 방지)
  pitch = THREE.MathUtils.clamp(pitch, -1.1, 1.1);

  ship.rotation.set(0, 0, 0);
  ship.rotateY(yaw);
  ship.rotateZ(0);
  ship.rotateX(pitch);

  // 이동(로컬 축 기준)
  const acc = (key["ShiftLeft"] || key["ShiftRight"]) ? 70 : 35;
  const brake = key["Space"] ? 0.88 : 0.96; // 감쇠

  const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(ship.quaternion);
  const right   = new THREE.Vector3(0, 0, -1).applyQuaternion(ship.quaternion);
  const up      = new THREE.Vector3(0, 1, 0);

  let a = new THREE.Vector3(0, 0, 0);
  if (key["KeyW"]) a.add(forward);
  if (key["KeyS"]) a.sub(forward);
  if (key["KeyD"]) a.add(right);
  if (key["KeyA"]) a.sub(right);
  if (key["KeyE"]) a.add(up);
  if (key["KeyQ"]) a.sub(up);

  if (a.lengthSq() > 0) a.normalize().multiplyScalar(acc);

  shipVel.add(a.multiplyScalar(dt));
  shipVel.multiplyScalar(brake);

  // 최대 속도 제한
  const maxV = (key["ShiftLeft"] || key["ShiftRight"]) ? 420 : 220;
  if (shipVel.length() > maxV) shipVel.setLength(maxV);

  ship.position.add(shipVel.clone().multiplyScalar(dt));

  // 엔진 글로우(가속 중 더 밝게)
  const thrusting = (key["KeyW"] || key["KeyA"] || key["KeyS"] || key["KeyD"] || key["KeyQ"] || key["KeyE"]);
  engineGlow.material.opacity = thrusting ? 0.95 : 0.55;

  // 카메라: 3인칭/1인칭
  if (key["KeyC"]) {
    // 키 길게 누르면 계속 토글되니, 간단히 “키 업” 방식으로 하고 싶으면 개선 가능
    // 여기선 사용감 때문에 약간의 딜레이 없이 토글되도록 처리(원하면 개선해줌)
    key["KeyC"] = false;
    toggleCameraView();
  }

  if (cameraView === "third") {
    const camBack = forward.clone().multiplyScalar(-30);
    const camUp = new THREE.Vector3(0, 1, 0).multiplyScalar(10);
    const desired = ship.position.clone().add(camBack).add(camUp);

    camera.position.lerp(desired, 0.12);
    camera.lookAt(ship.position.clone().add(forward.clone().multiplyScalar(30)));
  } else {
    // 1인칭(콕핏 느낌)
    const desired = ship.position.clone().add(forward.clone().multiplyScalar(2)).add(new THREE.Vector3(0, 1.2, 0));
    camera.position.lerp(desired, 0.25);
    camera.lookAt(ship.position.clone().add(forward.clone().multiplyScalar(60)));
  }
}

function updateTracking() {
  if (!followPlanet || !trackingEnabled) return;
  const p = followPlanet.getWorldPosition(new THREE.Vector3());

  // orbit 모드에서는 타겟을 계속 planet으로 잡아 “추적” 느낌 강화
  if (mode === "orbit") {
    controls.target.lerp(p, 0.12);
    controls.update();
  }
}

function updateHUD() {
  const targetName = followPlanet ? followPlanet.name : "None";
  const pos = ship.position;
  hud.textContent =
    `Mode: ${mode.toUpperCase()} (${cameraView})\n` +
    `Track: ${trackingEnabled ? "ON" : "OFF"} / Target: ${targetName}\n` +
    `TimeSpeed: ${timeSpeed.toFixed(2)}\n` +
    `Ship: x=${pos.x.toFixed(1)} y=${pos.y.toFixed(1)} z=${pos.z.toFixed(1)}`;
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.033);

  updatePlanets(dt);
  updateCameraAnim(dt);

  // orbit 모드일 때만 controls.update() (ship 모드에선 camera 직접 제어)
  if (mode === "orbit") controls.update();

  updateShip(dt);
  updateTracking();
  updateHUD();

  renderer.render(scene, camera);
}
animate();
