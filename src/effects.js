// Catalogue des effets, issu de la définition VIA officielle de l'EVO80 (EVO80_0924.json).
// Chaque effet a une fonction d'aperçu approximative : (touche, temps, contexte) -> [teinte, sat, lum] (0-1).

const frac = (x) => x - Math.floor(x);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const wave = (x) => 0.5 + 0.5 * Math.sin(x * Math.PI * 2);

// Bruit déterministe par touche, pour les effets "aléatoires".
const noise = (i, n) => frac(Math.sin(i * 127.1 + n * 311.7) * 43758.5453);

// Effets réactifs : plus la frappe est récente et proche, plus elle compte.
function reactive(k, c, mode) {
  let best = 0;
  let ring = 0;
  for (const h of c.hits) {
    const age = (c.now - h.t) * (0.6 + c.speedN * 1.6);
    if (age > 1.6) continue;
    const dx = (k.x - h.x) * 1.9;
    const dy = k.y - h.y;
    const d = Math.hypot(dx, dy);
    let v = 0;
    if (mode === 'key') v = h.i === k.i ? 1 - age : 0;
    else if (mode === 'wide') v = (1 - age) * clamp(1 - d / (0.1 + age * 0.35));
    else if (mode === 'cross') v = (Math.abs(dx) < 0.06 || Math.abs(dy) < 0.08) ? 1 - age : 0;
    else if (mode === 'nexus') v = (Math.abs(dx) < 0.06 || Math.abs(dy) < 0.08) ? clamp(1 - Math.abs(d - age * 0.8) * 8) : 0;
    else if (mode === 'splash') { v = clamp(1 - Math.abs(d - age * 0.7) * 7) * (1 - age / 1.6); ring = Math.max(ring, d); }
    best = Math.max(best, clamp(v));
  }
  return { v: best, ring };
}

const H = (c, off = 0) => frac(c.hue + off);

