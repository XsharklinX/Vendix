import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  getUpdateState: () => ipcRenderer.invoke('vendix:get-update-state'),
  checkForUpdates: () => ipcRenderer.invoke('vendix:check-for-updates'),
  installUpdate: () => ipcRenderer.invoke('vendix:install-update'),
  setUpdateChannel: (channel: 'stable' | 'beta') => ipcRenderer.invoke('vendix:set-update-channel', channel),
  onUpdateState: (callback: (state: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: unknown) => callback(state)
    ipcRenderer.on('vendix:update-state', listener)
    return () => ipcRenderer.removeListener('vendix:update-state', listener)
  },
  getLogInfo: () => ipcRenderer.invoke('vendix:get-log-info'),
  getSyncConfig: () => ipcRenderer.invoke('vendix:get-sync-config'),
  saveSyncConfig: (config: unknown) => ipcRenderer.invoke('vendix:save-sync-config', config),
  openUserData: () => ipcRenderer.invoke('vendix:open-user-data'),
  openLogFile: () => ipcRenderer.invoke('vendix:open-log-file'),
})
