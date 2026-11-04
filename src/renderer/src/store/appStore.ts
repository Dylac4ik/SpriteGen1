import { create } from 'zustand';
import type { RgbaImage } from '@core/image';
import type { Rgba } from '@core/color';
import { SpriteSize } from '@core/sizes';
import { defaultParams, sanitizeParams, type ParamValues } from '@core/params';
import { DEFAULT_CONVERSION, type ConversionSettings } from '@core/pixelize';
import { DEFAULT_TECHNICAL, type TechnicalToggles } from '@core/prompt/compose';
import { analyzePrompt, type PromptAnalysis } from '@core/prompt/analyze';
import { applyPipeline } from '@core/pipeline';
import { createFilterStep, sanitizeFilterStep, type FilterStep, type FilterType } from '@core/filters';
import { randomSeed } from '@core/random';
import type { AppErrorInfo } from '@shared/errors';
import type {
  AppInfo,
  FilterPreset,
  GenerationProgress,
  GenerationRecord,
  GenerationRequest,
  Preferences,
  ProjectData,
  ProviderDescriptor,
  VariationRecord,
} from '@shared/types';
import { api } from '../api';
import { basenameNoExt, slugify, uid } from '../util';
import { commitChange, emptyHistory, redoChange, sealHistory, undoChange, type DocHistory, type DocSnapshot } from './docHistory';

export type Tool = 'pencil' | 'eraser' | 'picker' | 'fill';
export type RightTab = 'analysis' | 'filters' | 'properties';

export interface FormState {
  prompt: string;
  negativePrompt: string;
  size: SpriteSize;
  transparent: boolean;
  seed: number;
  randomizeSeed: boolean;
  variations: number;
  /** Generation params per provider id. */
  params: Record<string, ParamValues>;
  technical: TechnicalToggles;
  conversion: ConversionSettings;
}

export interface Toast {
  id: string;
  kind: 'info' | 'success' | 'warning' | 'error';
  message: string;
  detail?: string;
}

export type Dialog =
  | { kind: 'export'; mode: 'sprite' | 'sheet' }
  | { kind: 'settings'; tab: 'providers' | 'preferences'; providerId?: string }
  | { kind: 'style-warning'; analysis: PromptAnalysis }
  | { kind: 'confirm'; title: string; message: string; confirmLabel: string; danger?: boolean; onConfirm: () => void };

export interface JobState {
  id: string;
  progress: GenerationProgress | null;
  startedAt: number;
  providerName: string;
  isMock: boolean;
}

export interface ProjectState {
  name: string;
  path: string | null;
  createdAt: string;
  dirty: boolean;
  history: GenerationRecord[];
}

export interface Selection {
  recordId: string;
  variationId: string;
}

export interface EditorState {
  tool: Tool;
  color: Rgba;
  zoom: number;
  showGrid: boolean;
  compare: boolean;
  compareSplit: number;
  showFilters: boolean;
  /** Incremented to ask the canvas to recompute "fit" zoom. */
  fitRequest: number;
  hover: { x: number; y: number; rgba: Rgba } | null;
}

export interface AppState {
  ready: boolean;
  appInfo: AppInfo | null;
  providers: ProviderDescriptor[];
  providerId: string;
  form: FormState;
  rejectedSuggestions: string[];
  job: JobState | null;
  lastError: AppErrorInfo | null;
  lastWarnings: string[];
  project: ProjectState;
  selection: Selection | null;
  docs: Record<string, DocHistory>;
  editor: EditorState;
  prefs: Preferences | null;
  toasts: Toast[];
  dialog: Dialog | null;
  rightTab: RightTab;
  promptFocusRequest: number;

  init(): Promise<void>;
  setForm(patch: Partial<FormState>): void;
  setProviderParam(key: string, value: number | string | boolean): void;
  setProvider(id: string): void;
  refreshProviders(): Promise<void>;
  generate(opts?: { skipStyleCheck?: boolean }): Promise<void>;
  cancelGeneration(): void;
  dismissError(): void;
  rejectSuggestion(id: string): void;
  restoreSuggestions(): void;