export const KEY_FAMILIES = [
  {
    name: 'Fixe',
    effects: [
      { id: 1, name: 'Couleur unie', f: (k, t, c) => [H(c), c.sat, 1] },
      { id: 2, name: 'Lettres et modificateurs', f: (k, t, c) => [k.mod ? H(c, 0.16 + c.speedN * 0.3) : H(c), c.sat, 1] },
      { id: 3, name: 'Dégradé vertical', f: (k, t, c) => [H(c, k.y * 0.35), c.sat, 1] },
      { id: 4, name: 'Dégradé horizontal', f: (k, t, c) => [H(c, k.x * 0.35), c.sat, 1] },
    ],
  },
  {
    name: 'Vagues',
    effects: [
      { id: 5, name: 'Respiration', f: (k, t, c) => [H(c), c.sat, 0.15 + 0.85 * wave(t * 0.35)] },
      { id: 26, name: 'Teinte qui respire', f: (k, t, c) => [H(c, 0.06 * Math.sin(t * 1.8)), c.sat, 1] },
      { id: 27, name: 'Pendule de teinte', f: (k, t, c) => [H(c, 0.12 * Math.sin(t * 1.4) * (k.x - 0.5) * 2), c.sat, 1] },
      { id: 28, name: 'Vague de teinte', color: false, f: (k, t, c) => [H(c, 0.1 * Math.sin((k.x - t * 0.35) * 6)), c.sat, 1] },
      { id: 45, name: 'Rivière', f: (k, t, c) => [H(c), c.sat, 0.2 + 0.8 * wave(k.i * 0.09 - t * 0.45)] },
      { id: 6, name: 'Bande de saturation', f: (k, t, c) => [H(c), c.sat * clamp(Math.abs(k.x - frac(t * 0.3)) * 4), 1] },
      { id: 7, name: 'Bande de lumière', f: (k, t, c) => [H(c), c.sat, clamp(1 - Math.abs(k.x - frac(t * 0.3)) * 4, 0.12)] },
    ],
  },
  {
    name: 'Arc-en-ciel',
    effects: [
      { id: 12, name: 'Cycle complet', f: (k, t) => [frac(t * 0.12), 1, 1] },
      { id: 13, name: 'Défilement horizontal', f: (k, t) => [frac(k.x - t * 0.25), 1, 1] },
      { id: 14, name: 'Défilement vertical', f: (k, t) => [frac(k.y - t * 0.25), 1, 1] },
      { id: 15, name: 'Du centre vers les bords', f: (k, t) => [frac(k.d * 1.2 - t * 0.3), 1, 1] },
      { id: 16, name: 'Double centre', f: (k, t) => [frac(Math.hypot(Math.abs(k.x - 0.5) * 2 - 0.5, k.y - 0.5) - t * 0.3), 1, 1] },
      { id: 17, name: 'Chevrons', f: (k, t) => [frac(k.x + Math.abs(k.y - 0.5) * 0.6 - t * 0.25), 1, 1] },
      { id: 18, name: 'Moulinet', f: (k, t) => [frac(k.a - t * 0.2), 1, 1] },
      { id: 19, name: 'Spirale', f: (k, t) => [frac(k.a + k.d * 0.8 - t * 0.2), 1, 1] },
      { id: 20, name: 'Double phare', f: (k, t, c) => [H(c, 0.1 * Math.cos((k.a - t * 0.2) * Math.PI * 4)), c.sat, 1] },
      { id: 21, name: 'Phare arc-en-ciel', f: (k, t) => [frac(0.5 * Math.cos((k.a - t * 0.2) * Math.PI * 2)), 1, 1] },
      { id: 22, name: 'Moulinets multiples', f: (k, t) => [frac(Math.sin((k.a * 3 - t * 0.3) * Math.PI) * 0.5 + k.x * 0.3), 1, 1] },
      { id: 23, name: 'Floraison', f: (k, t, c) => [H(c, Math.abs(k.y - 0.5) * 0.8 + (k.x < 0.5 ? 1 : -1) * t * 0.15), c.sat, 1] },
      { id: 8, name: 'Moulinet saturé', f: (k, t, c) => [H(c), c.sat * frac(k.a - t * 0.2), 1] },
      { id: 9, name: 'Moulinet lumineux', f: (k, t, c) => [H(c), c.sat, 0.1 + 0.9 * frac(k.a - t * 0.2)] },
      { id: 10, name: 'Spirale saturée', f: (k, t, c) => [H(c), c.sat * frac(k.a + k.d - t * 0.2), 1] },
      { id: 11, name: 'Spirale lumineuse', f: (k, t, c) => [H(c), c.sat, 0.1 + 0.9 * frac(k.a + k.d - t * 0.2)] },
    ],
  },
  {
    name: 'Frappe',
    effects: [
      { id: 31, name: 'Touche qui s’allume', f: (k, t, c) => { const r = reactive(k, c, 'key'); return [H(c, r.v * 0.5), c.sat, 1]; } },
      { id: 32, name: 'Halo large', color: false, f: (k, t, c) => { const r = reactive(k, c, 'wide'); return [H(c), c.sat, r.v]; } },
      { id: 33, name: 'Halos multiples', f: (k, t, c) => { const r = reactive(k, c, 'wide'); return [H(c), c.sat, r.v]; } },
      { id: 34, name: 'Croix', f: (k, t, c) => { const r = reactive(k, c, 'cross'); return [H(c), c.sat, r.v]; } },
      { id: 35, name: 'Croix multiples', f: (k, t, c) => { const r = reactive(k, c, 'cross'); return [H(c), c.sat, r.v]; } },
      { id: 36, name: 'Nexus', f: (k, t, c) => { const r = reactive(k, c, 'nexus'); return [H(c), c.sat, r.v]; } },
      { id: 37, name: 'Nexus multiples', f: (k, t, c) => { const r = reactive(k, c, 'nexus'); return [H(c), c.sat, r.v]; } },
      { id: 38, name: 'Éclaboussure', f: (k, t, c) => { const r = reactive(k, c, 'splash'); return [frac(c.hue + r.ring), c.sat, 0.15 + r.v * 0.85]; } },
      { id: 39, name: 'Éclaboussures multiples', f: (k, t, c) => { const r = reactive(k, c, 'splash'); return [frac(c.hue + r.ring), c.sat, 0.15 + r.v * 0.85]; } },
      { id: 40, name: 'Onde de choc', f: (k, t, c) => { const r = reactive(k, c, 'splash'); return [H(c), c.sat, r.v]; } },
      { id: 41, name: 'Ondes de choc multiples', f: (k, t, c) => { const r = reactive(k, c, 'splash'); return [H(c), c.sat, r.v]; } },
    ],
  },
  {
    name: 'Particules',
    effects: [
      { id: 42, name: 'Ciel étoilé', f: (k, t, c) => [H(c), c.sat, Math.pow(wave(noise(k.i, 1) + t * (0.15 + noise(k.i, 2) * 0.3)), 3)] },
      { id: 43, name: 'Étoiles bicolores', f: (k, t, c) => [H(c, noise(k.i, 3) > 0.5 ? 0.12 : -0.12), c.sat, Math.pow(wave(noise(k.i, 1) + t * 0.3), 3)] },
      { id: 44, name: 'Étoiles nuancées', f: (k, t, c) => [H(c), c.sat * noise(k.i, 4), Math.pow(wave(noise(k.i, 1) + t * 0.3), 3)] },
      { id: 24, name: 'Gouttes de pluie', color: false, f: (k, t, c) => { const n = Math.floor(t * 0.8 + noise(k.i, 5) * 9); return [frac(c.hue + (noise(k.i, n) - 0.5) * 0.3), c.sat, 1]; } },
      { id: 25, name: 'Bonbons', f: (k, t) => { const n = Math.floor(t * 0.8 + noise(k.i, 6) * 9); return [noise(k.i, n), 0.5 + noise(k.i, n + 1) * 0.5, 0.4 + noise(k.i, n + 2) * 0.6]; } },
      { id: 29, name: 'Flux de pixels', color: false, f: (k, t) => { const n = Math.floor(k.x * 18 - t * 3); return [noise(n, 7), 1, noise(n, 8) > 0.4 ? 1 : 0]; } },
      { id: 30, name: 'Pluie numérique', f: (k, t) => { const col = Math.floor(k.x * 18); const p = frac(t * (0.3 + noise(col, 9) * 0.4) + noise(col, 10)); const d = p * 1.4 - k.y; return [0.33, d > 0 && d < 0.08 ? 0.2 : 1, d > 0 ? clamp(1 - d * 3) : 0]; } },
    ],
  },
];

