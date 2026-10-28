(function start(){
  if (!window.THREE){ window.addEventListener('three-ready', start, {once:true}); return; }
  const THREE = window.THREE;
// THREE provided via window.THREE

/* ============================================================
   Password Geode — 3D engine + UI
   ------------------------------------------------------------
   Voxel rock (Minecraft-style cubes) ── cracks with entropy ──
   reveals procedural crystal geode in the hollow center.
   ============================================================ */

// ---------- tiny helpers ----------
const $ = s => document.querySelector(s);
const clamp = (x,a,b)=>Math.max(a,Math.min(b,x));
const lerp = (a,b,t)=>a+(b-a)*t;
const smoothstep = (a,b,x)=>{ const t = clamp((x-a)/(b-a),0,1); return t*t*(3-2*t); };

// Seeded PRNG (mulberry32)
function rng(seed){
  let a = seed>>>0;
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function hashStr(s){
  let h = 2166136261 >>> 0;
  for (let i=0;i<s.length;i++){
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

// ---------- entropy ----------
function analyze(pw){
  const classes = { lower:false, upper:false, digit:false, symbol:false };
  for (const ch of pw){
    const c = ch.charCodeAt(0);
    if (c>=97 && c<=122) classes.lower = true;
    else if (c>=65 && c<=90) classes.upper = true;
    else if (c>=48 && c<=57) classes.digit = true;
    else classes.symbol = true;
  }
  let poolSize = 0;
  if (classes.lower) poolSize += 26;
  if (classes.upper) poolSize += 26;
  if (classes.digit) poolSize += 10;
  if (classes.symbol) poolSize += 33;
  const len = pw.length;
  // basic entropy
  let entropy = len>0 && poolSize>0 ? len * Math.log2(poolSize) : 0;
  // penalize repeats and sequences
  if (len>0){
    let unique = new Set(pw).size;
    const diversity = unique / len;
    entropy *= (0.5 + 0.5 * diversity);
    // common patterns
    const pat = /(password|123456|qwerty|admin|letmein|welcome)/i;
    if (pat.test(pw)) entropy = Math.min(entropy, 12);
  }
  return { entropy, poolSize, classes, len };
}

function crackTime(entropy){
  // guesses/sec at 1e10
  const guesses = Math.pow(2, entropy) / 2;
  const sec = guesses / 1e10;
  if (!isFinite(sec)) return "eons";
  if (sec < 1e-6) return "instant";
  if (sec < 1) return `${(sec*1000).toFixed(1)} ms`;
  if (sec < 60) return `${sec.toFixed(1)} s`;
  if (sec < 3600) return `${(sec/60).toFixed(1)} min`;
  if (sec < 86400) return `${(sec/3600).toFixed(1)} hr`;
  if (sec < 86400*365) return `${(sec/86400).toFixed(1)} days`;
  const years = sec/(86400*365);
  if (years < 1e3) return `${years.toFixed(1)} years`;
  if (years < 1e6) return `${(years/1e3).toFixed(1)}K years`;
  if (years < 1e9) return `${(years/1e6).toFixed(1)}M years`;
  if (years < 1e12) return `${(years/1e9).toFixed(1)}B years`;
  if (years < 1e15) return `${(years/1e12).toFixed(1)}T years`;
  return "heat death";
}

// ---------- palettes ----------
const PALETTES = {
  amethyst: { base: 0x7c5fc7, accent: 0xbfa3ff, glow: 0xd9baff, warm:false },
  citrine:  { base: 0xd8a24a, accent: 0xffd56b, glow: 0xffe9a8, warm:true },
  emerald:  { base: 0x3aa37a, accent: 0x7de0b3, glow: 0xc8f3d9, warm:false },
};
const ROCKS = {
  granite:   { base: 0x58544e, grain:[0x3f3c37, 0x6d685f, 0x8a8178], noise:0.22 },
  obsidian:  { base: 0x1a1a1e, grain:[0x0c0c10, 0x2a2a32, 0x44404c], noise:0.12 },
  sandstone: { base: 0x9a7d5a, grain:[0x7c6144, 0xb69b7a, 0xd6bb93], noise:0.3 },
};

// ---------- UI state ----------
let state = {
  pw: "",
  reveal: false,
  rock: TWEAK_DEFAULTS.rock,
  palette: TWEAK_DEFAULTS.palette,
  resolution: TWEAK_DEFAULTS.resolution,
  spin: TWEAK_DEFAULTS.spin,
};
let current = { entropy: 0, poolSize: 0, classes:{}, len:0 };

// ---------- THREE setup ----------
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0c0d0f, 0.04);

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
camera.position.set(0, 0.8, 12);
camera.lookAt(0,0,0);

// Lighting
const ambient = new THREE.AmbientLight(0xffffff, 0.25);
scene.add(ambient);

const keyLight = new THREE.DirectionalLight(0xfff1d6, 1.2);
keyLight.position.set(6, 8, 6);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x7fa8d9, 0.5);
fillLight.position.set(-6, 2, -4);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xffddaa, 0.4);
rimLight.position.set(0, -4, -6);
scene.add(rimLight);

// Inner point light — pulses when geode opens
const innerLight = new THREE.PointLight(0xd9baff, 0, 10, 2);
innerLight.position.set(0,0,0);
scene.add(innerLight);

// Ground shadow disc (fake)
{
  const g = new THREE.CircleGeometry(4.2, 64);
  const m = new THREE.MeshBasicMaterial({ color:0x000000, transparent:true, opacity:0.35 });
  const mesh = new THREE.Mesh(g, m);
  mesh.rotation.x = -Math.PI/2;
  mesh.position.y = -2.6;
  scene.add(mesh);
}

// ---------- Rock construction ----------
const rockGroup = new THREE.Group();
scene.add(rockGroup);

const geodeGroup = new THREE.Group();
scene.add(geodeGroup);

const RES_MAP = { low:10, med:14, high:18 };

let voxels = []; // { mesh, home, dir, threshold, baseColor }
let voxelGeo = null;

function buildRock(){
  // clear
  while(rockGroup.children.length) rockGroup.remove(rockGroup.children[0]);
  voxels.length = 0;

  const N = RES_MAP[state.resolution];
  const r = N*0.5 - 0.5;
  const spec = ROCKS[state.rock];
  const rand = rng(12345);

  const worldR = 2.4;
  const vs = (worldR*2) / N; // voxel side
  voxelGeo = new THREE.BoxGeometry(vs*0.98, vs*0.98, vs*0.98);

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0.02,
    flatShading: true,
  });

  const positions = [];
  for (let x=0;x<N;x++){
    for (let y=0;y<N;y++){
      for (let z=0;z<N;z++){
        const cx = x - (N-1)/2, cy = y - (N-1)/2, cz = z - (N-1)/2;
        const rad = Math.sqrt(cx*cx+cy*cy+cz*cz);
        const theta = Math.atan2(cz, cx);
        const phi = Math.atan2(cy, Math.sqrt(cx*cx+cz*cz));
        const wobble = 0.35 * (Math.sin(theta*3 + 0.7)*Math.cos(phi*2 - 0.3))
                     + 0.2 * Math.sin(theta*5 + phi*4 + 1.3);
        if (rad < r + wobble){
          const innerR = r*0.55 + 0.3 * Math.sin(theta*2)*Math.cos(phi*3);
          if (rad < innerR) continue;
          positions.push([cx,cy,cz]);
        }
      }
    }
  }

  const mesh = new THREE.InstancedMesh(voxelGeo, mat, positions.length);
  mesh.frustumCulled = false;
  rockGroup.add(mesh);

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const baseCol = new THREE.Color(spec.base);
  const grainCols = spec.grain.map(c=>new THREE.Color(c));

  voxels = positions.map(([cx,cy,cz], i)=>{
    const wx = cx*vs, wy = cy*vs, wz = cz*vs;
    dummy.position.set(wx, wy, wz);
    dummy.rotation.set(
      (rand()-0.5)*0.04,
      (rand()-0.5)*0.04,
      (rand()-0.5)*0.04
    );
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);

    let col;
    const pick = rand();
    if (pick < 0.15) col = grainCols[0];
    else if (pick < 0.28) col = grainCols[1];
    else if (pick < 0.35) col = grainCols[2];
    else col = baseCol;
    color.copy(col);
    const jitter = (rand()-0.5) * spec.noise;
    color.r = clamp(color.r + jitter*0.2, 0, 1);
    color.g = clamp(color.g + jitter*0.2, 0, 1);
    color.b = clamp(color.b + jitter*0.2, 0, 1);
    mesh.setColorAt(i, color);

    const radial = Math.sqrt(cx*cx+cy*cy+cz*cz);
    const layer = radial / r;                 
    const threshold = 0.15 + (1 - layer) * 0.85 + (rand()-0.5)*0.1;

    const len = Math.sqrt(wx*wx+wy*wy+wz*wz) + 1e-3;
    const dir = new THREE.Vector3(wx/len + (rand()-0.5)*0.4, wy/len + (rand()-0.5)*0.4 + 0.2, wz/len + (rand()-0.5)*0.4);
    dir.normalize();

    return {
      index: i,
      home: new THREE.Vector3(wx, wy, wz),
      rot: new THREE.Euler((rand()-0.5)*0.04,(rand()-0.5)*0.04,(rand()-0.5)*0.04),
      spin: new THREE.Vector3((rand()-0.5)*0.8,(rand()-0.5)*0.8,(rand()-0.5)*0.8),
      dir,
      threshold: clamp(threshold, 0.02, 0.99),
      baseColor: color.clone(),
      mesh,
    };
  });

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  return mesh;
}

