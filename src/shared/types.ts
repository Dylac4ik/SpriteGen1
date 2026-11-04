import type { RgbaImage } from '@core/image';
import type { SpriteSize } from '@core/sizes';
import type { ParamSpec, ParamValues } from '@core/params';
import type { ConversionSettings } from '@core/pixelize';
import type { ComposedPrompt, TechnicalToggles } from '@core/prompt/compose';
import type { FilterStep } from '@core/filters';

/** Image as it crosses IPC (Electron may deliver Uint8Array instead of Uint8ClampedArray). */
export interface WireImage {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
}

export interface ProviderCapabilities {
  supportsSeed: boolean;
  supportsNegativePrompt: boolean;
  supportsNativeTransparency: boolean;
  maxVariations: number;
  maxPromptLength: number;
  /** Typical resolution of raw model output before pixel conversion. */
  workingSize: number;
  /** Provider-specific generation controls shown in the left panel. */
  generationParams: ParamSpec[];
}

export interface ProviderDescriptor {
  id: string;
  displayName: string;
  description: string;
  /** True for placeholder/offline providers that are NOT real AI. */
  isMock: boolean;
  requiresApiKey: boolean;
  apiKey: { present: boolean; source: 'keychain' | 'session' | 'env' | null; envVar?: string };
  settingsFields: ParamSpec[];
  settings: ParamValues;
  capabilities: ProviderCapabilities;
  docsUrl?: string;
}

export interface GenerationRequest {
  providerId: string;
  prompt: string;
  negativePrompt: string;
  size: SpriteSize;
  transparent: boolean;
  /** Base seed; variation i uses (seed + i) mod 2^32 when the provider supports seeds. */
  seed: number;
  variations: number;
  params: ParamValues;
  technical: TechnicalToggles;
  conversion: ConversionSettings;
}

export interface GeneratedVariation {
  index: number;
  seed: number | null;
  image: RgbaImage;
  sourceWidth: number;
  sourceHeight: number;
  notes: string[];
}

export interface GenerationResult {
  jobId: string;
  providerId: string;
  providerName: string;
  isMock: boolean;
  composed: ComposedPrompt;
  variations: GeneratedVariation[];
  durationMs: number;
  warnings: string[];
}

export type GenerationStage = 'preparing' | 'requesting' | 'receiving' | 'converting' | 'done';

export interface GenerationProgress {
  jobId: string;
  stage: GenerationStage;
  completed: number;
  total: number;
  message: string;
}

export interface VariationRecord {
  id: string;
  index: number;
  seed: number | null;
  /** Immutable converted generation output; "Reset to original" restores this. */
  original: RgbaImage;
  /** Base pixels including manual edits and applied (baked) filters. */
  current: RgbaImage;
  /** Live, non-destructive filter pipeline applied on top of `current`. */
  pipeline: FilterStep[];
  notes: string[];
  sourceWidth: number;
  sourceHeight: number;
}

export interface GenerationRecord {
  id: string;
  createdAt: string;
  providerId: string;
  providerName: string;
  isMock: boolean;
  request: GenerationRequest;
  finalPrompt: string;
  finalNegativePrompt: string | null;
  promptNotes: string[];
  variations: VariationRecord[];
}

export interface ProjectData {
  name: string;
  createdAt: string;
  updatedAt: string;
  history: GenerationRecord[];
}

export interface FilterPreset {
  id: string;
  name: string;
  steps: FilterStep[];
}

export type ThemePreference = 'system' | 'dark' | 'light';

export interface Preferences {
  version: 1;
  theme: ThemePreference;
  providerId: string;
  providerSettings: Record<string, ParamValues>;
  defaults: {
    size: SpriteSize;
    variations: number;
    transparent: boolean;
    technical: TechnicalToggles;
    conversion: ConversionSettings;
  };
  editor: { showGrid: boolean; gridMinZoom: number };
  presets: FilterPreset[];
  autosave: boolean;
  exportScale: number;
}

export interface AppInfo {
  version: string;
  platform: string;
  userDataPath: string;
  secureStorage: { available: boolean; backend: string };
  e2e: boolean;
}

export type MenuCommand =
  | 'new-project'
  | 'open-project'
  | 'save-project'
  | 'save-project-as'
  | 'export-png'
  | 'export-sheet'
  | 'copy-image'
  | 'undo'
  | 'redo'
  | 'generate'
  | 'cancel-generation'
  | 'zoom-in'
  | 'zoom-out'
  | 'zoom-fit'
  | 'zoom-actual'
  | 'toggle-grid'
  | 'toggle-compare'
  | 'open-settings'
  | 'reset-original';

export interface ExportPngRequest {
  image: WireImage;
  scale: number;
  suggestedName: string;
}

export interface ExportSheetRequest {
  images: WireImage[];
  columns: number;
  scale: number;
  suggestedName: string;
}

export interface ExportResult {
  path: string;
  width: number;
  height: number;
}

export interface OpenedProject {
  project: ProjectData;
  path: string | null;
  warnings: string[];
}
