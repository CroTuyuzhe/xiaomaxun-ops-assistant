const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('ball', { avatar: () => ipcRenderer.invoke('ball:avatar'), onAvatar: (callback) => ipcRenderer.on('ball:avatar-changed', (_event, value) => callback(value)), start: () => ipcRenderer.send('ball:start'), end: (cancelled) => ipcRenderer.send('ball:end', Boolean(cancelled)) });
