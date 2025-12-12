// ==========================================
// Space Explorer v2 (Mobile-ready + Missions)
// ==========================================
const sceneContainer = document.getElementById("scene-container");
const hud = document.getElementById("hud");

// UI
const zoomSlider = document.getElementById("zoom-slider");
const speedSlider = document.getElementById("speed-slider");
const chkTrack = document.getElementById("chk-track");
const btnOrbit = document.getElementById("mode-orbit");
const btnShip = document.getElementById("mode-ship");
const btnReset = document.getElementById("btn-reset");

// Mobile UI
const mobileUI = document.getElementById("mobile-ui");
const joyBase = document.getElementById("joystick-base");
const joyStick = document.getElementById("joystick-stick");
const touchArea = document.getElementById("touch-area");
const mBoost = document.getElementById("m-boost");
const mBrake = document.getElementById("m-brake");
const mCam = document.getElementById("m-cam");
const mMode = document.getElementById("m-mode");
const toast = document.getElementById("toast");

const isTouch = ("ontouchstart" in window) || (navigator.maxTouchPoints > 0);
const isMobile = isTouch && Math.min(window.innerWidth, window.innerHeight) < 900;
if (isMobile) mobileUI.classList.remove("hide");

// ====== THREE 기본 ======
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 200000);

// 모바일 성능 최적화: 픽셀비 제한 + powerPreference
const pixelRatio = Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2.0);
const renderer = new THREE.WebGLRenderer({
  antialias: !isMobile,             // 모바일은 안티앨리어싱 끄는 게 안정적
  alpha: false,
  powerPreference: "high-performance"
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(pixelRatio);
sceneContainer.appendChild(renderer.domElement);

// OrbitControls (ORBIT 모드에서만)
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 10;
controls.maxDistance = 5000;
controls.target.set(0, 0, 0);

camera.position.set(0, 80, 220);
controls.update();

// Light
const sunLight = new THREE.PointLight(0xffffff, 2.6, 0, 0);
sunLight.position.set(0, 0, 0);
scene.add(sunLight);

const ambient = new THREE.AmbientLight(0x202020);
scene.add(ambient);

// Time/State
const clock = new THREE.Clock();
let timeSpeed = 1.0;

let mode = "orbit"; // orbit | ship
let trackingEnabled = true;
let followPlanet = null;
let cameraView = "third"; // third | first

// ====== 텍스처 로더 + fallback ======
const texLoader = new THREE.TextureLoader();
texLoader.crossOrigin = "anonymous";

const TEX = {
  sun:    "https://threejs.org/examples/textures/planets/sun.jpg",
  mercury:"https://threejs.org/examples/textures/planets/mercury.jpg",
  venus:  "https://threejs.org/examples/textures/planets/venus.jpg",
  earth:  "https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg",
  earthNormal:"https://threejs.org/examples/textures/planets/earth_normal_2048.jpg",
  mars:   "https://threejs.org/examples/textures/planets/mars_1024.jpg",
  jupiter:"https://threejs.org/examples/textures/planets/jupiter2_1024.jpg",
  saturn: "https://threejs.org/examples/textures/planets/saturn.jpg",
  saturnRing:"https://threejs.org/examples/textures/planets/saturnringcolor.jpg",
};

function safeTexture(url) {
  // 로딩 실패해도 null 대신 기본색으로 버틸 수 있게
  try { return texLoader.load(url); } catch { return null; }
}

// ====== 별 배경 (모바일은 줄임) ======
function createStars() {
  const starGeometry = new THREE.BufferGeometry();
  const starCount = isMobile ? 9000 : 24000;
  const positions = new Float32Array(starCount * 3);
  const r = 12000;

  for (let i = 0; i < starCount; i++) {
    positions[i * 3 + 0] = THREE.MathUtils.randFloatSpread(r);
    positions[i * 3 + 1] = THREE.MathUtils.randFloatSpread(r);
    positions[i * 3 + 2] = THREE.MathUtils.randFloatSpread(r);
  }

  starGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const starMaterial = new THREE.PointsMaterial({
    color: 0xffffff,
    size: isMobile ? 1.0 : 1.1,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.95
  });

  const stars = new THREE.Points(starGeometry, starMaterial);
  scene.add(stars);
}
createStars();

// ====== Solar System Group ======
const solarSystem = new THREE.Group();
scene.add(solarSystem);

// ====== Glow Sprite ======
function makeGlowSprite(size, coreRGBA, midRGBA, edgeRGBA) {
  const canvas = document.createElement("canvas");
  canvas.width = 256; canvas.height = 256;
  const ctx = canvas.getContext("2d");

  const grad = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
  grad.addColorStop(0.0, coreRGBA);
  grad.addColorStop(0.3, midRGBA);
  grad.addColorStop(1.0, edgeRGBA);

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(size, size, 1);
  return sprite;
}

// ====== Sun (Texture + Glow + Corona) ======
const sun = new THREE.Mesh(
  new THREE.SphereGeometry(12, isMobile ? 32 : 64, isMobile ? 32 : 64),
  new THREE.MeshStandardMaterial({
    map: safeTexture(TEX.sun),
    color: 0xff8800,
    emissive: new THREE.Color(0xff6a00),
    emissiveIntensity: 1.1,
    roughness: 0.9,
    metalness: 0.0
  })
);
solarSystem.add(sun);

const sunGlow = makeGlowSprite(
  120,
  "rgba(255,190,80,0.90)",
  "rgba(255,120,30,0.40)",
  "rgba(0,0,0,0.0)"
);
solarSystem.add(sunGlow);

const corona = new THREE.Mesh(
  new THREE.SphereGeometry(14.5, isMobile ? 24 : 64, isMobile ? 24 : 64),
  new THREE.MeshBasicMaterial({
    color: 0xff8a2a,
    transparent: true,
    opacity: 0.07,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  })
);
solarSystem.add(corona);

// ====== Planets ======
const planetDefs = [
  { name: "Mercury", r: 2.1, dist: 22, map: TEX.mercury, orbit: 0.040, rot: 0.020 },
  { name: "Venus",   r: 3.2, dist: 34, map: TEX.venus,   orbit: 0.016, rot: 0.012 },
  { name: "Earth",   r: 3.4, dist: 50, map: TEX.earth,   orbit: 0.010, rot: 0.030, normal: TEX.earthNormal },
  { name: "Mars",    r: 2.7, dist: 70, map: TEX.mars,    orbit: 0.008, rot: 0.026 },
  { name: "Jupiter", r: 9.6, dist: 120,map: TEX.jupiter, orbit: 0.003, rot: 0.045 },
  { name: "Saturn",  r: 8.5, dist: 170,map: TEX.saturn,  orbit: 0.001, rot: 0.040, ring: TEX.saturnRing },
];

const planets = [];
const orbitGroups = [];
const clickTargets = [];

function createOrbitLine(radius, segments = 256) {
  const curve = new THREE.EllipseCurve(0, 0, radius, radius, 0, Math.PI * 2, false, 0);
  const pts = curve.getPoints(segments).map(p => new THREE.Vector3(p.x, 0, p.y));
  const geom = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({ color: 0x2b2b2b, transparent: true, opacity: 0.85 });
  return new THREE.LineLoop(geom, mat);
}

planetDefs.forEach(def => {
  const g = new THREE.Group();
  solarSystem.add(g);

  solarSystem.add(createOrbitLine(def.dist, isMobile ? 256 : 512));

  const geom = new THREE.SphereGeometry(def.r, isMobile ? 24 : 48, isMobile ? 24 : 48);
  const matOpt = {
    map: safeTexture(def.map),
    color: 0xffffff,
    roughness: 0.95,
    metalness: 0.0
  };
  if (def.normal) matOpt.normalMap = safeTexture(def.normal);
  const mat = new THREE.MeshStandardMaterial(matOpt);

  const p = new THREE.Mesh(geom, mat);
  p.position.set(def.dist, 0, 0);
  p.userData = { ...def };
  p.name = def.name;

  g.add(p);

  // Saturn ring
  if (def.ring) {
    const ringTex = safeTexture(def.ring);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(def.r * 1.4, def.r * 2.4, isMobile ? 64 : 128),
      new THREE.MeshBasicMaterial({
        map: ringTex || null,
        color: ringTex ? 0xffffff : 0xd9c7a6,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide
      })
    );
    ring.rotation.x = Math.PI / 2;
    p.add(ring);
  }

  // 대기(지구 느낌) - 간단 rim glow
  if (def.name === "Earth") {
    const atm = makeGlowSprite(
      def.r * 10,
      "rgba(120,180,255,0.20)",
      "rgba(80,140,255,0.08)",
      "rgba(0,0,0,0.0)"
    );
    atm.position.set(0, 0, 0);
    p.add(atm);
  }

  planets.push(p);
  orbitGroups.push(g);
  clickTargets.push(p);
});

// ====== Ship ======
const ship = new THREE.Group();
ship.position.set(0, 0, 260);
scene.add(ship);

const body = new THREE.Mesh(
  new THREE.CylinderGeometry(1.6, 2.2, 10, isMobile ? 16 : 24),
  new THREE.MeshStandardMaterial({ color: 0x9aa3b2, roughness: 0.35, metalness: 0.7 })
);
body.rotation.z = Math.PI / 2;
ship.add(body);

const nose = new THREE.Mesh(
  new THREE.ConeGeometry(2.2, 5, isMobile ? 16 : 24),
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
wing2.rotation.x = Math.PI / 2;
ship.add(wing2);

const engineGlow = makeGlowSprite(
  20,
  "rgba(140,200,255,0.95)",
  "rgba(80,160,255,0.35)",
  "rgba(0,0,0,0.0)"
);
engineGlow.position.set(-7.0, 0, 0);
ship.add(engineGlow);

// Physics / Control
const key = {};
let shipVel = new THREE.Vector3(0, 0, 0);
let yaw = 0;
let pitch = 0;

// 모바일 입력 상태
let joy = { x: 0, y: 0 };        // -1..1 (move)
let look = { dx: 0, dy: 0 };     // drag delta
let mobileBoost = false;
let mobileBrake = false;

window.addEventListener("keydown", (e) => { key[e.code] = true; });
window.addEventListener("keyup", (e) => { key[e.code] = false; });

function setShipMode(on) {
  mode = on ? "ship" : "orbit";
  btnShip.classList.toggle("active", mode === "ship");
  btnOrbit.classList.toggle("active", mode === "orbit");
  controls.enabled = (mode === "orbit");

  if (mode === "ship") {
    followPlanet = null;
  } else {
    controls.target.set(0, 0, 0);
    controls.update();
  }
}

function toggleCameraView() {
  cameraView = (cameraView === "third") ? "first" : "third";
}

// ====== Raycaster: planet click focus ======
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let camAnim = null; // {t,dur,startPos,endPos,startTarget,endTarget}

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

function onPickPlanet(clientX, clientY) {
  const rect = renderer.domElement.getBoundingClientRect();
  const x = ((clientX - rect.left) / rect.width) * 2 - 1;
  const y = -(((clientY - rect.top) / rect.height) * 2 - 1);
  mouse.set(x, y);

  raycaster.setFromCamera(mouse, camera);
  const hit = raycaster.intersectObjects(clickTargets, true);
  if (hit.length > 0) {
    const obj = hit[0].object;
    const planet = (obj.userData && obj.userData.dist) ? obj : obj.parent;
    if (planet && planet.userData && planet.userData.dist) {
      followPlanet = planet;
      trackingEnabled = chkTrack.checked;

      const dist = Math.max(planet.userData.r * 12, 35);
      animateCameraTo(planet.getWorldPosition(new THREE.Vector3()), dist, 0.8);
      toastMsg(`🪐 ${planet.name} 포커스`);
    }
  }
}

renderer.domElement.addEventListener("click", (e) => onPickPlanet(e.clientX, e.clientY));
// 모바일 탭 대응
renderer.domElement.addEventListener("touchend", (e) => {
  if (e.changedTouches && e.changedTouches.length === 1) {
    const t = e.changedTouches[0];
    onPickPlanet(t.clientX, t.clientY);
  }
}, { passive: true });

// ====== Missions (Scan + Collect) ======
const mission = {
  scan: {},          // planetName: progress(0..1)
  done: new Set(),
  score: 0,
  collected: 0
};
planets.forEach(p => { mission.scan[p.name] = 0; });

const anomalies = []; // collectible objects
function spawnAnomalies() {
  // 각 행성 근처에 2개씩
  planets.forEach(p => {
    for (let k = 0; k < 2; k++) {
      const a = makeGlowSprite(
        14,
        "rgba(255,255,255,0.95)",
        "rgba(160,120,255,0.35)",
        "rgba(0,0,0,0.0)"
      );
      a.userData = { type: "anomaly", alive: true, around: p.name };

      // 행성 궤도 그룹 기준 위치에 살짝 랜덤
      const angle = Math.random() * Math.PI * 2;
      const rad = p.userData.r * 7 + (Math.random() * 10);
      const offset = new THREE.Vector3(
        Math.cos(angle) * rad,
        (Math.random() - 0.5) * 6,
        Math.sin(angle) * rad
      );

      // anomaly는 planet의 월드포지션 근처에 배치 (초기)
      const base = p.getWorldPosition(new THREE.Vector3());
      a.position.copy(base.add(offset));
      scene.add(a);
      anomalies.push(a);
    }
  });
}
spawnAnomalies();

function updateMissions(dt) {
  // 스캔: 우주선이 행성 근처에 일정 시간 머무르면 완료
  // (orbit 모드에서도 가능하지만, ship 모드에서 더 재밌게)
  const shipPos = ship.position.clone();

  planets.forEach(p => {
    if (mission.done.has(p.name)) return;

    const pPos = p.getWorldPosition(new THREE.Vector3());
    const dist = shipPos.distanceTo(pPos);
    const scanRadius = Math.max(18, p.userData.r * 10);

    if (dist < scanRadius) {
      mission.scan[p.name] = Math.min(1, mission.scan[p.name] + dt / 3.0); // 3초 체류
      if (mission.scan[p.name] >= 1) {
        mission.done.add(p.name);
        mission.score += 100;
        toastMsg(`✅ ${p.name} 스캔 완료! +100`);
      }
    } else {
      // 너무 빡세면 감소는 천천히
      mission.scan[p.name] = Math.max(0, mission.scan[p.name] - dt * 0.15);
    }
  });

  // 수집: 이상현상 가까이 가면 획득
  anomalies.forEach(a => {
    if (!a.userData.alive) return;
    const d = ship.position.distanceTo(a.position);
    if (d < 8) {
      a.userData.alive = false;
      a.visible = false;
      mission.collected += 1;
      mission.score += 25;
      toastMsg(`✨ 이상현상 수집! +25`);
    } else {
      // 살짝 움직이는 느낌
      a.material.rotation += dt * 0.3;
    }
  });
}

// ====== Toast ======
let toastTimer = 0;
function toastMsg(msg) {
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.remove("hide");
  toastTimer = 1.2;
}
function updateToast(dt) {
  if (!toast) return;
  if (toastTimer > 0) {
    toastTimer -= dt;
    if (toastTimer <= 0) toast.classList.add("hide");
  }
}

// ====== UI Events ======
speedSlider.addEventListener("input", (ev) => { timeSpeed = Number(ev.target.value) / 10; });

zoomSlider.addEventListener("input", (ev) => {
  const t = Number(ev.target.value);
  const dist = THREE.MathUtils.lerp(controls.maxDistance, controls.minDistance, t / 100);
  const dir = camera.position.clone().sub(controls.target).normalize();
  camera.position.copy(controls.target.clone().add(dir.multiplyScalar(dist)));
  controls.update();
});

chkTrack.addEventListener("change", (ev) => { trackingEnabled = ev.target.checked; });

btnOrbit.addEventListener("click", () => setShipMode(false));
btnShip.addEventListener("click", () => setShipMode(true));
btnReset.addEventListener("click", () => { followPlanet = null; animateCameraTo(new THREE.Vector3(0, 0, 0), 220, 0.9); });

// 모바일 버튼
if (isMobile) {
  mBoost.addEventListener("touchstart", (e) => { e.preventDefault(); mobileBoost = true; }, { passive:false });
  mBoost.addEventListener("touchend",   (e) => { e.preventDefault(); mobileBoost = false; }, { passive:false });

  mBrake.addEventListener("touchstart", (e) => { e.preventDefault(); mobileBrake = true; }, { passive:false });
  mBrake.addEventListener("touchend",   (e) => { e.preventDefault(); mobileBrake = false; }, { passive:false });

  mCam.addEventListener("touchend", (e) => { e.preventDefault(); toggleCameraView(); toastMsg(`🎥 CAM: ${cameraView}`); }, { passive:false });
  mMode.addEventListener("touchend",(e) => {
    e.preventDefault();
    setShipMode(mode !== "ship");
    toastMsg(`MODE: ${mode.toUpperCase()}`);
  }, { passive:false });

  // 모바일은 기본 SHIP가 더 “탐험” 느낌이라 자동으로 SHIP로
  setShipMode(true);
}

// ====== Mobile joystick ======
let joyActive = false;
let joyCenter = { x: 0, y: 0 };

function setJoyStick(dx, dy) {
  // dx, dy: -1..1
  const max = 40;
  joyStick.style.transform = `translate(${dx * max}px, ${dy * max}px)`;
}

if (isMobile) {
  joyBase.addEventListener("touchstart", (e) => {
    e.preventDefault();
    const t = e.touches[0];
    const rect = joyBase.getBoundingClientRect();
    joyCenter.x = rect.left + rect.width / 2;
    joyCenter.y = rect.top + rect.height / 2;
    joyActive = true;
  }, { passive:false });

  joyBase.addEventListener("touchmove", (e) => {
    e.preventDefault();
    if (!joyActive) return;
    const t = e.touches[0];
    const dx = (t.clientX - joyCenter.x) / 45;
    const dy = (t.clientY - joyCenter.y) / 45;
    joy.x = THREE.MathUtils.clamp(dx, -1, 1);
    joy.y = THREE.MathUtils.clamp(dy, -1, 1);
    setJoyStick(joy.x, joy.y);
  }, { passive:false });

  joyBase.addEventListener("touchend", (e) => {
    e.preventDefault();
    joyActive = false;
    joy.x = 0; joy.y = 0;
    setJoyStick(0, 0);
  }, { passive:false });

  // 오른쪽 영역 드래그 = 시점 변경
  let lookActive = false;
  let last = { x: 0, y: 0 };

  touchArea.addEventListener("touchstart", (e) => {
    // 버튼 위일 수도 있어서 target 체크
    if (e.target && e.target.classList.contains("mbtn")) return;
    const t = e.touches[0];
    lookActive = true;
    last.x = t.clientX;
    last.y = t.clientY;
  }, { passive:true });

  touchArea.addEventListener("touchmove", (e) => {
    if (!lookActive) return;
    const t = e.touches[0];
    look.dx += (t.clientX - last.x);
    look.dy += (t.clientY - last.y);
    last.x = t.clientX;
    last.y = t.clientY;
  }, { passive:true });

  touchArea.addEventListener("touchend", (e) => { lookActive = false; }, { passive:true });
}

// ====== Update loops ======
function updatePlanets(dt) {
  sun.rotation.y += 0.15 * dt;
  corona.rotation.y -= 0.05 * dt;

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
  const k = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

  camera.position.lerpVectors(camAnim.startPos, camAnim.endPos, k);
  controls.target.lerpVectors(camAnim.startTarget, camAnim.endTarget, k);
  controls.update();
  if (t >= 1) camAnim = null;
}

function updateTracking() {
  if (!followPlanet || !trackingEnabled) return;
  if (mode !== "orbit") return;

  const p = followPlanet.getWorldPosition(new THREE.Vector3());
  controls.target.lerp(p, 0.12);
  controls.update();
}

function updateShip(dt) {
  if (mode !== "ship") return;

  // 회전 입력 (PC + 모바일 look)
  const rotSpeed = 1.2;
  if (key["ArrowLeft"])  yaw += rotSpeed * dt;
  if (key["ArrowRight"]) yaw -= rotSpeed * dt;
  if (key["ArrowUp"])    pitch += rotSpeed * 0.8 * dt;
  if (key["ArrowDown"])  pitch -= rotSpeed * 0.8 * dt;

  if (isMobile) {
    // look delta를 각도로 변환
    const sens = 0.0032;
    yaw   -= look.dx * sens;
    pitch -= look.dy * sens;
    // 매 프레임 감쇠(누적 방지)
    look.dx *= 0.35;
    look.dy *= 0.35;
  }

  pitch = THREE.MathUtils.clamp(pitch, -1.1, 1.1);

  ship.rotation.set(0, 0, 0);
  ship.rotateY(yaw);
  ship.rotateX(pitch);

  // 이동 입력
  const boostOn = (key["ShiftLeft"] || key["ShiftRight"]) || mobileBoost;
  const acc = boostOn ? 70 : 35;

  const braking = key["Space"] || mobileBrake;
  const brakeFactor = braking ? 0.86 : 0.96;

  const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(ship.quaternion);
  const right   = new THREE.Vector3(0, 0, -1).applyQuaternion(ship.quaternion);
  const up      = new THREE.Vector3(0, 1, 0);

  let a = new THREE.Vector3(0, 0, 0);

  // PC WASD + QE
  if (key["KeyW"]) a.add(forward);
  if (key["KeyS"]) a.sub(forward);
  if (key["KeyD"]) a.add(right);
  if (key["KeyA"]) a.sub(right);
  if (key["KeyE"]) a.add(up);
  if (key["KeyQ"]) a.sub(up);

  // Mobile joystick: x=좌우, y=위아래(여기서는 y가 전진/후진)
  if (isMobile) {
    // joy.y: 아래로 당기면 +y (후진 느낌)이라 부호 뒤집음
    a.add(forward.clone().multiplyScalar(-joy.y));
    a.add(right.clone().multiplyScalar(joy.x));
  }

  if (a.lengthSq() > 0) a.normalize().multiplyScalar(acc);

  shipVel.add(a.multiplyScalar(dt));
  shipVel.multiplyScalar(brakeFactor);

  const maxV = boostOn ? 420 : 220;
  if (shipVel.length() > maxV) shipVel.setLength(maxV);

  ship.position.add(shipVel.clone().multiplyScalar(dt));

  // 엔진 glow
  const thrusting = a.lengthSq() > 0;
  engineGlow.material.opacity = thrusting ? 0.95 : 0.55;

  // 카메라 시점 토글 (PC)
  if (key["KeyC"]) { key["KeyC"] = false; toggleCameraView(); }

  if (cameraView === "third") {
    const camBack = forward.clone().multiplyScalar(-30);
    const camUp = new THREE.Vector3(0, 1, 0).multiplyScalar(10);
    const desired = ship.position.clone().add(camBack).add(camUp);
    camera.position.lerp(desired, 0.12);
    camera.lookAt(ship.position.clone().add(forward.clone().multiplyScalar(30)));
  } else {
    const desired = ship.position.clone().add(forward.clone().multiplyScalar(2)).add(new THREE.Vector3(0, 1.2, 0));
    camera.position.lerp(desired, 0.25);
    camera.lookAt(ship.position.clone().add(forward.clone().multiplyScalar(60)));
  }
}

function updateHUD() {
  const targetName = followPlanet ? followPlanet.name : "None";
  const done = mission.done.size;
  const total = planets.length;
  const progLines = planets.map(p => {
    const v = mission.done.has(p.name) ? 1 : mission.scan[p.name];
    const barLen = 10;
    const fill = Math.round(v * barLen);
    const bar = "█".repeat(fill) + "░".repeat(barLen - fill);
    return `${p.name.padEnd(7)} [${bar}] ${Math.round(v * 100)}%`;
  }).join("\n");

  hud.textContent =
    `Mode: ${mode.toUpperCase()} (${cameraView})\n` +
    `Track: ${trackingEnabled ? "ON" : "OFF"} / Target: ${targetName}\n` +
    `TimeSpeed: ${timeSpeed.toFixed(2)}\n` +
    `Score: ${mission.score}  |  Collected: ${mission.collected}\n` +
    `Scans: ${done}/${total}\n\n` +
    progLines;
}

// ====== Render loop ======
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.033);

  updatePlanets(dt);
  updateCameraAnim(dt);

  if (mode === "orbit") controls.update();

  updateShip(dt);
  updateTracking();

  updateMissions(dt);
  updateToast(dt);
  updateHUD();

  renderer.render(scene, camera);
}
animate();

// ====== Resize ======
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  const pr = Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2.0);
  renderer.setPixelRatio(pr);
});

// ====== 기본값 ======
chkTrack.checked = true;
trackingEnabled = true;
timeSpeed = Number(speedSlider.value) / 10;
