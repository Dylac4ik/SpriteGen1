import { normalizeImage } from '@core/image';
import { scaleNearestInteger } from '@core/resize';
import { AppError, fail, ok, type Result } from '@shared/errors';
import type { SpriteGenApi } from '@shared/ipc';
import type { AppInfo, GenerationProgress, OpenedProject, Preferences, ProjectData } from '@shared/types';
import { exportScaleSchema, formatZodError, spriteImageSchema } from '@shared/schemas';
import { GenerationService } from '@backend/generation';
import { ProviderService } from '@backend/providerService';
import { createDefaultRegistry } from '@backend/providers/registry';
import { defaultPreferences, sanitizePreferences } from '@backend/preferences';
import { PROJECT_EXTENSION, parseProject, serializeProject } from '@backend/project';
import { prepareSheetExport, prepareSpriteExport, type PreparedExport } from '@backend/exporter';
import { encodePng } from '@backend/png';
import type { MobilePlatform, StoredFileInfo } from './types';

export const PREFS_KEY = 'spritegen.preferences';
export const AUTOSAVE_FILE = 'autosave.spritegen';
export const AUTOSAVE_META_KEY = 'spritegen.autosave-meta';
export const PROJECTS_DIR = 'projects';

export interface StoredProject {
  id: string; // file name inside PROJECTS_DIR
  name: string;
  size: number;
  modified: number;
}

/** Mobile-only operations beyond the shared SpriteGenApi (project library). */
export interface MobileExtras {
  platform: MobilePlatform;
  listProjects(): Promise<Result<StoredProject[]>>;
  openStoredProject(id: string): Promise<Result<OpenedProject>>;
  deleteStoredProject(id: string): Promise<Result<void>>;
  /** Shares the current project as a .spritegen file (backup / move to another device). */
  shareProject(project: ProjectData): Promise<Result<boolean>>;
  /** Writes the autosave immediately (called when the app goes to the background). */
  flushAutosave(project: ProjectData, path: string | null): Promise<void>;
}

export type MobileApi = SpriteGenApi & MobileExtras;

/** File-system-safe project file name that still reads as the project name. */
export function projectFileName(name: string): string {
  const base = name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/^\.+/, '').trim().slice(0, 80) || 'Untitled';
  return `${base}.${PROJECT_EXTENSION}`;
}

function isProjectId(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0 && id.length <= 120 && !/[\\/]/.test(id) && !id.startsWith('.') && id.endsWith(`.${PROJECT_EXTENSION}`);
}

async function wrap<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return ok(await fn());
  } catch (e) {
    if (!(e instanceof AppError)) console.error('[spritegen]', e);
    return fail(e);
  }
}

/**
 * Runs the same backend as the desktop main process (providers, generation, conversion,
 * validation, project codec, export) directly inside the mobile app, behind the same
 * SpriteGenApi contract the shared UI store uses.
 */
