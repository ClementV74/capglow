import {
  Evo80, CH_KEYS, CH_LOGO,
  KEYS_MAX_BRIGHTNESS, LOGO_MAX_BRIGHTNESS, KEYS_MAX_SPEED, LOGO_MAX_SPEED,
} from './hid.js';
import { KEY_FAMILIES, KEY_EFFECTS, LOGO_EFFECTS, LOGO_OFF } from './effects.js';
import { drawThumb } from './keyboard.js';
import { ledRgb } from './led.js';
import { Keyboard3D } from './keyboard3d.js';
import { THEMES } from './themes.js';

const $ = (id) => document.getElementById(id);

const ZONES = {
  keys: { ch: CH_KEYS, maxBrightness: KEYS_MAX_BRIGHTNESS, maxSpeed: KEYS_MAX_SPEED },
  logo: { ch: CH_LOGO, maxBrightness: LOGO_MAX_BRIGHTNESS, maxSpeed: LOGO_MAX_SPEED },
};

// Couleurs nommées d'après leur rendu sur les LED du clavier (voir led.js) : [nom, teinte, saturation].
const PALETTE = [
  ['Rouge', 0, 255], ['Corail', 5, 200], ['Ambre', 10, 240], ['Or', 17, 235], ['Citron vert', 30, 230], ['Vert', 85, 255],
  ['Menthe', 108, 170], ['Lagon', 128, 235], ['Azur', 150, 230], ['Bleu', 172, 230], ['Violet', 220, 220], ['Rose', 240, 180],
];

