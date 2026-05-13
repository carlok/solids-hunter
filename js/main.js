// ═══════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════
const COLORS = {
  Red:    0xe74c3c,
  Blue:   0x2980b9,
  Green:  0x27ae60,
  Yellow: 0xf1c40f,
  Purple: 0x8e44ad,
  Orange: 0xe67e22,
  White:  0xecf0f1
};
const CNAMES = Object.keys(COLORS);
const SHAPES = ['Sphere','Tetrahedron','Cube','Cylinder'];

// ═══════════════════════════════════════════
//  RENDERER
// ═══════════════════════════════════════════
const canvas  = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;

const scene  = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, innerWidth/innerHeight, 0.1, 300);

function onResize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
onResize();
addEventListener('resize', onResize);

// ═══════════════════════════════════════════
//  CONTROLS
// ═══════════════════════════════════════════
const controls = new THREE.PointerLockControls(camera, document.body);
scene.add(controls.getObject());
controls.getObject().position.set(0, 1.7, 0);

const keys = {};

// ═══════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════
let score       = 0;
let huntColor   = '';
let huntShape   = '';
let entities    = [];
let envMeshes   = [];
let wallBoxes   = [];
let matchLeft   = 0;
let gameActive  = false;
let selectedEnv = null;

// ═══════════════════════════════════════════
//  UI REFS
// ═══════════════════════════════════════════
const envScreen  = document.getElementById('env-screen');
const huntScreen = document.getElementById('hunt-screen');
const hudEl      = document.getElementById('hud');
const pausedEl   = document.getElementById('paused');
const roundEndEl = document.getElementById('round-end');
const flashEl    = document.getElementById('flash');
const vigEl      = document.getElementById('vignette');
const ruleDisp   = document.getElementById('rule-disp');
const scoreEl    = document.getElementById('score-el');
const targetsEl  = document.getElementById('targets-el');
const hudBadge   = document.getElementById('hud-badge');
const finalScEl  = document.getElementById('final-score');
const envBtn     = document.getElementById('env-btn');
const topNav     = document.getElementById('top-nav');
const navToggle  = document.getElementById('nav-toggle');
const navDropdown = document.getElementById('nav-dropdown');
const modalHelp  = document.getElementById('modal-help');
const modalCredits = document.getElementById('modal-credits');

addEventListener('keydown', e => {
  if (e.code === 'Escape') {
    if (!modalHelp.classList.contains('hidden')) {
      modalHelp.classList.add('hidden');
      e.preventDefault();
      return;
    }
    if (!modalCredits.classList.contains('hidden')) {
      modalCredits.classList.add('hidden');
      e.preventDefault();
      return;
    }
  }
  keys[e.code] = true;
  if (gameActive && controls.isLocked) {
    if (e.code === 'ArrowUp' || e.code === 'ArrowDown' ||
        e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      e.preventDefault();
    }
  }
});
addEventListener('keyup',   e => { keys[e.code] = false; });

function closeModals() {
  modalHelp.classList.add('hidden');
  modalCredits.classList.add('hidden');
}

function closeNavMenu() {
  navDropdown.classList.add('hidden');
  navToggle.setAttribute('aria-expanded', 'false');
}

function syncTopNav() {
  topNav.classList.toggle('hidden', controls.isLocked && gameActive);
}

/** Return to arena picker: leave game, clear world, reset selection */
function goHome() {
  closeModals();
  closeNavMenu();
  gameActive = false;
  roundEndEl.classList.add('hidden');
  pausedEl.classList.add('hidden');
  huntScreen.classList.add('hidden');
  hudEl.classList.add('hidden');
  vigEl.classList.add('hidden');
  clearAll();
  document.querySelectorAll('.env-card').forEach(c => c.classList.remove('sel'));
  selectedEnv = null;
  envBtn.disabled = true;
  envBtn.textContent = '\u2014 SELECT AN ENVIRONMENT \u2014';
  envScreen.classList.remove('hidden');
  try { if (controls.isLocked) controls.unlock(); } catch (e) {}
  syncTopNav();
}

