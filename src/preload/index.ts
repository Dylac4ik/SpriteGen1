import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type SpriteGenApi } from '@shared/ipc';
import type { GenerationProgress, MenuCommand } from '@shared/types';

/**
 * The only surface the (sandboxed, context-isolated) renderer can use. No Node APIs,
 * no filesystem and no secrets are exposed; API keys never travel to the renderer.
 */
const api: SpriteGenApi = {
  getAppInfo: () => ipcRenderer.invoke(IPC.appInfo),
  listProviders: () => ipcRenderer.invoke(IPC.providersList),
  saveProviderSettings: (id, settings) => ipcRenderer.invoke(IPC.providersSaveSettings, id, settings),
  setApiKey: (id, key, persist) => ipcRenderer.invoke(IPC.providersSetKey, id, key, persist),
  testProvider: (id) => ipcRenderer.invoke(IPC.providersTest, id),
  generate: (jobId, request) => ipcRenderer.invoke(IPC.generate, jobId, request),
  cancelGeneration: (jobId) => ipcRenderer.invoke(IPC.cancel, jobId),
  onGenerationProgress: (cb) => {
    const listener = (_e: unknown, p: GenerationProgress) => cb(p);
    ipcRenderer.on(IPC.progress, listener);
    return () => ipcRenderer.removeListener(IPC.progress, listener);
  },
  getPreferences: () => ipcRenderer.invoke(IPC.prefsGet),
  setPreferences: (patch) => ipcRenderer.invoke(IPC.prefsSet, patch),
  saveProject: (project, opts) => ipcRenderer.invoke(IPC.projectSave, project, opts),
  openProject: () => ipcRenderer.invoke(IPC.projectOpen),
  autosaveProject: (project, path) => ipcRenderer.invoke(IPC.projectAutosave, project, path),
  loadAutosave: () => ipcRenderer.invoke(IPC.projectLoadAutosave),
  exportPng: (req) => ipcRenderer.invoke(IPC.exportPng, req),
  exportSpriteSheet: (req) => ipcRenderer.invoke(IPC.exportSheet, req),
  copyImage: (image, scale) => ipcRenderer.invoke(IPC.clipboardImage, image, scale),
  onMenuCommand: (cb) => {
    const listener = (_e: unknown, cmd: MenuCommand) => cb(cmd);
    ipcRenderer.on(IPC.menuCommand, listener);
    return () => ipcRenderer.removeListener(IPC.menuCommand, listener);
  },
  nativeEdit: (action) => ipcRenderer.send(IPC.nativeEdit, action),
  setDirty: (dirty) => ipcRenderer.send(IPC.setDirty, dirty),
};

contextBridge.exposeInMainWorld('spriteGen', api);
