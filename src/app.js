import { KEYBOARDS, keyboardById } from './keyboards/index.js';
import { effectCatalog, OFF } from './effects.js';
import { drawThumb } from './keyboard.js';
import { ledRgb, setLedCalibration } from './led.js';
import { Keyboard3D } from './keyboard3d.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

// Développement : CAPGLOW_SIMULATE=<clavier> remplace le matériel par un clavier simulé.
const simulated = keyboardById(params.get('simulate'));
if (simulated) (await import('./simulator.js')).installSimulator(simulated);
const { ViaKeyboard } = await import('./hid.js');

// Couleurs nommées d'après leur rendu sur les LED de l'EVO80 (voir led.js) : [nom, teinte, saturation].
const PALETTE = [
  ['Rouge', 0, 255], ['Corail', 5, 200], ['Ambre', 10, 240], ['Or', 17, 235], ['Citron vert', 30, 230], ['Vert', 85, 255],
  ['Menthe', 108, 170], ['Lagon', 128, 235], ['Azur', 150, 230], ['Bleu', 172, 230], ['Violet', 220, 220], ['Rose', 240, 180],
];

// Couleur CSS d'un réglage teinte / saturation (0-255), telle que les LED la rendent.
function ledCss(hue, sat) {
  const [r, g, b] = ledRgb(hue / 255, sat / 255, 1);
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

const state = {
  keyboard: null,
  catalogs: {},
  zone: 'keys',
  values: {},
  lastOn: {},
  connected: false,
  readOnly: false,
  dirty: false,
  fxTab: null,
};

const via = new ViaKeyboard();
const view = new Keyboard3D($('kb'));

const zoneDef = (zone = state.zone) => state.keyboard.zones[zone];
const current = () => state.values[state.zone];
const effectFor = (zone, id) => (id === 0 ? OFF : state.catalogs[zone].byId.get(id) ?? OFF);
const usesColor = (zone, id) => id !== 0 && effectFor(zone, id).color !== false;

/* Préférences locales (coloris, profils) */

const storage = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* stockage indisponible */ }
  },
};

/* Clavier affiché */

// Catalogue d'effets d'une zone : effets QMK pour les touches, liste propre au clavier pour la barre.
function catalogFor(zone) {
  if (Array.isArray(zone.effects)) {
    const byId = new Map([[0, { ...OFF, id: 0 }], ...zone.effects.map((e) => [e.id, e])]);
    return { byId, families: [{ name: zone.label, effects: zone.effects }], idOf: new Map() };
  }
  return effectCatalog(zone.effects, zone.hideColor);
}

function defaultValues(zone) {
  return {
    effect: 1,
    brightness: Math.round(zone.brightness.max * 0.7),
    speed: Math.round(zone.speed.max / 2),
    hue: 10,
    sat: 240,
  };
}

function showKeyboard(keyboard) {
  if (state.keyboard === keyboard) return;
  state.keyboard = keyboard;
  storage.set('capglow.keyboard', keyboard.id);
  state.catalogs = {};
  state.values = {};
  state.lastOn = {};
  for (const [name, zone] of Object.entries(keyboard.zones)) {
    state.catalogs[name] = catalogFor(zone);
    state.values[name] = defaultValues(zone);
    state.lastOn[name] = 1;
  }
  if (!keyboard.zones[state.zone]) state.zone = 'keys';
  state.fxTab = null;
  renderedGrid = '';

  setLedCalibration(keyboard.ledCalibration);
  view.setKeyboard(keyboard);
  renderThemes();
  applyTheme(storage.get(`capglow.theme.${keyboard.id}`, keyboard.defaultTheme));
  renderKeyboardChrome();
  renderProfiles();
  render();
}

// Éléments qui dépendent du clavier : onglet de la barre, palette, piste de teinte, consignes.
function renderKeyboardChrome() {
  const kb = state.keyboard;
  const bar = kb.zones.bar;
  $('zone-tabs').hidden = !bar;
  if (bar) $('bar-tab').textContent = bar.label;

  document.querySelectorAll('.swatch').forEach((s) => { s.style.background = ledCss(Number(s.dataset.h), Number(s.dataset.s)); });
  const hueStops = Array.from({ length: 13 }, (_, i) => ledCss((i / 12) * 255, 255));
  $('hue').style.setProperty('--track', `linear-gradient(to right, ${hueStops.join(', ')})`);

  $('themes-hint').textContent = `L’aperçu 3D reprend les couleurs de ton ${kb.name}.`;
  $('notice-steps').replaceChildren(...wiredSteps(kb).map((text) => {
    const li = document.createElement('li');
    li.textContent = text;
    return li;
  }));
}