// ═══════════════════════════════════════════
//  UI EVENTS
// ═══════════════════════════════════════════
navToggle.addEventListener('click', e => {
  e.stopPropagation();
  const willOpen = navDropdown.classList.contains('hidden');
  navDropdown.classList.toggle('hidden');
  navToggle.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
});

document.addEventListener('click', e => {
  if (navDropdown.classList.contains('hidden')) return;
  if (e.target.closest('#top-nav')) return;
  closeNavMenu();
});

document.getElementById('nav-main').addEventListener('click', () => { goHome(); });
document.getElementById('nav-help').addEventListener('click', () => {
  closeNavMenu();
  modalHelp.classList.remove('hidden');
});
document.getElementById('nav-credits').addEventListener('click', () => {
  closeNavMenu();
  modalCredits.classList.remove('hidden');
});

document.getElementById('help-close').addEventListener('click', () => { modalHelp.classList.add('hidden'); });
document.getElementById('credits-close').addEventListener('click', () => { modalCredits.classList.add('hidden'); });
modalHelp.addEventListener('click', e => { if (e.target === modalHelp) modalHelp.classList.add('hidden'); });
modalCredits.addEventListener('click', e => { if (e.target === modalCredits) modalCredits.classList.add('hidden'); });

document.querySelectorAll('.env-card').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.env-card').forEach(c => c.classList.remove('sel'));
    card.classList.add('sel');
    selectedEnv = card.dataset.env;
    envBtn.disabled = false;
    envBtn.textContent = 'ENTER ' + selectedEnv.toUpperCase() + ' \u2192';
  });
});

envBtn.addEventListener('click', () => {
  if (!selectedEnv) return;
  clearAll();
  buildEnv(selectedEnv);
  showHuntScreen();
});

document.getElementById('start-btn').addEventListener('click', () => {
  huntScreen.classList.add('hidden');
  controls.lock();
});

document.getElementById('resume-btn').addEventListener('click', () => {
  pausedEl.classList.add('hidden');
  controls.lock();
});

document.getElementById('new-round-btn').addEventListener('click', () => {
  roundEndEl.classList.add('hidden');
  clearEntities();
  showHuntScreen();
});

document.getElementById('back-arena-btn').addEventListener('click', () => { goHome(); });

document.getElementById('paused-menu-btn').addEventListener('click', () => { goHome(); });

document.getElementById('change-env-btn').addEventListener('click', () => {
  roundEndEl.classList.add('hidden');
  goHome();
});

controls.addEventListener('lock', () => {
  gameActive = true;
  hudEl.classList.remove('hidden');
  vigEl.classList.remove('hidden');
  pausedEl.classList.add('hidden');
  syncTopNav();
  if (window.GameAudio) GameAudio.onEnterPlay();
});

controls.addEventListener('unlock', () => {
  gameActive = false;
  if (window.GameAudio) GameAudio.onLeavePlay();
  if (!roundEndEl.classList.contains('hidden')) { syncTopNav(); return; }
  if (!envScreen.classList.contains('hidden')) { syncTopNav(); return; }
  if (!huntScreen.classList.contains('hidden')) { syncTopNav(); return; }
  pausedEl.classList.remove('hidden');
  hudEl.classList.add('hidden');
  vigEl.classList.add('hidden');
  syncTopNav();
});

syncTopNav();

// ═══════════════════════════════════════════
//  ENV BUILDER HELPERS
// ═══════════════════════════════════════════
function addLight(type, color, intensity, x, y, z, dist) {
  let l;
  if (type === 'ambient') {
    l = new THREE.AmbientLight(color, intensity);
  } else if (type === 'dir') {
    l = new THREE.DirectionalLight(color, intensity);
    l.position.set(x, y, z);
  } else if (type === 'point') {
    l = new THREE.PointLight(color, intensity, dist || 60);
    l.position.set(x, y, z);
  }
  scene.add(l);
  envMeshes.push(l);
}

