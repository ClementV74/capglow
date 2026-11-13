// Copie Three.js et les modules utilisés dans src/vendor/three.
// electron-builder exclut les dossiers « examples » des dépendances : on les embarque nous-mêmes.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const from = path.join(root, 'node_modules', 'three');
const to = path.join(root, 'src', 'vendor', 'three');

const ADDON_DIRS = ['environments', 'geometries', 'postprocessing', 'shaders', 'utils'];

fs.rmSync(to, { recursive: true, force: true });
fs.mkdirSync(to, { recursive: true });
fs.copyFileSync(path.join(from, 'build', 'three.module.js'), path.join(to, 'three.module.js'));
fs.copyFileSync(path.join(from, 'LICENSE'), path.join(to, 'LICENSE'));
for (const dir of ADDON_DIRS) {
  fs.cpSync(path.join(from, 'examples', 'jsm', dir), path.join(to, 'addons', dir), { recursive: true });
}
console.log('Three.js copié dans src/vendor/three');
