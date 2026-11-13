// Installation depuis l'application, pour la version zip.
// Smart App Control bloque les installateurs non signés, mais pas Capglow.exe (binaire Electron d'origine) :
// l'application peut donc s'installer elle-même au même endroit que l'installateur classique.
const { app, dialog, shell } = require('electron');
const { execFile, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const APP_NAME = 'Capglow';
const APP_ID = 'io.github.capglow';
const INSTALL_DIR = path.join(process.env.LOCALAPPDATA || app.getPath('appData'), 'Programs', APP_NAME);
const UNINSTALL_KEY = `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${APP_NAME}`;

const currentDir = () => path.dirname(process.execPath);
const sameDir = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

const shortcuts = () => ({
  desktop: path.join(app.getPath('desktop'), `${APP_NAME}.lnk`),
  startMenu: path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', `${APP_NAME}.lnk`),
});

function status() {
  if (!app.isPackaged || process.platform !== 'win32') return { installable: false, installed: false };
  const installed = sameDir(currentDir(), INSTALL_DIR);
  return { installable: !installed, installed, installDir: INSTALL_DIR };
}

function regAdd(name, type, value) {
  return new Promise((resolve, reject) => {
    execFile('reg', ['add', UNINSTALL_KEY, '/v', name, '/t', type, '/d', String(value), '/f'],
      { windowsHide: true }, (err) => (err ? reject(err) : resolve()));
  });
}

function folderSizeKb(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) total += fs.statSync(path.join(entry.parentPath, entry.name)).size;
  }
  return Math.round(total / 1024);
}

async function install({ desktopShortcut }) {
  const exe = path.join(INSTALL_DIR, `${APP_NAME}.exe`);
  // Capglow.exe garde l'icône d'Electron (il n'est pas modifié) : les raccourcis utilisent notre .ico.
  const icon = path.join(INSTALL_DIR, 'resources', 'icon.ico');

  fs.mkdirSync(INSTALL_DIR, { recursive: true });
  fs.cpSync(currentDir(), INSTALL_DIR, { recursive: true, force: true });

  const link = { target: exe, cwd: INSTALL_DIR, icon, iconIndex: 0, appUserModelId: APP_ID, description: 'Éclairage RGB du clavier EVO80' };
  const { desktop, startMenu } = shortcuts();
  shell.writeShortcutLink(startMenu, 'create', link);
  if (desktopShortcut) shell.writeShortcutLink(desktop, 'create', link);

  // Entrée dans « Applications installées », avec désinstallation.
  await regAdd('DisplayName', 'REG_SZ', APP_NAME);
  await regAdd('DisplayVersion', 'REG_SZ', app.getVersion());
  await regAdd('Publisher', 'REG_SZ', APP_NAME);
  await regAdd('DisplayIcon', 'REG_SZ', icon);
  await regAdd('InstallLocation', 'REG_SZ', INSTALL_DIR);
  await regAdd('UninstallString', 'REG_SZ', `"${exe}" --uninstall`);
  await regAdd('NoModify', 'REG_DWORD', 1);
  await regAdd('NoRepair', 'REG_DWORD', 1);
  await regAdd('EstimatedSize', 'REG_DWORD', folderSizeKb(INSTALL_DIR));

  return exe;
}

// Lancé avec --uninstall depuis « Applications installées ».
async function uninstall() {
  const { response } = await dialog.showMessageBox({
    type: 'question',
    title: 'Désinstaller Capglow',
    message: 'Désinstaller Capglow de ce PC ?',
    detail: 'Les réglages enregistrés dans le clavier ne sont pas modifiés.',
    buttons: ['Désinstaller', 'Annuler'],
    defaultId: 0,
    cancelId: 1,
  });
  if (response !== 0) return false;

  const { desktop, startMenu } = shortcuts();
  for (const file of [desktop, startMenu]) fs.rmSync(file, { force: true });
  app.setLoginItemSettings({ openAtLogin: false, path: process.execPath, args: ['--hidden'] });
  await new Promise((resolve) =>
    execFile('reg', ['delete', UNINSTALL_KEY, '/f'], { windowsHide: true }, () => resolve()));

  // Le dossier ne peut pas être supprimé tant que Capglow tourne : cmd attend notre fermeture.
  const dirs = [currentDir(), app.getPath('userData')].map((d) => `"${d}"`).join(' ');
  spawn('cmd.exe', ['/d', '/c', `ping 127.0.0.1 -n 4 > nul & rmdir /s /q ${dirs}`], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    windowsVerbatimArguments: true,
  }).unref();
  return true;
}

module.exports = { status, install, uninstall };