function addBox(w, h, d, color, x, y, z, ry, isWall, opacity) {
  const op  = (opacity === undefined) ? 1 : opacity;
  const mat = op < 1
    ? new THREE.MeshLambertMaterial({ color, transparent: true, opacity: op })
    : new THREE.MeshLambertMaterial({ color });
  const m   = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  if (ry) m.rotation.y = ry;
  m.receiveShadow = true; m.castShadow = true;
  scene.add(m); envMeshes.push(m);
  if (isWall) wallBoxes.push(new THREE.Box3().setFromObject(m));
  return m;
}

function addFloor(size, color) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshLambertMaterial({ color })
  );
  m.rotation.x = -Math.PI / 2;
  m.receiveShadow = true;
  scene.add(m); envMeshes.push(m);
  return m;
}

function addMesh(geo, color, x, y, z, ry, isWall) {
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color }));
  m.position.set(x, y, z);
  if (ry) m.rotation.y = ry;
  m.castShadow = true; m.receiveShadow = true;
  scene.add(m); envMeshes.push(m);
  if (isWall) wallBoxes.push(new THREE.Box3().setFromObject(m));
  return m;
}

// ═══════════════════════════════════════════
//  ENVIRONMENTS
// ═══════════════════════════════════════════
const ENVS = {

  dungeon() {
    scene.background = new THREE.Color(0x121a2a);
    scene.fog = new THREE.Fog(0x121a2a, 10, 52);
    addLight('ambient', 0x8899cc, 0.72);
    addLight('point',  0xaabbff, 1.55,   0, 3.5,   0, 48);
    addLight('point',  0xffaa88, 1.0,  13, 3,  -13, 28);
    addLight('point',  0xffaa88, 1.0, -13, 3,   13, 28);

    addFloor(70, 0x2a3148);

    // Ceiling
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(70,70), new THREE.MeshLambertMaterial({color:0x151d2e}));
    ceil.rotation.x = Math.PI/2; ceil.position.y = 5.5; scene.add(ceil); envMeshes.push(ceil);

    // Outer walls
    addBox(70,6,1,   0x343d52,  0,3, -35,0,true);
    addBox(70,6,1,   0x343d52,  0,3,  35,0,true);
    addBox(1, 6, 70, 0x343d52,-35,3,   0,0,true);
    addBox(1, 6, 70, 0x343d52, 35,3,   0,0,true);

    // Interior walls
    addBox(18,5,1.2, 0x3d4656, -9,2.5,-11,0,true);
    addBox(18,5,1.2, 0x3d4656,  9,2.5, 11,0,true);
    addBox(1.2,5,14, 0x3d4656,  7,2.5,-19,0,true);
    addBox(1.2,5,14, 0x3d4656, -7,2.5, 19,0,true);
    addBox(10,5,1.2, 0x3d4656, 19,2.5, -5,0,true);
    addBox(10,5,1.2, 0x3d4656,-19,2.5,  5,0,true);

    // Pillars (no pillar at origin — player spawn corridor)
    [[-9,0,-9],[9,0,-9],[-9,0,9],[9,0,9],
     [-17,0,-17],[17,0,-17],[-17,0,17],[17,0,17]].forEach(([x,,z]) => {
      addBox(1.5,5.5,1.5, 0x4a5568, x,2.75,z,0,true);
    });

    // Rubble
    [[-4,0,-4],[6,0,8],[-13,0,-6],[15,0,7],[-8,0,15],[10,0,-17]].forEach(([x,,z]) => {
      addBox(1.8,0.55,1.2, 0x2e3545, x,0.28,z, Math.random()*Math.PI, false);
    });
  },

  forest() {
    scene.background = new THREE.Color(0x0c180f);
    scene.fog = new THREE.FogExp2(0x0c180f, 0.026);
    addLight('ambient', 0x3a5c42, 0.85);
    addLight('dir',    0xaaffcc, 0.62, 5, 15, 5);
    addLight('point',  0x66ff88, 0.75,  0, 6,  0, 65);
    addLight('point',  0x77ee99, 0.45, 16, 5,-16, 38);

    addFloor(90, 0x1a2e22);

    // Boundary walls (match floor, invisible-ish)
    addBox(90,12,0.5, 0x1a2e22,  0,6,-45,0,true);
    addBox(90,12,0.5, 0x1a2e22,  0,6, 45,0,true);
    addBox(0.5,12,90, 0x1a2e22,-45,6,  0,0,true);
    addBox(0.5,12,90, 0x1a2e22, 45,6,  0,0,true);

    // Trees
    const treePos = [
      [7,0,10],[-10,0,8],[14,0,-5],[-17,0,-9],[5,0,-14],[-6,0,17],
      [23,0,7],[-23,0,-12],[2,0,21],[-12,0,-21],[20,0,-17],[-20,0,14],
      [10,0,-23],[-27,0,5],[27,0,-10],[9,0,28],[-9,0,-28],[16,0,16],[-16,0,-16]
    ];
    treePos.forEach(([x,,z]) => {
      const h = 7 + Math.random() * 7;
      const r = 0.25 + Math.random() * 0.3;
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(r, r*1.35, h, 7),
        new THREE.MeshLambertMaterial({color:0x2a1007})
      );
      trunk.position.set(x, h/2, z);
      trunk.castShadow = true;
      scene.add(trunk); envMeshes.push(trunk);
      wallBoxes.push(new THREE.Box3().setFromObject(trunk));
      // Canopy
      [0, 1.8, 3.5].forEach((off, i) => {
        const cg = new THREE.ConeGeometry(r*(6-i*1.3), 3.2+i*0.3, 7);
        const cm = new THREE.Mesh(cg, new THREE.MeshLambertMaterial({color:0x0e2e0e}));
        cm.position.set(x, h - 0.5 + off, z);
        scene.add(cm); envMeshes.push(cm);
      });
    });

    // Rocks
    [[-5,0,6],[12,0,-10],[-14,0,4],[8,0,-5],[1,0,11],[-7,0,-17]].forEach(([x,,z]) => {
      addMesh(
        new THREE.DodecahedronGeometry(0.55+Math.random()*0.6,0),
        0x3a4a3a, x, 0.4, z, 0, true
      );
    });
  },

  lab() {
    scene.background = new THREE.Color(0x12182a);
    scene.fog = new THREE.Fog(0x12182a, 14, 58);
    addLight('ambient', 0x8899bb, 0.75);
    addLight('point',  0x55eeff, 1.25,   0, 5,   0, 58);
    addLight('point',  0xffffff, 0.55,  15, 4,  15, 32);
    addLight('point',  0xffffff, 0.55, -15, 4, -15, 32);

    addFloor(65, 0x1a2235);

    // Ceiling
    const ceil2 = new THREE.Mesh(new THREE.PlaneGeometry(65,65), new THREE.MeshLambertMaterial({color:0x141c2e}));
    ceil2.rotation.x = Math.PI/2; ceil2.position.y = 6.5; scene.add(ceil2); envMeshes.push(ceil2);

    // Floor grid lines
    const lineMat = new THREE.MeshBasicMaterial({color:0x18183a});
    for (let i = -30; i <= 30; i += 5) {
      const gl1 = new THREE.Mesh(new THREE.PlaneGeometry(60,0.055),lineMat);
      gl1.rotation.x = -Math.PI/2; gl1.position.set(0,0.01,i); scene.add(gl1); envMeshes.push(gl1);
      const gl2 = new THREE.Mesh(new THREE.PlaneGeometry(0.055,60),lineMat);
      gl2.rotation.x = -Math.PI/2; gl2.position.set(i,0.01,0); scene.add(gl2); envMeshes.push(gl2);
    }

    // Outer walls
    addBox(65,7,0.5, 0x2a3448,  0,3.5,-32,0,true);
    addBox(65,7,0.5, 0x2a3448,  0,3.5, 32,0,true);
    addBox(0.5,7,65, 0x2a3448,-32,3.5,  0,0,true);
    addBox(0.5,7,65, 0x2a3448, 32,3.5,  0,0,true);

    // Glass partitions
    [[0.3,6,10,  10,3,  0],
     [0.3,6,10, -10,3,  0],
     [10, 6,0.3,  0,3, 10],
     [10, 6,0.3,  0,3,-10]].forEach(([w,h,d,x,y,z]) => {
      const gm = new THREE.Mesh(
        new THREE.BoxGeometry(w,h,d),
        new THREE.MeshLambertMaterial({color:0x004466,transparent:true,opacity:0.28})
      );
      gm.position.set(x,y,z);
      scene.add(gm); envMeshes.push(gm);
      wallBoxes.push(new THREE.Box3().setFromObject(gm));
    });

    // Lab consoles
    [[-7,0,7],[7,0,-7],[13,0,-13],[-13,0,13],[0,0,-19],[0,0,19],[-19,0,0],[19,0,0]].forEach(([x,,z]) => {
      addBox(3,1.2,1.5, 0x121828, x,0.6,z, 0,false);
    });

    // Ceiling emissive strips
    const sMat = new THREE.MeshBasicMaterial({color:0x00e5ff});
    [[-13,6,0],[13,6,0],[0,6,-13],[0,6,13],[-13,6,-13],[13,6,13]].forEach(([x,y,z]) => {
      const sm = new THREE.Mesh(new THREE.BoxGeometry(9,0.07,0.22), sMat);
      sm.position.set(x,y-0.05,z); scene.add(sm); envMeshes.push(sm);
      const sl = new THREE.PointLight(0x00e5ff,0.4,15);
      sl.position.set(x,y-0.7,z); scene.add(sl); envMeshes.push(sl);
    });
  },

  ruins() {
    scene.background = new THREE.Color(0x1c1810);
    scene.fog = new THREE.FogExp2(0x1c1810, 0.016);
    addLight('ambient', 0x5a4838, 0.72);
    addLight('dir',    0xffaa77, 0.65, 10, 20, 5);
    addLight('point',  0xff6622, 0.58, -13, 4, -13, 52);
    addLight('point',  0xff8844, 0.48,  16, 3,  16, 40);

    addFloor(90, 0x2a2218);

    // Boundary
    addBox(90,9,0.5, 0x2a2218,  0,4.5,-45,0,true);
    addBox(90,9,0.5, 0x2a2218,  0,4.5, 45,0,true);
    addBox(0.5,9,90, 0x2a2218,-45,4.5,  0,0,true);
    addBox(0.5,9,90, 0x2a2218, 45,4.5,  0,0,true);

    const wc = 0x4a2e18;
    // Wall segments
    addBox(10,4,0.9,wc,-11,2, -9, 0.2,true);
    addBox(7, 6,0.9,wc,  7,3,-14,-0.1,true);
    addBox(14,3,0.9,wc, 10,1.5, 7, 0.3,true);
    addBox(8, 5,0.9,wc,-17,2.5,12,-0.2,true);
    addBox(5, 2,0.9,wc,  1,1,  10, 0.5,true);
    addBox(12,4,0.9,wc, -5,2, -22, 0.1,true);
    addBox(9, 5,0.9,wc, 20,2.5, 0,  0,  true);
    addBox(11,3,0.9,wc,-22,1.5,-7, 0.15,true);
    addBox(7, 4,0.9,wc, -4,2,  19, 0.35,true);
    addBox(8, 3,0.9,wc, 15,1.5,-21, 0.1,true);

    // Broken columns
    [[-5,0,5],[-10,0,10],[17,0,-7],[-17,0,-14],[2,0,-20],[12,0,17],[23,0,4],[-23,0,-5]].forEach(([x,,z]) => {
      const ch = 1.5 + Math.random() * 4;
      addBox(1.2,ch,1.2, 0x5a3a20, x,ch/2,z,0,true);
      if (Math.random() > 0.45) {
        addBox(2,0.45,2, 0x4a2e18, x+(Math.random()-0.5)*0.4, ch+0.23, z+(Math.random()-0.5)*0.4, Math.random()*0.3, false);
      }
    });

    // Rubble
    [[6,0,-7],[-5,0,14],[14,0,10],[-10,0,-17],[2,0,7],[11,0,-5]].forEach(([x,,z]) => {
      for (let i = 0; i < 5; i++) {
        const s = 0.22 + Math.random() * 0.65;
        const rm = new THREE.Mesh(
          new THREE.BoxGeometry(s, s*0.45, s*0.8),
          new THREE.MeshLambertMaterial({color:0x3a2010})
        );
        rm.position.set(x+(Math.random()-0.5)*2.5, s*0.23, z+(Math.random()-0.5)*2.5);
        rm.rotation.y = Math.random()*Math.PI;
        scene.add(rm); envMeshes.push(rm);
      }
    });
  }
};

