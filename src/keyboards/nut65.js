// Weikav NUT65 : clavier 65 % ANSI, firmware QMK/VIA d'origine.
// Prise en charge expérimentale : non testée sur un vrai clavier.
// Sources : définition VIA d'origine (VID 342D, PID E51A, canal 3 « rgb_matrix ») et
// github.com/bhctsntrk/nut65-signalrgb (identifiants USB, interface Raw HID 0xFF60/0x61).
// La barre lumineuse en façade se règle au clavier (Fn + Retour arrière) : VIA ne l'expose pas.

import { K, G, buildLayout } from './layout.js';

// Colonne de droite : Ins, Del, PgUp, PgDn, d'après la disposition d'origine du firmware
// (github.com/hangshengkeji/qmk_firmware, keyboards/leku/nut65) et la fiche des raccourcis de Weikav.
const ROWS = [
  [K('Esc', 'Escape', 1, 'o'), K('1', 'Digit1'), K('2', 'Digit2'), K('3', 'Digit3'), K('4', 'Digit4'), K('5', 'Digit5'),
    K('6', 'Digit6'), K('7', 'Digit7'), K('8', 'Digit8'), K('9', 'Digit9'), K('0', 'Digit0'), K('-', 'Minus'), K('=', 'Equal'),
    K('Backspace', 'Backspace', 2, 'm'), K('Ins', 'Insert', 1, 'm')],
  [K('Tab', 'Tab', 1.5, 'm'), K('Q', 'KeyQ'), K('W', 'KeyW'), K('E', 'KeyE'), K('R', 'KeyR'), K('T', 'KeyT'), K('Y', 'KeyY'),
    K('U', 'KeyU'), K('I', 'KeyI'), K('O', 'KeyO'), K('P', 'KeyP'), K('[', 'BracketLeft'), K(']', 'BracketRight'),
    K('\\', 'Backslash', 1.5), K('Del', 'Delete', 1, 'm')],
  [K('Caps Lock', 'CapsLock', 1.75, 'm'), K('A', 'KeyA'), K('S', 'KeyS'), K('D', 'KeyD'), K('F', 'KeyF'), K('G', 'KeyG'), K('H', 'KeyH'),
    K('J', 'KeyJ'), K('K', 'KeyK'), K('L', 'KeyL'), K(';', 'Semicolon'), K("'", 'Quote'), K('Enter', 'Enter', 2.25, 'o'),
    K('PgUp', 'PageUp', 1, 'm')],
  [K('Shift', 'ShiftLeft', 2.25, 'm'), K('Z', 'KeyZ'), K('X', 'KeyX'), K('C', 'KeyC'), K('V', 'KeyV'), K('B', 'KeyB'), K('N', 'KeyN'),
    K('M', 'KeyM'), K(',', 'Comma'), K('.', 'Period'), K('/', 'Slash'), K('Shift', 'ShiftRight', 1.75, 'm'),
    K('↑', 'ArrowUp', 1, 'm'), K('PgDn', 'PageDown', 1, 'm')],
  [K('Ctrl', 'ControlLeft', 1.25, 'm'), K('Win', 'MetaLeft', 1.25, 'm'), K('Alt', 'AltLeft', 1.25, 'm'), K('', 'Space', 6.25),
    K('Alt', 'AltRight', 1.25, 'm'), K('Fn', 'Fn', 1.25, 'm'), G(0.5),
    K('←', 'ArrowLeft', 1, 'm'), K('↓', 'ArrowDown', 1, 'm'), K('→', 'ArrowRight', 1, 'm')],
];

