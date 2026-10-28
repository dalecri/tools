// App: editor ↔ Architect ↔ Voxel renderer.
(function () {
  const editor = document.getElementById('editor');
  const canvas = document.getElementById('cathedral');
  const ctx = canvas.getContext('2d');
  const stats = document.getElementById('stats');
  const skyEl = document.getElementById('sky');
  const metaCounter = document.getElementById('meta-counter');
  const dateEl = document.getElementById('editor-date');

  const STORAGE_KEY = 'cathedral-md.v6';
  const STORAGE_TWEAKS = 'cathedral-md.tweaks.v6';
  const STORAGE_SEED = 'cathedral-md.seed.v6';

  function newThemeSeed() { return (Math.floor(Math.random() * 0xFFFFFFFF)) >>> 0; }
  function getThemeSeed() {
    let s = parseInt(localStorage.getItem(STORAGE_SEED) || '0', 10);
    if (!s) { s = newThemeSeed(); localStorage.setItem(STORAGE_SEED, String(s)); }
    return s >>> 0;
  }
  function resetThemeSeed() {
    const s = newThemeSeed();
    localStorage.setItem(STORAGE_SEED, String(s));
    return s;
  }
  let themeSeed = getThemeSeed();

  function defaultTweaks() {
    return Object.assign({ palette: 'dusk', zoom: 1.0, autoRotate: false },
      window.__TWEAK_DEFAULTS || {});
  }
  function loadTweaks() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_TWEAKS) || 'null');
      if (stored) return Object.assign({}, defaultTweaks(), stored);
    } catch (e) {}
    return defaultTweaks();
  }
  function saveTweaks() { localStorage.setItem(STORAGE_TWEAKS, JSON.stringify(tweaks)); }

  let tweaks = loadTweaks();
  let model = null;
  let zoom = tweaks.zoom;
  let rotation = 0;
  let autoRotate = tweaks.autoRotate;
  let cameraOffset = { x: 0, y: 0 };

  function applySky(palette) {
    const p = Architect.PALETTES[palette];
    skyEl.style.background =
      `linear-gradient(180deg, ${p.sky1} 0%, ${p.sky2} 55%, ${p.sky3} 100%)`;
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    render();
  }

  function rotateVoxels(voxels, turns, bounds) {
    if (!turns) return voxels;
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cz = (bounds.minZ + bounds.maxZ) / 2;
    return voxels.map(v => {
      let dx = v.x - cx, dz = v.z - cz;
      for (let i = 0; i < turns; i++) {
        const ndx = -dz; const ndz = dx;
        dx = ndx; dz = ndz;
      }
      return Object.assign({}, v, { x: Math.round(cx + dx), z: Math.round(cz + dz) });
    });
  }

  function render() {
    if (!model) return;
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);

    const turns = ((rotation % 4) + 4) % 4;
    const voxels = rotateVoxels(model.voxels, turns, model.bounds);

    let minSX = Infinity, maxSX = -Infinity, minSY = Infinity, maxSY = -Infinity;
    for (const v of voxels) {
      const px = (v.x - v.z) * (Voxel.TILE_W / 2);
      const py = (v.x + v.z) * (Voxel.TILE_H / 2) - v.y * Voxel.TILE_V;
      if (px < minSX) minSX = px;
      if (px > maxSX) maxSX = px;
      if (py < minSY) minSY = py;
      if (py > maxSY) maxSY = py;
    }
    const w = rect.width, h = rect.height;
    const contentW = (maxSX - minSX) || 1;
    const contentH = (maxSY - minSY) || 1;
    const fit = Math.min(w / (contentW + 80), h / (contentH + 100));
    const z = Math.max(0.25, Math.min(2.5, fit * zoom * 0.95));
    const cx = w / 2 - ((minSX + maxSX) / 2) * z + cameraOffset.x;
    const cy = h / 2 - ((minSY + maxSY) / 2) * z + cameraOffset.y;

    Voxel.render(ctx, voxels, { zoom: z, cx, cy });

    const wordCount = (editor.value.match(/\b\w+\b/g) || []).length;
    stats.innerHTML =
      `<span>${voxels.length.toLocaleString()} stones</span>` +
      `<span>${model.height || 0} courses</span>` +
      `<span>${model.westHeight || 0}↑ towers</span>` +
      `<span>${model.windows || 0} windows</span>`;
    metaCounter.textContent = wordCount + (wordCount === 1 ? ' word' : ' words');
  }

  let buildTimer = null;
  function scheduleBuild() {
    if (buildTimer) cancelAnimationFrame(buildTimer);
    buildTimer = requestAnimationFrame(() => {
      buildTimer = setTimeout(() => {
        model = Architect.build(editor.value, { palette: tweaks.palette, themeSeed });
        applySky(tweaks.palette);
        render();
      }, 60);
    });
  }

  editor.addEventListener('input', () => {
    localStorage.setItem(STORAGE_KEY, editor.value);
    if (editor.value.trim().length === 0) themeSeed = resetThemeSeed();
    scheduleBuild();
  });
  editor.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = editor.selectionStart, end = editor.selectionEnd;
      editor.value = editor.value.slice(0, start) + '  ' + editor.value.slice(end);
      editor.selectionStart = editor.selectionEnd = start + 2;
      editor.dispatchEvent(new Event('input'));
    }
  });

  function wrap(prefix, suffix) {
    suffix = suffix == null ? prefix : suffix;
    const start = editor.selectionStart, end = editor.selectionEnd;
    const sel = editor.value.slice(start, end) || '';
    const before = editor.value.slice(0, start);
    const after = editor.value.slice(end);
    editor.value = before + prefix + sel + suffix + after;
    editor.selectionStart = start + prefix.length;
    editor.selectionEnd = end + prefix.length;
    editor.focus();
    editor.dispatchEvent(new Event('input'));
  }
  function lineStart() {
    const v = editor.value, s = editor.selectionStart;
    let i = s;
    while (i > 0 && v[i - 1] !== '\n') i--;
    return i;
  }
  function prefixLine(prefix) {
    const ls = lineStart();
    editor.value = editor.value.slice(0, ls) + prefix + editor.value.slice(ls);
    editor.selectionStart = editor.selectionEnd = ls + prefix.length;
    editor.focus();
    editor.dispatchEvent(new Event('input'));
  }
  document.querySelectorAll('.editor-toolbar [data-md]').forEach(b => {
    b.addEventListener('click', () => {
      const k = b.dataset.md;
      if (k === 'bold') wrap('**');
      else if (k === 'italic') wrap('*');
      else if (k === 'code') wrap('`');
      else if (k === 'h1') prefixLine('# ');
      else if (k === 'h2') prefixLine('## ');
      else if (k === 'ul') prefixLine('- ');
      else if (k === 'ol') prefixLine('1. ');
      else if (k === 'quote') prefixLine('> ');
    });
  });

  let dragging = false, lastX = 0, lastY = 0;
  canvas.addEventListener('mousedown', (e) => {
    dragging = true; lastX = e.clientX; lastY = e.clientY;
    canvas.style.cursor = 'grabbing';
  });
  window.addEventListener('mouseup', () => { dragging = false; canvas.style.cursor = 'grab'; });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    cameraOffset.x += e.clientX - lastX;
    cameraOffset.y += e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    render();
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoom *= e.deltaY < 0 ? 1.08 : 0.93;
    zoom = Math.max(0.4, Math.min(3, zoom));
    tweaks.zoom = zoom; saveTweaks();
    render();
  }, { passive: false });

  document.getElementById('rotate-btn').addEventListener('click', () => {
    rotation = (rotation + 1) % 4;
    render();
  });
  document.getElementById('reset-btn').addEventListener('click', () => {
    cameraOffset = { x: 0, y: 0 };
    zoom = 1; tweaks.zoom = 1; saveTweaks();
    rotation = 0;
    render();
  });

  let lastAutoTime = 0, autoRotateAccum = 0;
  function autoTick(t) {
    if (autoRotate) {
      const dt = t - lastAutoTime;
      lastAutoTime = t;
      autoRotateAccum += dt;
      if (autoRotateAccum > 4500) {
        autoRotateAccum = 0;
        rotation = (rotation + 1) % 4;
        render();
      }
    } else { lastAutoTime = t; }
    requestAnimationFrame(autoTick);
  }
  requestAnimationFrame(autoTick);

  const tweakPanel = document.getElementById('tweaks');
  function buildTweaks() {
    tweakPanel.innerHTML = `
      <div class="tw-header">Tweaks</div>
      <div class="tw-row">
        <label>Time of day</label>
        <div class="tw-seg" data-key="palette">
          ${['dawn','dusk','night','snow'].map(p =>
            `<button data-val="${p}" class="${tweaks.palette===p?'on':''}">${p}</button>`
          ).join('')}
        </div>
      </div>
      <div class="tw-row">
        <label>Zoom</label>
        <input type="range" id="tw-zoom" min="0.4" max="3" step="0.05" value="${zoom}">
        <span class="tw-val" id="tw-zoom-val">${zoom.toFixed(2)}×</span>
      </div>
      <div class="tw-row">
        <label>Auto-rotate</label>
        <button class="tw-toggle ${autoRotate?'on':''}" id="tw-rotate">${autoRotate?'On':'Off'}</button>
      </div>
      <div class="tw-row tw-actions">
        <button id="tw-clear">Clear note</button>
        <button id="tw-sample">Load sample</button>
      </div>
      <div class="tw-foot">
        Every word grows <em>one</em> cathedral upward:
        <span class="legend"><b>paragraph</b> raises walls</span>
        <span class="legend"><b>#</b> twin west towers</span>
        <span class="legend"><b>##</b> crossing tower</span>
        <span class="legend"><b>-</b> / <b>1.</b> spiral stair</span>
        <span class="legend"><b>&gt;</b> stained glass</span>
        <span class="legend"><b>---</b> roof + buttress</span>
        <span class="legend"><b>**bold**</b> pinnacle</span>
        <span class="legend"><b>\`code\`</b> lantern</span>
      </div>
    `;
    tweakPanel.querySelectorAll('[data-key="palette"] button').forEach(b => {
      b.addEventListener('click', () => {
        tweaks.palette = b.dataset.val;
        saveTweaks(); buildTweaks(); scheduleBuild();
        postEdit({ palette: tweaks.palette });
      });
    });
    document.getElementById('tw-zoom').addEventListener('input', (e) => {
      zoom = parseFloat(e.target.value);
      tweaks.zoom = zoom; saveTweaks();
      document.getElementById('tw-zoom-val').textContent = zoom.toFixed(2) + '×';
      render();
    });
    document.getElementById('tw-rotate').addEventListener('click', () => {
      autoRotate = !autoRotate; tweaks.autoRotate = autoRotate;
      saveTweaks(); buildTweaks();
      postEdit({ autoRotate });
    });
    document.getElementById('tw-clear').addEventListener('click', () => {
      editor.value = '';
      editor.dispatchEvent(new Event('input'));
      editor.focus();
    });
    document.getElementById('tw-sample').addEventListener('click', () => {
      editor.value = window.SAMPLE_MD;
      editor.dispatchEvent(new Event('input'));
    });
  }

  function postEdit(edits) {
    try { window.parent.postMessage({ type: '__edit_mode_set_keys', edits }, '*'); } catch (e) {}
  }

  function setTweaksVisible(v) { tweakPanel.style.display = v ? 'block' : 'none'; }
  setTweaksVisible(false);

  window.addEventListener('message', (ev) => {
    const d = ev.data;
    if (!d || typeof d !== 'object') return;
    if (d.type === '__activate_edit_mode') setTweaksVisible(true);
    if (d.type === '__deactivate_edit_mode') setTweaksVisible(false);
  });
  try { window.parent.postMessage({ type: '__edit_mode_available' }, '*'); } catch (e) {}

  try {
    const d = new Date();
    dateEl.textContent = d.toLocaleDateString(undefined, {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    }) + ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  } catch (e) {}

  const stored = localStorage.getItem(STORAGE_KEY);
  editor.value = stored && stored.trim().length > 0 ? stored : window.SAMPLE_MD;
  buildTweaks();
  applySky(tweaks.palette);
  scheduleBuild();
  setTimeout(resize, 0);
  window.addEventListener('resize', resize);
})();