const ENV_SPAWN = {
  dungeon: new THREE.Vector3(6, 1.7, 8),
  forest:  new THREE.Vector3(0, 1.7, 0),
  lab:     new THREE.Vector3(0, 1.7, 0),
  ruins:   new THREE.Vector3(0, 1.7, 0)
};

function buildEnv(name) {
  ENVS[name]();
  const spawn = ENV_SPAWN[name] || ENV_SPAWN.forest;
  controls.getObject().position.copy(spawn);
  camera.rotation.set(0, 0, 0);
}

// ═══════════════════════════════════════════
//  HUNT SCREEN
// ═══════════════════════════════════════════
function showHuntScreen() {
  envScreen.classList.add('hidden');
  score     = 0;
  huntColor = CNAMES[Math.floor(Math.random()*CNAMES.length)];
  huntShape = SHAPES[Math.floor(Math.random()*SHAPES.length)];

  spawnEntities();

  const hex = '#' + COLORS[huntColor].toString(16).padStart(6,'0');
  ruleDisp.textContent       = huntColor + ' ' + huntShape;
  ruleDisp.style.color       = hex;
  hudBadge.textContent       = huntColor + ' ' + huntShape;
  hudBadge.style.color       = hex;
  hudBadge.style.borderColor = hex;

  updateHUD();
  huntScreen.classList.remove('hidden');
  hudEl.classList.add('hidden');
  vigEl.classList.add('hidden');
}

