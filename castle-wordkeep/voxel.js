// Isometric voxel renderer (canvas 2D, painter's algorithm).
(function () {
  const TILE_W = 18;   // width of a tile (x axis projection)
  const TILE_H = 9;    // height of a tile (z axis projection -> tilts)
  const TILE_V = 18;   // vertical extent of one y unit

  function hexToRgb(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const n = parseInt(hex, 16);
    return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
  }
  function rgbToStr(r, g, b, a) {
    return a != null ? `rgba(${r|0},${g|0},${b|0},${a})` : `rgb(${r|0},${g|0},${b|0})`;
  }
  function shade(hex, factor, emissive) {
    const { r, g, b } = hexToRgb(hex);
    const f = factor;
    let nr = r * f, ng = g * f, nb = b * f;
    if (emissive) {
      nr = Math.min(255, nr + 255 * emissive * 0.35);
      ng = Math.min(255, ng + 255 * emissive * 0.35);
      nb = Math.min(255, nb + 255 * emissive * 0.35);
    }
    return rgbToStr(Math.max(0, Math.min(255, nr)),
                    Math.max(0, Math.min(255, ng)),
                    Math.max(0, Math.min(255, nb)));
  }

  // Sort voxels back-to-front: larger (x+z-y) renders later (in front)
  function sortKey(v) { return (v.x + v.z) * 1000 - v.y * 1; }

  function render(ctx, voxels, opts) {
    const zoom = opts.zoom || 1;
    const cx = opts.cx || 0;
    const cy = opts.cy || 0;
    const tw = TILE_W * zoom, th = TILE_H * zoom, tv = TILE_V * zoom;

    // Sort
    const sorted = voxels.slice().sort((a, b) => sortKey(a) - sortKey(b));

    for (const v of sorted) {
      const px = cx + (v.x - v.z) * (tw / 2);
      const py = cy + (v.x + v.z) * (th / 2) - v.y * tv;
      const em = v.emissive || 0;

      // Top face (lightest)
      const top = shade(v.color, 1.15, em);
      // Left face
      const left = shade(v.color, 0.78, em * 0.7);
      // Right face
      const right = shade(v.color, 0.62, em * 0.5);

      // Top diamond
      ctx.fillStyle = top;
      ctx.beginPath();
      ctx.moveTo(px,            py);
      ctx.lineTo(px + tw / 2,   py + th / 2);
      ctx.lineTo(px,            py + th);
      ctx.lineTo(px - tw / 2,   py + th / 2);
      ctx.closePath();
      ctx.fill();

      // Left face
      ctx.fillStyle = left;
      ctx.beginPath();
      ctx.moveTo(px - tw / 2,   py + th / 2);
      ctx.lineTo(px,            py + th);
      ctx.lineTo(px,            py + th + tv);
      ctx.lineTo(px - tw / 2,   py + th / 2 + tv);
      ctx.closePath();
      ctx.fill();

      // Right face
      ctx.fillStyle = right;
      ctx.beginPath();
      ctx.moveTo(px + tw / 2,   py + th / 2);
      ctx.lineTo(px,            py + th);
      ctx.lineTo(px,            py + th + tv);
      ctx.lineTo(px + tw / 2,   py + th / 2 + tv);
      ctx.closePath();
      ctx.fill();

      // Subtle edge lines for crispness (skipped if edge:false)
      if (v.edge !== false) {
        ctx.strokeStyle = 'rgba(0,0,0,0.18)';
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(px, py + th);
        ctx.lineTo(px, py + th + tv);
        ctx.moveTo(px - tw / 2, py + th / 2);
        ctx.lineTo(px,          py + th);
        ctx.lineTo(px + tw / 2, py + th / 2);
        ctx.stroke();
      }

      // Emissive glow halo
      if (em > 0.5) {
        const { r, g, b } = hexToRgb(v.color);
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = rgbToStr(r, g, b, 0.22);
        ctx.beginPath();
        ctx.arc(px, py + th / 2 + tv / 2, tw * 0.9, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  window.Voxel = { render, TILE_W, TILE_H, TILE_V };
})();
