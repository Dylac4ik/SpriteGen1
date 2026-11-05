import { create } from 'zustand';
import type { Tool } from '@renderer/store/appStore';

export type MobileTab = 'create' | 'edit' | 'library' | 'settings';
export type MobileTool = 'move' | Tool;
export type MobileSheet = 'analysis' | 'filters' | 'info' | null;

interface MobileUiState {
  tab: MobileTab;
  tool: MobileTool;
  sheet: MobileSheet;
  settingsProviderId: string | null;
  setTab(tab: MobileTab): void;
  setTool(tool: MobileTool): void;
  openSheet(sheet: MobileSheet): void;
  openSettings(providerId?: string): void;
}

/** UI-only state of the mobile shell (navigation, touch tool, open sheet). */
export const useMobileUi = create<MobileUiState>()((set) => ({
  tab: 'create',
  tool: 'move',
  sheet: null,
  settingsProviderId: null,
  setTab: (tab) => set({ tab, sheet: null }),
  setTool: (tool) => set({ tool }),
  openSheet: (sheet) => set({ sheet }),
  openSettings: (providerId) => set({ tab: 'settings', sheet: null, settingsProviderId: providerId ?? null }),
}));
