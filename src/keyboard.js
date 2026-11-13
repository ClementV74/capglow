// Disposition des touches de l'EVO80 (TKL ANSI), couleurs des LED pour un effet donné
// et vignettes d'aperçu. Le rendu 3D du clavier est dans keyboard3d.js.

import { ledRgb } from './led.js';

const G = (w) => ({ gap: w });
// Tons des touches : alpha (a), modificateur (m), accent (o).
const K = (label, code, w = 1, tone = 'a') => ({ label, code, w, tone });

const ROWS = [
  [K('Esc', 'Escape', 1, 'o'), G(0.25), K('F1', 'F1'), K('F2', 'F2'), K('F3', 'F3'), K('F4', 'F4'), G(0.25),
    K('F5', 'F5', 1, 'm'), K('F6', 'F6', 1, 'm'), K('F7', 'F7', 1, 'm'), K('F8', 'F8', 1, 'm'), G(0.1),
    K('F9', 'F9'), K('F10', 'F10'), K('F11', 'F11'), K('F12', 'F12'), G(0.15), K('F13', 'F13', 1, 'm'), G(0.5),
    K('Print', 'PrintScreen', 1, 'm'), K('Scroll', 'ScrollLock', 1, 'm'), K('Pause', 'Pause', 1, 'm')],
  [K('~', 'Backquote'), K('1', 'Digit1'), K('2', 'Digit2'), K('3', 'Digit3'), K('4', 'Digit4'), K('5', 'Digit5'),
    K('6', 'Digit6'), K('7', 'Digit7'), K('8', 'Digit8'), K('9', 'Digit9'), K('0', 'Digit0'), K('-', 'Minus'), K('=', 'Equal'),
    K('Backspace', 'Backspace', 2, 'm'), G(0.25), K('Insert', 'Insert', 1, 'm'), K('Home', 'Home', 1, 'm'), K('PgUp', 'PageUp', 1, 'm')],
  [K('Tab', 'Tab', 1.5, 'm'), K('Q', 'KeyQ'), K('W', 'KeyW'), K('E', 'KeyE'), K('R', 'KeyR'), K('T', 'KeyT'), K('Y', 'KeyY'),
    K('U', 'KeyU'), K('I', 'KeyI'), K('O', 'KeyO'), K('P', 'KeyP'), K('[', 'BracketLeft'), K(']', 'BracketRight'),
    K('\\', 'Backslash', 1.5), G(0.25), K('Delete', 'Delete', 1, 'm'), K('End', 'End', 1, 'm'), K('PgDn', 'PageDown', 1, 'm')],
  [K('Caps Lock', 'CapsLock', 1.75, 'm'), K('A', 'KeyA'), K('S', 'KeyS'), K('D', 'KeyD'), K('F', 'KeyF'), K('G', 'KeyG'), K('H', 'KeyH'),
    K('J', 'KeyJ'), K('K', 'KeyK'), K('L', 'KeyL'), K(';', 'Semicolon'), K("'", 'Quote'), K('Enter', 'Enter', 2.25, 'o')],
  [K('Shift', 'ShiftLeft', 2.25, 'm'), K('Z', 'KeyZ'), K('X', 'KeyX'), K('C', 'KeyC'), K('V', 'KeyV'), K('B', 'KeyB'), K('N', 'KeyN'),
    K('M', 'KeyM'), K(',', 'Comma'), K('.', 'Period'), K('/', 'Slash'), K('Shift', 'ShiftRight', 2.75, 'm'), G(1.25), K('↑', 'ArrowUp', 1, 'm')],
  [K('Control', 'ControlLeft', 1.25, 'm'), K('Super', 'MetaLeft', 1.25, 'm'), K('Alt', 'AltLeft', 1.25, 'm'), K('', 'Space', 6.25),
    K('Alt', 'AltRight', 1.25, 'm'), K('Fn', 'Fn', 1.25, 'm'), K('Super', 'ContextMenu', 1.25, 'm'), K('Control', 'ControlRight', 1.25, 'm'),
    G(0.25), K('←', 'ArrowLeft', 1, 'm'), K('↓', 'ArrowDown', 1, 'm'), K('→', 'ArrowRight', 1, 'm')],
];

export const TOTAL_W = 18.25;
export const TOTAL_H = 6;

function buildKeys() {
  const keys = [];
  ROWS.forEach((row, r) => {
    let x = 0;
    for (const item of row) {
      if (item.gap) { x += item.gap; continue; }
      keys.push({ ...item, ux: x, uy: r });
      x += item.w;
    }
  });
  keys.forEach((k, i) => {
    k.i = i;
    k.x = (k.ux + k.w / 2) / TOTAL_W;
    k.y = (k.uy + 0.5) / TOTAL_H;
    const dx = (k.x - 0.5) * 2.9, dy = k.y - 0.5;
    k.d = Math.hypot(dx, dy) / 1.5;
    k.a = (Math.atan2(dy, dx) / (Math.PI * 2) + 1) % 1;
  });
  return keys;
}
export const KEYS = buildKeys();

const wrap = (h) => ((h % 1) + 1) % 1;
const clamp01 = (x) => Math.min(1, Math.max(0, x));

// Couleur de chaque touche pour un effet donné, telle que les LED la rendent.
export function keyColors(fx, t, c, bright) {
  return KEYS.map((k) => {
    const [hh, ss, vv] = fx.f(k, t, c);
    return ledRgb(wrap(hh), clamp01(ss), Math.max(0, vv) * bright);
  });
}

// Vignette d'aperçu d'un effet : la grille des touches vue de dessus, en pastilles de lumière.
export function drawThumb(ctx, w, h, fx, c, t = 1.7) {
  ctx.clearRect(0, 0, w, h);
  const u = Math.min(w / TOTAL_W, h / TOTAL_H);
  const ox = (w - TOTAL_W * u) / 2, oy = (h - TOTAL_H * u) / 2;
  const cols = keyColors(fx, t, { ...c, hits: c.hits ?? [], now: c.now ?? 0 }, 0.92);
  const paint = (inset, alpha) => {
    KEYS.forEach((k, i) => {
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