function wiredSteps(kb) {
  if (kb.id === 'nut65') return ['Branche le câble USB-C.', 'Passe le clavier en mode filaire avec Fn + T.'];
  return ['Débranche le dongle 2.4G.', 'Mets l’interrupteur du clavier sur la position câble.', 'Branche le câble USB-C.'];
}

/* Envoi au clavier : les changements rapprochés sont regroupés */

const pending = new Map();
let flushTimer = null;

function queueWrite(zone, field) {
  state.dirty = true;
  renderFooter();
  if (!state.connected || state.readOnly) return;
  pending.set(`${zone}:${field}`, { zone, field });
  flushTimer ??= setTimeout(flush, 35);
}

async function flush() {
  flushTimer = null;
  const jobs = [...pending.values()];
  pending.clear();
  for (const { zone, field } of jobs) {
    try {
      await via.write(zoneDef(zone), field, state.values[zone]);
      // Clavier non testé sur du vrai matériel : chaque écriture est relue.
      if (state.keyboard.experimental) await via.verify(zoneDef(zone), field, state.values[zone]);
    } catch (err) {
      enterReadOnly(err.message);
      return;
    }
  }
}

function enterReadOnly(reason) {
  state.readOnly = true;
  pending.clear();
  toast(`Capglow arrête d’écrire dans le clavier : ${reason}`, true);
  renderFooter();
}

/* Coloris */

function renderThemes() {
  $('themes').replaceChildren(...state.keyboard.themes.map((t) => {
    const b = document.createElement('button');
    b.className = 'theme-option';
    b.dataset.id = t.id;
    b.setAttribute('role', 'radio');

    const swatch = document.createElement('span');
    swatch.className = 'theme';
    swatch.style.setProperty('--c1', t.case);
    swatch.style.setProperty('--c2', t.mod);

    const name = document.createElement('span');
    name.className = 'theme-label';
    name.textContent = t.name;
    const finish = document.createElement('span');
    finish.className = 'theme-finish';
    finish.textContent = t.finish;
    name.append(finish);

    b.append(swatch, name);
    b.addEventListener('click', () => applyTheme(t.id));
    return b;
  }));
}

function applyTheme(id) {
  const themes = state.keyboard.themes;
  const theme = themes.find((t) => t.id === id) ?? themes[0];
  view.setTheme(theme);
  document.querySelectorAll('.theme-option').forEach((b) =>
    b.setAttribute('aria-checked', String(b.dataset.id === theme.id)));
  storage.set(`capglow.theme.${state.keyboard.id}`, theme.id);
}

/* Installation (version zip) */

const installCard = $('install-card');

async function initInstall() {
  const status = await window.capglow?.installStatus();
  if (!status?.installable) return;
  $('install-section').hidden = false;
  if (!storage.get('capglow.installLater', false)) installCard.hidden = false;
}

$('install-later').addEventListener('click', () => {
  installCard.hidden = true;
  storage.set('capglow.installLater', true);
  toast('Tu pourras installer Capglow plus tard depuis les paramètres');
});

$('install-open').addEventListener('click', () => {
  settingsDialog.close();
  installCard.hidden = false;
});

$('install-now').addEventListener('click', async () => {
  const button = $('install-now');
  button.disabled = true;
  button.textContent = 'Installation…';
  try {
    // L'application redémarre depuis le dossier d'installation.
    await window.capglow.install({ desktopShortcut: $('install-desktop').checked });
  } catch (err) {
    button.disabled = false;
    button.textContent = 'Installer';
    toast(`Installation impossible : ${err.message}`, true);
  }
});

/* Paramètres */

const settingsDialog = $('settings-dialog');
const loginSwitch = $('open-at-login');

