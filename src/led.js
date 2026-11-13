// Couleur réellement visible d'une LED pour une consigne teinte / saturation / valeur.
// Chaque clavier fournit son calibrage (voir src/keyboards/) : sur l'EVO80, la LED rouge est
// nettement plus faible que les autres, ce qui change le rendu de presque toutes les couleurs.

const NEUTRAL = { redGain: 1, blueTint: 0, whiteLift: 0.08 };
let calibration = NEUTRAL;

// redGain : force de la LED rouge ; blueTint : débord du bleu sur le vert ;
// whiteLift : lumière diffusée par les interrupteurs et la plaque.
export function setLedCalibration(next) {
  calibration = { ...NEUTRAL, ...next };
}

function hsv(h, s, v) {
  const i = Math.floor(h * 6), f = h * 6 - i;
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  return [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][((i % 6) + 6) % 6];
}

// h, s, v entre 0 et 1 ; renvoie [r, g, b] entre 0 et 255. La correction porte sur la teinte
// pure, ensuite désaturée vers le blanc : un réglage sans saturation reste blanc.
export function ledRgb(h, s, v) {
  const { redGain, blueTint, whiteLift } = calibration;
  const [r, g, b] = hsv(h, 1, 1);
  const seen = [r * redGain, g + b * blueTint, b];
  const peak = Math.max(...seen);
  const chroma = s * (1 - whiteLift);
  return seen.map((c) => 255 * v * (1 - chroma + (chroma * c) / peak));
}
