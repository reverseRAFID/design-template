/**
 * Shareable settings link (PRD Phase 3 § 3.6): `#s=<base64 json>`.
 *
 * Settings only — never the photo. The whole point of this app is that images
 * stay in the browser, and a URL is the one thing a user will paste into Slack.
 *
 * Keys are abbreviated because this ends up in a link someone has to paste.
 */

import { getPresetOrDefault } from '@/engine/presets';
import type { PresetId, Tone } from '@/engine/types';

export interface SharedSettings {
  presetId: PresetId;
  tone: Tone;
  toneOverridden: boolean;
  frame: boolean;
  scrim: number;
  selectedSponsors: string[];
  label: string;
}

export const SHARE_PREFIX = 's=';

interface Wire {
  p: string;
  t: string;
  o: number;
  f: number;
  c: number;
  s: string[];
  l: string;
}

/** base64url, so the hash survives being pasted into chat clients unescaped. */
function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(encoded: string): string {
  const padded = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeSettings(settings: SharedSettings): string {
  const wire: Wire = {
    p: settings.presetId,
    t: settings.tone,
    o: settings.toneOverridden ? 1 : 0,
    f: settings.frame ? 1 : 0,
    // Two decimals is finer than the slider's own step.
    c: Math.round(settings.scrim * 100) / 100,
    s: settings.selectedSponsors,
    l: settings.label,
  };
  return toBase64Url(JSON.stringify(wire));
}

/**
 * Null for anything that is not a settings payload we understand. A mangled link
 * must leave the app on its own defaults, never half-applied.
 */
export function decodeSettings(encoded: string): SharedSettings | null {
  try {
    const raw: unknown = JSON.parse(fromBase64Url(encoded));
    // Arrays are objects too, and `{}` decodes to a full set of defaults — both
    // would quietly "succeed" and reset the user's settings. Every payload we
    // write carries `p`, so require it as the marker that this is one of ours.
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
    const wire = raw as Partial<Wire>;
    if (typeof wire.p !== 'string') return null;

    const preset = getPresetOrDefault(wire.p);
    const scrim = typeof wire.c === 'number' && Number.isFinite(wire.c) ? wire.c : 0.7;

    return {
      presetId: preset.id,
      tone: wire.t === 'light' ? 'light' : 'dark',
      toneOverridden: wire.o === 1,
      frame: wire.f === 1,
      scrim: Math.min(1, Math.max(0, scrim)),
      selectedSponsors: Array.isArray(wire.s) ? wire.s.filter((v) => typeof v === 'string') : [],
      label: typeof wire.l === 'string' ? wire.l.slice(0, 48) : '',
    };
  } catch {
    return null;
  }
}

/** The settings payload in `location.hash`, if there is one. */
export function readShareHash(hash: string): SharedSettings | null {
  const raw = hash.replace(/^#/, '');
  if (!raw.startsWith(SHARE_PREFIX)) return null;
  return decodeSettings(raw.slice(SHARE_PREFIX.length));
}

export function buildShareUrl(settings: SharedSettings, base: string): string {
  const url = new URL(base);
  url.hash = `${SHARE_PREFIX}${encodeSettings(settings)}`;
  return url.toString();
}
