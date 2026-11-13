// Rendu 3D temps réel de l'EVO80 (TKL ANSI) avec three.js : boîtier, touches sculptées,
// LED sous les touches et barre lumineuse.
//
// Le clavier est modélisé dans le repère de sa disposition : x = ux, z = uy (une unité = une
// touche, soit 19,05 mm), y vers le haut avec le dessus du boîtier à y = 0.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeVertices, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { KEYS, TOTAL_W, TOTAL_H, keyColors } from './keyboard.js';
import { ledRgb } from './led.js';

const { degToRad: rad, lerp, clamp, smootherstep } = THREE.MathUtils;
const wrap = (h) => ((h % 1) + 1) % 1;

/* Dimensions */

// Emprise du boîtier : les touches affleurent presque les bords, sauf à l'avant.
const CASE = { left: -0.28, right: TOTAL_W + 0.28, back: -0.26, front: TOTAL_H + 0.42 };
const FRONT_H = 0.85;       // hauteur du boîtier à l'avant
const TILT = rad(6.5);      // angle de frappe
const WELL_DEPTH = 0.3;

// Découpes du boîtier autour des groupes de touches, avec un léger jeu.
const PAD = 0.07;
const WELLS = [
  // Les trois rangées du haut sur toute la largeur, puis le bloc principal.
  [[-PAD, -PAD], [TOTAL_W + PAD, -PAD], [TOTAL_W + PAD, 3 + PAD], [15 + PAD, 3 + PAD], [15 + PAD, 6 + PAD], [-PAD, 6 + PAD]],
  // Les flèches, en T inversé.
  [[16.25 - PAD, 4 - PAD], [17.25 + PAD, 4 - PAD], [17.25 + PAD, 5 - PAD], [18.25 + PAD, 5 - PAD],
    [18.25 + PAD, 6 + PAD], [15.25 - PAD, 6 + PAD], [15.25 - PAD, 5 - PAD], [16.25 - PAD, 5 - PAD]],
];

const CAP_GAP = 0.05;
const CAP_H = 0.45;
const CAP_Y = -0.05 + CAP_H / 2;
const CAP_TOP = CAP_Y + CAP_H / 2;
const CAP_TRAVEL = 0.16;
// Rétrécissement du sommet par rapport à la base : plus marqué à l'avant, comme un profil Cherry.
const CAP_INSET = { side: 0.14, back: 0.05, front: 0.2 };

// Fenêtre de la barre lumineuse, encastrée dans le boîtier sous Delete / End / PgDn.
const BAR = { x: 16.75, z: 3.4, w: 2.9, d: 0.36 };

/* Caméra */

// Points de vue : orientation de la caméra et boîte à cadrer.
const VIEWS = {
  keys: {
    yaw: 0, pitch: rad(50),
    box: new THREE.Box3(new THREE.Vector3(CASE.left, -FRONT_H, CASE.back), new THREE.Vector3(CASE.right, CAP_TOP, CASE.front)),
  },
  logo: {
    yaw: rad(12), pitch: rad(46),
    box: new THREE.Box3(new THREE.Vector3(BAR.x - 3.2, -0.2, BAR.z - 2.4), new THREE.Vector3(BAR.x + 2.2, CAP_TOP, BAR.z + 2.6)),
  },
};
// Place réservée à l'interface posée sur la scène (onglets en haut, légende en bas), en pixels CSS.
const MARGIN = { top: 64, side: 36, bottom: 118 };
const PARALLAX = { yaw: rad(3.5), pitch: rad(2) };
const ZOOM_SECONDS = 1.1;

/* Lumière */

const ENV_INTENSITY = 0.3;
const SPILL = 0.5;          // part de la lumière des LED renvoyée sur le clavier
const HALO_REACH = 0.3;     // distance sur laquelle la lumière d'une LED s'éteint autour de sa touche
// Hauteur (0 à la base, 1 au sommet) jusqu'à laquelle la touche de devant cache la jupe.
const HIDDEN_SKIRT = 0.36;

/* Géométries */

