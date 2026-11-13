// Catalogue des effets de rétroéclairage QMK (rgb_matrix), identifiés par leur nom QMK.
// Chaque clavier associe ses numéros d'effet VIA à ces noms (voir src/keyboards/).
// La fonction d'aperçu est une approximation : (touche, temps, contexte) -> [teinte, sat, lum] (0-1).

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

// Nombre de frappes récentes sur une touche (carte de chaleur).
function heat(k, c) {
  let sum = 0;
  for (const h of c.hits) {
    const age = c.now - h.t;
    if (age < 2) sum += (1 - age / 2) * clamp(1 - Math.hypot((k.x - h.x) * 1.9, k.y - h.y) * 6);
  }
  return clamp(sum);
}

const H = (c, off = 0) => frac(c.hue + off);
const react = (mode) => (k, t, c) => [H(c), c.sat, reactive(k, c, mode).v];
const splash = (k, t, c) => { const r = reactive(k, c, 'splash'); return [frac(c.hue + r.ring), c.sat, 0.15 + r.v * 0.85]; };

// Familles, dans l'ordre des onglets. `color: false` : l'effet ignore la couleur choisie.
export const FAMILIES = ['Fixe', 'Vagues', 'Arc-en-ciel', 'Frappe', 'Particules'];

export const EFFECTS = {
  solid_color: { family: 'Fixe', name: 'Couleur unie', f: (k, t, c) => [H(c), c.sat, 1] },
  alphas_mods: { family: 'Fixe', name: 'Lettres et modificateurs', f: (k, t, c) => [k.tone !== 'a' ? H(c, 0.16 + c.speedN * 0.3) : H(c), c.sat, 1] },
  gradient_up_down: { family: 'Fixe', name: 'Dégradé vertical', f: (k, t, c) => [H(c, k.y * 0.35), c.sat, 1] },
  gradient_left_right: { family: 'Fixe', name: 'Dégradé horizontal', f: (k, t, c) => [H(c, k.x * 0.35), c.sat, 1] },

  breathing: { family: 'Vagues', name: 'Respiration', f: (k, t, c) => [H(c), c.sat, 0.15 + 0.85 * wave(t * 0.35)] },
  hue_breathing: { family: 'Vagues', name: 'Teinte qui respire', f: (k, t, c) => [H(c, 0.06 * Math.sin(t * 1.8)), c.sat, 1] },
  hue_pendulum: { family: 'Vagues', name: 'Pendule de teinte', f: (k, t, c) => [H(c, 0.12 * Math.sin(t * 1.4) * (k.x - 0.5) * 2), c.sat, 1] },
  hue_wave: { family: 'Vagues', name: 'Vague de teinte', f: (k, t, c) => [H(c, 0.1 * Math.sin((k.x - t * 0.35) * 6)), c.sat, 1] },
  riverflow: { family: 'Vagues', name: 'Rivière', f: (k, t, c) => [H(c), c.sat, 0.2 + 0.8 * wave(k.i * 0.09 - t * 0.45)] },
  band_sat: { family: 'Vagues', name: 'Bande de saturation', f: (k, t, c) => [H(c), c.sat * clamp(Math.abs(k.x - frac(t * 0.3)) * 4), 1] },
  band_val: { family: 'Vagues', name: 'Bande de lumière', f: (k, t, c) => [H(c), c.sat, clamp(1 - Math.abs(k.x - frac(t * 0.3)) * 4, 0.12)] },

  cycle_all: { family: 'Arc-en-ciel', name: 'Cycle complet', color: false, f: (k, t) => [frac(t * 0.12), 1, 1] },
  cycle_left_right: { family: 'Arc-en-ciel', name: 'Défilement horizontal', color: false, f: (k, t) => [frac(k.x - t * 0.25), 1, 1] },
  cycle_up_down: { family: 'Arc-en-ciel', name: 'Défilement vertical', color: false, f: (k, t) => [frac(k.y - t * 0.25), 1, 1] },
  cycle_out_in: { family: 'Arc-en-ciel', name: 'Du centre vers les bords', color: false, f: (k, t) => [frac(k.d * 1.2 - t * 0.3), 1, 1] },
  cycle_out_in_dual: { family: 'Arc-en-ciel', name: 'Double centre', color: false, f: (k, t) => [frac(Math.hypot(Math.abs(k.x - 0.5) * 2 - 0.5, k.y - 0.5) - t * 0.3), 1, 1] },
  rainbow_moving_chevron: { family: 'Arc-en-ciel', name: 'Chevrons', color: false, f: (k, t) => [frac(k.x + Math.abs(k.y - 0.5) * 0.6 - t * 0.25), 1, 1] },
  cycle_pinwheel: { family: 'Arc-en-ciel', name: 'Moulinet', color: false, f: (k, t) => [frac(k.a - t * 0.2), 1, 1] },
  cycle_spiral: { family: 'Arc-en-ciel', name: 'Spirale', color: false, f: (k, t) => [frac(k.a + k.d * 0.8 - t * 0.2), 1, 1] },
  dual_beacon: { family: 'Arc-en-ciel', name: 'Double phare', f: (k, t, c) => [H(c, 0.1 * Math.cos((k.a - t * 0.2) * Math.PI * 4)), c.sat, 1] },
  rainbow_beacon: { family: 'Arc-en-ciel', name: 'Phare arc-en-ciel', color: false, f: (k, t) => [frac(0.5 * Math.cos((k.a - t * 0.2) * Math.PI * 2)), 1, 1] },
  rainbow_pinwheels: { family: 'Arc-en-ciel', name: 'Moulinets multiples', color: false, f: (k, t) => [frac(Math.sin((k.a * 3 - t * 0.3) * Math.PI) * 0.5 + k.x * 0.3), 1, 1] },
  flower_blooming: { family: 'Arc-en-ciel', name: 'Floraison', f: (k, t, c) => [H(c, Math.abs(k.y - 0.5) * 0.8 + (k.x < 0.5 ? 1 : -1) * t * 0.15), c.sat, 1] },
  band_pinwheel_sat: { family: 'Arc-en-ciel', name: 'Moulinet saturé', f: (k, t, c) => [H(c), c.sat * frac(k.a - t * 0.2), 1] },
  band_pinwheel_val: { family: 'Arc-en-ciel', name: 'Moulinet lumineux', f: (k, t, c) => [H(c), c.sat, 0.1 + 0.9 * frac(k.a - t * 0.2)] },
  band_spiral_sat: { family: 'Arc-en-ciel', name: 'Spirale saturée', f: (k, t, c) => [H(c), c.sat * frac(k.a + k.d - t * 0.2), 1] },
  band_spiral_val: { family: 'Arc-en-ciel', name: 'Spirale lumineuse', f: (k, t, c) => [H(c), c.sat, 0.1 + 0.9 * frac(k.a + k.d - t * 0.2)] },

  solid_reactive_simple: { family: 'Frappe', name: 'Touche qui s’éclaire', f: (k, t, c) => [H(c), c.sat, reactive(k, c, 'key').v] },
  solid_reactive: { family: 'Frappe', name: 'Touche qui s’allume', f: (k, t, c) => [H(c, reactive(k, c, 'key').v * 0.5), c.sat, 1] },
  solid_reactive_wide: { family: 'Frappe', name: 'Halo large', f: react('wide') },
  solid_reactive_multiwide: { family: 'Frappe', name: 'Halos multiples', f: react('wide') },
  solid_reactive_cross: { family: 'Frappe', name: 'Croix', f: react('cross') },
  solid_reactive_multicross: { family: 'Frappe', name: 'Croix multiples', f: react('cross') },
  solid_reactive_nexus: { family: 'Frappe', name: 'Nexus', f: react('nexus') },
  solid_reactive_multinexus: { family: 'Frappe', name: 'Nexus multiples', f: react('nexus') },
  splash: { family: 'Frappe', name: 'Éclaboussure', f: splash },
  multisplash: { family: 'Frappe', name: 'Éclaboussures multiples', f: splash },
  solid_splash: { family: 'Frappe', name: 'Onde de choc', f: react('splash') },
  solid_multisplash: { family: 'Frappe', name: 'Ondes de choc multiples', f: react('splash') },
  typing_heatmap: { family: 'Frappe', name: 'Carte de chaleur', color: false, f: (k, t, c) => { const v = heat(k, c); return [0.66 - v * 0.66, 1, 0.15 + v * 0.85]; } },

  starlight: { family: 'Particules', name: 'Ciel étoilé', f: (k, t, c) => [H(c), c.sat, Math.pow(wave(noise(k.i, 1) + t * (0.15 + noise(k.i, 2) * 0.3)), 3)] },
  starlight_dual_hue: { family: 'Particules', name: 'Étoiles bicolores', f: (k, t, c) => [H(c, noise(k.i, 3) > 0.5 ? 0.12 : -0.12), c.sat, Math.pow(wave(noise(k.i, 1) + t * 0.3), 3)] },
  starlight_dual_sat: { family: 'Particules', name: 'Étoiles nuancées', f: (k, t, c) => [H(c), c.sat * noise(k.i, 4), Math.pow(wave(noise(k.i, 1) + t * 0.3), 3)] },
  raindrops: { family: 'Particules', name: 'Gouttes de pluie', f: (k, t, c) => { const n = Math.floor(t * 0.8 + noise(k.i, 5) * 9); return [frac(c.hue + (noise(k.i, n) - 0.5) * 0.3), c.sat, 1]; } },
  jellybean_raindrops: { family: 'Particules', name: 'Bonbons', color: false, f: (k, t) => { const n = Math.floor(t * 0.8 + noise(k.i, 6) * 9); return [noise(k.i, n), 0.5 + noise(k.i, n + 1) * 0.5, 0.4 + noise(k.i, n + 2) * 0.6]; } },
  pixel_rain: { family: 'Particules', name: 'Pluie de pixels', color: false, f: (k, t) => { const n = Math.floor(t * 1.2 + noise(k.i, 11) * 7); return [noise(k.i, n), 1, noise(k.i, n + 3) > 0.55 ? 1 : 0]; } },
  pixel_flow: { family: 'Particules', name: 'Flux de pixels', color: false, f: (k, t) => { const n = Math.floor(k.x * 18 - t * 3); return [noise(n, 7), 1, noise(n, 8) > 0.4 ? 1 : 0]; } },
  pixel_fractal: { family: 'Particules', name: 'Fractale de pixels', color: false, f: (k, t) => { const n = Math.floor(Math.abs(k.x - 0.5) * 18 - t * 3); return [noise(n + k.uy * 31, 12), 1, noise(n + k.uy * 31, 13) > 0.45 ? 1 : 0]; } },
  digital_rain: { family: 'Particules', name: 'Pluie numérique', color: false, f: (k, t) => { const col = Math.floor(k.x * 18); const p = frac(t * (0.3 + noise(col, 9) * 0.4) + noise(col, 10)); const d = p * 1.4 - k.y; return [0.33, d > 0 && d < 0.08 ? 0.2 : 1, d > 0 ? clamp(1 - d * 3) : 0]; } },
};

export const OFF = { key: 'none', name: 'Éteint', color: false, f: () => [0, 0, 0] };

// Construit la liste des effets d'un clavier à partir de sa table « numéro VIA -> nom QMK ».
// `hideColor` : effets pour lesquels le constructeur masque le réglage de couleur.
export function effectCatalog(viaEffects, hideColor = []) {
  const byId = new Map([[0, { ...OFF, id: 0 }]]);
  const families = FAMILIES.map((name) => ({ name, effects: [] }));
  for (const [id, key] of Object.entries(viaEffects)) {
    const fx = EFFECTS[key];
    if (!fx) continue;
    const effect = { ...fx, id: Number(id), key, color: fx.color !== false && !hideColor.includes(key) };
    byId.set(effect.id, effect);
    families.find((f) => f.name === fx.family).effects.push(effect);
  }
  const idOf = new Map([...byId.values()].map((e) => [e.key, e.id]));
  return { byId, families: families.filter((f) => f.effects.length), idOf };
}
