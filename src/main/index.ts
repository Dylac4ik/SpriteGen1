import { app, BrowserWindow, dialog, Menu, net, safeStorage, shell } from 'electron';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createDefaultRegistry } from './providers/registry';
import { ProviderService } from './providerService';
import { GenerationService } from './generation';
import { PreferencesStore } from './preferences';
import { SecretStore } from './secrets';
import { registerIpc } from './ipc';
import { buildMenu } from './menu';
import type { FetchLike } from './providers/types';

const isDev = !app.isPackaged && !!process.env.ELECTRON_RENDERER_URL;

// Test isolation: E2E runs use a throwaway profile directory.
if (process.env.SPRITEGEN_USER_DATA) app.setPath('userData', resolve(process.env.SPRITEGEN_USER_DATA));

let mainWindow: BrowserWindow | null = null;

function rendererUrl(): string {
  if (isDev) return process.env.ELECTRON_RENDERER_URL!;
  return pathToFileURL(join(__dirname, '../renderer/index.html')).toString();
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1100,
    minHeight: 680,
    show: false,
    backgroundColor: '#16171d',
    title: 'SpriteGen',
    autoHideMenuBar: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow?.webContents.getURL()) event.preventDefault();
  });
  // Renderer cancels unload (beforeunload) when there are unsaved changes; confirm natively.
  mainWindow.webContents.on('will-prevent-unload', (event) => {
    if (!mainWindow) return;
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'question',
      buttons: ['Quit without saving', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      title: 'Unsaved changes',
      message: 'This project has unsaved changes.',
      detail: 'Your session is autosaved and will be restored next time, but the project file has not been saved.',
    });
    if (choice === 0) event.preventDefault();
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  void mainWindow.loadURL(rendererUrl());
}

app.whenReady().then(async () => {
  const userData = app.getPath('userData');
  const prefs = new PreferencesStore(join(userData, 'preferences.json'));
  const { warning } = await prefs.load();
  const secrets = new SecretStore(join(userData, 'secrets.json'), safeStorage);
  // Chromium's network stack: honors system proxy settings and certificates.
  const fetchImpl: FetchLike = (url, init) => net.fetch(url, init as RequestInit);
  const providers = new ProviderService({
    registry: createDefaultRegistry(),
    secrets,
    getPrefs: () => prefs.get(),
    updatePrefs: (patch) => prefs.update(patch),
    fetch: fetchImpl,
  });
  const generation = new GenerationService(providers, fetchImpl);
  const expectedOrigin = isDev ? new URL(process.env.ELECTRON_RENDERER_URL!).origin : 'file://';

  registerIpc({
    generation,
    providers,
    prefs,
    prefsWarning: warning,
    secrets,
    getWindow: () => mainWindow,
    // Shows the "edited" dot in the macOS title bar; unsaved-change confirmation uses will-prevent-unload.
    setDirty: (d) => mainWindow?.setDocumentEdited?.(d),
    isTrustedSender: (event) => {
      const url = event.senderFrame?.url ?? '';
      return expectedOrigin === 'file://' ? url.startsWith('file://') : url.startsWith(expectedOrigin);
    },
    e2eDir: process.env.SPRITEGEN_E2E_DIR ? resolve(process.env.SPRITEGEN_E2E_DIR) : undefined,
  });

  Menu.setApplicationMenu(buildMenu(() => mainWindow, isDev));
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

