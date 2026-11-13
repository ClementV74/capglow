const { app, BrowserWindow, Menu, Tray, ipcMain, screen } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const installer = require('./installer');

const EVO_VENDOR = 0x36b0;
const EVO_WIRED = 0x300e;
const HIDDEN_ARG = '--hidden';
const ICON = path.join(__dirname, 'build', 'icon.png');

let win = null;
let tray = null;
let quitting = false;

// Même identifiant que les raccourcis, pour que Windows les associe à la fenêtre.
app.setAppUserModelId('io.github.capglow');

if (process.argv.includes('--uninstall')) {
  // Désinstallation demandée depuis « Applications installées ».
  app.whenReady().then(() => installer.uninstall()).finally(() => app.quit());
} else if (!app.requestSingleInstanceLock()) {
  // Une seule instance : relancer Capglow ramène la fenêtre existante.
  app.quit();
} else {
  app.on('second-instance', showWindow);
  app.whenReady().then(start);
}

const loginItem = (exePath = process.execPath) => ({ path: exePath, args: [HIDDEN_ARG] });

function openAtLogin() {
  return app.getLoginItemSettings(loginItem()).openAtLogin;
}

function setOpenAtLogin(enabled) {
  app.setLoginItemSettings({ ...loginItem(), openAtLogin: enabled });
  updateTray();
  return openAtLogin();
}

async function installAndRelaunch(options) {
  const exe = await installer.install(options);
  // Le lancement au démarrage doit pointer vers la copie installée.
  if (openAtLogin()) {
    app.setLoginItemSettings({ ...loginItem(), openAtLogin: false });
    app.setLoginItemSettings({ ...loginItem(exe), openAtLogin: true });
  }
  app.releaseSingleInstanceLock();
  spawn(exe, [], { detached: true, stdio: 'ignore' }).unref();
  quitting = true;
  app.quit();
}

function start() {
  ipcMain.handle('settings:get', () => ({ openAtLogin: openAtLogin() }));
  ipcMain.handle('settings:set-open-at-login', (_e, enabled) => setOpenAtLogin(Boolean(enabled)));
  ipcMain.handle('install:status', () => installer.status());
  ipcMain.handle('install:run', (_e, options) => installAndRelaunch({ desktopShortcut: Boolean(options?.desktopShortcut) }));

  createWindow();
  updateTray();

  // Lancé avec Windows : on reste discret dans la zone de notification.
  if (!process.argv.includes(HIDDEN_ARG)) {
    win.once('ready-to-show', () => win.show());
  }
}

function createWindow() {
  // La fenêtre s'adapte à l'écran (barre des tâches et mise à l'échelle comprises).
  const area = screen.getPrimaryDisplay().workAreaSize;
  win = new BrowserWindow({
    width: Math.min(1320, Math.round(area.width * 0.9)),
    height: Math.min(860, Math.round(area.height * 0.9)),
    minWidth: 980,
    minHeight: 600,
    backgroundColor: '#16181c',
    title: 'Capglow',
    icon: ICON,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#16181c', symbolColor: '#a3a7af', height: 44 },
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const ses = win.webContents.session;

  // WebHID : on n'autorise que les périphériques Evoworks, sans popup de choix.
  ses.setPermissionCheckHandler((_wc, permission) => permission === 'hid');
  ses.setDevicePermissionHandler((details) =>
    details.deviceType === 'hid' && details.device.vendorId === EVO_VENDOR);
  ses.on('select-hid-device', (event, details, callback) => {
    event.preventDefault();
    const wired = details.deviceList.find(
      (d) => d.vendorId === EVO_VENDOR && d.productId === EVO_WIRED);
    callback(wired ? wired.deviceId : '');
  });

  if (process.env.CAPGLOW_DEBUG) {
    win.webContents.on('console-message', (e) =>
      console.log(`[${e.level}] ${e.message} (${e.sourceId}:${e.lineNumber})`));
  }

  // Si Capglow démarre avec Windows, fermer la fenêtre la range dans la zone de notification.
  win.on('close', (e) => {
    if (!quitting && openAtLogin()) {
      e.preventDefault();
      win.hide();
    }
  });

  win.setMenu(null);
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
}

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

// L'icône de notification n'existe que lorsque le lancement au démarrage est activé.
function updateTray() {
  if (!openAtLogin()) {
    tray?.destroy();
    tray = null;
    return;
  }
  if (tray) return;
  tray = new Tray(ICON);
  tray.setToolTip('Capglow');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Ouvrir Capglow', click: showWindow },
    { type: 'separator' },
    { label: 'Quitter', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('click', showWindow);
}

app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => app.quit());
