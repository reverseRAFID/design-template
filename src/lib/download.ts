/**
 * Hand a rendered blob to the browser's download manager.
 *
 * Nothing is uploaded: the object URL is same-origin and lives for one tick.
 */

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.hidden = true;

  // Firefox only honours a click on a connected node.
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  // Revoking synchronously cancels the download in WebKit — let the click settle first.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