export const KEY_EFFECTS = new Map();
for (const fam of KEY_FAMILIES) for (const e of fam.effects) KEY_EFFECTS.set(e.id, { ...e, family: fam.name });
KEY_EFFECTS.set(0, { id: 0, name: 'Éteint', color: false, f: () => [0, 0, 0] });

// Effets de la barre lumineuse : la barre change de couleur d'un bloc, en fondu (pas de défilement).
// La couleur choisie ne s'applique qu'à « Pulsation », « Respiration » et « Lumière fixe ».
const rgbFade = (t) => {
  const p = frac(t) * 3;
  const i = Math.floor(p);
  const from = [0, 1 / 3, 2 / 3][i];
  return frac(from + (p - i) / 3);
};

export const LOGO_EFFECTS = [
  { id: 1, name: 'Fondu de couleurs', color: false, f: (x, t) => [frac(t * 0.25), 1, 1] },
  { id: 2, name: 'Fondu lent', color: false, f: (x, t) => [frac(t * 0.12), 1, 1] },
  { id: 3, name: 'Fondu rapide', color: false, f: (x, t) => [frac(t * 0.5), 1, 1] },
  { id: 4, name: 'Pulsation', color: true, f: (x, t, c) => [c.hue, c.sat, 0.2 + 0.8 * wave(t * 0.3)] },
  { id: 5, name: 'Fondu RVB', color: false, f: (x, t) => [rgbFade(t * 0.15), 1, 1] },
  { id: 6, name: 'Spectre', color: false, f: (x, t) => [frac(t * 0.08), 1, 1] },
  { id: 7, name: 'Respiration', color: true, f: (x, t, c) => [c.hue, c.sat, 0.1 + 0.9 * wave(t * 0.3)] },
  { id: 8, name: 'Respiration RVB', color: false, f: (x, t) => [[0, 1 / 3, 2 / 3][Math.floor(t * 0.3) % 3], 1, wave(t * 0.3)] },
  { id: 9, name: 'Lumière fixe', color: true, f: (x, t, c) => [c.hue, c.sat, 1] },
];
export const LOGO_OFF = { id: 0, name: 'Éteint', color: false, f: () => [0, 0, 0] };
