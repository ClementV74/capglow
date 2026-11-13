// Outils pour décrire la disposition des touches d'un clavier, rangée par rangée.

// Espace vide de w unités entre deux touches.
export const G = (w) => ({ gap: w });

// Une touche : légende, code DOM (event.code) pour les effets réactifs, largeur en unités,
// et ton : alpha (a), modificateur (m) ou accent (o).
export const K = (label, code, w = 1, tone = 'a') => ({ label, code, w, tone });

// Calcule la position de chaque touche et les coordonnées normalisées utilisées par les effets.
export function buildLayout(rows) {
  const keys = [];
  rows.forEach((row, r) => {
    let x = 0;
    for (const item of row) {
      if (item.gap) { x += item.gap; continue; }
      keys.push({ ...item, ux: x, uy: r });
      x += item.w;
    }
  });
  const width = Math.max(...keys.map((k) => k.ux + k.w));
  const height = rows.length;
  keys.forEach((k, i) => {
    k.i = i;
    k.x = (k.ux + k.w / 2) / width;
    k.y = (k.uy + 0.5) / height;
    const dx = (k.x - 0.5) * 2.9, dy = k.y - 0.5;
    k.d = Math.hypot(dx, dy) / 1.5;
    k.a = (Math.atan2(dy, dx) / (Math.PI * 2) + 1) % 1;
  });
  return { keys, width, height };
}
