// Communication VIA (QMK Raw HID) avec les claviers pris en charge (voir src/keyboards/).
// Rapports de 32 octets sur l'interface « page d'usage 0xFF60 / usage 0x61 ».
// Seules les commandes VIA standard d'éclairage sont utilisées : lire, écrire, enregistrer.

import { KEYBOARDS, identify } from './keyboards/index.js';

const CMD_GET_PROTOCOL = 0x01;
const CMD_SET = 0x07;
const CMD_GET = 0x08;
const CMD_SAVE = 0x09;
const UNHANDLED = 0xff;

// Avant la version 11 du protocole, les commandes 0x07/0x08 n'ont pas le même format :
// on refuse d'écrire plutôt que d'envoyer une commande mal interprétée.
const MIN_PROTOCOL = 11;

const VALUE = { brightness: 1, effect: 2, speed: 3, color: 4 };

const isVia = (d) => d.collections.some((c) => c.usagePage === 0xff60 && c.usage === 0x61);

export class ViaKeyboard extends EventTarget {
  constructor() {
    super();
    this.device = null;
    this.keyboard = null;
    this.queue = Promise.resolve();
    this.pending = null;
    this.onReport = this.onReport.bind(this);
    navigator.hid.addEventListener('connect', () => this.scan());
    navigator.hid.addEventListener('disconnect', (e) => {
      if (e.device === this.device) this.drop();
      this.scan();
    });
  }

  async scan() {
    const found = (await navigator.hid.getDevices())
      .filter(isVia)
      .map((device) => ({ device, ...identify(device) }))
      .filter((d) => d.keyboard);

    const wired = found.find((d) => d.mode === 'wired');
    if (wired) {
      if (wired.device !== this.device) await this.attach(wired.device, wired.keyboard);
      return;
    }
    this.drop();
    const dongle = found.find((d) => d.mode === 'dongle');
    this.emit('status', dongle ? { state: 'dongle', keyboard: dongle.keyboard } : { state: 'none' });
  }

  async request() {
    try {
      await navigator.hid.requestDevice({
        filters: KEYBOARDS.map((k) => ({ vendorId: k.usb.vendorId, usagePage: 0xff60, usage: 0x61 })),
      });
    } catch { /* l'utilisateur a annulé */ }
    return this.scan();
  }

  async attach(device, keyboard) {
    this.drop();
    if (!device.opened) await device.open();
    device.addEventListener('inputreport', this.onReport);
    this.device = device;
    this.keyboard = keyboard;
    let protocol = 0;
    try {
      const r = await this.send([CMD_GET_PROTOCOL]);
      protocol = (r[1] << 8) | r[2];
    } catch { /* traité ci-dessous comme non pris en charge */ }
    this.emit('status', { state: 'connected', keyboard, protocol, supported: protocol >= MIN_PROTOCOL });
  }

  drop() {
    if (!this.device) return;
    this.device.removeEventListener('inputreport', this.onReport);
    this.device.close().catch(() => {});
    this.device = null;
    this.keyboard = null;
    this.emit('status', { state: 'none' });
  }

  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  onReport(e) {
    const data = new Uint8Array(e.data.buffer);
    // Une réponse VIA reprend la commande envoyée (ou 0xFF si elle n'est pas gérée).
    if (this.pending && (data[0] === this.pending.cmd || data[0] === UNHANDLED)) this.pending.resolve(data);
  }

  // Les commandes sont sérialisées : une requête, une réponse.
  send(bytes) {
    const run = () => new Promise((resolve, reject) => {
      if (!this.device) return reject(new Error('Clavier non connecté'));
      const buf = new Uint8Array(32);
      buf.set(bytes);
      const timer = setTimeout(() => {
        this.pending = null;
        reject(new Error('Le clavier ne répond pas'));
      }, 800);
      this.pending = {
        cmd: bytes[0],
        resolve: (d) => { clearTimeout(timer); this.pending = null; resolve(d); },
      };
      this.device.sendReport(0, buf).catch((err) => {
        clearTimeout(timer); this.pending = null; reject(err);
      });
    });
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }

  async get(zone, value) {
    const r = await this.send([CMD_GET, zone.channel, VALUE[value]]);
    if (r[0] === UNHANDLED || r[1] !== zone.channel || r[2] !== VALUE[value]) {
      throw new Error('Réponse inattendue du clavier');
    }
    return [r[3], r[4]];
  }

  async set(zone, value, ...data) {
    const r = await this.send([CMD_SET, zone.channel, VALUE[value], ...data]);
    if (r[0] === UNHANDLED) throw new Error('Réglage refusé par le clavier');
  }

  // Valeurs lues ramenées sur l'échelle d'écriture (certains firmwares lisent sur 0-255).
  async readZone(zone) {
    const [b] = await this.get(zone, 'brightness');
    const [effect] = await this.get(zone, 'effect');
    const [speed] = await this.get(zone, 'speed');
    const [hue, sat] = await this.get(zone, 'color');
    const readMax = zone.brightness.readMax ?? zone.brightness.max;
    const brightness = Math.min(zone.brightness.max, Math.round((b * zone.brightness.max) / readMax));
    return { brightness, effect, speed: Math.min(speed, zone.speed.max), hue, sat };
  }

  async write(zone, field, z) {
    if (field === 'color') return this.set(zone, 'color', z.hue, z.sat);
    return this.set(zone, field, z[field]);
  }

  // Relit une valeur écrite : sur un clavier non testé, tout écart arrête les écritures.
  async verify(zone, field, z) {
    const read = await this.readZone(zone);
    const same = field === 'color'
      ? read.hue === z.hue && read.sat === z.sat
      : Math.abs(read[field] - z[field]) <= (field === 'brightness' ? 2 : 0);
    if (!same) throw new Error('Le clavier n’a pas appliqué le réglage comme prévu');
  }

  async writeZone(zone, z) {
    for (const field of ['effect', 'brightness', 'speed', 'color']) await this.write(zone, field, z);
  }

  save(zone) { return this.send([CMD_SAVE, zone.channel]); }
}
