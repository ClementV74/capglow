const { contextBridge, ipcRenderer } = require('electron');

// Seule passerelle entre l'interface et le système : réglages et installation de l'application.
contextBridge.exposeInMainWorld('capglow', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setOpenAtLogin: (enabled) => ipcRenderer.invoke('settings:set-open-at-login', enabled),
  installStatus: () => ipcRenderer.invoke('install:status'),
  install: (options) => ipcRenderer.invoke('install:run', options),
});
