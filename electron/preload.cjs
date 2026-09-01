const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("aiangDesktop", {
  isDesktop: true,
  frameless: true,
  minimize: () => ipcRenderer.invoke("desktop:window", "minimize"),
  maximize: () => ipcRenderer.invoke("desktop:window", "maximize"),
  close: () => ipcRenderer.invoke("desktop:window", "close"),
  isMaximized: () => ipcRenderer.invoke("desktop:isMaximized"),
})