// ═══════════════════════════════════════════
//  ENTITIES
// ═══════════════════════════════════════════
function makeEntityGeo(shape) {
  if (shape === 'Sphere')      return new THREE.SphereGeometry(0.48, 14, 14);
  if (shape === 'Tetrahedron') return new THREE.TetrahedronGeometry(0.58, 0);
  if (shape === 'Cube')        return new THREE.BoxGeometry(0.88, 0.88, 0.88);
  if (shape === 'Cylinder')    return new THREE.CylinderGeometry(0.32, 0.32, 0.88, 10);
}

function makeLabel(text, hexColor) {
  const cv  = document.createElement('canvas');
  cv.width = 288; cv.height = 64;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.58)';
  ctx.fillRect(0,0,288,64);
  ctx.font = 'bold 17px Courier New';
  ctx.fillStyle = hexColor;
  ctx.textAlign = 'center';
  ctx.fillText(text, 144, 40);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(cv),
    depthTest: false,
    transparent: true
  }));
  sp.scale.set(2.3, 0.52, 1);
  return sp;
}

function freeSpawn() {
  for (let t = 0; t < 30; t++) {
    const x = (Math.random()-0.5)*44;
    const z = (Math.random()-0.5)*44;
    if (Math.abs(x) < 4 && Math.abs(z) < 4) continue;
    return new THREE.Vector3(x, 1.5, z);
  }
  return new THREE.Vector3(9, 1.5, 9);
}