export default {
  id: 'nut65',
  name: 'NUT65',
  brand: 'Weikav',
  experimental: true,
  usb: {
    vendorId: 0x342d,
    productIds: [0xe51a],
    dongleIds: [],
  },
  layout: buildLayout(ROWS),
  zones: {
    keys: {
      label: 'Touches',
      channel: 3,
      brightness: { max: 255, readMax: 255 },
      speed: { max: 255 },
      // Ordre standard des effets QMK, identique au menu de la définition VIA d'origine.
      // L'entrée 45 (« Close All ») n'est pas documentée : elle est volontairement absente.
      effects: {
        1: 'solid_color', 2: 'alphas_mods', 3: 'gradient_up_down', 4: 'gradient_left_right', 5: 'breathing',
        6: 'band_sat', 7: 'band_val', 8: 'band_pinwheel_sat', 9: 'band_pinwheel_val', 10: 'band_spiral_sat',
        11: 'band_spiral_val', 12: 'cycle_all', 13: 'cycle_left_right', 14: 'cycle_up_down', 15: 'rainbow_moving_chevron',
        16: 'cycle_out_in', 17: 'cycle_out_in_dual', 18: 'cycle_pinwheel', 19: 'cycle_spiral', 20: 'dual_beacon',
        21: 'rainbow_beacon', 22: 'rainbow_pinwheels', 23: 'raindrops', 24: 'jellybean_raindrops', 25: 'hue_breathing',
        26: 'hue_pendulum', 27: 'hue_wave', 28: 'pixel_rain', 29: 'pixel_flow', 30: 'pixel_fractal',
        31: 'typing_heatmap', 32: 'digital_rain', 33: 'solid_reactive_simple', 34: 'solid_reactive', 35: 'solid_reactive_wide',
        36: 'solid_reactive_multiwide', 37: 'solid_reactive_cross', 38: 'solid_reactive_multicross', 39: 'solid_reactive_nexus',
        40: 'solid_reactive_multinexus', 41: 'splash', 42: 'multisplash', 43: 'solid_splash', 44: 'solid_multisplash',
      },
      hideColor: [],
    },
  },
  // Pas encore mesuré sur un vrai clavier : rendu neutre.
  ledCalibration: {},
  // Boîtier pour le rendu 3D (src/keyboard3d.js), en unités de touche : 1 = 19,05 mm.
  // D'après les dimensions et les photos de Weikav (314 × 113 mm, 19,5 mm de haut à l'avant, 7°).
  model: {
    // Bords fins sur les côtés, un peu plus larges en haut et en bas.
    bezel: { left: 0.24, right: 0.24, back: 0.42, front: 0.5 },
    frontHeight: 1,
    cornerRadius: 0.25,
    tilt: 7, // angle de frappe, en degrés
    // Une seule découpe ; le boîtier remonte en languette entre Fn et la flèche gauche.
    wells: [[[0, 0], [16, 0], [16, 5], [13, 5], [13, 4], [12.5, 4], [12.5, 5], [0, 5]]],
    leds: 'south', // côté de la touche où se trouve la LED
    // Bandeau lumineux en façade, en quatre segments. L'application ne le pilote pas (voir plus haut) :
    // il est dessiné avec une lueur blanche neutre.
    light: { kind: 'front-strip', controllable: false, segments: 4, margin: 0.28, top: 0.58, height: 0.28 },
  },
  defaultTheme: 'black',
  // Coloris officiels du boîtier (weikav.com), teintes estimées d'après les photos ; « Champagne Gold »
  // est déduit de son nom, faute de photo. Le NUT65 est vendu sans touches : celles-ci reprennent les
  // touches translucides des visuels de Weikav, noires ou blanches, rendues opaques. Pour Slate Blue,
  // Champagne Gold et Teal, l'association boîtier / touches est une supposition.
  themes: [
    { id: 'black', name: 'Black', finish: 'Anodisé', case: '#1f2124', alpha: '#3a3d42', alphaInk: '#f1f2f3', mod: '#2e3034', modInk: '#f1f2f3', accent: '#2e3034', accentInk: '#f1f2f3', lightBar: '#0a0b0d' },
    { id: 'silver', name: 'Silver', finish: 'Anodisé', case: '#c9cbd0', alpha: '#3a3d42', alphaInk: '#f1f2f3', mod: '#2e3034', modInk: '#f1f2f3', accent: '#2e3034', accentInk: '#f1f2f3', lightBar: '#0a0b0d' },
    { id: 'red', name: 'Red', finish: 'Anodisé', case: '#cc373e', alpha: '#f1f2f3', alphaInk: '#c23a3f', mod: '#e2e4e7', modInk: '#c23a3f', accent: '#e2e4e7', accentInk: '#c23a3f', lightBar: '#0a0b0d' },
    { id: 'white', name: 'White', finish: 'Électrophorèse', case: '#eceef1', alpha: '#f1f2f3', alphaInk: '#2b2d31', mod: '#e2e4e7', modInk: '#2b2d31', accent: '#e2e4e7', accentInk: '#2b2d31', lightBar: '#0a0b0d' },
    { id: 'cream', name: 'Creamy White', finish: 'Électrophorèse', case: '#e8e3d8', alpha: '#3a3d42', alphaInk: '#f1f2f3', mod: '#2e3034', modInk: '#f1f2f3', accent: '#2e3034', accentInk: '#f1f2f3', lightBar: '#0a0b0d' },
    { id: 'pink', name: 'Pink', finish: 'Électrophorèse', case: '#efc0c7', alpha: '#f1f2f3', alphaInk: '#d2525f', mod: '#e2e4e7', modInk: '#d2525f', accent: '#e2e4e7', accentInk: '#d2525f', lightBar: '#0a0b0d' },
    { id: 'slate', name: 'Slate Blue', finish: 'Anodisé', case: '#6f7c8e', alpha: '#3a3d42', alphaInk: '#f1f2f3', mod: '#2e3034', modInk: '#f1f2f3', accent: '#2e3034', accentInk: '#f1f2f3', lightBar: '#0a0b0d' },
    { id: 'champagne', name: 'Champagne Gold', finish: 'Anodisé', case: '#cdb892', alpha: '#f1f2f3', alphaInk: '#2b2d31', mod: '#e2e4e7', modInk: '#2b2d31', accent: '#e2e4e7', accentInk: '#2b2d31', lightBar: '#0a0b0d' },
    { id: 'teal', name: 'Teal', finish: 'Anodisé', case: '#23aaa7', alpha: '#3a3d42', alphaInk: '#f1f2f3', mod: '#2e3034', modInk: '#f1f2f3', accent: '#2e3034', accentInk: '#f1f2f3', lightBar: '#0a0b0d' },
  ],
};
