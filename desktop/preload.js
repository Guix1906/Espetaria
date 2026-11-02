// Só o site do Ponto recebe esta ponte, e ela só sabe mostrar ou esconder o WhatsApp.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pontoDesktop', {
  showWhatsApp: (visible) => ipcRenderer.send('ponto:show-whatsapp', visible === true),
});