$('open-settings').addEventListener('click', async () => {
  if (window.capglow) {
    const { openAtLogin } = await window.capglow.getSettings();
    loginSwitch.setAttribute('aria-checked', String(openAtLogin));
  } else {
    loginSwitch.disabled = true;
  }
  settingsDialog.showModal();
});
$('close-settings').addEventListener('click', () => settingsDialog.close());
// Un clic sur le fond assombri ferme la fenêtre.
settingsDialog.addEventListener('click', (e) => {
  if (e.target === settingsDialog) settingsDialog.close();
});

loginSwitch.addEventListener('click', async () => {
  const wanted = loginSwitch.getAttribute('aria-checked') !== 'true';
  const applied = await window.capglow.setOpenAtLogin(wanted);
  loginSwitch.setAttribute('aria-checked', String(applied));
  toast(applied ? 'Capglow se lancera au démarrage de Windows' : 'Lancement au démarrage désactivé');
});

// Diagnostic en lecture seule, à joindre à un signalement : rien n'est écrit dans le clavier.
$('export-diagnostic').addEventListener('click', async () => {
  const devices = await navigator.hid.getDevices();
  const report = {
    app: 'Capglow 0.3.0',
    date: new Date().toISOString(),
    devices: devices.map((d) => ({
      name: d.productName,
      vendorId: `0x${d.vendorId.toString(16).padStart(4, '0')}`,
      productId: `0x${d.productId.toString(16).padStart(4, '0')}`,
      collections: d.collections.map((c) => `0x${c.usagePage.toString(16)}/0x${c.usage.toString(16)}`),
    })),
    keyboard: state.connected ? state.keyboard.id : null,
    protocol: state.protocol ?? null,
    readOnly: state.readOnly,
    zones: {},
  };
  if (state.connected) {
    for (const [name, zone] of Object.entries(state.keyboard.zones)) {
      try { report.zones[name] = await via.readZone(zone); } catch (err) { report.zones[name] = { error: err.message }; }
    }
  }
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
  link.download = 'capglow-diagnostic.json';
  link.click();
  URL.revokeObjectURL(link.href);
  toast('Diagnostic exporté dans tes téléchargements');
});

/* Rendu de l'inspecteur */

function render() {
  const zone = state.zone;
  const z = current();
  const fx = effectFor(zone, z.effect);

  view.focus = zone;
  const bar = state.keyboard.zones.bar ? state.values.bar : null;
  view.set(effectFor('keys', state.values.keys.effect), state.values.keys,
    bar ? effectFor('bar', bar.effect) : null, bar);

  document.querySelectorAll('.seg').forEach((b) =>
    b.setAttribute('aria-selected', String(b.dataset.zone === zone)));

  // L'accent de l'interface suit la couleur des LED de la zone affichée, éclaircie pour rester lisible.
  const led = ledCss(z.hue, z.sat);
  const root = document.documentElement.style;
  root.setProperty('--led', `color-mix(in srgb, ${led} 72%, white)`);
  root.setProperty('--led-soft', `color-mix(in srgb, ${led} 12%, transparent)`);

  $('np-family').textContent = zone === 'keys' ? fx.family ?? zoneDef().label : zoneDef().label;
  $('np-name').textContent = fx.name;

  const on = z.effect !== 0;
  $('power').setAttribute('aria-checked', String(on));
  $('power-label').textContent = on ? 'Allumé' : 'Éteint';

  renderTabs();
  renderEffects();
  renderColor();
  renderSliders();
  renderFooter();
}

const families = () => state.catalogs[state.zone].families;
const familyOf = (id) => families().find((f) => f.effects.some((e) => e.id === id))?.name;

function renderTabs() {
  const host = $('fx-tabs');
  const fams = families();
  if (!fams.some((f) => f.name === state.fxTab)) {
    state.fxTab = familyOf(current().effect) ?? fams[0].name;
  }
  host.hidden = fams.length < 2;
  host.replaceChildren(...fams.map((f) => {
    const b = document.createElement('button');
    b.className = 'tab';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(f.name === state.fxTab));
    b.textContent = f.name;
    if (f.name === familyOf(current().effect) && f.name !== state.fxTab) {
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.title = 'Effet actif';
      b.append(dot);
    }
    b.addEventListener('click', () => {
      state.fxTab = f.name;
      renderTabs();
      renderEffects();
    });
    return b;
  }));
}