// ---------- Geode (procedural crystal) ----------
let geodeCrystals = [];

function buildGeode(seed, palette, complexity){
  while(geodeGroup.children.length) geodeGroup.remove(geodeGroup.children[0]);
  geodeCrystals.length = 0;

  const rand = rng(seed);
  const pal = PALETTES[palette];

  {
    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.35, 1),
      new THREE.MeshBasicMaterial({ color: pal.glow, transparent:true, opacity:0.9 })
    );
    geodeGroup.add(core);

    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.9, 24, 18),
      new THREE.MeshBasicMaterial({ color: pal.accent, transparent:true, opacity:0.12, blending:THREE.AdditiveBlending, depthWrite:false })
    );
    geodeGroup.add(halo);
    geodeCrystals.push({ mesh: halo, kind:'halo' });
  }

  const count = Math.floor(lerp(18, 140, complexity));
  const shardMat = new THREE.MeshStandardMaterial({
    color: pal.base,
    roughness: 0.2,
    metalness: 0.4,
    emissive: new THREE.Color(pal.accent).multiplyScalar(0.2),
    flatShading: true,
    transparent: true,
    opacity: 0.95,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: pal.accent,
    roughness: 0.1,
    metalness: 0.55,
    emissive: new THREE.Color(pal.glow).multiplyScalar(0.35),
    flatShading: true,
  });

  const maxR = 2.0; 
  for (let i=0;i<count;i++){
    const u = rand(), v = rand();
    const theta = 2*Math.PI*u;
    const phi = Math.acos(2*v - 1);
    const x = Math.sin(phi)*Math.cos(theta);
    const y = Math.sin(phi)*Math.sin(theta);
    const z = Math.cos(phi);

    const height = lerp(0.35, 1.25, rand()) * lerp(0.6, 1.0, complexity);
    const rad = lerp(0.04, 0.18, rand()) * (1 - complexity*0.35);

    const sides = rand() < 0.6 ? 6 : (rand()<0.5 ? 4 : 5);
    const geo = new THREE.ConeGeometry(rad, height, sides, 1, false);
    const mesh = new THREE.Mesh(geo, rand() < 0.22 ? accentMat : shardMat);

    const dir = new THREE.Vector3(x,y,z);
    const base = dir.clone().multiplyScalar(maxR * 0.3); 
    mesh.position.copy(base.clone().add(dir.clone().multiplyScalar(height*0.5)));
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir);
    mesh.rotateY(rand()*Math.PI*2);
    mesh.scale.set(0.001, 0.001, 0.001); 
    geodeGroup.add(mesh);
    geodeCrystals.push({
      mesh,
      target: new THREE.Vector3(1,1,1),
      delay: rand()*0.8,
      kind:'shard',
    });
  }

  const sparkleCount = Math.floor(lerp(4, 22, complexity));
  for (let i=0;i<sparkleCount;i++){
    const sz = lerp(0.04, 0.1, rand());
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(sz,sz,sz),
      new THREE.MeshBasicMaterial({ color: pal.glow, transparent:true, opacity:0.85, blending:THREE.AdditiveBlending, depthWrite:false })
    );
    const u = rand(), v = rand(), rd = lerp(0.4, 1.6, rand());
    const theta = 2*Math.PI*u, phi = Math.acos(2*v - 1);
    m.position.set(Math.sin(phi)*Math.cos(theta)*rd, Math.sin(phi)*Math.sin(theta)*rd, Math.cos(phi)*rd);
    m.userData = { baseY: m.position.y, phase: rand()*Math.PI*2, speed: 0.4+rand()*0.8 };
    geodeGroup.add(m);
    geodeCrystals.push({ mesh:m, kind:'spark' });
  }

  geodeGroup.visible = false;
  geodeGroup.scale.setScalar(0.0001);
}

