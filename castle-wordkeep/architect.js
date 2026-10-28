// Architect v5 — a single CATHEDRAL that grows upward (not outward).
//
// Footprint is fixed: a cruciform plan with
//   - a long NAVE running east–west
//   - a perpendicular TRANSEPT crossing in the middle
//   - an APSE on the east end
//   - a WEST FRONT with twin towers
//
// Writing drives VERTICAL growth: every paragraph/sentence/list/etc adds
// stones to the walls, pushing the top course upward. Markdown elements
// target specific features — H1 pushes the twin west towers higher, H2
// adds to the crossing tower, lists wind a spiral stair up the NW turret,
// quotes punch stained-glass windows into the nave walls, HR caps the
// current course with a roof section, code lines set lanterns inside.
//
// Key invariant: x,z footprint NEVER changes as the user writes. Only
// y (height) grows.
(function () {
  function mulberry32(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const PALETTES = {
    dusk: {
      stone: '#d8cdb8', stoneDark: '#a89880', stoneLight: '#ece0c8',
      floor: '#8a7a60', roof: '#6b4a3a', roofDark: '#4a3025',
      pillar: '#c4b295', spire: '#4a5a7a', spireCap: '#3a4a65',
      gold: '#e8b560', teal: '#4a9a8a', plum: '#a05a7a', moss: '#6b8a5a',
      glass1: '#c06090', glass2: '#60a0c0', glass3: '#e8b560',
      ground: '#3a4050',
      sky1: '#2a2a40', sky2: '#6a4560', sky3: '#d89a70',
    },
    dawn: {
      stone: '#e8dcc0', stoneDark: '#b8a488', stoneLight: '#f4ead4',
      floor: '#967a5a', roof: '#8a5a48', roofDark: '#5a3028',
      pillar: '#d8c4a4', spire: '#7a8ab0', spireCap: '#5a6a95',
      gold: '#f0c878', teal: '#5aaa9a', plum: '#b86a8a', moss: '#7a9a6a',
      glass1: '#d07090', glass2: '#70b0d0', glass3: '#f0d088',
      ground: '#4a5060',
      sky1: '#f0c090', sky2: '#e8a0a0', sky3: '#b090c0',
    },
    night: {
      stone: '#5a5a70', stoneDark: '#3a3a50', stoneLight: '#6a6a85',
      floor: '#2a2a40', roof: '#202035', roofDark: '#12121f',
      pillar: '#4a4a65', spire: '#2a3055', spireCap: '#1a2040',
      gold: '#ffd070', teal: '#50c0b0', plum: '#c060a0', moss: '#5a8a6a',
      glass1: '#d040a0', glass2: '#40b0d0', glass3: '#ffc060',
      ground: '#1a1a2a',
      sky1: '#0a0a1a', sky2: '#1a1a35', sky3: '#2a2050',
    },
    snow: {
      stone: '#e8e8ec', stoneDark: '#b8b8c0', stoneLight: '#f4f4f8',
      floor: '#9898a0', roof: '#6878a0', roofDark: '#404a6a',
      pillar: '#d8d8e0', spire: '#5868a0', spireCap: '#3a4a78',
      gold: '#e8c070', teal: '#70b8c8', plum: '#a878b0', moss: '#7a9aa0',
      glass1: '#b060a0', glass2: '#60a0c8', glass3: '#e8b870',
      ground: '#c8ccd8',
      sky1: '#c8d0e0', sky2: '#d8d8e8', sky3: '#e8e0e0',
    },
  };

  // ---- Tokenize markdown ----
  function tokenize(md) {
    const lines = md.split('\n');
    const tokens = [];
    let inCode = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trimEnd();
      if (/^```/.test(line)) { inCode = !inCode; tokens.push({ type: 'codeFence' }); continue; }
      if (inCode) { tokens.push({ type: 'code', text: line }); continue; }
      if (line.trim() === '') { tokens.push({ type: 'blank' }); continue; }
      const h = /^(#{1,6})\s+(.*)$/.exec(line);
      if (h) { tokens.push({ type: 'header', level: h[1].length, text: h[2] }); continue; }
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { tokens.push({ type: 'hr' }); continue; }
      const bq = /^>\s?(.*)$/.exec(line);
      if (bq) { tokens.push({ type: 'quote', text: bq[1] }); continue; }
      const ul = /^(\s*)([-*+])\s+(.*)$/.exec(line);
      if (ul) { tokens.push({ type: 'ul', indent: Math.floor(ul[1].length / 2), text: ul[3] }); continue; }
      const ol = /^(\s*)(\d+)\.\s+(.*)$/.exec(line);
      if (ol) { tokens.push({ type: 'ol', indent: Math.floor(ol[1].length / 2), text: ol[3] }); continue; }
      const bold = (line.match(/\*\*[^*]+\*\*/g) || []).length;
      const ital = (line.match(/(?<!\*)\*[^*]+\*(?!\*)/g) || []).length;
      const inlineCode = (line.match(/`[^`]+`/g) || []).length;
      const link = (line.match(/\[[^\]]+\]\([^\)]+\)/g) || []).length;
      const words = (line.match(/\b\w+\b/g) || []).length;
      tokens.push({ type: 'p', text: line, len: line.length, words, bold, ital, inlineCode, link });
    }
    return tokens;
  }

  // ---- Cathedral footprint ----
  // Coordinate system: x east–west (length of nave), z north–south (transept arms).
  // Origin at the crossing (intersection of nave + transept).
  // Nave runs from x = -NAVE_W (west end) to x = NAVE_E (east end, at apse start).
  // Apse is a semi-hexagonal cap east of NAVE_E.
  // Transept runs from z = -TR_HALF to z = TR_HALF, width = TR_W (same as nave height).
  const NAVE_W = 10;       // west front x = -10
  const NAVE_E =  8;       // apse start x = +8 (apse extends to x=11)
  const NAVE_HALF = 3;     // nave width = 6 (z ∈ [-3, 3])
  const AISLE = 1;         // side aisle adds 1 cell each side (z ∈ [-4..4] with aisle)
  const TR_HALF = 5;       // transept arms extend to z = ±5
  const TR_W = 3;          // transept width in x (x ∈ [-1, 1])
  const APSE_END = NAVE_E + 3; // apse goes to x = +11

  // Footprint test — returns true if (x,z) is inside the cathedral plan.
  function inFoot(x, z) {
    // Nave + aisles: rectangle
    if (x >= -NAVE_W && x <= NAVE_E && z >= -(NAVE_HALF + AISLE) && z <= (NAVE_HALF + AISLE)) return true;
    // Transept: rectangle
    if (z >= -TR_HALF && z <= TR_HALF && x >= -TR_W && x <= TR_W) return true;
    // Apse: semi-circular cap east of NAVE_E
    if (x > NAVE_E && x <= APSE_END) {
      const dx = x - NAVE_E;
      const maxZ = Math.round(Math.sqrt(Math.max(0, 9 - dx * dx))); // radius 3 ellipse
      if (z >= -maxZ && z <= maxZ) return true;
    }
    // West-front bastions — two square towers on either side of the west door
    if (x >= -NAVE_W - 1 && x <= -NAVE_W + 1) {
      if (z >= -4 && z <= -2) return true; // north tower base
      if (z >= 2 && z <= 4) return true;   // south tower base
    }
    return false;
  }

  // Wall cells — the perimeter of the footprint (for wall-stone placement)
  // We compute this once and reuse.
  function computeWallCells() {
    const cells = [];
    const seen = new Set();
    for (let x = -NAVE_W - 2; x <= APSE_END + 1; x++) {
      for (let z = -TR_HALF - 1; z <= TR_HALF + 1; z++) {
        if (!inFoot(x, z)) continue;
        // Is any 4-neighbor OUTSIDE the footprint? → wall cell
        const isEdge =
          !inFoot(x + 1, z) || !inFoot(x - 1, z) ||
          !inFoot(x, z + 1) || !inFoot(x, z - 1);
        if (isEdge) {
          const k = x + ',' + z;
          if (!seen.has(k)) { seen.add(k); cells.push([x, z]); }
        }
      }
    }
    return cells;
  }
  const WALL_CELLS = computeWallCells();

  // Floor cells — interior of footprint (everything that's inside)
  function computeFloorCells() {
    const cells = [];
    for (let x = -NAVE_W - 2; x <= APSE_END + 1; x++) {
      for (let z = -TR_HALF - 1; z <= TR_HALF + 1; z++) {
        if (inFoot(x, z)) cells.push([x, z]);
      }
    }
    return cells;
  }
  const FLOOR_CELLS = computeFloorCells();

  // Key anchor points
  const WEST_TOWER_N = { x: -NAVE_W, z: -3 };  // center of north west tower (2x2)
  const WEST_TOWER_S = { x: -NAVE_W, z:  3 };  // center of south west tower
  const CROSSING = { x: 0, z: 0 };              // crossing tower base center
  const NW_TURRET = { x: -NAVE_W - 1, z: -3 };  // spiral stair turret
  const SE_BUTTRESS = { x: NAVE_E, z:  NAVE_HALF + AISLE + 1 };

  // Nave side-wall cells specifically (used for stained-glass windows)
  const NAVE_SOUTH_WINDOWS = [];
  const NAVE_NORTH_WINDOWS = [];
  for (let x = -NAVE_W + 2; x <= NAVE_E - 2; x += 2) {
    NAVE_SOUTH_WINDOWS.push([x,  NAVE_HALF + AISLE]);
    NAVE_NORTH_WINDOWS.push([x, -(NAVE_HALF + AISLE)]);
  }

  function build(md, opts) {
    opts = opts || {};
    const palette = PALETTES[opts.palette || 'dusk'];
    const tokens = tokenize(md);
    const themeSeed = (opts.themeSeed >>> 0) || 1;
    const rng = mulberry32(themeSeed);

    const hasContent = tokens.some(t =>
      t.type === 'p' || t.type === 'header' || t.type === 'ul' || t.type === 'ol' ||
      t.type === 'quote' || t.type === 'hr' || t.type === 'code' || t.type === 'codeFence'
    );
    if (!hasContent) {
      return {
        voxels: [], bounds: { minX: -1, maxX: 1, minZ: -1, maxZ: 1, minY: 0, maxY: 1 },
        palette, tokens, height: 0,
        westHeight: 0, crossingHeight: 0, stairs: 0, windows: 0,
      };
    }

    // ---- Voxel store ----
    const voxels = [];
    const occ = new Map();
    function put(x, y, z, color, extra) {
      x = Math.round(x); y = Math.round(y); z = Math.round(z);
      const k = x + ',' + y + ',' + z;
      if (occ.has(k)) {
        const v = voxels[occ.get(k)];
        v.color = color;
        if (extra) {
          if (extra.emissive != null) v.emissive = extra.emissive;
          if (extra.alpha != null) v.alpha = extra.alpha;
          if (extra.edge === false) v.edge = false;
        }
        return;
      }
      const v = { x, y, z, color };
      if (extra) {
        if (extra.emissive != null) v.emissive = extra.emissive;
        if (extra.alpha != null) v.alpha = extra.alpha;
        if (extra.edge === false) v.edge = false;
      }
      voxels.push(v);
      occ.set(k, voxels.length - 1);
    }
    function has(x, y, z) { return occ.has(x + ',' + y + ',' + z); }

    // ---- Base: floor + ground apron ----
    for (const [x, z] of FLOOR_CELLS) {
      put(x, 0, z, palette.floor, { edge: false });
    }
    // Ground apron just outside the cathedral
    const GROUND_PAD = 4;
    for (let x = -NAVE_W - 4; x <= APSE_END + 3; x++) {
      for (let z = -TR_HALF - 3; z <= TR_HALF + 3; z++) {
        if (!inFoot(x, z)) {
          // only inside a padding band
          let near = false;
          for (let dx = -GROUND_PAD; dx <= GROUND_PAD && !near; dx++) {
            for (let dz = -GROUND_PAD; dz <= GROUND_PAD && !near; dz++) {
              if (inFoot(x + dx, z + dz)) near = true;
            }
          }
          if (near) put(x, -1, z, palette.ground, { edge: false });
        }
      }
    }

    // ---- Grow the walls upward ----
    // `waveHeight` is the current top course of the main nave walls.
    // Each paragraph raises it; long paragraphs raise it more.
    // Hard cap so it never goes absurd.
    const MAX_WALL = 14;
    const MAX_WEST_TOWER = 28;
    const MAX_CROSSING = 22;
    const MAX_APSE = 11;

    let wallHeight = 0;          // nave + transept + apse walls height (course count)
    let westTowerHeight = 0;     // twin west towers
    let crossingHeight = 0;      // crossing tower over the transept
    let apseHeight = 0;          // apse walls
    let spiralSteps = 0;         // spiral stair progress
    let windowCount = 0;
    let bannerSlot = 0;
    let lanternSlot = 0;

    // Accumulators: raise feature heights by integer amounts.
    function raiseWall(dy) {
      wallHeight = Math.min(MAX_WALL, wallHeight + dy);
      // Apse tracks 80% of wall
      apseHeight = Math.min(MAX_APSE, Math.round(wallHeight * 0.9));
    }
    function raiseWest(dy) { westTowerHeight = Math.min(MAX_WEST_TOWER, westTowerHeight + dy); }
    function raiseCrossing(dy) { crossingHeight = Math.min(MAX_CROSSING, crossingHeight + dy); }
    function addSpiral(n) { spiralSteps += n; }

    // Track markdown triggers per-token
    for (const tok of tokens) {
      if (tok.type === 'p') {
        const dy = Math.max(1, Math.min(3, Math.floor(tok.len / 40) + 1));
        raiseWall(dy);
        // inline ornaments raise very little — they're ornaments, placed on current top
        if (tok.bold) bannerSlot++;
        if (tok.ital) bannerSlot++;
        if (tok.inlineCode) lanternSlot++;
        if (tok.link) lanternSlot++;
      } else if (tok.type === 'header') {
        if (tok.level === 1) {
          raiseWest(4); raiseWall(1);
        } else if (tok.level === 2) {
          raiseCrossing(3); raiseWall(1);
        } else {
          raiseWall(1); bannerSlot++;
        }
      } else if (tok.type === 'ul' || tok.type === 'ol') {
        const steps = Math.max(2, Math.min(8, Math.floor(tok.text.length / 10) + 2));
        addSpiral(steps);
      } else if (tok.type === 'quote') {
        windowCount++;
      } else if (tok.type === 'hr') {
        raiseWall(2); // pronounced roof terrace
      } else if (tok.type === 'codeFence') {
        lanternSlot++;
      } else if (tok.type === 'code') {
        lanternSlot++;
      }
    }

    // ---- Build the cathedral with accumulated heights ----

    // 1) Walls of the nave + transept + apse + west-front bastions, from y=1 to wallHeight
    for (const [x, z] of WALL_CELLS) {
      let top = wallHeight;
      // Apse walls follow apseHeight
      if (x > NAVE_E) top = apseHeight;
      // West bastion bases rise with west towers
      const inNWBastion = (x >= -NAVE_W - 1 && x <= -NAVE_W + 1 && z >= -4 && z <= -2);
      const inSWBastion = (x >= -NAVE_W - 1 && x <= -NAVE_W + 1 && z >= 2 && z <= 4);
      if (inNWBastion || inSWBastion) top = Math.max(top, westTowerHeight);
      for (let y = 1; y <= top; y++) {
        // Alternate stone shades every 3 courses for visual rhythm
        const c = ((y - 1) % 3 === 0) ? palette.stoneLight : palette.stone;
        put(x, y, z, c);
      }
      // Crenellation on nave/transept main walls only (not bastions — they're towers with roofs)
      if (!inNWBastion && !inSWBastion && x <= NAVE_E && top > 0) {
        // every other cell
        if ((Math.abs(x) + Math.abs(z)) % 2 === 0) put(x, top + 1, z, palette.stoneDark);
      }
    }

    // 2) Pitched nave roof — an A-frame sitting on the nave walls (covers NAVE_HALF+AISLE wide strip)
    if (wallHeight > 0) {
      const roofBase = wallHeight + 1;
      const halfW = NAVE_HALF + AISLE;
      for (let level = 0; level <= halfW; level++) {
        const y = roofBase + level;
        for (let x = -NAVE_W; x <= NAVE_E; x++) {
          // skip the crossing area (covered separately)
          if (x >= -TR_W && x <= TR_W) continue;
          put(x, y, -(halfW - level), palette.roof);
          put(x, y,  (halfW - level), palette.roof);
          // fill the apex
          if (level === halfW) put(x, y, 0, palette.roof);
        }
      }
      // Ridge cap
      for (let x = -NAVE_W; x <= NAVE_E; x++) {
        if (x >= -TR_W && x <= TR_W) continue;
        put(x, roofBase + halfW, 0, palette.roofDark);
      }
      // Transept arms get their own pitched roof too (perpendicular)
      for (let level = 0; level <= halfW; level++) {
        const y = roofBase + level;
        for (let z = -TR_HALF; z <= TR_HALF; z++) {
          if (z >= -NAVE_HALF && z <= NAVE_HALF) continue; // crossing covered by crossing tower
          put(-(halfW - level), y, z, palette.roof);
          put( (halfW - level), y, z, palette.roof);
          if (level === halfW) put(0, y, z, palette.roof);
        }
      }
    }

    // 3) Apse semi-dome on top of apse walls
    if (apseHeight > 0) {
      const baseY = apseHeight + 1;
      for (let r = 0; r < 3; r++) {
        for (let x = NAVE_E + 1; x <= APSE_END; x++) {
          const dx = x - NAVE_E;
          const maxZ = Math.round(Math.sqrt(Math.max(0, 9 - dx * dx))) - r;
          if (maxZ < 0) continue;
          for (let z = -maxZ; z <= maxZ; z++) {
            put(x, baseY + r, z, palette.roofDark);
          }
        }
      }
    }

    // 4) Twin west-front towers (taller blocks over the bastions, topped with pyramidal spires)
    if (westTowerHeight > 0) {
      const ty = westTowerHeight;
      // Each west tower is 3x3 in z-extent, 3 wide in x (x ∈ [-NAVE_W-1, -NAVE_W+1])
      for (const base of [WEST_TOWER_N, WEST_TOWER_S]) {
        // Small belfry band at top (hollow with openings)
        for (let dx = -1; dx <= 1; dx++) {
          for (let dz = -1; dz <= 1; dz++) {
            const x = base.x + dx, z = base.z + dz;
            // belfry arches — leave center stone open
            if ((Math.abs(dx) === 1 || Math.abs(dz) === 1) && (dx !== 0 || dz !== 0)) {
              put(x, ty - 2, z, palette.stoneDark);
              put(x, ty - 1, z, palette.stone);
              put(x, ty,     z, palette.stoneLight);
            }
          }
        }
        // Spire on top — pyramidal, tapering 4 cells up
        const spireH = 6;
        for (let s = 1; s <= spireH; s++) {
          const r = Math.max(0, 1 - Math.floor((s - 1) / 2));
          for (let dx = -r; dx <= r; dx++) {
            for (let dz = -r; dz <= r; dz++) {
              put(base.x + dx, ty + s, base.z + dz, s < spireH - 1 ? palette.spire : palette.spireCap);
            }
          }
        }
        // Golden finial
        put(base.x, ty + spireH + 1, base.z, palette.gold, { emissive: 1 });
      }
      // West rose window — centered between the towers, on the west-front wall (x = -NAVE_W)
      if (westTowerHeight >= 6) {
        const cy = Math.max(4, Math.min(wallHeight - 1, 7));
        for (let dz = -2; dz <= 2; dz++) {
          for (let dy = -2; dy <= 2; dy++) {
            if (dz * dz + dy * dy <= 4 && dz * dz + dy * dy >= 2) {
              // outer ring — darker stone tracery
              put(-NAVE_W, cy + dy, dz, palette.stoneDark);
            } else if (dz * dz + dy * dy < 2) {
              // glass center
              put(-NAVE_W, cy + dy, dz, palette.glass1, { emissive: 0.9 });
            }
          }
        }
      }
    }

    // 5) Central crossing tower — over the transept crossing (x ∈ [-TR_W..TR_W], z ∈ [-NAVE_HALF..NAVE_HALF])
    if (crossingHeight > 0) {
      const topBase = wallHeight; // crossing tower starts rising from above the main roof
      const ty = topBase + crossingHeight;
      for (let y = topBase + 1; y <= ty; y++) {
        for (let x = -TR_W; x <= TR_W; x++) {
          for (let z = -NAVE_HALF; z <= NAVE_HALF; z++) {
            // hollow square — only perimeter
            if (x === -TR_W || x === TR_W || z === -NAVE_HALF || z === NAVE_HALF) {
              put(x, y, z, palette.stone);
            }
          }
        }
      }
      // Crenellation band
      for (let x = -TR_W; x <= TR_W; x++) {
        for (let z = -NAVE_HALF; z <= NAVE_HALF; z++) {
          if (x === -TR_W || x === TR_W || z === -NAVE_HALF || z === NAVE_HALF) {
            if ((x + z) % 2 === 0) put(x, ty + 1, z, palette.stoneDark);
          }
        }
      }
      // Central octagonal spire over crossing
      if (crossingHeight >= 6) {
        const spireBase = ty + 2;
        const spireH = Math.min(12, Math.floor(crossingHeight / 2) + 4);
        for (let s = 0; s < spireH; s++) {
          const r = Math.max(0, 3 - Math.floor(s * 0.8));
          for (let dx = -r; dx <= r; dx++) {
            for (let dz = -r; dz <= r; dz++) {
              // round off corners at outer radius
              if (Math.abs(dx) === r && Math.abs(dz) === r && r > 0) continue;
              put(dx, spireBase + s, dz, s < spireH - 1 ? palette.spire : palette.spireCap);
            }
          }
        }
        // Final gold cross
        put(0, spireBase + spireH,     0, palette.gold, { emissive: 0.9 });
        put(0, spireBase + spireH + 1, 0, palette.gold, { emissive: 1 });
        put(-1, spireBase + spireH,    0, palette.gold, { emissive: 0.9 });
        put( 1, spireBase + spireH,    0, palette.gold, { emissive: 0.9 });
      }
    }

    // 6) NW turret with spiral stair — a slender round tower attached to the NW bastion
    if (spiralSteps > 0 || westTowerHeight > 0) {
      const tx = NW_TURRET.x - 1;
      const tz = NW_TURRET.z - 1;
      const turretH = Math.max(westTowerHeight - 2, Math.min(20, 2 + Math.floor(spiralSteps / 2)));
      // 2x2 turret column
      for (let y = 1; y <= turretH; y++) {
        for (let dx = 0; dx < 2; dx++) {
          for (let dz = 0; dz < 2; dz++) {
            put(tx + dx, y, tz + dz, palette.stone);
          }
        }
      }
      // Spiral stair steps visible as darker voxels on the turret exterior
      for (let s = 0; s < spiralSteps; s++) {
        const y = 1 + Math.floor(s / 2);
        if (y > turretH) break;
        // 4-position loop around turret exterior
        const pos = s % 4;
        let sx = tx, sz = tz;
        if (pos === 0) { sx = tx - 1; sz = tz; }
        else if (pos === 1) { sx = tx;     sz = tz - 1; }
        else if (pos === 2) { sx = tx + 2; sz = tz + 1; }
        else               { sx = tx + 1; sz = tz + 2; }
        put(sx, y, sz, palette.stoneDark);
      }
      // Turret conical roof
      const roofBase = turretH + 1;
      for (let s = 0; s < 4; s++) {
        const r = 1 - Math.floor(s / 2);
        for (let dx = -r; dx <= 1 + r; dx++) {
          for (let dz = -r; dz <= 1 + r; dz++) {
            put(tx + dx, roofBase + s, tz + dz, palette.spire);
          }
        }
      }
      put(tx, roofBase + 4, tz, palette.gold, { emissive: 0.9 });
    }

    // 7) Flying buttresses along the nave south side — one per HR + one per 3 paragraphs-worth of wall growth
    // We'll use a simple heuristic: number of buttresses = floor(wallHeight / 3)
    const buttressCount = Math.floor(wallHeight / 3);
    for (let i = 0; i < buttressCount; i++) {
      const x = -NAVE_W + 3 + i * 3;
      if (x > NAVE_E - 1) break;
      // Pier
      for (let y = 1; y <= wallHeight - 1; y++) {
        put(x, y, NAVE_HALF + AISLE + 1, palette.stoneDark);
        put(x, y, -(NAVE_HALF + AISLE + 1), palette.stoneDark);
      }
      // Flying arch
      const archStart = Math.max(3, wallHeight - 2);
      for (let s = 0; s <= 1; s++) {
        put(x, archStart + s, NAVE_HALF + AISLE + 1 - s, palette.stoneDark);
        put(x, archStart + s, -(NAVE_HALF + AISLE + 1 - s), palette.stoneDark);
      }
    }

    // 8) Stained-glass windows in nave side walls — one per quote token, alternating sides
    for (let i = 0; i < windowCount && i < NAVE_SOUTH_WINDOWS.length * 2; i++) {
      const side = (i % 2 === 0) ? NAVE_SOUTH_WINDOWS : NAVE_NORTH_WINDOWS;
      const idx = Math.floor(i / 2) % side.length;
      const [wx, wz] = side[idx];
      const cy = Math.max(3, Math.min(wallHeight - 1, 5));
      // 1-wide, 3-tall lancet window, glass colors cycle
      const colors = [palette.glass1, palette.glass2, palette.glass3];
      const col = colors[i % 3];
      for (let dy = -1; dy <= 1; dy++) {
        put(wx, cy + dy, wz, col, { emissive: 0.95 });
      }
      // Tracery above
      put(wx, cy + 2, wz, palette.stoneDark);
    }

    // 9) Inline banners & lanterns: attach to crenellations and interior
    // Banners — gold pinnacles on crenellations of the south nave wall
    for (let i = 0; i < bannerSlot && i < 8; i++) {
      const x = -NAVE_W + 2 + i * 2;
      if (x > NAVE_E - 1) break;
      put(x, wallHeight + 2, NAVE_HALF + AISLE, palette.gold, { emissive: 0.6 });
    }
    // Lanterns — teal glow points inside the nave floor
    for (let i = 0; i < lanternSlot && i < 12; i++) {
      const x = -NAVE_W + 2 + i * 2;
      if (x > NAVE_E - 1) break;
      put(x, 1, 0, palette.teal, { emissive: 0.8 });
    }

    // ---- Bounds for camera framing ----
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, maxY = 0;
    for (const v of voxels) {
      if (v.x < minX) minX = v.x;
      if (v.x > maxX) maxX = v.x;
      if (v.z < minZ) minZ = v.z;
      if (v.z > maxZ) maxZ = v.z;
      if (v.y > maxY) maxY = v.y;
    }

    return {
      voxels,
      bounds: { minX, maxX, minZ, maxZ, minY: -1, maxY },
      palette,
      tokens,
      height: wallHeight,
      westHeight: westTowerHeight,
      crossingHeight,
      stairs: spiralSteps,
      windows: windowCount,
    };
  }

  window.Architect = { build, tokenize, PALETTES };
})();
