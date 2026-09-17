/**
 * Upload a sponsor logo from the app.
 *
 * A stopgap by design, and it says so on screen: the permanent home is
 * `img/partners/<slug>.svg` plus a row in the importer. This exists so whoever is
 * posting at an event can use a logo that arrived by email an hour ago.
 *
 * Two jobs in one panel: fill in artwork for a sponsor the manifest is still
 * waiting on, or add a sponsor the manifest does not have at all.
 */
import { useId, useMemo, useRef, useState } from 'react';

import { Eyebrow } from '@/components/ui/Eyebrow';
import { Pill } from '@/components/ui/Pill';
import {
  MAX_TOTAL_BYTES,
  readLogoFile,
  removeCustomSponsor,
  slugify,
  totalBytes,
  upsertCustomSponsor,
  type CustomSponsor,
} from '@/assets/custom-sponsors';
import type { AssetBundle } from '@/assets/loader';

export interface SponsorUploadProps {
  bundle: AssetBundle | null;
  uploaded: readonly CustomSponsor[];
  onChange: (next: CustomSponsor[]) => void;
  onError: (message: string) => void;
  onDone: (message: string) => void;
}

/** Sentinel for "not one of the sponsors already in the manifest". */
const NEW_SPONSOR = '';

export function SponsorUpload({
  bundle,
  uploaded,
  onChange,
  onError,
  onDone,
}: SponsorUploadProps): JSX.Element {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const targetId = useId();
  const nameId = useId();
  const tierId = useId();

  const [target, setTarget] = useState<string>(NEW_SPONSOR);
  const [name, setName] = useState('');
  const [tier, setTier] = useState(3);
  const [busy, setBusy] = useState(false);

  /** Sponsors still waiting on artwork come first — the common case. */
  const options = useMemo(() => {
    if (!bundle) return [];
    return Object.values(bundle.meta)
      .slice()
      .sort((a, b) => Number(b.missing ?? false) - Number(a.missing ?? false) || a.tier - b.tier);
  }, [bundle]);

  const used = totalBytes(uploaded);
  const chosen = target === NEW_SPONSOR ? null : bundle?.meta[target];

  async function handleFile(file: File): Promise<void> {
    setBusy(true);
    try {
      const { data, ext } = await readLogoFile(file);

      const slug = chosen ? chosen.slug : slugify(name);
      if (!slug) {
        onError('Give the sponsor a name first.');
        return;
      }

      const entry: CustomSponsor = {
        slug,
        name: chosen ? chosen.name : name.trim(),
        tier: chosen ? chosen.tier : tier,
        data,
        ext,
      };

      onChange(upsertCustomSponsor(uploaded, entry));
      onDone(`ADDED ${entry.name.toUpperCase()}`);
      if (!chosen) setName('');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not add that logo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Eyebrow>UPLOAD A LOGO</Eyebrow>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={targetId} className="text-[12px] font-medium leading-4 text-mt-text-dim">
          Sponsor
        </label>
        <select
          id={targetId}
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="w-full rounded-md border border-mt-line bg-mt-surface-2 px-2 py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-mt-text"
        >
          <option value={NEW_SPONSOR}>+ NEW SPONSOR</option>
          {options.map((sponsor) => (
            <option key={sponsor.slug} value={sponsor.slug}>
              {sponsor.missing ? '! ' : ''}
              {sponsor.name.toUpperCase()}
            </option>
          ))}
        </select>
        <p className="mt-telemetry text-mt-text-mute">! = still waiting on artwork</p>
      </div>

      {/* Name and tier are only asked for when the manifest has no entry to reuse. */}
      {target === NEW_SPONSOR ? (
        <>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={nameId} className="text-[12px] font-medium leading-4 text-mt-text-dim">
              Name
            </label>
            <input
              id={nameId}
              type="text"
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Robotics"
              className="w-full rounded-md border border-mt-line bg-mt-surface-2 px-3 py-2 text-[12px] text-mt-text placeholder:text-mt-text-mute focus:border-mt-orange"
            />
            {name ? (
              <p className="mt-telemetry text-mt-text-mute">SLUG: {slugify(name) || '—'}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={tierId} className="text-[12px] font-medium leading-4 text-mt-text-dim">
              Tier (which row)
            </label>
            <select
              id={tierId}
              value={tier}
              onChange={(e) => setTier(Number(e.target.value))}
              className="w-full rounded-md border border-mt-line bg-mt-surface-2 px-2 py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-mt-text"
            >
              <option value={1}>TIER 01 — PLATINUM</option>
              <option value={2}>TIER 02 — GOLD</option>
              <option value={3}>TIER 03 — PARTNER</option>
            </select>
          </div>
        </>
      ) : null}

      <input
        ref={fileRef}
        type="file"
        accept="image/svg+xml,image/png"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Cleared so picking the same file twice fires change again.
          event.target.value = '';
          if (file) void handleFile(file);
        }}
      />

      <Pill
        as="button"
        variant="outline"
        disabled={busy || !bundle || (target === NEW_SPONSOR && !slugify(name))}
        onClick={() => fileRef.current?.click()}
      >
        {busy ? 'READING…' : 'CHOOSE SVG OR PNG'}
      </Pill>

      <p className="mt-telemetry text-mt-text-mute">
        Send the logo in its own brand colours — the banner is light behind it.
      </p>

      {uploaded.length > 0 ? (
        <div className="flex flex-col gap-1.5 border-t border-mt-line pt-3">
          <p className="mt-telemetry text-mt-text-mute">
            {uploaded.length} UPLOADED · {Math.round(used / 1024)} /{' '}
            {Math.round(MAX_TOTAL_BYTES / 1024)} KB
          </p>
          <ul className="flex flex-col">
            {uploaded.map((entry) => (
              <li key={entry.slug} className="flex items-center gap-2 py-0.5">
                <span className="min-w-0 flex-1 truncate text-[12px]">{entry.name}</span>
                <button
                  type="button"
                  aria-label={`Remove uploaded logo for ${entry.name}`}
                  onClick={() => {
                    onChange(removeCustomSponsor(uploaded, entry.slug));
                    onDone(`REMOVED ${entry.name.toUpperCase()}`);
                  }}
                  className="px-1 font-mono text-[11px] leading-4 text-mt-text-mute hover:text-mt-orange"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-telemetry text-mt-warn">
        ↳ Kept in this browser only — it will not reach teammates. For good, drop the file in
        img/partners/ and run npm run import:sponsors
      </p>
    </div>
  );
}
