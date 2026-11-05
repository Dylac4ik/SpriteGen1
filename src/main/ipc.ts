import { app, BrowserWindow, clipboard, ClipboardItem, dialog, ipcMain, nativeImage, type IpcMainInvokeEvent } from 'electron';
import { promises as fs } from 'node:fs';
import { join, basename } from 'node:path';
import { AppError, fail, ok, type Result } from '@shared/errors';
import { IPC } from '@shared/ipc';
import type { AppInfo, ExportPngRequest, ExportSheetRequest, Preferences, ProjectData } from '@shared/types';
import { spriteImageSchema, exportScaleSchema, formatZodError } from '@shared/schemas';
import { normalizeImage } from '@core/image';
import { scaleNearestInteger } from '@core/resize';
import type { GenerationService } from '@backend/generation';
import type { ProviderService } from '@backend/providerService';
import type { PreferencesStore } from './preferences';
import type { SecretStore } from './secrets';
import { PROJECT_EXTENSION, readProjectFile, writeProjectFile } from './projectIo';
import { prepareSheetExport, prepareSpriteExport, type PreparedExport } from '@backend/exporter';
import { encodePng } from '@backend/png';
import { readFileIfExists, writeFileAtomic } from './fsUtil';

export interface IpcDeps {
  generation: GenerationService;
  providers: ProviderService;
  prefs: PreferencesStore;
  prefsWarning?: string;
  secrets: SecretStore;
  getWindow(): BrowserWindow | null;
  setDirty(dirty: boolean): void;
  isTrustedSender(event: Pick<IpcMainInvokeEvent, 'senderFrame'>): boolean;
  /** Test-only: when set, save/open dialogs are bypassed and files go to this folder. */
  e2eDir?: string;
}

function handle<A extends unknown[], R>(deps: IpcDeps, channel: string, fn: (event: IpcMainInvokeEvent, ...args: A) => Promise<R>): void {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!deps.isTrustedSender(event)) throw new Error('Untrusted IPC sender');
    return fn(event, ...(args as A));
  });
}

async function wrap<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return ok(await fn());
  } catch (e) {
    if (!(e instanceof AppError)) console.error('[spritegen]', e);
    return fail(e);
  }
}

