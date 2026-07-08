"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    platform: process.platform,
    getUpdateState: () => electron_1.ipcRenderer.invoke('vendix:get-update-state'),
    checkForUpdates: () => electron_1.ipcRenderer.invoke('vendix:check-for-updates'),
    installUpdate: () => electron_1.ipcRenderer.invoke('vendix:install-update'),
    setUpdateChannel: (channel) => electron_1.ipcRenderer.invoke('vendix:set-update-channel', channel),
    onUpdateState: (callback) => {
        const listener = (_event, state) => callback(state);
        electron_1.ipcRenderer.on('vendix:update-state', listener);
        return () => electron_1.ipcRenderer.removeListener('vendix:update-state', listener);
    },
    getLogInfo: () => electron_1.ipcRenderer.invoke('vendix:get-log-info'),
    getSyncConfig: () => electron_1.ipcRenderer.invoke('vendix:get-sync-config'),
    saveSyncConfig: (config) => electron_1.ipcRenderer.invoke('vendix:save-sync-config', config),
    openUserData: () => electron_1.ipcRenderer.invoke('vendix:open-user-data'),
    openLogFile: () => electron_1.ipcRenderer.invoke('vendix:open-log-file'),
});
