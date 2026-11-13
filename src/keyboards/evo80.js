// Evoworks EVO80 : clavier TKL (80 %) ANSI, firmware QMK/VIA d'origine.
// Données vérifiées sur un vrai clavier : protocole VIA v12 en filaire uniquement,
// définition VIA officielle EVO80_0924.json.

import { K, G, buildLayout } from './layout.js';

const frac = (x) => x - Math.floor(x);
const wave = (x) => 0.5 + 0.5 * Math.sin(x * Math.PI * 2);
const rgbFade = (t) => {
  const p = frac(t) * 3;
  const i = Math.floor(p);
  return frac([0, 1 / 3, 2 / 3][i] + (p - i) / 3);
};

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

// Effets de la barre lumineuse : toute la barre change de couleur d'un bloc, en fondu.
const BAR_EFFECTS = [
  { id: 1, name: 'Fondu de couleurs', color: false, f: (x, t) => [frac(t * 0.25), 1, 1] },
  { id: 2, name: 'Fondu lent', color: false, f: (x, t) => [frac(t * 0.12), 1, 1] },
  { id: 3, name: 'Fondu rapide', color: false, f: (x, t) => [frac(t * 0.5), 1, 1] },
  { id: 4, name: 'Pulsation', f: (x, t, c) => [c.hue, c.sat, 0.2 + 0.8 * wave(t * 0.3)] },
  { id: 5, name: 'Fondu RVB', color: false, f: (x, t) => [rgbFade(t * 0.15), 1, 1] },
  { id: 6, name: 'Spectre', color: false, f: (x, t) => [frac(t * 0.08), 1, 1] },
  { id: 7, name: 'Respiration', f: (x, t, c) => [c.hue, c.sat, 0.1 + 0.9 * wave(t * 0.3)] },
  { id: 8, name: 'Respiration RVB', color: false, f: (x, t) => [[0, 1 / 3, 2 / 3][Math.floor(t * 0.3) % 3], 1, wave(t * 0.3)] },
  { id: 9, name: 'Lumière fixe', f: (x, t, c) => [c.hue, c.sat, 1] },
];