let renderedGrid = '';
function renderEffects() {
  const host = $('fx-grid');
  const fam = families().find((f) => f.name === state.fxTab);
  const key = `${state.keyboard.id}:${state.zone}:${fam.name}`;
  if (renderedGrid !== key) {
    renderedGrid = key;
    host.replaceChildren(...fam.effects.map((e) => {
      const b = document.createElement('button');
      b.className = 'fx';
      b.dataset.id = e.id;
      const canvas = document.createElement('canvas');
      const label = document.createElement('span');
      label.textContent = e.name;
      b.append(canvas, label);
      b.addEventListener('click', () => setEffect(e.id));
      return b;
    }));
  }
  host.querySelectorAll('.fx').forEach((b) =>
    b.setAttribute('aria-pressed', String(Number(b.dataset.id) === current().effect)));
  scheduleThumbs();
}

// Les vignettes reprennent la couleur choisie ; on les redessine au plus une fois par image.
let thumbsQueued = false;
function scheduleThumbs() {
  if (thumbsQueued) return;
  thumbsQueued = true;
  requestAnimationFrame(() => {
    thumbsQueued = false;
    const z = current();
    const c = { hue: z.hue / 255, sat: z.sat / 255, speedN: 0.5 };
    const dpr = window.devicePixelRatio || 1;
    $('fx-grid').querySelectorAll('.fx').forEach((b) => {
      const canvas = b.querySelector('canvas');
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w) return;
      if (canvas.width !== Math.round(w * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const fx = effectFor(state.zone, Number(b.dataset.id));
      if (state.zone === 'keys') drawThumb(ctx, w, h, state.keyboard.layout, fx, c);
      else drawBarThumb(ctx, w, h, fx, c);
    });
  });
}

function drawBarThumb(ctx, w, h, fx, c) {
  ctx.clearRect(0, 0, w, h);
  const steps = 24;
  const bw = w * 0.8, x0 = (w - bw) / 2, bh = 6;
  for (let i = 0; i < steps; i++) {
    const [hh, ss, vv] = fx.f(i / steps, 1.2, c);
    const [r, g, b] = ledRgb(((hh % 1) + 1) % 1, ss, vv);
    ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 8;
    ctx.fillRect(x0 + (i * bw) / steps, h / 2 - bh / 2, bw / steps + 0.5, bh);
  }
  ctx.shadowBlur = 0;
}

function renderColor() {
  const z = current();
  const active = usesColor(state.zone, z.effect);
  $('color-off').hidden = active;
  $('color-controls').classList.toggle('off', !active);

  const led = ledCss(z.hue, z.sat), pure = ledCss(z.hue, 255);
  const match = PALETTE.find(([, h, s]) => h === z.hue && s === z.sat);
  $('color-name').textContent = match ? match[0] : 'Personnalisée';
  $('color-chip').style.background = led;
  $('color-chip').style.boxShadow = `0 0 10px ${led}`;

  document.querySelectorAll('.swatch').forEach((s) =>
    s.setAttribute('aria-checked', String(Number(s.dataset.h) === z.hue && Number(s.dataset.s) === z.sat)));

  const hueEl = $('hue'), satEl = $('sat');
  hueEl.value = z.hue;
  satEl.value = z.sat;
  hueEl.style.setProperty('--thumb', pure);
  satEl.style.setProperty('--thumb', led);
  satEl.style.setProperty('--track', `linear-gradient(to right, ${ledCss(z.hue, 0)}, ${pure})`);
  $('hue-out').textContent = `${Math.round((z.hue / 255) * 360)}°`;
  $('sat-out').textContent = `${Math.round((z.sat / 255) * 100)} %`;
}

function renderSliders() {
  const z = current();
  const cfg = zoneDef();
  const on = z.effect !== 0;
  const bright = $('bright'), speed = $('speed');
  bright.max = cfg.brightness.max;
  speed.max = cfg.speed.max;
  bright.value = z.brightness;
  speed.value = z.speed;
  bright.disabled = speed.disabled = !on;
  for (const el of [bright, speed]) el.style.setProperty('--p', `${(el.value / el.max) * 100}%`);
  $('bright-out').textContent = `${Math.round((z.brightness / cfg.brightness.max) * 100)} %`;
  // Peu de crans (barre de l'EVO80) : on affiche le cran plutôt qu'un pourcentage.
  $('speed-out').textContent = cfg.speed.max < 10
    ? `${z.speed + 1} sur ${cfg.speed.max + 1}`
    : `${Math.round((z.speed / cfg.speed.max) * 100)} %`;
}

function renderFooter() {
  const note = $('foot-note');
  note.classList.toggle('dirty', state.dirty && !state.readOnly);
  note.textContent = !state.connected
    ? 'Aperçu uniquement : aucun clavier connecté.'
    : state.readOnly
      ? 'Lecture seule : Capglow n’écrit pas dans ce clavier.'
      : state.dirty
        ? 'Pas encore enregistré dans le clavier.'
        : 'Les réglages s’appliquent en direct.';
  $('save').disabled = !(state.dirty && state.connected && !state.readOnly);
}

/* Actions */

function setEffect(id) {
  const z = current();
  if (z.effect === id) return;
  z.effect = id;
  if (id !== 0) state.lastOn[state.zone] = id;
  queueWrite(state.zone, 'effect');
  render();
}

function setColor(hue, sat) {
  const z = current();
  z.hue = hue;
  z.sat = sat;
  queueWrite(state.zone, 'color');
  render();
}

for (const [name, h, s] of PALETTE) {
  const b = document.createElement('button');
  b.className = 'swatch';
  b.dataset.h = h;
  b.dataset.s = s;
  b.title = name;
  b.setAttribute('role', 'radio');
  b.setAttribute('aria-label', name);
  b.addEventListener('click', () => setColor(h, s));
  $('palette').append(b);
}

$('hue').addEventListener('input', (e) => setColor(Number(e.target.value), current().sat));
$('sat').addEventListener('input', (e) => setColor(current().hue, Number(e.target.value)));

$('bright').addEventListener('input', (e) => {
  current().brightness = Number(e.target.value);
  queueWrite(state.zone, 'brightness');
  renderSliders();
});
$('speed').addEventListener('input', (e) => {
  current().speed = Number(e.target.value);
  queueWrite(state.zone, 'speed');
  renderSliders();
});

$('power').addEventListener('click', () => {
  const z = current();
  setEffect(z.effect === 0 ? state.lastOn[state.zone] || 1 : 0);
});

document.querySelectorAll('.seg').forEach((b) => b.addEventListener('click', () => {
  if (state.zone === b.dataset.zone) return;
  state.zone = b.dataset.zone;
  state.fxTab = null;
  render();
}));

$('save').addEventListener('click', async () => {
  $('save').disabled = true;
  try {
    await flush();
    for (const zone of Object.values(state.keyboard.zones)) await via.save(zone);
    state.dirty = false;
    toast('Enregistré dans le clavier');
  } catch (err) {
    toast(`Enregistrement impossible : ${err.message}`, true);
  }
  renderFooter();
});

// Les vraies frappes alimentent l'aperçu des effets réactifs.
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement && e.target.type === 'text') return;
  view.press(e.code, performance.now() / 1000);
});
window.addEventListener('keyup', (e) => view.release(e.code));