  select(recordId: string, variationId?: string): void;
  reopenRecord(recordId: string): void;
  regenerate(recordId: string): Promise<void>;
  deleteRecord(recordId: string): void;

  /** Low-level variation update with undo support. */
  updateDoc(fn: (doc: DocSnapshot) => DocSnapshot, key?: string | null): void;
  /** Updates `current` without recording undo (used during a brush stroke). */
  setCurrentTransient(img: RgbaImage): void;
  /** Records an undo point for a finished brush stroke. */
  commitStroke(before: DocSnapshot): void;
  undo(): void;
  redo(): void;
  resetToOriginal(): void;
  bakeFilters(): void;
  addFilter(type: FilterType): void;
  updateFilterParam(stepId: string, key: string, value: number | string | boolean): void;
  toggleFilter(stepId: string): void;
  moveFilter(stepId: string, dir: -1 | 1): void;
  removeFilter(stepId: string): void;
  clearFilters(): void;

  savePreset(name: string): void;
  renamePreset(id: string, name: string): void;
  deletePreset(id: string): void;
  movePreset(id: string, dir: -1 | 1): void;
  applyPreset(id: string, mode: 'replace' | 'append'): void;

  setEditor(patch: Partial<EditorState>): void;
  setRightTab(tab: RightTab): void;
  focusPrompt(): void;
  openDialog(d: Dialog): void;
  closeDialog(): void;
  toast(kind: Toast['kind'], message: string, detail?: string): void;
  dismissToast(id: string): void;

  newProject(force?: boolean): void;
  saveProject(saveAs?: boolean): Promise<void>;
  openProject(force?: boolean): Promise<void>;
  updatePrefs(patch: Partial<Preferences>): Promise<void>;
  saveProviderSettings(id: string, settings: ParamValues): Promise<boolean>;
  setApiKey(id: string, key: string | null, persist: boolean): Promise<boolean>;
  testProvider(id: string): Promise<{ ok: boolean; message: string; hint?: string }>;

  exportSprite(opts: { scale: number; includeFilters: boolean }): Promise<void>;
  exportSheet(opts: { scale: number; includeFilters: boolean; columns: number }): Promise<void>;
  copySprite(opts: { scale: number; includeFilters: boolean }): Promise<void>;
}

const now = () => new Date().toISOString();

function emptyProject(): ProjectState {
  return { name: 'Untitled', path: null, createdAt: now(), dirty: false, history: [] };
}

function defaultForm(): FormState {
  return {
    prompt: '',
    negativePrompt: '',
    size: 32,
    transparent: true,
    seed: randomSeed(),
    randomizeSeed: true,
    variations: 4,
    params: {},
    technical: { ...DEFAULT_TECHNICAL },
    conversion: { ...DEFAULT_CONVERSION },
  };
}

export function findSelected(state: Pick<AppState, 'project' | 'selection'>): { record: GenerationRecord; variation: VariationRecord } | null {
  const sel = state.selection;
  if (!sel) return null;
  const record = state.project.history.find((r) => r.id === sel.recordId);
  const variation = record?.variations.find((v) => v.id === sel.variationId);
  return record && variation ? { record, variation } : null;
}

export function currentProvider(state: Pick<AppState, 'providers' | 'providerId'>): ProviderDescriptor | undefined {
  return state.providers.find((p) => p.id === state.providerId) ?? state.providers[0];
}

/** Generation params for the active provider, filled with defaults and sanitized. */
export function providerParams(state: Pick<AppState, 'providers' | 'providerId' | 'form'>): ParamValues {
  const p = currentProvider(state);
  if (!p) return {};
  const specs = p.capabilities.generationParams;
  return sanitizeParams(specs, { ...defaultParams(specs), ...(state.form.params[p.id] ?? {}) });
}

export function toProjectData(p: ProjectState): ProjectData {
  return { name: p.name, createdAt: p.createdAt, updatedAt: now(), history: p.history };
}

