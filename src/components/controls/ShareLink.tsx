/**
 * "Copy a link to these exact settings" (PRD Phase 3 § 3.6).
 *
 * Settings travel, photos never do — see `@/lib/share-url`. That is worth saying
 * on screen too, because "share" next to an image editor reads like it uploads
 * the picture.
 */
import { useState } from 'react';

import { Eyebrow } from '@/components/ui/Eyebrow';
import { Pill } from '@/components/ui/Pill';
import { buildShareUrl } from '@/lib/share-url';
import { useEditorStore } from '@/state/editor-store';

type Status = 'idle' | 'copied' | 'failed';

export function ShareLink(): JSX.Element {
  const [status, setStatus] = useState<Status>('idle');

  const presetId = useEditorStore((s) => s.presetId);
  const tone = useEditorStore((s) => s.tone);
  const toneOverridden = useEditorStore((s) => s.toneOverridden);
  const frame = useEditorStore((s) => s.frame);
  const scrim = useEditorStore((s) => s.scrim);
  const selectedSponsors = useEditorStore((s) => s.selectedSponsors);
  const sponsorOrder = useEditorStore((s) => s.sponsorOrder);
  const sponsorTiers = useEditorStore((s) => s.sponsorTiers);
  const label = useEditorStore((s) => s.label);

  async function copy(): Promise<void> {
    const url = buildShareUrl(
      {
        presetId,
        tone,
        toneOverridden,
        frame,
        scrim,
        selectedSponsors,
        sponsorOrder,
        sponsorTiers,
        label,
      },
      window.location.href,
    );
    try {
      await navigator.clipboard.writeText(url);
      setStatus('copied');
    } catch {
      // Clipboard is blocked without a secure context or a user gesture the
      // browser recognises; put the link in the address bar so it can be copied.
      window.location.hash = new URL(url).hash;
      setStatus('failed');
    }
    setTimeout(() => setStatus('idle'), 2500);
  }

  return (
    <div className="flex flex-col gap-2">
      <Eyebrow>SHARE SETTINGS</Eyebrow>
      <Pill as="button" variant="ghost" size="sm" onClick={() => void copy()}>
        {status === 'copied' ? 'LINK COPIED' : status === 'failed' ? 'LINK IN ADDRESS BAR' : 'COPY SETTINGS LINK'}
      </Pill>
      <p className="mt-telemetry text-mt-text-mute">
        Sends the treatment and the sponsor arrangement — never your photo
      </p>
    </div>
  );
}