/* Profils
   Ils sont communs à tous les claviers : l'effet est enregistré par son nom QMK, et la
   luminosité et la vitesse en proportion (0 à 1), car chaque clavier a ses propres plages. */

const PRESETS = [
  { name: 'Braise', keys: { fx: 'solid_color', brightness: 0.8, speed: 0.4, hue: 10, sat: 240 }, bar: { effect: 9, brightness: 0.85, speed: 0.5, hue: 10, sat: 240 } },
  { name: 'Lagon', keys: { fx: 'hue_breathing', brightness: 0.8, speed: 0.3, hue: 125, sat: 230 }, bar: { effect: 7, brightness: 0.75, speed: 0.25, hue: 125, sat: 230 } },
  { name: 'Ciel étoilé', keys: { fx: 'starlight', brightness: 0.75, speed: 0.45, hue: 160, sat: 150 }, bar: { effect: 7, brightness: 0.6, speed: 0.25, hue: 160, sat: 150 } },
  { name: 'Arc-en-ciel', keys: { fx: 'cycle_left_right', brightness: 0.85, speed: 0.35, hue: 0, sat: 255 }, bar: { effect: 1, brightness: 0.95, speed: 0.5, hue: 0, sat: 255 } },
  { name: 'Nuit', keys: { fx: 'solid_color', brightness: 0.2, speed: 0.2, hue: 20, sat: 200 }, bar: { effect: 0, brightness: 0, speed: 0, hue: 20, sat: 200 } },
];