function spawnEntities() {
  clearEntities();
  const count = 14 + Math.floor(Math.random()*5);

  let list = Array.from({length:count}, () => ({
    shape: SHAPES[Math.floor(Math.random()*4)],
    color: CNAMES[Math.floor(Math.random()*7)]
  }));

  // guarantee >= 3 matching
  let nm = list.filter(e => e.shape===huntShape && e.color===huntColor).length;
  while (nm < 3) {
    const i = Math.floor(Math.random()*list.length);
    list[i] = { shape: huntShape, color: huntColor };
    nm = list.filter(e => e.shape===huntShape && e.color===huntColor).length;
  }

  list.forEach(({shape, color}) => {
    const colorHex = COLORS[color];
    const hexStr   = '#' + colorHex.toString(16).padStart(6,'0');
    const geo      = makeEntityGeo(shape);
    const mesh     = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({color:colorHex}));
    const pos      = freeSpawn();
    mesh.position.copy(pos);
    mesh.castShadow = true;
    scene.add(mesh);

    // Outline (inverted normals shell)
    const outMesh = new THREE.Mesh(makeEntityGeo(shape), new THREE.MeshBasicMaterial({color:0x000000,side:THREE.BackSide}));
    outMesh.scale.setScalar(1.1);
    mesh.add(outMesh);

    // Label sprite
    const label = makeLabel(color + ' ' + shape, hexStr);
    label.position.copy(pos).setY(pos.y + 1.2);
    scene.add(label);

    // Random walk target
    const target = new THREE.Vector3(
      THREE.MathUtils.clamp((Math.random()-0.5)*60,-30,30),
      1.5,
      THREE.MathUtils.clamp((Math.random()-0.5)*60,-30,30)
    );

    entities.push({
      mesh, label, shape, color,
      isMatch: shape===huntShape && color===huntColor,
      bobPhase: Math.random()*Math.PI*2,
      bobFreq:  1.1 + Math.random()*0.9,
      speed:    1.4 + Math.random()*1.3,
      target,
      targetTimer: 3 + Math.random()*4,
      alive: true, dying: false, dyingT: 0
    });
  });

  matchLeft = entities.filter(e=>e.isMatch).length;
  updateHUD();
}

