import type { Result } from './errors';
import type {
  AppInfo,
  ExportPngRequest,
  ExportResult,
  ExportSheetRequest,
  GenerationProgress,
  GenerationRequest,
  GenerationResult,
  MenuCommand,
  OpenedProject,
  Preferences,
  ProjectData,
  ProviderDescriptor,
  WireImage,
} from './types';
import type { ParamValues } from '@core/params';

export const IPC = {
  appInfo: 'app:info',
  providersList: 'providers:list',
  providersSaveSettings: 'providers:save-settings',
  providersSetKey: 'providers:set-key',
  providersTest: 'providers:test',
  generate: 'generation:start',
  cancel: 'generation:cancel',
  progress: 'generation:progress',
  prefsGet: 'prefs:get',
  prefsSet: 'prefs:set',
  projectSave: 'project:save',
  projectOpen: 'project:open',
  projectAutosave: 'project:autosave',
  projectLoadAutosave: 'project:load-autosave',
  exportPng: 'export:png',
  exportSheet: 'export:sheet',
  clipboardImage: 'clipboard:image',
  menuCommand: 'menu:command',
  nativeEdit: 'edit:native',
  setDirty: 'app:set-dirty',
} as const;

/** API exposed to the renderer by the preload script as `window.spriteGen`. */
export interface SpriteGenApi {
  getAppInfo(): Promise<AppInfo>;
  listProviders(): Promise<ProviderDescriptor[]>;
  saveProviderSettings(providerId: string, settings: ParamValues): Promise<Result<ProviderDescriptor>>;
  /** key === null removes the stored key. persist=false keeps it in memory for this session only. */
  setApiKey(providerId: string, key: string | null, persist: boolean): Promise<Result<ProviderDescriptor>>;
  testProvider(providerId: string): Promise<Result<{ message: string }>>;
  generate(jobId: string, request: GenerationRequest): Promise<Result<GenerationResult>>;
  cancelGeneration(jobId: string): Promise<void>;
  onGenerationProgress(cb: (p: GenerationProgress) => void): () => void;
  getPreferences(): Promise<{ prefs: Preferences; warning?: string }>;
  setPreferences(patch: Partial<Preferences>): Promise<Result<Preferences>>;
  saveProject(project: ProjectData, opts: { path: string | null; saveAs: boolean }): Promise<Result<{ path: string } | null>>;
  openProject(): Promise<Result<OpenedProject | null>>;
  autosaveProject(project: ProjectData, path: string | null): Promise<Result<void>>;
  loadAutosave(): Promise<Result<OpenedProject | null>>;
  exportPng(req: ExportPngRequest): Promise<Result<ExportResult | null>>;
  exportSpriteSheet(req: ExportSheetRequest): Promise<Result<ExportResult | null>>;
  copyImage(image: WireImage, scale: number): Promise<Result<{ width: number; height: number }>>;
  onMenuCommand(cb: (cmd: MenuCommand) => void): () => void;
  nativeEdit(action: 'undo' | 'redo'): void;
  /** Tells main whether there are unsaved changes (used to confirm before closing). */
  setDirty(dirty: boolean): void;
}
