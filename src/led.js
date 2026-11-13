// Couleur réellement visible d'une LED de l'EVO80 pour une consigne teinte / saturation / valeur.
// Calé sur deux observations du vrai clavier : la teinte 14° (saturation 95 %) y est un ambre
// chaud et non un rouge orangé, la teinte 243° (saturation 90 %) un bleu franc et non un indigo.

const RED_GAIN = 0.45;    // la LED rouge est nettement plus faible que la verte et la bleue
const BLUE_TINT = 0.22;   // la LED bleue tire sur l'azur : elle déborde un peu sur le vert
const WHITE_LIFT = 0.1;   // lumière diffusée par les interrupteurs et la plaque

function hsv(h, s, v) {
  const i = Math.floor(h * 6), f = h * 6 - i;
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  return [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][((i % 6) + 6) % 6];
}

// h, s, v entre 0 et 1 ; renvoie [r, g, b] entre 0 et 255. La correction porte sur la teinte
// pure, ensuite désaturée vers le blanc : un réglage sans saturation reste blanc.
export function ledRgb(h, s, v) {
  const [r, g, b] = hsv(h, 1, 1);
  const seen = [r * RED_GAIN, g + b * BLUE_TINT, b];
  const peak = Math.max(...seen);
  const chroma = s * (1 - WHITE_LIFT);
  return seen.map((c) => 255 * v * (1 - chroma + (chroma * c) / peak));
}