function clearEntities() {
  entities.forEach(e => { scene.remove(e.mesh); scene.remove(e.label); });
  entities = [];
}

function clearAll() {
  clearEntities();
  envMeshes.forEach(o => scene.remove(o));
  envMeshes = []; wallBoxes = [];
  scene.fog = null; scene.background = null;
}

// ═══════════════════════════════════════════
//  RAYCASTING
// ═══════════════════════════════════════════
const raycaster = new THREE.Raycaster();
const CENT      = new THREE.Vector2(0, 0);

addEventListener('click', () => {
  if (!gameActive || !controls.isLocked) return;

  if (window.GameAudio) GameAudio.shoot();

  raycaster.setFromCamera(CENT, camera);
  const liveMeshes = entities.filter(e=>e.alive&&!e.dying).map(e=>e.mesh);
  const hits = raycaster.intersectObjects(liveMeshes, true);
  if (!hits.length) return;

  let obj = hits[0].object;
  // outline is a child — walk up
  if (obj.parent && entities.find(e=>e.mesh===obj.parent)) obj = obj.parent;
  const ent = entities.find(e=>e.mesh===obj);
  if (!ent || ent.dying || !ent.alive) return;

  if (ent.isMatch) {
    score += 10; matchLeft--;
    ent.dying = true; ent.dyingT = 0;
    doFlash('#00ff88', 0.28);
    if (window.GameAudio) GameAudio.hitCorrect();
    updateHUD();
    if (matchLeft <= 0) setTimeout(endRound, 700);
  } else {
    score = Math.max(0, score-5);
    doFlash('#ff2200', 0.42);
    if (window.GameAudio) GameAudio.hitWrong();
    updateHUD();
  }
});

function doFlash(color, alpha) {
  flashEl.style.background = color;
  flashEl.style.opacity = alpha;
  setTimeout(() => { flashEl.style.opacity = 0; }, 180);
}

function endRound() {
  if (window.GameAudio) GameAudio.roundWin();
  gameActive = false;
  hudEl.classList.add('hidden'); vigEl.classList.add('hidden'); pausedEl.classList.add('hidden');
  finalScEl.textContent = score;
  roundEndEl.classList.remove('hidden');
  controls.unlock();
}