// Couleur CSS d'un réglage teinte / saturation (0-255), telle que les LED la rendent.
function ledCss(hue, sat) {
  const [r, g, b] = ledRgb(hue / 255, sat / 255, 1);
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

const LOGO_BY_ID = new Map(LOGO_EFFECTS.map((e) => [e.id, e]));

const state = {
  zone: 'keys',
  connected: false,
  dirty: false,
  keys: { effect: 42, brightness: 140, speed: 120, hue: 20, sat: 220 },
  logo: { effect: 9, brightness: 90, speed: 2, hue: 20, sat: 220 },
  lastOn: { keys: 1, logo: 9 },
  fxTab: null,
};

const evo = new Evo80();
const view = new Keyboard3D($('kb'));

function effectFor(zone, id) {
  if (zone === 'keys') return KEY_EFFECTS.get(id) ?? KEY_EFFECTS.get(1);
  return id === 0 ? LOGO_OFF : (LOGO_BY_ID.get(id) ?? LOGO_EFFECTS[0]);
}
const usesColor = (zone, id) => id !== 0 && effectFor(zone, id).color !== false;
const current = () => state[state.zone];

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

/* Envoi au clavier : les changements rapprochés sont regroupés */

const pending = new Map();
let flushTimer = null;

function queueWrite(zone, field) {
  state.dirty = true;
  renderFooter();
  if (!state.connected) return;
  pending.set(`${zone}:${field}`, { zone, field });
  flushTimer ??= setTimeout(flush, 35);
}

async function flush() {
  flushTimer = null;
  const jobs = [...pending.values()];
  pending.clear();
  for (const { zone, field } of jobs) {
    const z = state[zone];
    const ch = ZONES[zone].ch;
    try {
      if (field === 'effect') await evo.setEffect(ch, z.effect);
      if (field === 'brightness') await evo.setBrightness(ch, z.brightness);
      if (field === 'speed') await evo.setSpeed(ch, z.speed);
      if (field === 'color') await evo.setColor(ch, z.hue, z.sat);
    } catch (err) {
      toast(`Réglage non envoyé : ${err.message}`, true);
      return;
    }
  }
}

/* Coloris */

function applyTheme(id) {
  const theme = THEMES.find((t) => t.id === id) ?? THEMES[0];
  view.setTheme(theme);
  document.querySelectorAll('.theme-option').forEach((b) =>
    b.setAttribute('aria-checked', String(b.dataset.id === theme.id)));
  storage.set('capglow.theme', theme.id);
}

for (const t of THEMES) {
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
  $('themes').append(b);
}

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

/* Rendu de l'inspecteur */

function render() {
  const zone = state.zone;
  const z = current();
  const fx = effectFor(zone, z.effect);

  view.focus = zone;
  view.set(effectFor('keys', state.keys.effect), state.keys, effectFor('logo', state.logo.effect), state.logo);

  document.querySelectorAll('.seg').forEach((b) =>
    b.setAttribute('aria-selected', String(b.dataset.zone === zone)));

  // L'accent de l'interface suit la couleur des LED de la zone affichée, éclaircie pour rester lisible.
  const led = ledCss(z.hue, z.sat);
  const root = document.documentElement.style;
  root.setProperty('--led', `color-mix(in srgb, ${led} 72%, white)`);
  root.setProperty('--led-soft', `color-mix(in srgb, ${led} 12%, transparent)`);

  $('np-family').textContent = zone === 'keys' ? fx.family ?? 'Touches' : 'Barre lumineuse';
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

function families() {
  return state.zone === 'keys'
    ? KEY_FAMILIES
    : [{ name: 'Barre lumineuse', effects: LOGO_EFFECTS }];
}

function familyOf(id) {
  return families().find((f) => f.effects.some((e) => e.id === id))?.name;
}

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
  const key = `${state.zone}:${fam.name}`;
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
      if (state.zone === 'keys') drawThumb(ctx, w, h, fx, c);
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
  const cfg = ZONES[state.zone];
  const on = z.effect !== 0;
  const bright = $('bright'), speed = $('speed');
  bright.max = cfg.maxBrightness;
  speed.max = cfg.maxSpeed;
  bright.value = z.brightness;
  speed.value = z.speed;
  bright.disabled = speed.disabled = !on;
  for (const el of [bright, speed]) el.style.setProperty('--p', `${(el.value / el.max) * 100}%`);
  $('bright-out').textContent = `${Math.round((z.brightness / cfg.maxBrightness) * 100)} %`;
  $('speed-out').textContent = state.zone === 'logo'
    ? `${z.speed + 1} sur ${cfg.maxSpeed + 1}`
    : `${Math.round((z.speed / cfg.maxSpeed) * 100)} %`;
}

function renderFooter() {
  const note = $('foot-note');
  note.classList.toggle('dirty', state.dirty);
  note.textContent = !state.connected
    ? 'Aperçu uniquement : aucun clavier connecté.'
    : state.dirty
      ? 'Pas encore enregistré dans le clavier.'
      : 'Les réglages s’appliquent en direct.';
  $('save').disabled = !(state.dirty && state.connected);
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
  b.style.background = ledCss(h, s);
  b.addEventListener('click', () => setColor(h, s));
  $('palette').append(b);
}

// La piste de teinte montre les couleurs telles que les LED les rendent.
const hueStops = Array.from({ length: 13 }, (_, i) => ledCss((i / 12) * 255, 255));
$('hue').style.setProperty('--track', `linear-gradient(to right, ${hueStops.join(', ')})`);

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
    await evo.save(CH_KEYS);
    await evo.save(CH_LOGO);
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

/* Profils */

const PRESETS = [
  { name: 'Braise', keys: { effect: 1, brightness: 150, speed: 100, hue: 10, sat: 240 }, logo: { effect: 9, brightness: 90, speed: 2, hue: 10, sat: 240 } },
  { name: 'Lagon', keys: { effect: 26, brightness: 150, speed: 70, hue: 125, sat: 230 }, logo: { effect: 7, brightness: 80, speed: 1, hue: 125, sat: 230 } },
  { name: 'Ciel étoilé', keys: { effect: 42, brightness: 140, speed: 110, hue: 160, sat: 150 }, logo: { effect: 7, brightness: 60, speed: 1, hue: 160, sat: 150 } },
  { name: 'Arc-en-ciel', keys: { effect: 13, brightness: 160, speed: 90, hue: 0, sat: 255 }, logo: { effect: 1, brightness: 100, speed: 2, hue: 0, sat: 255 } },
  { name: 'Nuit', keys: { effect: 1, brightness: 35, speed: 50, hue: 20, sat: 200 }, logo: { effect: 0, brightness: 0, speed: 0, hue: 20, sat: 200 } },
];
let profiles = storage.get('capglow.profiles', structuredClone(PRESETS));

const CLOSE_ICON = '<svg viewBox="0 0 8 8" aria-hidden="true"><path d="M1 1l6 6M7 1L1 7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';

function renderProfiles() {
  $('profiles').replaceChildren(...profiles.map((p, i) => {
    const li = document.createElement('li');
    li.className = 'profile-item';

    const b = document.createElement('button');
    b.className = 'profile';
    b.title = `Appliquer « ${p.name} »`;
    const chip = document.createElement('span');
    chip.className = 'chip';
    const rainbow = KEY_FAMILIES.find((f) => f.name === 'Arc-en-ciel').effects.some((e) => e.id === p.keys.effect);
    chip.style.background = rainbow
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
  Object.assign(state.keys, p.keys);
  Object.assign(state.logo, p.logo);
  if (p.keys.effect) state.lastOn.keys = p.keys.effect;
  if (p.logo.effect) state.lastOn.logo = p.logo.effect;
  state.dirty = true;
  state.fxTab = null;
  render();
  if (state.connected) {
    try {
      await evo.writeZone(CH_KEYS, state.keys);
      await evo.writeZone(CH_LOGO, state.logo);
    } catch (err) {
      toast(`Profil non envoyé : ${err.message}`, true);
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
  profiles.push({ name, keys: { ...state.keys }, logo: { ...state.logo } });
  storage.set('capglow.profiles', profiles);
  renderProfiles();
  toast(`Profil « ${name} » enregistré`);
});

/* Connexion */

const STATUS_TEXT = {
  wired: 'Connecté en filaire',
  dongle: 'Dongle 2.4G : passe en filaire',
  none: 'Aucun clavier détecté',
};

evo.addEventListener('status', async (e) => {
  const s = e.detail.state;
  $('status').dataset.state = s;
  $('status-text').textContent = STATUS_TEXT[s];
  $('notice').hidden = s === 'wired';
  $('notice-title').textContent = s === 'dongle' ? 'Passe ton EVO80 en filaire' : 'Branche ton EVO80 en filaire';

  const wasConnected = state.connected;
  state.connected = s === 'wired';
  if (state.connected && !wasConnected) {
    try {
      Object.assign(state.keys, await evo.readZone(CH_KEYS));
      Object.assign(state.logo, await evo.readZone(CH_LOGO));
      if (state.keys.effect) state.lastOn.keys = state.keys.effect;
      if (state.logo.effect) state.lastOn.logo = state.logo.effect;
      state.dirty = false;
      state.fxTab = null;
      toast('Réglages du clavier chargés');
    } catch (err) {
      toast(`Lecture du clavier impossible : ${err.message}`, true);
    }
  }
  render();
});

$('retry').addEventListener('click', () => evo.request());

let toastTimer;
function toast(message, isError = false) {
  const el = $('toast');
  el.textContent = message;
  el.classList.toggle('error', isError);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), isError ? 4200 : 2200);
}

/* Démarrage */

applyTheme(storage.get('capglow.theme', 'cream'));
renderProfiles();
render();
evo.scan();
// Certains ports USB n'émettent pas d'événement de connexion : on revérifie tant qu'on n'est pas connecté.
setInterval(() => { if (!state.connected) evo.scan(); }, 2500);