export default {
  id: 'evo80',
  name: 'EVO80',
  brand: 'Evoworks',
  experimental: false,
  usb: {
    vendorId: 0x36b0,
    productIds: [0x300e], // filaire : seul mode où VIA répond
    dongleIds: [0x3002], // récepteur 2.4G : détecté, mais il ne relaie pas VIA
  },
  layout: buildLayout(ROWS),
  zones: {
    keys: {
      label: 'Touches',
      channel: 3,
      // Le firmware lit la luminosité sur 0-255 mais l'écrit sur 0-180.
      brightness: { max: 180, readMax: 255 },
      speed: { max: 255 },
      effects: {
        1: 'solid_color', 2: 'alphas_mods', 3: 'gradient_up_down', 4: 'gradient_left_right', 5: 'breathing',
        6: 'band_sat', 7: 'band_val', 8: 'band_pinwheel_sat', 9: 'band_pinwheel_val', 10: 'band_spiral_sat',
        11: 'band_spiral_val', 12: 'cycle_all', 13: 'cycle_left_right', 14: 'cycle_up_down', 15: 'cycle_out_in',
        16: 'cycle_out_in_dual', 17: 'rainbow_moving_chevron', 18: 'cycle_pinwheel', 19: 'cycle_spiral', 20: 'dual_beacon',
        21: 'rainbow_beacon', 22: 'rainbow_pinwheels', 23: 'flower_blooming', 24: 'raindrops', 25: 'jellybean_raindrops',
        26: 'hue_breathing', 27: 'hue_pendulum', 28: 'hue_wave', 29: 'pixel_flow', 30: 'digital_rain',
        31: 'solid_reactive', 32: 'solid_reactive_wide', 33: 'solid_reactive_multiwide', 34: 'solid_reactive_cross',
        35: 'solid_reactive_multicross', 36: 'solid_reactive_nexus', 37: 'solid_reactive_multinexus', 38: 'splash',
        39: 'multisplash', 40: 'solid_splash', 41: 'solid_multisplash', 42: 'starlight', 43: 'starlight_dual_hue',
        44: 'starlight_dual_sat', 45: 'riverflow',
      },
      // Le JSON d'Evoworks masque la couleur pour ces effets.
      hideColor: ['raindrops', 'hue_wave', 'pixel_flow', 'solid_reactive_wide'],
    },
    bar: {
      label: 'Barre lumineuse',
      channel: 2,
      brightness: { max: 105 },
      speed: { max: 4 },
      effects: BAR_EFFECTS,
    },
  },
  // Mesuré sur un vrai clavier : 14° / 95 % donne un ambre, 243° / 90 % un bleu franc.
  ledCalibration: { redGain: 0.45, blueTint: 0.22, whiteLift: 0.1 },
  // Boîtier pour le rendu 3D (src/keyboard3d.js), en unités de touche : 1 = 19,05 mm.
  model: {
    // Marges autour des touches : elles affleurent presque les bords, sauf à l'avant.
    bezel: { left: 0.28, right: 0.28, back: 0.26, front: 0.42 },
    frontHeight: 0.85,
    cornerRadius: 0.4,
    tilt: 6.5, // angle de frappe, en degrés
    // Découpes du boîtier autour des touches : les trois rangées du haut sur toute la largeur
    // avec le bloc principal, puis les flèches en T inversé.
    wells: [
      [[0, 0], [18.25, 0], [18.25, 3], [15, 3], [15, 6], [0, 6]],
      [[16.25, 4], [17.25, 4], [17.25, 5], [18.25, 5], [18.25, 6], [15.25, 6], [15.25, 5], [16.25, 5]],
    ],
    leds: 'north', // côté de la touche où se trouve la LED
    // Barre lumineuse : une fenêtre encastrée sous Delete / End / PgDn, et le cadrage de son gros plan.
    light: {
      kind: 'insert',
      center: [16.75, 3.4],
      size: [2.9, 0.36],
      closeUp: { yaw: 12, pitch: 46, left: 3.2, right: 2.2, back: 2.4, front: 2.6 },
    },
  },
  defaultTheme: 'cream',
  // Coloris officiels (5 anodisés, 5 laqués), estimés d'après les revendeurs ; « Cream » est calé sur un vrai clavier.
  themes: [
    { id: 'cream', name: 'Cream', finish: 'Laqué', case: '#e6d5b8', alpha: '#f1e3cc', alphaInk: '#846a54', mod: '#a87a5d', modInk: '#f6e9d8', accent: '#eda66b', accentInk: '#fff4e8', lightBar: '#ecdcc0' },
    { id: 'sandgold', name: 'Sandgold', finish: 'Anodisé', case: '#8a7462', alpha: '#d6cbbb', alphaInk: '#4a3a2e', mod: '#6b5141', modInk: '#e9dfd0', accent: '#b26c43', accentInk: '#fbefe4', lightBar: '#a08876' },
    { id: 'scarlet', name: 'Scarlet', finish: 'Anodisé', case: '#a8323a', alpha: '#ede3d0', alphaInk: '#6a2a2f', mod: '#6e2229', modInk: '#f1e6d4', accent: '#d9773a', accentInk: '#fff3e6', lightBar: '#e2cfae' },
    { id: 'tyrian', name: 'Tyrian', finish: 'Anodisé', case: '#4a3352', alpha: '#e6e0d2', alphaInk: '#3b2b40', mod: '#7a7a80', modInk: '#f0ece4', accent: '#8e6a9a', accentInk: '#f6eff8', lightBar: '#9a9aa0' },
    { id: 'ink', name: 'Ink', finish: 'Anodisé', case: '#2b2d30', alpha: '#4a4d52', alphaInk: '#e3e5e6', mod: '#33363a', modInk: '#d6d9db', accent: '#7fc4b4', accentInk: '#1f2a28', lightBar: '#7fc4b4' },
    { id: 'nimbus', name: 'Nimbus', finish: 'Anodisé', case: '#b9bcc0', alpha: '#eeeeec', alphaInk: '#4a4d52', mod: '#9a9da2', modInk: '#f4f4f2', accent: '#86c9b8', accentInk: '#24312e', lightBar: '#86c9b8' },
    { id: 'spark', name: 'Spark', finish: 'Laqué', case: '#ecebe7', alpha: '#f6f5f1', alphaInk: '#4a4a4a', mod: '#bfc0c0', modInk: '#2f2f2f', accent: '#e2793a', accentInk: '#ffffff', lightBar: '#e2793a' },
    { id: 'butter', name: 'Butter Yellow', finish: 'Laqué', case: '#ecd98c', alpha: '#f4eed8', alphaInk: '#6b5a2a', mod: '#e2c968', modInk: '#5a4a1e', accent: '#d9b84a', accentInk: '#4a3c14', lightBar: '#f6f0dc' },
    { id: 'pink', name: 'Baby Pink', finish: 'Laqué', case: '#ecc6cc', alpha: '#f7e6e8', alphaInk: '#8a4f5a', mod: '#dd9fab', modInk: '#fbeef0', accent: '#d68596', accentInk: '#ffffff', lightBar: '#f0ced3' },
    { id: 'iceberg', name: 'Iceberg', finish: 'Laqué', case: '#b9d3e4', alpha: '#f3f5f6', alphaInk: '#46627a', mod: '#a9c6da', modInk: '#2f4a60', accent: '#7fa8c6', accentInk: '#ffffff', lightBar: '#eef2f4' },
  ],
};