function updateHUD() {
  scoreEl.textContent   = score;
  targetsEl.textContent = matchLeft;
}

// ═══════════════════════════════════════════
//  COLLISION
// ═══════════════════════════════════════════
const pBox = new THREE.Box3();
function hitsWall(pos) {
  pBox.setFromCenterAndSize(pos, new THREE.Vector3(0.5, 1.8, 0.5));
  for (const wb of wallBoxes) if (pBox.intersectsBox(wb)) return true;
  return false;
}

// ═══════════════════════════════════════════
//  GAME LOOP
// ═══════════════════════════════════════════
const clock    = new THREE.Clock();
const playerObj = controls.getObject();

(function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t  = clock.elapsedTime;

  // ── Player movement ──
  if (gameActive && controls.isLocked) {
    const MV = 6;
    const fwd = new THREE.Vector3();
    if (keys['KeyW']||keys['ArrowUp'])    fwd.z -= 1;
    if (keys['KeyS']||keys['ArrowDown'])  fwd.z += 1;
    if (keys['KeyA']||keys['ArrowLeft'])  fwd.x -= 1;
    if (keys['KeyD']||keys['ArrowRight']) fwd.x += 1;
    fwd.normalize().multiplyScalar(MV*dt);
    fwd.applyQuaternion(camera.quaternion);
    fwd.y = 0;

    if (window.GameAudio) GameAudio.maybeFootstep(dt, fwd.lengthSq() > 1e-8);

    const np = playerObj.position.clone().add(fwd);
    np.x = THREE.MathUtils.clamp(np.x,-40,40);
    np.z = THREE.MathUtils.clamp(np.z,-40,40);
    np.y = 1.7;
    if (!hitsWall(np)) playerObj.position.copy(np);
  }

  // ── Entity update ──
  entities.forEach(ent => {
    if (!ent.alive) return;
    const m = ent.mesh;
    const l = ent.label;

    if (ent.dying) {
      ent.dyingT += dt * 4;
      const s = Math.max(0, 1-ent.dyingT);
      m.scale.setScalar(s);
      l.material.opacity = s;
      if (ent.dyingT >= 1) {
        ent.alive = false;
        scene.remove(m); scene.remove(l);
      }
      return;
    }

    // Bob animation
    m.position.y = 1.45 + Math.sin(t*ent.bobFreq + ent.bobPhase)*0.2;
    m.rotation.y += dt * 0.55;

    // Walk toward target
    ent.targetTimer -= dt;
    if (ent.targetTimer <= 0) {
      ent.target.set(
        THREE.MathUtils.clamp((Math.random()-0.5)*60,-30,30),
        1.5,
        THREE.MathUtils.clamp((Math.random()-0.5)*60,-30,30)
      );
      ent.targetTimer = 3 + Math.random()*4;
    }
    const dx = ent.target.x - m.position.x;
    const dz = ent.target.z - m.position.z;
    const dist = Math.sqrt(dx*dx+dz*dz);
    if (dist > 0.5) {
      m.position.x += (dx/dist)*ent.speed*dt;
      m.position.z += (dz/dist)*ent.speed*dt;
    }
    m.position.x = THREE.MathUtils.clamp(m.position.x,-30,30);
    m.position.z = THREE.MathUtils.clamp(m.position.z,-30,30);

    // Label follows entity
    l.position.set(m.position.x, m.position.y+1.15, m.position.z);
    l.visible = playerObj.position.distanceTo(m.position) < 20;
  });

  renderer.render(scene, camera);
})();

if (window.GameAudio) GameAudio.load().catch(function () {});

document.addEventListener(
  'click',
  function (e) {
    if (!window.GameAudio) return;
    if (e.target === canvas && gameActive && controls.isLocked) return;
    if (e.target.closest('button, .env-card, .modal-close, a')) GameAudio.uiClick();
  },
  true
);
