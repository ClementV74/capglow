// Couche de communication VIA (QMK Raw HID) pour l'EVO80.
// Protocole vérifié sur le clavier : VIA v12, rapports de 32 octets,
// page d'usage 0xFF60 / usage 0x61, uniquement en filaire (PID 0x300E).

export const VENDOR = 0x36b0;
export const PID_WIRED = 0x300e;
export const PID_DONGLE = 0x3002;

const CMD_GET_PROTOCOL = 0x01;
const CMD_SET = 0x07;
const CMD_GET = 0x08;
const CMD_SAVE = 0x09;

export const CH_LOGO = 2;   // id_qmk_rgblight
export const CH_KEYS = 3;   // id_qmk_rgb_matrix

const VAL_BRIGHTNESS = 1;
const VAL_EFFECT = 2;
const VAL_SPEED = 3;
const VAL_COLOR = 4;

// Le firmware renvoie la luminosité des touches sur 0-255 mais l'écrit sur 0-180.
export const KEYS_MAX_BRIGHTNESS = 180;
export const LOGO_MAX_BRIGHTNESS = 105;
export const KEYS_MAX_SPEED = 255;
export const LOGO_MAX_SPEED = 4;

const isVia = (d) =>
  d.vendorId === VENDOR &&
  d.collections.some((c) => c.usagePage === 0xff60 && c.usage === 0x61);

export class Evo80 extends EventTarget {
  constructor() {
    super();
    this.device = null;
    this.queue = Promise.resolve();
    this.pending = null;
    this.onReport = this.onReport.bind(this);
    navigator.hid.addEventListener('connect', () => this.scan());
    navigator.hid.addEventListener('disconnect', (e) => {
      if (e.device === this.device) this.drop();
      this.scan();
    });
  }

  // Retourne 'wired' | 'dongle' | 'none'
  async scan() {
    const devices = await navigator.hid.getDevices();
    const wired = devices.find((d) => d.productId === PID_WIRED && isVia(d));
    if (wired) {
      if (wired !== this.device) await this.attach(wired);
      return 'wired';
    }
    this.drop();
    const state = devices.some((d) => d.vendorId === VENDOR) ? 'dongle' : 'none';
    this.emit('status', { state });
    return state;
  }

  async request() {
    try {
      await navigator.hid.requestDevice({
        filters: [{ vendorId: VENDOR, usagePage: 0xff60, usage: 0x61 }],
      });
    } catch { /* l'utilisateur a annulé */ }
    return this.scan();
  }

  async attach(device) {
    this.drop();
    if (!device.opened) await device.open();
    device.addEventListener('inputreport', this.onReport);
    this.device = device;
    const r = await this.send([CMD_GET_PROTOCOL]);
    const protocol = (r[1] << 8) | r[2];
    this.emit('status', { state: 'wired', protocol });
  }

  drop() {
    if (!this.device) return;
    this.device.removeEventListener('inputreport', this.onReport);
    this.device.close().catch(() => {});
    this.device = null;
    this.emit('status', { state: 'none' });
  }

  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  onReport(e) {
    if (!this.pending) return;
    const data = new Uint8Array(e.data.buffer);
    this.pending.resolve(data);
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

  async get(channel, value) {
    const r = await this.send([CMD_GET, channel, value]);
    if (r[0] === 0xff) throw new Error('Valeur non prise en charge');
    return r.slice(3, 5);
  }

  async readZone(channel) {
    const [b] = await this.get(channel, VAL_BRIGHTNESS);
    const [effect] = await this.get(channel, VAL_EFFECT);
    const [speed] = await this.get(channel, VAL_SPEED);
    const [hue, sat] = await this.get(channel, VAL_COLOR);
    const brightness = channel === CH_KEYS
      ? Math.round((b * KEYS_MAX_BRIGHTNESS) / 255)
      : b;
    return { brightness, effect, speed, hue, sat };
  }

  setBrightness(ch, v) { return this.send([CMD_SET, ch, VAL_BRIGHTNESS, v]); }
  setEffect(ch, v) { return this.send([CMD_SET, ch, VAL_EFFECT, v]); }
  setSpeed(ch, v) { return this.send([CMD_SET, ch, VAL_SPEED, v]); }
  setColor(ch, h, s) { return this.send([CMD_SET, ch, VAL_COLOR, h, s]); }

  async writeZone(ch, z) {
    await this.setEffect(ch, z.effect);
    await this.setBrightness(ch, z.brightness);
    await this.setSpeed(ch, z.speed);
    await this.setColor(ch, z.hue, z.sat);
  }

  save(ch) { return this.send([CMD_SAVE, ch]); }
}
