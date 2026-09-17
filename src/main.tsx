import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';

import { App } from '@/App';
import '@/styles/globals.css';

/**
 * Take a new build the moment it is available.
 *
 * The auto-injected registration installs an update and then waits for the tab to
 * be closed and reopened, so the first load after a deploy shows the PREVIOUS
 * build — which is how "I deployed and nothing changed" happens. `immediate`
 * hands control straight over and reloads once (docs/DECISIONS.md D34).
 */
registerSW({ immediate: true });

/**
 * Evict any service worker on the dev server.
 *
 * Dev ships no service worker — but one installed by a production build served
 * from the same origin (a `vite preview` on :5173, `npx serve dist`, anything)
 * outlives every dev run afterwards. It keeps answering from its precache, dev
 * never installs a replacement, and there is nothing on screen to say so. A board
 * saved to disk then appears to revert on the next reload, for ever.
 * See docs/DECISIONS.md D34.
 */
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  void navigator.serviceWorker
    .getRegistrations()
    .then((registrations) => Promise.all(registrations.map((r) => r.unregister())))
    .then(async (unregistered) => {
      if (!unregistered.some(Boolean)) return;
      // Its caches go too, or the next worker inherits the same stale bodies.
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }
      console.warn('[brand kit] removed a stale service worker left by a production build');
    })
    .catch(() => {
      /* Storage blocked, or a browser that will not say. Nothing to undo. */
    });
}

const root = document.getElementById('root');
if (!root) throw new Error('#root missing from index.html');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