// ---------- Crack progress ----------
let fracture = 0;
let fractureTarget = 0;

function setFractureTarget(t){
  fractureTarget = clamp(t, 0, 1);
}

// ---------- Resize ----------
function onResize(){
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w/h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);
onResize();

// ---------- Render loop ----------
const tmpMat = new THREE.Matrix4();
const tmpPos = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpScl = new THREE.Vector3(1,1,1);
const tmpObj = new THREE.Object3D();
const tmpColor = new THREE.Color();

let elapsed = 0;
let lastT = performance.now();

function tick(now){
  const dt = Math.min(0.05, (now - lastT)/1000);
  lastT = now;
  elapsed += dt;

  fracture = lerp(fracture, fractureTarget, 1 - Math.pow(0.001, dt));

  const spinRate = state.spin === 'off' ? 0 : state.spin === 'fast' ? 0.35 : 0.12;
  rockGroup.rotation.y += dt * spinRate;
  rockGroup.rotation.x = Math.sin(elapsed*0.2) * 0.08;
  geodeGroup.rotation.y -= dt * spinRate * 1.3;
  geodeGroup.rotation.x = Math.sin(elapsed*0.25) * 0.1;

  if (voxels.length){
    const mesh = voxels[0].mesh;
    for (let i=0;i<voxels.length;i++){
      const v = voxels[i];
      const over = fracture - v.threshold;
      const broken = over > 0;
      const stress = smoothstep(v.threshold - 0.1, v.threshold, fracture);

      let px = v.home.x, py = v.home.y, pz = v.home.z;
      let rx = v.rot.x, ry = v.rot.y, rz = v.rot.z;
      let sx = 1, sy = 1, sz = 1;

      if (broken){
        const k = smoothstep(0, 0.25, over); 
        const dist = k * 6 + k*k*8;
        const fall = k*k * 6;
        px += v.dir.x * dist;
        py += v.dir.y * dist - fall;
        pz += v.dir.z * dist;
        rx += v.spin.x * over * 8;
        ry += v.spin.y * over * 8;
        rz += v.spin.z * over * 8;
        const s = clamp(1 - k*1.1, 0, 1);
        sx = sy = sz = s;
      } else {
        const wig = stress * 0.06;
        px += Math.sin(elapsed*30 + v.home.x*3) * wig;
        py += Math.cos(elapsed*27 + v.home.y*3) * wig;
        pz += Math.sin(elapsed*25 + v.home.z*3) * wig;

        if (stress > 0.05){
          tmpColor.copy(v.baseColor).multiplyScalar(1 - stress*0.25);
          mesh.setColorAt(i, tmpColor);
        } else {
          mesh.setColorAt(i, v.baseColor);
        }
      }

      tmpObj.position.set(px, py, pz);
      tmpObj.rotation.set(rx, ry, rz);
      tmpObj.scale.set(sx, sy, sz);
      tmpObj.updateMatrix();
      mesh.setMatrixAt(i, tmpObj.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  const revealAmt = smoothstep(0.55, 0.95, fracture);
  if (revealAmt > 0.001){
    if (!geodeGroup.visible) geodeGroup.visible = true;
    const target = lerp(0.4, 1.0, revealAmt);
    const cur = geodeGroup.scale.x;
    const next = lerp(cur, target, 1 - Math.pow(0.0001, dt));
    geodeGroup.scale.setScalar(next);

    innerLight.intensity = lerp(innerLight.intensity, revealAmt * 4, 1 - Math.pow(0.001, dt));
    const pal = PALETTES[state.palette];
    innerLight.color.setHex(pal.glow);

    for (const c of geodeCrystals){
      if (c.kind === 'shard'){
        const t = clamp(revealAmt - c.delay*0.4, 0, 1);
        const s = smoothstep(0, 1, t);
        c.mesh.scale.setScalar(s);
      } else if (c.kind === 'spark'){
        const t = revealAmt;
        c.mesh.scale.setScalar(t);
        const bob = Math.sin(elapsed*c.mesh.userData.speed + c.mesh.userData.phase) * 0.05;
        c.mesh.position.y = c.mesh.userData.baseY + bob;
      }
    }
  } else {
    if (geodeGroup.visible) geodeGroup.visible = false;
    innerLight.intensity = 0;
  }

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
requestAnimationFrame(t=>{ lastT = t; tick(t); });

// ---------- UI ----------
const pwEl = $('#pw');
const eyeBtn = $('#eye');
const clearBtn = $('#clear');

eyeBtn.addEventListener('click', ()=>{
  const is = pwEl.type === 'password';
  pwEl.type = is ? 'text' : 'password';
  eyeBtn.classList.toggle('active', is);
  pwEl.focus();
});
clearBtn.addEventListener('click', ()=>{
  pwEl.value = '';
  pwEl.focus();
  onPwChange();
});

pwEl.addEventListener('input', onPwChange);

function onPwChange(){
  const pw = pwEl.value;
  state.pw = pw;
  const info = analyze(pw);
  current = info;

  $('#entropyV').textContent = info.entropy.toFixed(1);
  $('#charsetSize').textContent = info.poolSize;
  $('#crackV').textContent = pw.length ? crackTime(info.entropy) : '—';
  $('#lenLabel').textContent = `${info.len} chars`;

  $('#chLower').classList.toggle('on', info.classes.lower);
  $('#chUpper').classList.toggle('on', info.classes.upper);
  $('#chDigit').classList.toggle('on', info.classes.digit);
  $('#chSym').classList.toggle('on', info.classes.symbol);

  const meter = document.querySelectorAll('#meter .seg .fill');
  const segs = meter.length;
  const progress = clamp(info.entropy / 100, 0, 1.001);
  const colors = segColors(info.entropy);
  meter.forEach((el, i)=>{
    const segStart = i / segs;
    const segEnd = (i+1) / segs;
    const local = clamp((progress - segStart) / (segEnd - segStart), 0, 1);
    el.style.width = (local*100) + '%';
    el.style.setProperty('--segA', colors.a);
    el.style.setProperty('--segB', colors.b);
  });

  $('#verdict').textContent = verdict(info.entropy, info.len);

  let frac = 0;
  if (info.len > 0){
    frac = smoothstep(0, 90, info.entropy);
    const classCount = Object.values(info.classes).filter(Boolean).length;
    frac = Math.max(frac, smoothstep(4, 28, info.len) * (0.4 + 0.15*classCount));
    frac = clamp(frac, 0, 1);
  }
  if (fractureTarget < 0.7 && frac >= 0.7){
    const flash = $('#flash');
    flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go');
    rebuildGeode();
  }
  setFractureTarget(frac);

  const hero = $('#hero');
  hero.classList.toggle('hidden', info.len > 0);

  updateSpecimen(info, frac);

  if (frac > 0.2){ 
    const seed = hashStr(pw || 'empty');
    const complexity = clamp((info.entropy - 20) / 80, 0.15, 1);
    if (geodeSig !== `${seed}|${state.palette}|${complexity.toFixed(2)}`){
      buildGeode(seed, state.palette, complexity);
      geodeSig = `${seed}|${state.palette}|${complexity.toFixed(2)}`;
    }
  }
}

let geodeSig = '';
function rebuildGeode(){
  const seed = hashStr(state.pw || 'empty');
  const complexity = clamp((current.entropy - 20) / 80, 0.15, 1);
  buildGeode(seed, state.palette, complexity);
  geodeSig = `${seed}|${state.palette}|${complexity.toFixed(2)}`;
}

function segColors(entropy){
  if (entropy < 30) return { a:'#d97a6a', b:'#e09f7b' };
  if (entropy < 60) return { a:'#e6b873', b:'#e4cf8a' };
  if (entropy < 90) return { a:'#b7c596', b:'#8ecf9a' };
  return { a:'#d9c7a0', b:'#efe3bd' };
}

function verdict(e, len){
  if (len === 0) return 'Untouched';
  if (e < 20) return 'Brittle · chips at a glance';
  if (e < 40) return 'Weak · fissures forming';
  if (e < 60) return 'Passable · outer shell splinters';
  if (e < 80) return 'Strong · shell giving way';
  if (e < 100) return 'Formidable · interior revealed';
  return 'Exquisite · geode radiant';
}

const ROCK_NAMES = {
  granite: ['Greystone','Granite','Biotite','Feldspar'],
  obsidian:['Obsidian','Basalt','Pitchstone','Tektite'],
  sandstone:['Sandstone','Arkose','Siltstone','Ochre']
};
const CRYSTAL_NAMES = {
  amethyst:['Amethyst geode','Violet druse','Iolite cluster','Charoite spray'],
  citrine: ['Citrine druse','Sulphur crystals','Amber geode','Heliodor cluster'],
  emerald: ['Emerald druse','Dioptase spray','Malachite geode','Fluorite cluster']
};

function updateSpecimen(info, frac){
  const hue = state.palette;
  const stage =
    frac < 0.05 ? 'Intact' :
    frac < 0.3  ? 'Surface chips' :
    frac < 0.6  ? 'Deep fractures' :
    frac < 0.8  ? 'Partial breach' : 'Cracked open';

  $('#spStage').textContent = stage;
  $('#spFrac').textContent = (Math.round(frac*100)) + '%';
  $('#spFacets').textContent = frac > 0.2 ? Math.floor(lerp(18,140,clamp((info.entropy-20)/80,0.15,1))) : 0;
  $('#spHue').textContent = frac > 0.55 ? hue : '—';
  $('#spLust').textContent = frac < 0.3 ? 'dull' : frac < 0.6 ? 'sub-vitreous' : frac < 0.8 ? 'vitreous' : 'adamantine';

  const rand = rng(hashStr(state.pw || 'x'));
  const rockNames = ROCK_NAMES[state.rock];
  const cryNames = CRYSTAL_NAMES[state.palette];
  let name;
  if (frac < 0.55){
    name = rockNames[Math.floor(rand()*rockNames.length)] + (frac<0.05?' · unfractured':' · fractured');
  } else {
    name = cryNames[Math.floor(rand()*cryNames.length)];
  }
  $('#specName').textContent = name;

  const num = (hashStr(state.pw || '000') % 900 + 100).toString();
  $('#specNo').textContent = state.pw.length ? num : '000';
}

// ---------- Forge (generator) ----------
const genEl = $('#gen');
const genToggleBtn = $('#genToggle');
const genLen = $('#genLen');
const genLenV = $('#genLenV');
const genOut = $('#genOut');
const genForge = $('#genForge');
const genUse = $('#genUse');

const genState = { length: 20, lower:true, upper:true, digit:true, symbol:true };

genToggleBtn.addEventListener('click', ()=>{
  const open = !genEl.classList.contains('closed') === false ? true : genEl.classList.contains('closed');
  const isOpen = !genEl.classList.contains('closed');
  if (isOpen){ genEl.classList.add('closed'); genToggleBtn.classList.remove('open'); }
  else { genEl.classList.remove('closed'); genToggleBtn.classList.add('open'); forgeOne(); }
});

genLen.addEventListener('input', ()=>{
  genState.length = +genLen.value;
  genLenV.textContent = genState.length;
});

document.querySelectorAll('.toggle').forEach(t=>{
  t.addEventListener('click', ()=>{
    t.classList.toggle('on');
    const k = t.dataset.tog;
    genState[k] = t.classList.contains('on');
  });
});

function forgeOne(){
  const LOWER = 'abcdefghijklmnopqrstuvwxyz';
  const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const DIGIT = '0123456789';
  const SYM   = '!@#$%^&*()-_=+[]{};:,.<>?/~';
  let pool = '';
  const req = [];
  if (genState.lower){ pool += LOWER; req.push(LOWER); }
  if (genState.upper){ pool += UPPER; req.push(UPPER); }
  if (genState.digit){ pool += DIGIT; req.push(DIGIT); }
  if (genState.symbol){ pool += SYM; req.push(SYM); }
  if (!pool){ genOut.textContent = 'Select at least one charset'; return; }

  const buf = new Uint32Array(genState.length);
  crypto.getRandomValues(buf);
  let out = '';
  for (let i=0;i<genState.length;i++){
    out += pool[buf[i] % pool.length];
  }
  const arr = out.split('');
  req.forEach((charset, idx)=>{
    const has = arr.some(c => charset.includes(c));
    if (!has){
      const rnd = new Uint32Array(1); crypto.getRandomValues(rnd);
      arr[idx % arr.length] = charset[rnd[0] % charset.length];
    }
  });
  genOut.textContent = arr.join('');
}

genForge.addEventListener('click', forgeOne);
genUse.addEventListener('click', ()=>{
  if (genOut.textContent && genOut.textContent !== '—' && !genOut.textContent.startsWith('Select')){
    pwEl.value = genOut.textContent;
    pwEl.type = 'text';
    eyeBtn.classList.add('active');
    onPwChange();
    genEl.classList.add('closed');
    genToggleBtn.classList.remove('open');
  }
});

// ---------- Tweaks (host-toggled) ----------
const tweaksEl = $('#tweaks');

function persistEdits(edits){
  try {
    window.parent.postMessage({ type:'__edit_mode_set_keys', edits }, '*');
  } catch(e){}
}

function bindTweakGroup(groupId, key){
  const group = $(groupId);
  if (!group) return;
  group.querySelectorAll('.seg-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      group.querySelectorAll('.seg-btn').forEach(b=>b.classList.remove('on'));
      btn.classList.add('on');
      const val = btn.dataset.val;
      state[key] = val;
      const edits = {}; edits[key] = val;
      persistEdits(edits);
      
      if (key === 'resolution'){
        rebuildRock();
        updateSpecimen(current, fractureTarget); 
      } else if (key === 'palette'){
        rebuildGeode();
        updateSpecimen(current, fractureTarget); 
      }
    });
  });
  const val = state[key];
  group.querySelectorAll('.seg-btn').forEach(b=>{
    b.classList.toggle('on', b.dataset.val === val);
  });
}

bindTweakGroup('#tw-palette', 'palette');
bindTweakGroup('#tw-res', 'resolution');
bindTweakGroup('#tw-spin', 'spin');

window.addEventListener('message', (ev)=>{
  const d = ev.data;
  if (!d || typeof d !== 'object') return;
  if (d.type === '__activate_edit_mode') tweaksEl.classList.add('visible');
  else if (d.type === '__deactivate_edit_mode') tweaksEl.classList.remove('visible');
});
try { window.parent.postMessage({ type:'__edit_mode_available' }, '*'); } catch(e){}

// ---------- init ----------
buildRock();
buildGeode(12345, state.palette, 0.6);
onPwChange();

// EDIT: Force Tweaks panel open on load
if(tweaksEl) tweaksEl.classList.add('visible');

// EDIT: Add toggle hotkey (T) to manually hide/show it
window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 't' && document.activeElement.tagName !== 'INPUT') {
    if(tweaksEl) tweaksEl.classList.toggle('visible');
  }
});

// focus input on load for ergonomics
setTimeout(()=>pwEl.focus(), 300);

})();
