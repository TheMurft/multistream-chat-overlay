const { contextBridge, ipcRenderer } = require('electron');

// Expone un objeto 'api' al 'window' de la página web (index.html) de forma segura.
// Esto nos permite escuchar eventos desde el proceso principal (main.js).
contextBridge.exposeInMainWorld('api', {
    // El proceso renderer (la web) puede ahora usar window.api.onToggleDragMode(...)
    onToggleDragMode: (callback) => {
        // Escucha el evento 'toggle-drag-mode' que enviamos desde main.js
        ipcRenderer.on('toggle-drag-mode', callback);
    },
    // El proceso renderer puede ahora llamar a window.api.setTransparent(...)
    setTransparent: (isTransparent) => {
        ipcRenderer.send('set-transparent', isTransparent);
    }
});