export function registerIpc(deps: IpcDeps): void {
  const userData = app.getPath('userData');
  const autosavePath = join(userData, 'autosave.spritegen');
  const autosaveMetaPath = join(userData, 'autosave-meta.json');

  async function pickSavePath(defaultName: string, filters: Electron.FileFilter[]): Promise<string | null> {
    if (deps.e2eDir) {
      await fs.mkdir(deps.e2eDir, { recursive: true });
      return join(deps.e2eDir, defaultName);
    }
    const win = deps.getWindow();
    const opts: Electron.SaveDialogOptions = { defaultPath: defaultName, filters };
    const res = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts);
    return res.canceled || !res.filePath ? null : res.filePath;
  }

  async function writeExport(prep: PreparedExport): Promise<{ path: string; width: number; height: number } | null> {
    const path = await pickSavePath(prep.fileName, [{ name: 'PNG image', extensions: ['png'] }]);
    if (!path) return null;
    const finalPath = /\.png$/i.test(path) ? path : `${path}.png`;
    try {
      await writeFileAtomic(finalPath, prep.png);
    } catch (e) {
      throw new AppError('file_io', `Could not write ${basename(finalPath)}: ${(e as Error).message}`, { hint: 'Choose a folder you can write to.' });
    }
    return { path: finalPath, width: prep.image.width, height: prep.image.height };
  }

  handle(deps, IPC.appInfo, async (): Promise<AppInfo> => ({
    version: app.getVersion(),
    platform: process.platform,
    userDataPath: userData,
    secureStorage: { available: deps.secrets.canPersistSecurely(), backend: deps.secrets.backend() },
    e2e: !!deps.e2eDir,
  }));

  handle(deps, IPC.providersList, async () => deps.providers.list());
  handle(deps, IPC.providersSaveSettings, async (_e, id: string, settings: unknown) => wrap(() => deps.providers.saveSettings(String(id), settings)));
  handle(deps, IPC.providersSetKey, async (_e, id: string, key: unknown, persist: unknown) =>
    wrap(() => {
      if (key !== null && typeof key !== 'string') throw new AppError('invalid_input', 'API key must be text.');
      return deps.providers.setApiKey(String(id), key, persist !== false);
    }),
  );
  handle(deps, IPC.providersTest, async (_e, id: string) => wrap(async () => ({ message: await deps.providers.test(String(id)) })));

  handle(deps, IPC.generate, async (event, jobId: string, request: unknown) =>
    wrap(() =>
      deps.generation.run(String(jobId), request, (p) => {
        if (!event.sender.isDestroyed()) event.sender.send(IPC.progress, p);
      }),
    ),
  );
  handle(deps, IPC.cancel, async (_e, jobId: string) => {
    deps.generation.cancel(String(jobId));
  });

  handle(deps, IPC.prefsGet, async () => ({ prefs: deps.prefs.get(), warning: deps.prefsWarning }));
  handle(deps, IPC.prefsSet, async (_e, patch: Partial<Preferences>) => wrap(() => deps.prefs.update(patch && typeof patch === 'object' ? patch : {})));

  handle(deps, IPC.projectSave, async (_e, project: ProjectData, opts: { path: string | null; saveAs: boolean }) =>
    wrap(async () => {
      let path = !opts?.saveAs && typeof opts?.path === 'string' && opts.path ? opts.path : null;
      if (!path) {
        const safe = String(project?.name || 'Untitled').replace(/[^\w\- .()]+/g, '_') || 'Untitled';
        path = await pickSavePath(`${safe}.${PROJECT_EXTENSION}`, [{ name: 'SpriteGen project', extensions: [PROJECT_EXTENSION] }]);
        if (!path) return null;
        if (!path.toLowerCase().endsWith(`.${PROJECT_EXTENSION}`)) path = `${path}.${PROJECT_EXTENSION}`;
      }
      await writeProjectFile(path, project);
      return { path };
    }),
  );

  handle(deps, IPC.projectOpen, async () =>
    wrap(async () => {
      let path: string | null = null;
      if (deps.e2eDir) path = process.env.SPRITEGEN_E2E_OPEN ?? null;
      else {
        const win = deps.getWindow();
        const opts: Electron.OpenDialogOptions = {
          properties: ['openFile'],
          filters: [
            { name: 'SpriteGen project', extensions: [PROJECT_EXTENSION, 'json'] },
            { name: 'All files', extensions: ['*'] },
          ],
        };
        const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
        path = res.canceled ? null : (res.filePaths[0] ?? null);
      }
      if (!path) return null;
      return readProjectFile(path);
    }),
  );

  handle(deps, IPC.projectAutosave, async (_e, project: ProjectData, path: string | null) =>
    wrap(async () => {
      await writeProjectFile(autosavePath, project);
      await writeFileAtomic(autosaveMetaPath, JSON.stringify({ path: typeof path === 'string' ? path : null }));
    }),
  );

  handle(deps, IPC.projectLoadAutosave, async () =>
    wrap(async () => {
      const exists = await readFileIfExists(autosavePath);
      if (!exists) return null;
      let path: string | null = null;
      try {
        const meta = JSON.parse((await readFileIfExists(autosaveMetaPath))?.toString('utf8') ?? '{}');
        path = typeof meta.path === 'string' ? meta.path : null;
      } catch {
        path = null;
      }
      try {
        const opened = await readProjectFile(autosavePath);
        return { ...opened, path };
      } catch (e) {
        await fs.rename(autosavePath, `${autosavePath}.corrupt-${Date.now()}`).catch(() => undefined);
        throw e;
      }
    }),
  );

  handle(deps, IPC.exportPng, async (_e, req: ExportPngRequest) => wrap(async () => writeExport(prepareSpriteExport(req))));
  handle(deps, IPC.exportSheet, async (_e, req: ExportSheetRequest) => wrap(async () => writeExport(prepareSheetExport(req))));

  handle(deps, IPC.clipboardImage, async (_e, image: unknown, scale: unknown) =>
    wrap(async () => {
      const parsed = spriteImageSchema.safeParse(image);
      if (!parsed.success) throw new AppError('invalid_input', `Cannot copy: ${formatZodError(parsed.error)}`);
      const s = exportScaleSchema.safeParse(scale);
      if (!s.success) throw new AppError('invalid_input', 'Invalid clipboard scale.');
      const native = normalizeImage(parsed.data);
      const img = s.data === 1 ? native : scaleNearestInteger(native, s.data);
      const png = encodePng(img);
      // Electron < 44 exposes writeImage(NativeImage); Electron 44+ uses the async W3C-style write().
      const legacy = clipboard as unknown as { writeImage?: (i: Electron.NativeImage) => void };
      if (typeof legacy.writeImage === 'function') {
        const ni = nativeImage.createFromBuffer(Buffer.from(png));
        if (ni.isEmpty()) throw new AppError('unknown', 'The system could not create a clipboard image.');
        legacy.writeImage(ni);
      } else {
        await clipboard.write([new ClipboardItem({ 'image/png': new Blob([new Uint8Array(png)], { type: 'image/png' }) })]);
      }
      return { width: img.width, height: img.height };
    }),
  );

  ipcMain.on(IPC.nativeEdit, (event, action: unknown) => {
    if (!deps.isTrustedSender(event)) return;
    if (action === 'undo') event.sender.undo();
    else if (action === 'redo') event.sender.redo();
  });
  ipcMain.on(IPC.setDirty, (event, dirty: unknown) => {
    if (deps.isTrustedSender(event)) deps.setDirty(dirty === true);
  });
}
