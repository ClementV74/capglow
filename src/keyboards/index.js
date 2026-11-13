// Claviers pris en charge. Pour en ajouter un : créer sa définition (voir evo80.js),
// l'ajouter ici, puis ajouter son identifiant constructeur dans KNOWN_VENDORS de main.js.

import evo80 from './evo80.js';
import nut65 from './nut65.js';

export const KEYBOARDS = [evo80, nut65];

export const keyboardById = (id) => KEYBOARDS.find((k) => k.id === id);

// Définition correspondant à un périphérique HID, et mode de connexion ('wired' ou 'dongle').
export function identify(device) {
  for (const kb of KEYBOARDS) {
    if (device.vendorId !== kb.usb.vendorId) continue;
    if (kb.usb.productIds.includes(device.productId)) return { keyboard: kb, mode: 'wired' };
    if (kb.usb.dongleIds.includes(device.productId)) return { keyboard: kb, mode: 'dongle' };
  }
  return null;
}