export function suggestedFileName(record: GenerationRecord, variation: VariationRecord): string {
  const words = record.request.prompt.split(/\s+/).slice(0, 4).join(' ');
  const seed = variation.seed !== null ? `-seed${variation.seed}` : `-v${variation.index + 1}`;
  return `${slugify(words)}-${record.request.size}x${record.request.size}${seed}`;
}

export function compositeImage(v: VariationRecord, includeFilters: boolean): RgbaImage {
  return includeFilters ? applyPipeline(v.current, v.pipeline) : v.current;
}

function mapVariation(project: ProjectState, sel: Selection, fn: (v: VariationRecord) => VariationRecord): ProjectState {
  return {
    ...project,
    dirty: true,
    history: project.history.map((r) =>
      r.id !== sel.recordId ? r : { ...r, variations: r.variations.map((v) => (v.id === sel.variationId ? fn(v) : v)) },
    ),
  };
}

let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
let initStarted = false;
let prefsTimer: ReturnType<typeof setTimeout> | null = null;

export const useApp = create<AppState>()((set, get) => {
  const toast = (kind: Toast['kind'], message: string, detail?: string) => {
    const id = uid();
    set((s) => ({ toasts: [...s.toasts.slice(-4), { id, kind, message, detail }] }));
    if (kind !== 'error') setTimeout(() => get().dismissToast(id), kind === 'warning' ? 8000 : 4500);
  };

  const scheduleAutosave = () => {
    const s = get();
    if (!s.prefs?.autosave) return;
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(async () => {
      const st = get();
      const res = await api().autosaveProject(toProjectData(st.project), st.project.path);
      if (!res.ok) console.warn('Autosave failed', res.error);
    }, 1500);
  };

  /** Persists form defaults (size, variations, provider...) as user preferences. */
  const schedulePrefsFromForm = () => {
    if (prefsTimer) clearTimeout(prefsTimer);
    prefsTimer = setTimeout(() => {
      const s = get();
      if (!s.prefs) return;
      void get().updatePrefs({
        providerId: s.providerId,
        defaults: { size: s.form.size, variations: s.form.variations, transparent: s.form.transparent, technical: s.form.technical, conversion: s.form.conversion },
      });
    }, 800);
  };

  const setProject = (project: ProjectState) => {
    set({ project });
    api().setDirty(project.dirty);
    scheduleAutosave();
  };

  const applyDoc = (next: DocSnapshot, history: DocHistory) => {
    const s = get();
    if (!s.selection) return;
    const sel = s.selection;
    set({ docs: { ...s.docs, [sel.variationId]: history } });
    setProject(mapVariation(s.project, sel, (v) => ({ ...v, current: next.current, pipeline: next.pipeline })));
  };

  const loadOpened = (project: ProjectData, path: string | null, dirty: boolean) => {
    const first = project.history[0];
    set({
      docs: {},
      selection: first ? { recordId: first.id, variationId: first.variations[0].id } : null,
      editor: { ...get().editor, fitRequest: get().editor.fitRequest + 1 },
    });
    setProject({ name: path ? basenameNoExt(path) : project.name || 'Untitled', path, createdAt: project.createdAt, dirty, history: project.history });
  };

  return {
    ready: false,
    appInfo: null,
    providers: [],
    providerId: 'mock',
    form: defaultForm(),
    rejectedSuggestions: [],
    job: null,
    lastError: null,
    lastWarnings: [],
    project: emptyProject(),
    selection: null,
    docs: {},
    editor: {
      tool: 'pencil',
      color: [26, 28, 44, 255],
      zoom: 8,
      showGrid: true,
      compare: false,
      compareSplit: 50,
      showFilters: true,
      fitRequest: 0,
      hover: null,
    },
    prefs: null,
    toasts: [],
    dialog: null,
    rightTab: 'analysis',
    promptFocusRequest: 0,

    async init() {
      if (initStarted) return; // React StrictMode mounts effects twice in development
      initStarted = true;
      const a = api();
      a.onGenerationProgress((p) => {
        const job = get().job;
        if (job && job.id === p.jobId) set({ job: { ...job, progress: p } });
      });
      const [appInfo, providers, prefsRes] = await Promise.all([a.getAppInfo(), a.listProviders(), a.getPreferences()]);
      const prefs = prefsRes.prefs;
      const providerId = providers.some((p) => p.id === prefs.providerId) ? prefs.providerId : 'mock';
      set({
        appInfo,
        providers,
        prefs,
        providerId,
        form: {
          ...get().form,
          size: prefs.defaults.size,
          variations: prefs.defaults.variations,
          transparent: prefs.defaults.transparent,
          technical: { ...prefs.defaults.technical },
          conversion: { ...prefs.defaults.conversion },
        },
        editor: { ...get().editor, showGrid: prefs.editor.showGrid },
      });
      if (prefsRes.warning) toast('warning', prefsRes.warning);
      if (prefs.autosave && !appInfo.e2e) {
        const restored = await a.loadAutosave();
        if (!restored.ok) toast('warning', 'The autosaved session could not be restored.', restored.error.message);
        else if (restored.value && restored.value.project.history.length > 0) {
          loadOpened(restored.value.project, restored.value.path, restored.value.path === null);
          toast('info', `Restored your previous session (${restored.value.project.history.length} generation${restored.value.project.history.length === 1 ? '' : 's'}).`);
        }
      }
      window.addEventListener('beforeunload', (e) => {
        if (get().project.dirty) {
          e.preventDefault();
          e.returnValue = '';
        }
      });
      set({ ready: true });
    },

    setForm(patch) {
      set((s) => ({ form: { ...s.form, ...patch } }));
      if ('size' in patch || 'variations' in patch || 'transparent' in patch || 'technical' in patch || 'conversion' in patch) schedulePrefsFromForm();
    },

    setProviderParam(key, value) {
      const s = get();
      const id = s.providerId;
      set({ form: { ...s.form, params: { ...s.form.params, [id]: { ...(s.form.params[id] ?? {}), [key]: value } } } });
    },

    setProvider(id) {
      set({ providerId: id, lastError: null });
      schedulePrefsFromForm();
    },

    async refreshProviders() {
      set({ providers: await api().listProviders() });
    },

    async generate(opts = {}) {
      const s = get();
      if (s.job) return;
      const provider = currentProvider(s);
      if (!provider) {
        toast('error', 'No generation provider is available.');
        return;
      }
      const analysis = analyzePrompt({ prompt: s.form.prompt, negativePrompt: s.form.negativePrompt, size: s.form.size, transparent: s.form.transparent });
      if (analysis.hasErrors) {
        const first = analysis.issues.find((i) => i.severity === 'error')!;
        set({ lastError: { code: 'invalid_input', message: first.message, hint: 'See the Prompt analysis panel for details.' }, rightTab: 'analysis' });
        return;
      }
      if (!opts.skipStyleCheck && analysis.needsStyleConfirmation) {
        set({ dialog: { kind: 'style-warning', analysis }, rightTab: 'analysis' });
        return;
      }
      if (provider.requiresApiKey && !provider.apiKey.present) {
        set({
          lastError: {
            code: 'missing_credentials',
            message: `${provider.displayName} needs an API key.`,
            hint: `Add one in Settings → Providers${provider.apiKey.envVar ? ` or set the ${provider.apiKey.envVar} environment variable` : ''}, or switch to the Mock provider.`,
          },
        });
        return;
      }
      const seed = s.form.randomizeSeed ? randomSeed() : s.form.seed;
      const request: GenerationRequest = {
        providerId: provider.id,
        prompt: s.form.prompt,
        negativePrompt: s.form.negativePrompt,
        size: s.form.size,
        transparent: s.form.transparent,
        seed,
        variations: Math.min(s.form.variations, provider.capabilities.maxVariations),
        params: providerParams(s),
        technical: s.form.technical,
        conversion: s.form.conversion,
      };
      const jobId = uid();
      set({
        form: { ...s.form, seed },
        job: { id: jobId, progress: null, startedAt: Date.now(), providerName: provider.displayName, isMock: provider.isMock },
        lastError: null,
        lastWarnings: [],
      });
      let res;
      try {
        res = await api().generate(jobId, request);
      } catch (e) {
        res = { ok: false as const, error: { code: 'unknown' as const, message: (e as Error).message } };
      }
      set({ job: null });
      if (!res.ok) {
        if (res.error.code === 'cancelled') toast('info', 'Generation cancelled.');
        else set({ lastError: res.error });
        return;
      }
      const r = res.value;
      const record: GenerationRecord = {
        id: uid(),
        createdAt: now(),
        providerId: r.providerId,
        providerName: r.providerName,
        isMock: r.isMock,
        request,
        finalPrompt: r.composed.prompt,
        finalNegativePrompt: r.composed.negativePrompt,
        promptNotes: r.warnings,
        variations: r.variations.map((v) => ({
          id: uid(),
          index: v.index,
          seed: v.seed,
          original: v.image,
          current: v.image,
          pipeline: [],
          notes: v.notes,
          sourceWidth: v.sourceWidth,
          sourceHeight: v.sourceHeight,
        })),
      };
      const cur = get();
      set({
        selection: { recordId: record.id, variationId: record.variations[0].id },
        lastWarnings: r.warnings,
        editor: { ...cur.editor, fitRequest: cur.editor.fitRequest + 1 },
      });
      setProject({ ...cur.project, dirty: true, history: [record, ...cur.project.history] });
      toast(
        'success',
        `Generated ${record.variations.length} ${record.request.size}×${record.request.size} variation${record.variations.length === 1 ? '' : 's'}${r.isMock ? ' (mock placeholder, not AI)' : ''}.`,
      );
    },

    cancelGeneration() {
      const job = get().job;
      if (job) void api().cancelGeneration(job.id);
    },

    dismissError() {
      set({ lastError: null });
    },

    rejectSuggestion(id) {
      set((s) => ({ rejectedSuggestions: [...new Set([...s.rejectedSuggestions, id])] }));
    },

    restoreSuggestions() {
      set({ rejectedSuggestions: [] });
    },

    select(recordId, variationId) {
      const rec = get().project.history.find((r) => r.id === recordId);
      if (!rec) return;
      const vid = variationId ?? rec.variations[0].id;
      const prev = findSelected(get());
      const sizeChanged = !prev || prev.record.request.size !== rec.request.size;
      set((s) => ({
        selection: { recordId, variationId: vid },
        docs: s.docs[vid] ? { ...s.docs, [vid]: sealHistory(s.docs[vid]) } : s.docs,
        editor: sizeChanged ? { ...s.editor, fitRequest: s.editor.fitRequest + 1 } : s.editor,
      }));
    },

    reopenRecord(recordId) {
      const s = get();
      const rec = s.project.history.find((r) => r.id === recordId);
      if (!rec) return;
      const req = rec.request;
      set({
        providerId: s.providers.some((p) => p.id === req.providerId) ? req.providerId : s.providerId,
        form: {
          ...s.form,
          prompt: req.prompt,
          negativePrompt: req.negativePrompt,
          size: req.size,
          transparent: req.transparent,
          seed: req.seed,
          randomizeSeed: false,
          variations: req.variations,
          params: { ...s.form.params, [req.providerId]: req.params },
          technical: req.technical,
          conversion: req.conversion,
        },
        rejectedSuggestions: [],
      });
      toast('info', 'Loaded prompt and settings from history (seed locked).');
    },

    async regenerate(recordId) {
      get().reopenRecord(recordId);
      await get().generate({ skipStyleCheck: true });
    },

    deleteRecord(recordId) {
      const s = get();
      const history = s.project.history.filter((r) => r.id !== recordId);
      const removed = s.project.history.find((r) => r.id === recordId);
      const docs = { ...s.docs };
      removed?.variations.forEach((v) => delete docs[v.id]);
      const selection =
        s.selection?.recordId === recordId ? (history[0] ? { recordId: history[0].id, variationId: history[0].variations[0].id } : null) : s.selection;
      set({ docs, selection });
      setProject({ ...s.project, dirty: true, history });
    },

    updateDoc(fn, key = null) {
      const s = get();
      const found = findSelected(s);
      if (!found) return;
      const before: DocSnapshot = { current: found.variation.current, pipeline: found.variation.pipeline };
      const next = fn(before);
      if (next.current === before.current && next.pipeline === before.pipeline) return;
      const history = commitChange(s.docs[found.variation.id] ?? emptyHistory(), before, key);
      applyDoc(next, history);
    },

    setCurrentTransient(img) {
      const s = get();
      if (!s.selection) return;
      set({ project: mapVariation(s.project, s.selection, (v) => ({ ...v, current: img })) });
    },

    commitStroke(before) {
      const s = get();
      const found = findSelected(s);
      if (!found) return;
      const history = commitChange(s.docs[found.variation.id] ?? emptyHistory(), before, null);
      applyDoc({ current: found.variation.current, pipeline: found.variation.pipeline }, history);
    },

    undo() {
      const s = get();
      const found = findSelected(s);
      if (!found) return;
      const res = undoChange(s.docs[found.variation.id] ?? emptyHistory(), { current: found.variation.current, pipeline: found.variation.pipeline });
      if (res) applyDoc(res.present, res.history);
    },

    redo() {
      const s = get();
      const found = findSelected(s);
      if (!found) return;
      const res = redoChange(s.docs[found.variation.id] ?? emptyHistory(), { current: found.variation.current, pipeline: found.variation.pipeline });
      if (res) applyDoc(res.present, res.history);
    },

    resetToOriginal() {
      const found = findSelected(get());
      if (!found) return;
      get().updateDoc(() => ({ current: found.variation.original, pipeline: [] }));
      toast('info', 'Sprite reset to the original generation (undo is available).');
    },

    bakeFilters() {
      const found = findSelected(get());
      if (!found || found.variation.pipeline.every((s) => !s.enabled)) return;
      get().updateDoc((d) => ({ current: applyPipeline(d.current, d.pipeline), pipeline: [] }));
      toast('success', 'Filters applied to the sprite pixels. The original is still available via Reset.');
    },

    addFilter(type) {
      get().updateDoc((d) => ({ ...d, pipeline: [...d.pipeline, createFilterStep(type)] }));
    },

    updateFilterParam(stepId, key, value) {
      get().updateDoc(
        (d) => ({ ...d, pipeline: d.pipeline.map((st) => (st.id === stepId ? { ...st, params: { ...st.params, [key]: value } } : st)) }),
        `param:${stepId}:${key}`,
      );
    },

    toggleFilter(stepId) {
      get().updateDoc((d) => ({ ...d, pipeline: d.pipeline.map((st) => (st.id === stepId ? { ...st, enabled: !st.enabled } : st)) }));
    },

    moveFilter(stepId, dir) {
      get().updateDoc((d) => {
        const i = d.pipeline.findIndex((st) => st.id === stepId);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= d.pipeline.length) return d;
        const pipeline = [...d.pipeline];
        [pipeline[i], pipeline[j]] = [pipeline[j], pipeline[i]];
        return { ...d, pipeline };
      });
    },

    removeFilter(stepId) {
      get().updateDoc((d) => ({ ...d, pipeline: d.pipeline.filter((st) => st.id !== stepId) }));
    },

    clearFilters() {
      get().updateDoc((d) => (d.pipeline.length ? { ...d, pipeline: [] } : d));
    },

    savePreset(name) {
      const found = findSelected(get());
      const prefs = get().prefs;
      const trimmed = name.trim().slice(0, 80);
      if (!found || !prefs) return;
      if (!trimmed) {
        toast('warning', 'Give the preset a name.');
        return;
      }
      if (found.variation.pipeline.length === 0) {
        toast('warning', 'Add at least one filter before saving a preset.');
        return;
      }
      const preset: FilterPreset = { id: uid(), name: trimmed, steps: found.variation.pipeline.map((st) => ({ ...st, params: { ...st.params } })) };
      void get().updatePrefs({ presets: [...prefs.presets, preset] });
      toast('success', `Saved preset "${trimmed}".`);
    },

    renamePreset(id, name) {
      const prefs = get().prefs;
      const trimmed = name.trim().slice(0, 80);
      if (!prefs || !trimmed) return;
      void get().updatePrefs({ presets: prefs.presets.map((p) => (p.id === id ? { ...p, name: trimmed } : p)) });
    },

    deletePreset(id) {
      const prefs = get().prefs;
      if (!prefs) return;
      void get().updatePrefs({ presets: prefs.presets.filter((p) => p.id !== id) });
    },

    movePreset(id, dir) {
      const prefs = get().prefs;
      if (!prefs) return;
      const list = [...prefs.presets];
      const i = list.findIndex((p) => p.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      void get().updatePrefs({ presets: list });
    },

    applyPreset(id, mode) {
      const preset = get().prefs?.presets.find((p) => p.id === id);
      if (!preset || !findSelected(get())) return;
      // Fresh ids so the same preset can be appended twice; params re-validated.
      const steps = preset.steps.map((st) => sanitizeFilterStep({ ...st, id: uid() })).filter((st): st is FilterStep => st !== null);
      get().updateDoc((d) => ({ ...d, pipeline: mode === 'replace' ? steps : [...d.pipeline, ...steps] }));
      toast('info', `${mode === 'replace' ? 'Applied' : 'Appended'} preset "${preset.name}" — previewing live.`);
    },

    setEditor(patch) {
      set((s) => ({ editor: { ...s.editor, ...patch } }));
      if ('showGrid' in patch && get().prefs) void get().updatePrefs({ editor: { ...get().prefs!.editor, showGrid: !!patch.showGrid } });
    },

    setRightTab(tab) {
      set({ rightTab: tab });
    },

    focusPrompt() {
      set((s) => ({ promptFocusRequest: s.promptFocusRequest + 1 }));
    },

    openDialog(d) {
      set({ dialog: d });
    },

    closeDialog() {
      set({ dialog: null });
    },

    toast,

    dismissToast(id) {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    },

    newProject(force = false) {
      const s = get();
      if (s.project.dirty && !force) {
        set({
          dialog: {
            kind: 'confirm',
            title: 'Start a new project?',
            message: 'The current project has unsaved changes. They will be discarded.',
            confirmLabel: 'Discard and start new',
            danger: true,
            onConfirm: () => get().newProject(true),
          },
        });
        return;
      }
      set({ selection: null, docs: {}, lastError: null, lastWarnings: [] });
      setProject(emptyProject());
    },

    async saveProject(saveAs = false) {
      const s = get();
      const res = await api().saveProject(toProjectData(s.project), { path: s.project.path, saveAs });
      if (!res.ok) {
        toast('error', res.error.message, [res.error.hint, res.error.details].filter(Boolean).join(' '));
        return;
      }
      if (!res.value) return; // dialog cancelled
      const path = res.value.path;
      setProject({ ...get().project, path, name: basenameNoExt(path), dirty: false });
      toast('success', `Project saved to ${path}`);
    },

    async openProject(force = false) {
      if (get().project.dirty && !force) {
        set({
          dialog: {
            kind: 'confirm',
            title: 'Open another project?',
            message: 'The current project has unsaved changes. They will be discarded.',
            confirmLabel: 'Discard and open',
            danger: true,
            onConfirm: () => void get().openProject(true),
          },
        });
        return;
      }
      const res = await api().openProject();
      if (!res.ok) {
        toast('error', `Could not open project: ${res.error.message}`, [res.error.details, res.error.hint].filter(Boolean).join(' — '));
        return;
      }
      if (!res.value) return;
      loadOpened(res.value.project, res.value.path, false);
      toast('success', `Opened ${res.value.path ? basenameNoExt(res.value.path) : 'project'} (${res.value.project.history.length} generations).`);
      res.value.warnings.slice(0, 3).forEach((w) => toast('warning', w));
    },

    async updatePrefs(patch) {
      const prev = get().prefs;
      if (prev) set({ prefs: { ...prev, ...patch } });
      const res = await api().setPreferences(patch);
      if (res.ok) set({ prefs: res.value });
      else toast('error', `Could not save preferences: ${res.error.message}`);
    },

    async saveProviderSettings(id, settings) {
      const res = await api().saveProviderSettings(id, settings);
      if (!res.ok) {
        toast('error', res.error.message, res.error.hint);
        return false;
      }
      set((s) => ({ providers: s.providers.map((p) => (p.id === id ? res.value : p)) }));
      const prefsRes = await api().getPreferences();
      set({ prefs: prefsRes.prefs });
      toast('success', 'Provider settings saved.');
      return true;
    },

    async setApiKey(id, key, persist) {
      const res = await api().setApiKey(id, key, persist);
      if (!res.ok) {
        toast('error', res.error.message, res.error.hint);
        return false;
      }
      set((s) => ({ providers: s.providers.map((p) => (p.id === id ? res.value : p)), lastError: null }));
      toast('success', key === null ? 'API key removed.' : persist ? 'API key stored in the OS credential store.' : 'API key kept in memory for this session only.');
      return true;
    },

    async testProvider(id) {
      const res = await api().testProvider(id);
      return res.ok ? { ok: true, message: res.value.message } : { ok: false, message: res.error.message, hint: res.error.hint };
    },

    async exportSprite({ scale, includeFilters }) {
      const found = findSelected(get());
      if (!found) {
        toast('warning', 'Select a sprite to export.');
        return;
      }
      const image = compositeImage(found.variation, includeFilters);
      const res = await api().exportPng({ image, scale, suggestedName: suggestedFileName(found.record, found.variation) });
      if (!res.ok) {
        toast('error', `Export failed: ${res.error.message}`, res.error.hint);
        return;
      }
      if (!res.value) return;
      const { width, height, path } = res.value;
      toast('success', scale === 1 ? `Exported ${width}×${height} PNG (native size).` : `Exported ${width}×${height} enlarged preview (${scale}× nearest-neighbor, not native size).`, path);
      set({ dialog: null });
    },

    async exportSheet({ scale, includeFilters, columns }) {
      const found = findSelected(get());
      if (!found) {
        toast('warning', 'Select a generation to export.');
        return;
      }
      const images = found.record.variations.map((v) => compositeImage(v, includeFilters));
      const res = await api().exportSpriteSheet({ images, columns, scale, suggestedName: suggestedFileName(found.record, found.record.variations[0]).replace(/-seed\d+|-v\d+$/, '') });
      if (!res.ok) {
        toast('error', `Sprite sheet export failed: ${res.error.message}`, res.error.hint);
        return;
      }
      if (!res.value) return;
      toast('success', `Exported ${images.length}-sprite sheet (${res.value.width}×${res.value.height}${scale > 1 ? `, ${scale}× enlarged` : ''}).`, res.value.path);
      set({ dialog: null });
    },

    async copySprite({ scale, includeFilters }) {
      const found = findSelected(get());
      if (!found) {
        toast('warning', 'Select a sprite to copy.');
        return;
      }
      const res = await api().copyImage(compositeImage(found.variation, includeFilters), scale);
      if (!res.ok) toast('error', `Copy failed: ${res.error.message}`, res.error.hint);
      else toast('success', `Copied ${res.value.width}×${res.value.height} sprite to the clipboard${scale > 1 ? ` (${scale}× enlarged)` : ''}.`);
    },
  };
});
