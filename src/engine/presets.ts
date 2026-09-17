import type { Preset, PresetId } from './types';

/**
 * The six output canvases (docs/01-PRD.md § F1). Order here is the order in the
 * UI, and stays the table order until the team says which platforms matter most.
 */
export const PRESETS: readonly Preset[] = [
  {
    id: 'square',
    name: 'Square',
    w: 1080,
    h: 1080,
    ratio: '1:1',
    defaultFrame: false,
    use: 'Instagram / Facebook feed',
  },
  {
    id: 'portrait34',
    name: 'Portrait 3:4',
    w: 1080,
    h: 1440,
    ratio: '3:4',
    defaultFrame: false,
    use: 'Instagram / Facebook feed',
  },
  {
    id: 'portrait45',
    name: 'Portrait 4:5',
    w: 1080,
    h: 1350,
    ratio: '4:5',
    defaultFrame: false,
    use: 'Instagram feed (max height)',
  },
  {
    id: 'story',
    name: 'Story / Reel cover',
    w: 1080,
    h: 1920,
    ratio: '9:16',
    defaultFrame: false,
    use: 'IG / FB stories',
  },
  {
    id: 'wide',
    name: 'Wide 16:9',
    w: 1920,
    h: 1080,
    ratio: '16:9',
    defaultFrame: false,
    use: 'YouTube thumb, LinkedIn, slides',
  },
  {
    id: 'og',
    name: 'Link preview',
    w: 1200,
    h: 630,
    ratio: '1.9:1',
    // The only preset that frames by default — link previews want a crisp edge.
    defaultFrame: true,
    use: 'Website OG / LinkedIn link',
  },
] as const;

export const DEFAULT_PRESET_ID: PresetId = 'square';

const BY_ID = new Map<PresetId, Preset>(PRESETS.map((p) => [p.id, p]));

export function isPresetId(value: unknown): value is PresetId {
  return typeof value === 'string' && BY_ID.has(value as PresetId);
}

export function getPreset(id: PresetId): Preset {
  const preset = BY_ID.get(id);
  if (!preset) throw new Error(`Unknown preset: ${id}`);
  return preset;
}

/** Falls back to the default rather than throwing — for restoring persisted state. */
export function getPresetOrDefault(id: unknown): Preset {
  return isPresetId(id) ? getPreset(id) : getPreset(DEFAULT_PRESET_ID);
}