// Contour fermé aux angles arrondis, à partir de ses sommets.
function roundedOutline(path, points, r) {
  const k = r * 0.4477; // quart de cercle approché par une courbe de Bézier
  points.forEach(([x, y], i) => {
    const [px, py] = points.at(i - 1);
    const [nx, ny] = points[(i + 1) % points.length];
    const a = new THREE.Vector2(px - x, py - y).normalize();
    const b = new THREE.Vector2(nx - x, ny - y).normalize();
    path[i ? 'lineTo' : 'moveTo'](x + a.x * r, y + a.y * r);
    path.bezierCurveTo(x + a.x * k, y + a.y * k, x + b.x * k, y + b.y * k, x + b.x * r, y + b.y * r);
  });
  path.closePath();
  return path;
}

const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const capsule = (w, d, inset = 0) =>
  roundedOutline(new THREE.Shape(), rect(-w / 2 + inset, -d / 2 + inset, w / 2 - inset, d / 2 - inset), d / 2 - inset);

// Extrude vers le bas un contour tracé dans le plan (x, z), arêtes chanfreinées, sommet à y = top.
function extrudeDown(shape, height, top, bevel) {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: height - bevel * 2,
    bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 3,
    curveSegments: 16,
  });
  return geo.rotateX(Math.PI / 2).translate(0, top - bevel, 0);
}

// Boîtier : un bloc percé des découpes des touches. Le dessous est rallongé vers l'arrière
// pour rester à plat sur le bureau une fois le clavier incliné.
function caseGeometry() {
  const outline = roundedOutline(new THREE.Shape(), rect(CASE.left, CASE.back, CASE.right, CASE.front), 0.4);
  for (const well of WELLS) outline.holes.push(roundedOutline(new THREE.Path(), well, 0.1));
  const geo = extrudeDown(outline, FRONT_H, 0, 0.025);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) < -FRONT_H / 2) pos.setY(i, pos.getY(i) - (CASE.front - pos.getZ(i)) * Math.tan(TILT));
  }
  return toCreasedNormals(geo, rad(35));
}

// Touche : une boîte arrondie au sommet resserré et légèrement creusé. Une géométrie par largeur.
const capGeometries = new Map();
function capGeometry(w) {
  if (capGeometries.has(w)) return capGeometries.get(w);
  const bw = w - CAP_GAP, bd = 1 - CAP_GAP;
  const box = new RoundedBoxGeometry(bw, CAP_H, bd, 3, 0.08);
  box.deleteAttribute('normal');
  box.deleteAttribute('uv');
  const geo = mergeVertices(box);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / CAP_H + 0.5;
    pos.setX(i, pos.getX(i) * (1 - (t * CAP_INSET.side * 2) / bw));
    pos.setZ(i, pos.getZ(i) * (1 - (t * (CAP_INSET.back + CAP_INSET.front)) / bd) + (t * (CAP_INSET.back - CAP_INSET.front)) / 2);
  }
  geo.computeVertexNormals();

  // Creux cylindrique du dessus, simulé en inclinant les normales des bords vers le centre.
  const normal = geo.attributes.normal;
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) < CAP_H / 2 - 1e-4) continue;
    n.fromBufferAttribute(normal, i);
    n.x -= Math.sign(pos.getX(i)) * 0.3;
    normal.setXYZ(i, ...n.normalize());
  }
  capGeometries.set(w, geo);
  return geo;
}

// Face supérieure d'une touche, dans le repère de la touche.
function capTop(w) {
  return {
    w: w - CAP_GAP - CAP_INSET.side * 2 - 0.08,
    d: 1 - CAP_GAP - CAP_INSET.back - CAP_INSET.front - 0.08,
    z: (CAP_INSET.back - CAP_INSET.front) / 2,
  };
}

/* Textures */

// Toutes les légendes sur une seule texture, disposées comme le clavier vu de dessus :
// les UV d'une légende sont simplement sa position sur le clavier.
const ATLAS_PPU = 160;

function legendAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = TOTAL_W * ATLAS_PPU;
  canvas.height = TOTAL_H * ATLAS_PPU;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'top';
  const font = (size) => `700 ${size * ATLAS_PPU}px Bahnschrift, "Segoe UI", sans-serif`;
  for (const k of KEYS) {
    if (!k.label) continue;
    const top = capTop(k.w);
    const size = k.label.length > 1 ? 0.19 : 0.32;
    const room = (top.w - 0.08) * ATLAS_PPU;
    ctx.font = font(size);
    const width = ctx.measureText(k.label).width;
    if (width > room) ctx.font = font((size * room) / width);
    // En haut à gauche, comme sur les touches de l'EVO80.
    const x = k.ux + k.w / 2 - top.w / 2 + 0.04;
    const y = k.uy + 0.5 + top.z - top.d / 2 + 0.05;
    ctx.fillText(k.label, x * ATLAS_PPU, y * ATLAS_PPU);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 8;
  return texture;
}

function legendGeometry(k) {
  const top = capTop(k.w);
  const geo = new THREE.PlaneGeometry(top.w, top.d).rotateX(-Math.PI / 2).translate(0, CAP_H / 2 + 0.002, top.z);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    geo.attributes.uv.setXY(i, (k.ux + k.w / 2 + pos.getX(i)) / TOTAL_W, 1 - (k.uy + 0.5 + pos.getZ(i)) / TOTAL_H);
  }
  return geo;
}

// Rectangle blanc aux bords flous sur fond noir ; `inset` et `blur` en fraction de la largeur.
function softRectTexture(w, h, inset, blur) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  ctx.filter = `blur(${w * blur}px)`;
  ctx.fillStyle = '#fff';
  ctx.fillRect(w * inset, w * inset, w - w * inset * 2, h - w * inset * 2);
  return new THREE.CanvasTexture(canvas);
}

/* Matériaux */

