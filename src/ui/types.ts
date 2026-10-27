import type { WallpaperParams } from '../core/params';

export interface ResolutionChoice {
  preset: string; // RES_PRESETS id or 'custom'
  w: number;
  h: number;
}

export interface App {
  params: WallpaperParams;
  resolution: ResolutionChoice;
  autosave: boolean;
  /** live animation preview is playing */
  playing: boolean;
  /** re-render preview + sync control values (cheap) */
  refresh(): void;
  /** full rebuild of header + sidebar (language switch) */
  rebuildUI(): void;
  updateSeedInput(): void;
  saveToHistory(): Promise<void>;
  openExport(): void;
  openHistory(): void;
}

export interface ResolutionPreset {
  id: string;
  labelKey?: string;
  w: number;
  h: number;
}

export const RES_PRESETS: ResolutionPreset[] = [
  { id: 'fhd', w: 1920, h: 1080 },
  { id: 'qhd', w: 2560, h: 1440 },
  { id: '4k', w: 3840, h: 2160 },
  { id: '5k', w: 5120, h: 2880 },
  { id: '8k', w: 7680, h: 4320 },
  { id: '16k', w: 15360, h: 8640 },
  { id: 'uw34', w: 3440, h: 1440 },
  { id: 'uw51', w: 5120, h: 2160 },
  { id: 'phone', w: 1080, h: 2340 },
  { id: 'custom', w: 0, h: 0 },
];

export const MAX_DIM = 16384;
