const { contextBridge, ipcRenderer } = require('electron');

// Seule passerelle entre l'interface et le système : les réglages de l'application.
contextBridge.exposeInMainWorld('capglow', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setOpenAtLogin: (enabled) => ipcRenderer.invoke('settings:set-open-at-login', enabled),
});
