const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('drinkApi', {
  getStatus: () => ipcRenderer.invoke('get-status'),
  addDrink: () => ipcRenderer.invoke('add-drink'),
  updateSettings: (settings) => ipcRenderer.invoke('update-settings', settings),
  resetData: () => ipcRenderer.invoke('reset-data'),
  onStatus: (callback) => {
    ipcRenderer.removeAllListeners('status');
    ipcRenderer.on('status', (event, status) => callback(status));
  }
});