// Profils des versions 0.1 et 0.2 : numéros d'effet et plages de l'EVO80.
function migrateProfile(p) {
  if (p.keys.fx) return p;
  const evo = keyboardById('evo80').zones;
  return {
    name: p.name,
    keys: {
      fx: evo.keys.effects[p.keys.effect] ?? (p.keys.effect === 0 ? 'none' : 'solid_color'),
      brightness: p.keys.brightness / evo.keys.brightness.max,
      speed: p.keys.speed / evo.keys.speed.max,
      hue: p.keys.hue,
      sat: p.keys.sat,
    },
    bar: p.logo && {
      effect: p.logo.effect,
      brightness: p.logo.brightness / evo.bar.brightness.max,
      speed: p.logo.speed / evo.bar.speed.max,
      hue: p.logo.hue,
      sat: p.logo.sat,
    },
  };
}

let profiles = storage.get('capglow.profiles', structuredClone(PRESETS)).map(migrateProfile);
storage.set('capglow.profiles', profiles);

// Réglages d'un profil, convertis pour le clavier affiché.
function profileValues(p) {
  const kb = state.keyboard;
  const scale = (zone, v) => ({
    brightness: Math.round(v.brightness * zone.brightness.max),
    speed: Math.round(v.speed * zone.speed.max),
    hue: v.hue,
    sat: v.sat,
  });
  const out = {
    keys: {
      ...scale(kb.zones.keys, p.keys),
      effect: p.keys.fx === 'none' ? 0 : state.catalogs.keys.idOf.get(p.keys.fx) ?? state.catalogs.keys.idOf.get('solid_color'),
    },
  };
  if (kb.zones.bar && p.bar) out.bar = { ...scale(kb.zones.bar, p.bar), effect: p.bar.effect };
  return out;
}

function profileFromState() {
  const kb = state.keyboard;
  const share = (zone, v) => ({
    brightness: v.brightness / zone.brightness.max,
    speed: v.speed / zone.speed.max,
    hue: v.hue,
    sat: v.sat,
  });
  const keys = state.values.keys;
  return {
    keys: { ...share(kb.zones.keys, keys), fx: effectFor('keys', keys.effect).key ?? 'none' },
    bar: kb.zones.bar ? { ...share(kb.zones.bar, state.values.bar), effect: state.values.bar.effect } : undefined,
  };
}

const CLOSE_ICON = '<svg viewBox="0 0 8 8" aria-hidden="true"><path d="M1 1l6 6M7 1L1 7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
const RAINBOW_FAMILY = 'Arc-en-ciel';

function renderProfiles() {
  $('profiles').replaceChildren(...profiles.map((p, i) => {
    const li = document.createElement('li');
    li.className = 'profile-item';

    const b = document.createElement('button');
    b.className = 'profile';
    b.title = `Appliquer « ${p.name} »`;
    const chip = document.createElement('span');
    chip.className = 'chip';
    const fx = effectFor('keys', profileValues(p).keys.effect);
    chip.style.background = fx.family === RAINBOW_FAMILY && fx.color === false
      ? 'conic-gradient(#f55, #fd5, #5f8, #5cf, #a6f, #f55)'
      : ledCss(p.keys.hue, p.keys.sat);
    b.append(chip, document.createTextNode(p.name));
    b.addEventListener('click', () => applyProfile(p));

    const del = document.createElement('button');
    del.className = 'profile-del';
    del.innerHTML = CLOSE_ICON;
    del.setAttribute('aria-label', `Supprimer le profil ${p.name}`);
    del.addEventListener('click', () => {
      profiles.splice(i, 1);
      storage.set('capglow.profiles', profiles);
      renderProfiles();
      toast(`Profil « ${p.name} » supprimé`);
    });

    li.append(b, del);
    return li;
  }));
}

