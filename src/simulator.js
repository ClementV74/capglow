// Clavier VIA simulé, pour développer et tester sans le matériel (développement uniquement).
// Lancer avec la variable d'environnement CAPGLOW_SIMULATE=<id du clavier>, par exemple nut65.
// Il répond aux commandes VIA comme un firmware QMK : version du protocole, lecture,
// écriture et enregistrement des valeurs d'éclairage, sur les canaux de sa définition.

const PROTOCOL = 12;

export function installSimulator(keyboard) {
  const values = {};
  for (const zone of Object.values(keyboard.zones)) {
    values[zone.channel] = { 1: [Math.round(zone.brightness.max * 0.6), 0], 2: [1, 0], 3: [128, 0], 4: [10, 230] };
  }
  const listeners = new Set();

  const device = {
    vendorId: keyboard.usb.vendorId,
    productId: keyboard.usb.productIds[0],
    productName: `${keyboard.brand} ${keyboard.name} (simulé)`,
    collections: [{ usagePage: 0xff60, usage: 0x61 }],
    opened: false,
    async open() { this.opened = true; },
    async close() { this.opened = false; },
    addEventListener(type, fn) { if (type === 'inputreport') listeners.add(fn); },
    removeEventListener(type, fn) { listeners.delete(fn); },
    async sendReport(_id, data) {
      const reply = new Uint8Array(32);
      reply.set(data);
      const [cmd, channel, value, a, b] = data;
      const slot = values[channel];
      if (cmd === 0x01) { reply[1] = 0; reply[2] = PROTOCOL; }
      else if ((cmd === 0x07 || cmd === 0x08 || cmd === 0x09) && !slot) reply[0] = 0xff;
      else if (cmd === 0x07) slot[value] = [a, b];
      else if (cmd === 0x08) {
        const [x, y] = slot[value] ?? [0, 0];
        // Comme sur l'EVO80, certains firmwares renvoient la luminosité sur 0-255.
        const zone = Object.values(keyboard.zones).find((z) => z.channel === channel);
        reply[3] = value === 1 && zone.brightness.readMax ? Math.round((x * zone.brightness.readMax) / zone.brightness.max) : x;
        reply[4] = y;
      }
      setTimeout(() => listeners.forEach((fn) => fn({ data: new DataView(reply.buffer) })), 4);
    },
  };

  const hid = {
    getDevices: async () => [device],
    requestDevice: async () => [device],
    addEventListener() {},
  };
  Object.defineProperty(navigator, 'hid', { value: hid, configurable: true });
}