// La lumière des LED ne fait qu'un liseré au bas de la jupe. Quand une touche est placée devant,
// ce bas est caché : le liseré est remonté sur la face avant pour dépasser tout juste, et se lit
// comme un trait de lumière entre les deux rangées.
function capMaterial(hasKeyInFront) {
  const material = new THREE.MeshStandardMaterial({ roughness: 0.68, emissiveIntensity: 6 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.hiddenSkirt = { value: hasKeyInFront ? HIDDEN_SKIRT : 0 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float hiddenSkirt;
        varying float vHeight;
        varying float vGlowBase;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vHeight = position.y / ${CAP_H} + 0.5;
        vGlowBase = hiddenSkirt * smoothstep(0.2, 0.8, normal.z);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vHeight;
        varying float vGlowBase;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance *= 1.0 - smoothstep(vGlowBase, vGlowBase + 0.16, vHeight);`);
  };
  return material;
}

// Halo d'une LED sur la plaque : plein sous la touche, il s'éteint sur HALO_REACH tout autour.
const HALO = {
  uniforms: { reach: { value: HALO_REACH }, gain: { value: 0.7 } },
  vertexShader: `
    varying vec2 vOffset; // position dans le halo, en unités de touche
    varying vec2 vHalf;   // demi-dimensions du halo
    varying vec3 vColor;
    void main() {
      vHalf = 0.5 * vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[2].xyz));
      vOffset = position.xz * 2.0 * vHalf;
      vColor = instanceColor;
      gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    uniform float reach;
    uniform float gain;
    varying vec2 vOffset;
    varying vec2 vHalf;
    varying vec3 vColor;
    void main() {
      vec2 fade = smoothstep(0.0, reach, vHalf - abs(vOffset));
      gl_FragColor = vec4(vColor * fade.x * fade.y * gain, 1.0);
    }`,
  blending: THREE.AdditiveBlending,
  transparent: true,
  depthWrite: false,
};

// Addition de l'image et de son halo.
const ADD_GLOW = {
  uniforms: { tDiffuse: { value: null }, tGlow: { value: null } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform sampler2D tGlow; varying vec2 vUv;
    void main() { gl_FragColor = texture2D(tDiffuse, vUv) + vec4(texture2D(tGlow, vUv).rgb, 0.0); }`,
};

export class Keyboard3D {
  constructor(canvas) {
    this.container = canvas.parentElement;
    this.byCode = new Map(KEYS.map((k) => [k.code, k]));
    this.hits = [];
    this.down = new Set();
    this.travel = new Float32Array(KEYS.length);
    this.lastRealHit = -10;
    this.focus = 'keys';
    this.onAmbient = null;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.zoom = 0;                         // 0 : vue d'ensemble, 1 : gros plan sur la barre lumineuse
    this.pointer = new THREE.Vector2();
    this.sway = new THREE.Vector2();
    this.target = new THREE.Vector3();
    this.led = new THREE.Color();
    this.last = 0;

    this.renderer = new THREE.WebGLRenderer({ canvas, powerPreference: 'high-performance' });
    // Rendu des tons neutre : contrairement à ACES, il ne fait pas virer les teintes saturées des LED.
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(28, 1, 1, 300);
    this.buildStudio();
    this.buildKeyboard();
    this.buildLightBar();
    this.buildPipeline();

    new ResizeObserver(() => this.resize()).observe(this.container);
    if (!this.reduced) this.trackPointer();

    this.frame = this.frame.bind(this);
    document.addEventListener('visibilitychange', () => (document.hidden ? this.stop() : this.start()));
    this.start();
  }

  /* Interface publique */

  set(keyFx, keyState, logoFx, logoState) {
    Object.assign(this, { keyFx, keyState, logoFx, logoState });
  }

  setTheme(theme) {
    this.theme = theme;
    const lacquered = theme.finish === 'Laqué';

    // Anodisé : satiné, légèrement métallique. Laqué : peinture lisse sous vernis.
    this.caseMaterial.color.set(theme.case);
    this.caseMaterial.metalness = lacquered ? 0 : 0.55;
    this.caseMaterial.roughness = lacquered ? 0.4 : 0.42;
    this.caseMaterial.clearcoat = lacquered ? 0.7 : 0;
    // Plaque : une version sombre du boîtier, que seules les LED éclairent vraiment.
    this.plateMaterial.color.set(theme.case).multiplyScalar(0.12);

    const tones = {
      a: [theme.alpha, theme.alphaInk],
      m: [theme.mod, theme.modInk],
      o: [theme.accent, theme.accentInk],
    };
    KEYS.forEach((k, i) => this.caps[i].material.color.set(tones[k.tone][0]));
    for (const tone in tones) this.inks[tone].color.set(tones[tone][1]);

    this.barRim.color.set(theme.lightBar);
  }

  press(code, now) {
    const k = this.byCode.get(code);
    if (!k) return false;
    this.hits.push({ i: k.i, x: k.x, y: k.y, t: now });
    this.down.add(k.i);
    this.lastRealHit = now;
    return true;
  }

  release(code) {
    const k = this.byCode.get(code);
    if (k) this.down.delete(k.i);
  }

  /* Construction de la scène */

  buildStudio() {
    const { scene } = this;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // Lumière principale : un projecteur doux, en haut à gauche, qui dessine une flaque sur le sol.
    const key = new THREE.SpotLight('#fff4e8', 1.4, 0, rad(34), 1, 0);
    key.position.set(-9, 27, 10);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 14;
    key.shadow.camera.far = 50;
    key.shadow.bias = -0.0003;
    key.shadow.normalBias = 0.015;

    // Contre-jour froid pour détacher les arêtes des touches.
    const rim = new THREE.DirectionalLight('#c9d8ff', 0.4);
    rim.position.set(8, 10, -14);

    // Lumière moyenne des LED, renvoyée sur les touches.
    this.spill = new THREE.PointLight('#000', SPILL, 12, 2);
    this.spill.position.set(0, 5, 0);

    this.lights = [key, rim, this.spill];
    for (const light of this.lights) light.userData.intensity = light.intensity;
    scene.add(key, key.target, rim, this.spill);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: '#2a2c31', roughness: 0.85 }),
    );
    floor.receiveShadow = true;

    const span = 1.4;
    const contact = new THREE.Mesh(
      new THREE.PlaneGeometry((CASE.right - CASE.left) * span, (CASE.front - CASE.back) * span).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#000', alphaMap: softRectTexture(256, 128, (1 - 1 / span) / 2, 0.03), transparent: true, opacity: 0.8, depthWrite: false }),
    );
    contact.position.y = 0.01;
    scene.add(floor, contact);
  }

  buildKeyboard() {
    // Clavier incliné, centré sur l'origine de la scène, l'avant du boîtier posé au sol.
    const board = new THREE.Group();
    board.rotation.x = TILT;
    board.position.set(
      -TOTAL_W / 2,
      FRONT_H * Math.cos(TILT) + CASE.front * Math.sin(TILT),
      (-TOTAL_H / 2) * Math.cos(TILT),
    );
    board.updateMatrixWorld();
    this.board = board;
    this.scene.add(board);

    this.caseMaterial = new THREE.MeshPhysicalMaterial({ clearcoatRoughness: 0.25 });
    const body = new THREE.Mesh(caseGeometry(), this.caseMaterial);
    body.castShadow = body.receiveShadow = true;

    this.plateMaterial = new THREE.MeshStandardMaterial({ roughness: 0.6 });
    const plate = new THREE.Mesh(new THREE.BoxGeometry(TOTAL_W + 0.4, 0.1, TOTAL_H + 0.4), this.plateMaterial);
    plate.position.set(TOTAL_W / 2, -WELL_DEPTH - 0.05, TOTAL_H / 2);
    plate.receiveShadow = true;
    board.add(body, plate);

    const atlas = legendAtlas();
    const ink = () => new THREE.MeshStandardMaterial({
      alphaMap: atlas, transparent: true, depthWrite: false, roughness: 0.7,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.inks = { a: ink(), m: ink(), o: ink() };

    this.caps = KEYS.map((k) => {
      const hasKeyInFront = KEYS.some((o) => o.uy === k.uy + 1 && o.ux < k.ux + k.w && o.ux + o.w > k.ux);
      const cap = new THREE.Mesh(capGeometry(k.w), capMaterial(hasKeyInFront));
      cap.position.set(k.ux + k.w / 2, CAP_Y, k.uy + 0.5);
      cap.castShadow = cap.receiveShadow = true;
      if (k.label) {
        const legend = new THREE.Mesh(legendGeometry(k), this.inks[k.tone]);
        legend.receiveShadow = true;
        cap.add(legend);
      }
      board.add(cap);
      return cap;
    });

    // Lumière des LED sur la plaque, visible dans les interstices entre les touches.
    this.halos = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial(HALO),
      KEYS.length,
    );
    const matrix = new THREE.Matrix4();
    this.caps.forEach((cap, i) => {
      matrix.makeScale(KEYS[i].w + HALO_REACH * 2, 1, 1 + HALO_REACH * 2).setPosition(cap.position.x, -WELL_DEPTH + 0.01, cap.position.z);
      this.halos.setMatrixAt(i, matrix);
      this.halos.setColorAt(i, this.led.setScalar(0));
    });
    this.halos.instanceColor.setUsage(THREE.DynamicDrawUsage);
    board.add(this.halos);
  }

  // Fenêtre noire et brillante, avec sa fente lumineuse à gauche et son point à droite.
  buildLightBar() {
    const bar = new THREE.Group();
    bar.position.set(BAR.x, 0, BAR.z);

    this.barRim = new THREE.MeshPhysicalMaterial({ roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 });
    const rim = new THREE.Mesh(extrudeDown(capsule(BAR.w, BAR.d), 0.1, 0.014, 0.012), this.barRim);
    const glass = new THREE.Mesh(
      extrudeDown(capsule(BAR.w, BAR.d, 0.035), 0.1, 0.02, 0.012),
      new THREE.MeshPhysicalMaterial({ color: '#07080a', roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.04 }),
    );
    rim.receiveShadow = glass.receiveShadow = true;

    // Toute la barre prend la même couleur, sans dégradé le long de la fente.
    this.barLight = new THREE.MeshStandardMaterial({ color: '#000', emissiveIntensity: 1.6 });
    const slotW = BAR.w * 0.26, slotD = 0.07, y = 0.022;
    const slot = new THREE.Mesh(new THREE.ShapeGeometry(capsule(slotW, slotD), 8).rotateX(-Math.PI / 2), this.barLight);
    slot.position.set(-BAR.w / 2 + 0.22 + slotW / 2, y, 0);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.065, 24).rotateX(-Math.PI / 2), this.barLight);
    dot.position.set(BAR.w / 2 - 0.2, y, 0);

    bar.add(rim, glass, slot, dot);
    this.board.add(bar);
  }

  // L'image finale = la scène éclairée + le halo des LED. Le halo vient d'un second rendu,
  // studio éteint, où seules les LED restent visibles ; il est flouté puis ajouté à l'image.
  buildPipeline() {
    const { renderer, scene, camera } = this;

    const target = () => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });

    this.glow = new EffectComposer(renderer, target());
    this.glow.renderToScreen = false;
    this.glow.addPass(new RenderPass(scene, camera));
    // Halo serré : on coupe les deux niveaux de flou les plus larges, qui voileraient toute la scène.
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.2, 0.1, 0);
    bloom.compositeMaterial.uniforms.bloomFactors.value = [1, 0.7, 0.3, 0, 0];
    this.glow.addPass(bloom);

    const addGlow = new ShaderPass(ADD_GLOW);
    addGlow.uniforms.tGlow.value = this.glow.renderTarget2.texture;

    this.composer = new EffectComposer(renderer, target());
    this.composer.addPass(new RenderPass(scene, camera));
    this.composer.addPass(addGlow);
    this.composer.addPass(new OutputPass());
  }

  trackPointer() {
    window.addEventListener('pointermove', (e) => {
      const r = this.container.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      const inside = Math.abs(x) <= 0.5 && Math.abs(y) <= 0.5;
      this.pointer.set(inside ? x : 0, inside ? y : 0);
    });
    document.documentElement.addEventListener('pointerleave', () => this.pointer.set(0, 0));
  }

  /* Cadrage */

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(ratio);
    this.composer.setSize(w, h);
    // Le halo est flou par nature : demi-résolution.
    this.glow.setPixelRatio(ratio / 2);
    this.glow.setSize(w, h);

    // Le centre optique est décalé vers le milieu de la zone laissée libre par l'interface.
    this.camera.aspect = w / h;
    this.camera.setViewOffset(w, h, 0, (MARGIN.bottom - MARGIN.top) / 2, w, h);
    for (const view of Object.values(VIEWS)) this.frameView(view, w, h);
    this.ready = true;
  }

  // Calcule la cible et la distance auxquelles la boîte d'un point de vue tient dans la zone libre.
  frameView(view, w, h) {
    const tan = Math.tan(rad(this.camera.fov) / 2);
    const tanV = tan * (1 - (MARGIN.top + MARGIN.bottom) / h);
    const tanH = tan * (w / h) * (1 - (MARGIN.side * 2) / w);

    const cp = Math.cos(view.pitch);
    const back = new THREE.Vector3(Math.sin(view.yaw) * cp, Math.sin(view.pitch), Math.cos(view.yaw) * cp);
    const right = new THREE.Vector3(Math.cos(view.yaw), 0, -Math.sin(view.yaw));
    const up = back.clone().cross(right);

    view.target = view.box.getCenter(new THREE.Vector3()).applyMatrix4(this.board.matrixWorld);
    view.dist = 0;
    const p = new THREE.Vector3();
    for (let corner = 0; corner < 8; corner++) {
      p.set(
        corner & 1 ? view.box.max.x : view.box.min.x,
        corner & 2 ? view.box.max.y : view.box.min.y,
        corner & 4 ? view.box.max.z : view.box.min.z,
      ).applyMatrix4(this.board.matrixWorld).sub(view.target);
      const depth = p.dot(back);
      view.dist = Math.max(view.dist, depth + Math.abs(p.dot(right)) / tanH, depth + Math.abs(p.dot(up)) / tanV);
    }
  }

  /* Boucle de rendu */

  start() {
    if (!this.raf) this.raf = requestAnimationFrame(this.frame);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  frame(ms) {
    this.raf = requestAnimationFrame(this.frame);
    const now = ms / 1000;
    const dt = Math.min(0.1, now - this.last);
    this.last = now;
    if (!this.ready || !this.keyState || !this.theme) return;

    this.demoHits(now);
    this.updateLeds(now);
    this.updateLightBar(now);
    this.updateCaps(dt);
    this.updateCamera(dt);

    this.lightStudio(false);
    this.glow.render();
    this.lightStudio(true);
    this.renderer.shadowMap.needsUpdate = true; // les ombres ne servent qu'au rendu éclairé
    this.composer.render();
  }

  // Studio éteint, il ne reste à l'image que la lumière des LED.
  lightStudio(on) {
    for (const light of this.lights) light.intensity = on ? light.userData.intensity : 0;
    this.scene.environmentIntensity = on ? ENV_INTENSITY : 0;
  }

  // Frappes de démonstration quand personne ne tape, pour que les effets réactifs restent lisibles.
  demoHits(now) {
    this.hits = this.hits.filter((h) => now - h.t < 2);
    if (now - this.lastRealHit < 2.5) return;
    if (!this.nextDemo || now > this.nextDemo) {
      const k = KEYS[Math.floor(Math.random() * KEYS.length)];
      this.hits.push({ i: k.i, x: k.x, y: k.y, t: now });
      this.nextDemo = now + 0.25 + Math.random() * 0.6;
    }
  }

  updateLeds(now) {
    const ks = this.keyState;
    const speedN = ks.speed / 255;
    const t = this.reduced ? 1.7 : now * (0.25 + speedN * 1.75);
    const c = { hue: ks.hue / 255, sat: ks.sat / 255, speedN, hits: this.hits, now };
    const bright = ks.effect === 0 ? 0 : ks.brightness / 180;
    const colors = keyColors(this.keyFx, t, c, bright);

    const { led, halos, caps } = this;
    let ar = 0, ag = 0, ab = 0;
    for (let i = 0; i < colors.length; i++) {
      const rgb = colors[i];
      led.setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, THREE.SRGBColorSpace);
      caps[i].material.emissive.copy(led);
      halos.setColorAt(i, led);
      ar += rgb[0]; ag += rgb[1]; ab += rgb[2];
    }
    halos.instanceColor.needsUpdate = true;

    const n = colors.length;
    this.spill.color.setRGB(ar / n / 255, ag / n / 255, ab / n / 255, THREE.SRGBColorSpace);
    this.onAmbient?.(ar / n, ag / n, ab / n);
  }

  updateLightBar(now) {
    const ls = this.logoState;
    const lt = this.reduced ? 1 : now * (0.4 + ls.speed * 0.45);
    const lb = ls.effect === 0 ? 0 : ls.brightness / 105;
    const [h, s, v] = this.logoFx.f(0, lt, { hue: ls.hue / 255, sat: ls.sat / 255 });
    const [r, g, b] = ledRgb(wrap(h), s, v * lb);
    this.barLight.emissive.setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
  }

  updateCaps(dt) {
    const ease = this.reduced ? 1 : 1 - Math.exp(-dt * 32);
    for (let i = 0; i < this.caps.length; i++) {
      this.travel[i] += ((this.down.has(i) ? 1 : 0) - this.travel[i]) * ease;
      this.caps[i].position.y = CAP_Y - this.travel[i] * CAP_TRAVEL;
    }
  }

  updateCamera(dt) {
    const goal = this.focus === 'logo' ? 1 : 0;
    const step = this.reduced ? 1 : dt / ZOOM_SECONDS;
    this.zoom += clamp(goal - this.zoom, -step, step);
    this.sway.lerp(this.pointer, 1 - Math.exp(-dt * 4));

    const a = VIEWS.keys, b = VIEWS.logo;
    const e = smootherstep(this.zoom, 0, 1);
    const yaw = lerp(a.yaw, b.yaw, e) + this.sway.x * PARALLAX.yaw;
    const pitch = lerp(a.pitch, b.pitch, e) - this.sway.y * PARALLAX.pitch;
    const dist = lerp(a.dist, b.dist, e);

    const cp = Math.cos(pitch);
    this.target.lerpVectors(a.target, b.target, e);
    this.camera.position.set(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp).multiplyScalar(dist).add(this.target);
    this.camera.lookAt(this.target);
  }
}