async function applyProfile(p) {
  const values = profileValues(p);
  for (const [zone, v] of Object.entries(values)) {
    Object.assign(state.values[zone], v);
    if (v.effect) state.lastOn[zone] = v.effect;
  }
  state.dirty = true;
  state.fxTab = null;
  render();
  if (state.connected && !state.readOnly) {
    try {
      for (const zone of Object.keys(values)) {
        await via.writeZone(zoneDef(zone), state.values[zone]);
        if (state.keyboard.experimental) {
          for (const field of ['effect', 'brightness', 'speed', 'color']) await via.verify(zoneDef(zone), field, state.values[zone]);
        }
      }
    } catch (err) {
      enterReadOnly(err.message);
      return;
    }
  }
  toast(`Profil « ${p.name} » appliqué`);
}

$('profile-add').addEventListener('click', () => {
  $('profile-name').value = '';
  $('name-dialog').showModal();
});
$('name-dialog').addEventListener('close', () => {
  const name = $('profile-name').value.trim();
  if ($('name-dialog').returnValue !== 'ok' || !name) return;
  profiles.push({ name, ...profileFromState() });
  storage.set('capglow.profiles', profiles);
  renderProfiles();
  toast(`Profil « ${name} » enregistré`);
});

/* Connexion : le clavier branché est reconnu automatiquement */

via.addEventListener('status', async (e) => {
  const { state: status, keyboard, protocol, supported } = e.detail;
  if (keyboard) showKeyboard(keyboard);
  const kb = state.keyboard;

  const label = $('status-text');
  $('status').dataset.state = status === 'connected' ? 'wired' : status;
  label.textContent = status === 'connected'
    ? `${kb.brand} ${kb.name} connecté`
    : status === 'dongle'
      ? `${kb.name} en 2.4G : passe en filaire`
      : 'Aucun clavier détecté';
  if (status === 'connected' && kb.experimental) {
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = 'expérimental';
    badge.title = 'Prise en charge pas encore testée sur ce clavier';
    label.append(' ', badge);
  }
  $('notice').hidden = status === 'connected';
  $('notice-title').textContent = status === 'dongle'
    ? `Passe ton ${kb.name} en filaire`
    : 'Branche ton clavier en filaire';

  const wasConnected = state.connected;
  state.connected = status === 'connected';
  state.protocol = protocol;
  if (!state.connected) state.readOnly = false;

  if (state.connected && !wasConnected) {
    if (!supported) {
      enterReadOnly(`protocole VIA ${protocol || 'inconnu'} non pris en charge`);
    } else {
      try {
        for (const [name, zone] of Object.entries(kb.zones)) {
          const read = await via.readZone(zone);
          Object.assign(state.values[name], read);
          if (read.effect) state.lastOn[name] = read.effect;
        }
        state.readOnly = false;
        state.dirty = false;
        state.fxTab = null;
        toast('Réglages du clavier chargés');
      } catch (err) {
        enterReadOnly(`lecture impossible (${err.message})`);
      }
    }
  }
  render();
});

$('retry').addEventListener('click', () => via.request());

let toastTimer;
function toast(message, isError = false) {
  const el = $('toast');
  el.textContent = message;
  el.classList.toggle('error', isError);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), isError ? 4200 : 2200);
}

/* Démarrage : on affiche le dernier clavier utilisé en attendant la détection */

showKeyboard(keyboardById(storage.get('capglow.keyboard', 'evo80')) ?? KEYBOARDS[0]);
initInstall();
via.scan();
// Certains ports USB n'émettent pas d'événement de connexion : on revérifie tant qu'on n'est pas connecté.
setInterval(() => { if (!state.connected) via.scan(); }, 2500);

// Développement : afficher un autre clavier sans le brancher (window.__capglowPreview('nut65')).
if (params.get('dev')) {
  window.__capglowPreview = (id) => {
    const kb = keyboardById(id);
    if (kb && !state.connected) showKeyboard(kb);
    return Boolean(kb);
  };
}
