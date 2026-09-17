import { describe, expect, it } from 'vitest';

import { buildShareUrl, decodeSettings, encodeSettings, readShareHash } from '@/lib/share-url';
import type { SharedSettings } from '@/lib/share-url';

const SETTINGS: SharedSettings = {
  presetId: 'story',
  tone: 'light',
  toneOverridden: true,
  frame: true,
  scrim: 0.45,
  selectedSponsors: ['msi', 'altium', 'turkish-airlines'],
  sponsorOrder: ['altium', 'msi', 'turkish-airlines'],
  sponsorTiers: { altium: 1, msi: 3 },
  label: 'OUTREACH · DHAKA · 16.09.2026',
};

describe('share-url', () => {
  it('round-trips every field', () => {
    expect(decodeSettings(encodeSettings(SETTINGS))).toEqual(SETTINGS);
  });

  it('round-trips the defaults too', () => {
    const plain: SharedSettings = {
      presetId: 'square',
      tone: 'dark',
      toneOverridden: false,
      frame: false,
      scrim: 0.7,
      selectedSponsors: [],
      sponsorOrder: [],
      sponsorTiers: {},
      label: '',
    };
    expect(decodeSettings(encodeSettings(plain))).toEqual(plain);
  });

  it('encodes to a hash-safe, base64url payload', () => {
    // '+', '/' and '=' all get mangled or truncated when pasted into chat clients.
    expect(encodeSettings(SETTINGS)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('survives non-ASCII in the label', () => {
    const withDots: SharedSettings = { ...SETTINGS, label: 'URC · IRC · ERC — ✦' };
    expect(decodeSettings(encodeSettings(withDots))?.label).toBe('URC · IRC · ERC — ✦');
  });

  it('returns null for junk rather than half-applying it', () => {
    expect(decodeSettings('not-base64!!')).toBeNull();
    expect(decodeSettings(btoa('[1,2,3]'))).toBeNull();
    expect(decodeSettings(btoa('null'))).toBeNull();
    expect(decodeSettings('')).toBeNull();
  });

  it('falls back to the default preset when the id is unknown', () => {
    const encoded = encodeSettings({ ...SETTINGS, presetId: 'nope' as SharedSettings['presetId'] });
    expect(decodeSettings(encoded)?.presetId).toBe('square');
  });

  it('clamps a scrim outside 0..1', () => {
    expect(decodeSettings(encodeSettings({ ...SETTINGS, scrim: 9 }))?.scrim).toBe(1);
    expect(decodeSettings(encodeSettings({ ...SETTINGS, scrim: -3 }))?.scrim).toBe(0);
  });

  it('truncates an over-long label to the frame limit', () => {
    const long = 'X'.repeat(200);
    expect(decodeSettings(encodeSettings({ ...SETTINGS, label: long }))?.label).toHaveLength(48);
  });

  it('carries the arrangement, which is what "these exact settings" means', () => {
    const back = decodeSettings(encodeSettings(SETTINGS));
    expect(back?.sponsorOrder).toEqual(['altium', 'msi', 'turkish-airlines']);
    expect(back?.sponsorTiers).toEqual({ altium: 1, msi: 3 });
  });

  it('drops junk tier overrides rather than trusting them', () => {
    const encoded = encodeSettings({
      ...SETTINGS,
      sponsorTiers: { ok: 2, zero: 0, frac: 1.5, str: 'x' } as unknown as Record<string, number>,
    });
    expect(decodeSettings(encoded)?.sponsorTiers).toEqual({ ok: 2 });
  });

  it('drops non-string entries from the sponsor list', () => {
    const encoded = encodeSettings({
      ...SETTINGS,
      selectedSponsors: ['msi', 7, null] as unknown as string[],
    });
    expect(decodeSettings(encoded)?.selectedSponsors).toEqual(['msi']);
  });

  it('reads only a hash that carries a settings payload', () => {
    const hash = new URL(buildShareUrl(SETTINGS, 'https://example.com/kit/')).hash;
    expect(readShareHash(hash)).toEqual(SETTINGS);
    expect(readShareHash('#something-else')).toBeNull();
    expect(readShareHash('')).toBeNull();
  });

  it('keeps the base URL intact and only replaces the hash', () => {
    const url = new URL(buildShareUrl(SETTINGS, 'https://example.com/kit/?a=1#old'));
    expect(url.origin + url.pathname).toBe('https://example.com/kit/');
    expect(url.search).toBe('?a=1');
    expect(url.hash.startsWith('#s=')).toBe(true);
  });
});