export async function createMobileBackend(platform: MobilePlatform): Promise<MobileApi> {
  let prefs: Preferences = defaultPreferences();
  let prefsWarning: string | undefined;
  const raw = await platform.kv.get(PREFS_KEY);
  if (raw) {
    try {
      prefs = sanitizePreferences(JSON.parse(raw));
    } catch {
      prefsWarning = 'Saved preferences were unreadable and have been reset.';
      await platform.kv.remove(PREFS_KEY);
    }
  }
  const updatePrefs = async (patch: Partial<Preferences>) => {
    prefs = sanitizePreferences({ ...prefs, ...(patch && typeof patch === 'object' ? patch : {}) });
    await platform.kv.set(PREFS_KEY, JSON.stringify(prefs));
    return prefs;
  };

  const providers = new ProviderService({
    registry: createDefaultRegistry(),
    secrets: platform.secrets,
    getPrefs: () => prefs,
    updatePrefs,
    fetch: platform.fetch,
  });
  const generation = new GenerationService(providers, platform.fetch);
  const progressListeners = new Set<(p: GenerationProgress) => void>();

  const share = async (prep: PreparedExport) => {
    const outcome = await platform.shareFile(prep.fileName, prep.png, 'image/png');
    if (outcome === 'cancelled') return null;
    return { path: outcome === 'shared' ? `${prep.fileName} (shared)` : `${prep.fileName} (downloaded)`, width: prep.image.width, height: prep.image.height };
  };

  const readStored = async (path: string, id: string): Promise<OpenedProject> => {
    const text = await platform.files.read(path);
    if (text === null) throw new AppError('file_io', `Project "${id}" was not found.`);
    const { project, warnings } = parseProject(text);
    return { project, path: id, warnings };
  };

  const api: MobileApi = {
    platform,

    async getAppInfo(): Promise<AppInfo> {
      return {
        version: await platform.appVersion(),
        platform: platform.name,
        userDataPath: platform.isNative ? 'App-private storage on this device' : 'This browser (IndexedDB / localStorage)',
        secureStorage: { available: platform.secrets.canPersistSecurely(), backend: platform.secrets.backend() },
        e2e: false,
      };
    },
    listProviders: () => providers.list(),
    saveProviderSettings: (id, settings) => wrap(() => providers.saveSettings(String(id), settings)),
    setApiKey: (id, key, persist) =>
      wrap(() => {
        if (key !== null && typeof key !== 'string') throw new AppError('invalid_input', 'API key must be text.');
        return providers.setApiKey(String(id), key, persist !== false);
      }),
    testProvider: (id) => wrap(async () => ({ message: await providers.test(String(id)) })),
    generate: (jobId, request) => wrap(() => generation.run(String(jobId), request, (p) => progressListeners.forEach((cb) => cb(p)))),
    async cancelGeneration(jobId) {
      generation.cancel(String(jobId));
    },
    onGenerationProgress(cb) {
      progressListeners.add(cb);
      return () => progressListeners.delete(cb);
    },
    async getPreferences() {
      return { prefs, warning: prefsWarning };
    },
    setPreferences: (patch) => wrap(() => updatePrefs(patch)),

    saveProject: (project, opts) =>
      wrap(async () => {
        const current = !opts.saveAs && isProjectId(opts.path) ? opts.path : null;
        const wanted = projectFileName(opts.saveAs ? `${project.name} copy` : project.name);
        let id = wanted;
        if (id !== current) {
          // New file name (first save, rename or copy): never overwrite a different project.
          const taken = new Set((await platform.files.list(PROJECTS_DIR)).map((f) => f.name));
          const base = wanted.slice(0, -(PROJECT_EXTENSION.length + 1));
          for (let i = 2; taken.has(id); i++) id = projectFileName(`${base} ${i}`);
        }
        await platform.files.write(`${PROJECTS_DIR}/${id}`, serializeProject(project));
        if (current && current !== id) await platform.files.remove(`${PROJECTS_DIR}/${current}`); // renamed
        return { path: id };
      }),
    openProject: () =>
      wrap(async () => {
        const picked = await platform.pickTextFile(`.${PROJECT_EXTENSION},application/json`);
        if (!picked) return null;
        const { project, warnings } = parseProject(picked.text);
        // Imported files are not linked to app storage until saved.
        return { project: { ...project, name: picked.name.replace(/\.[^.]+$/, '') || project.name }, path: null, warnings };
      }),
    autosaveProject: (project, path) =>
      wrap(async () => {
        await platform.files.write(AUTOSAVE_FILE, serializeProject(project));
        await platform.kv.set(AUTOSAVE_META_KEY, JSON.stringify({ path: isProjectId(path) ? path : null }));
      }),
    loadAutosave: () =>
      wrap(async () => {
        const text = await platform.files.read(AUTOSAVE_FILE);
        if (text === null) return null;
        let path: string | null = null;
        try {
          const meta = JSON.parse((await platform.kv.get(AUTOSAVE_META_KEY)) ?? '{}');
          path = isProjectId(meta.path) ? meta.path : null;
        } catch {
          path = null;
        }
        try {
          const { project, warnings } = parseProject(text);
          return { project, path, warnings };
        } catch (e) {
          await platform.files.remove(AUTOSAVE_FILE);
          throw e;
        }
      }),
    exportPng: (req) => wrap(async () => share(prepareSpriteExport(req))),
    exportSpriteSheet: (req) => wrap(async () => share(prepareSheetExport(req))),
    copyImage: (image, scale) =>
      wrap(async () => {
        const parsed = spriteImageSchema.safeParse(image);
        if (!parsed.success) throw new AppError('invalid_input', `Cannot copy: ${formatZodError(parsed.error)}`);
        const s = exportScaleSchema.safeParse(scale);
        if (!s.success) throw new AppError('invalid_input', 'Invalid clipboard scale.');
        const native = normalizeImage(parsed.data);
        const img = s.data === 1 ? native : scaleNearestInteger(native, s.data);
        await platform.copyPng(encodePng(img));
        return { width: img.width, height: img.height };
      }),
    onMenuCommand: () => () => undefined, // no native menus on mobile
    nativeEdit(action) {
      document.execCommand(action);
    },
    setDirty: () => undefined,

    listProjects: () =>
      wrap(async () => {
        const files: StoredFileInfo[] = await platform.files.list(PROJECTS_DIR);
        return files
          .filter((f) => isProjectId(f.name))
          .map((f) => ({ id: f.name, name: f.name.replace(new RegExp(`\\.${PROJECT_EXTENSION}$`), ''), size: f.size, modified: f.mtime }))
          .sort((a, b) => b.modified - a.modified);
      }),
    openStoredProject: (id) =>
      wrap(async () => {
        if (!isProjectId(id)) throw new AppError('invalid_input', 'Invalid project id.');
        return readStored(`${PROJECTS_DIR}/${id}`, id);
      }),
    deleteStoredProject: (id) =>
      wrap(async () => {
        if (!isProjectId(id)) throw new AppError('invalid_input', 'Invalid project id.');
        await platform.files.remove(`${PROJECTS_DIR}/${id}`);
      }),
    shareProject: (project) =>
      wrap(async () => {
        const outcome = await platform.shareFile(projectFileName(project.name), new TextEncoder().encode(serializeProject(project)), 'application/json');
        return outcome !== 'cancelled';
      }),
    async flushAutosave(project, path) {
      if (!prefs.autosave) return;
      await api.autosaveProject(project, path);
    },
  };
  return api;
}
