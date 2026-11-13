// Couleur des LED de chaque touche pour un effet donné, et vignettes d'aperçu des effets.
// La disposition vient de la définition du clavier (src/keyboards/) ; le rendu 3D est dans keyboard3d.js.

import { ledRgb } from './led.js';

const wrap = (h) => ((h % 1) + 1) % 1;
const clamp01 = (x) => Math.min(1, Math.max(0, x));

// Couleur de chaque touche pour un effet donné, telle que les LED la rendent.
export function keyColors(keys, fx, t, c, bright) {
  return keys.map((k) => {
    const [hh, ss, vv] = fx.f(k, t, c);
    return ledRgb(wrap(hh), clamp01(ss), Math.max(0, vv) * bright);
  });
}

// Vignette d'aperçu d'un effet : la grille des touches vue de dessus, en pastilles de lumière.
export function drawThumb(ctx, w, h, layout, fx, c, t = 1.7) {
  const { keys, width, height } = layout;
  ctx.clearRect(0, 0, w, h);
  const u = Math.min(w / width, h / height);
  const ox = (w - width * u) / 2, oy = (h - height * u) / 2;
  const cols = keyColors(keys, fx, t, { ...c, hits: c.hits ?? [], now: c.now ?? 0 }, 0.92);
  const paint = (inset, alpha) => {
    keys.forEach((k, i) => {
      const [r, g, b] = cols[i];
      ctx.fillStyle = r + g + b < 10 ? 'rgba(255,255,255,0.05)' : `rgba(${r | 0},${g | 0},${b | 0},${alpha})`;
      ctx.beginPath();
      ctx.roundRect(ox + k.ux * u + u * inset, oy + k.uy * u + u * inset, k.w * u - u * inset * 2, u * (1 - inset * 2), u * 0.25);
      ctx.fill();
    });
  };
  // Halo diffus puis touches nettes et plus petites : rendu « lumière » plutôt que grille de pixels.
  ctx.filter = `blur(${Math.max(2, u * 0.8)}px)`;
  paint(0, 0.55);
  ctx.filter = 'none';
  paint(0.2, 0.95);
}
