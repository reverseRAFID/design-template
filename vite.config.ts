import { defineConfig, type Plugin } from 'vite';
import { writeFile } from 'node:fs/promises';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

/**
 * Writes the sponsor manifest back to disk from the running app.
 *
 * The sponsor board's tiers and order belong in `manifest.json`, which is in the
 * repo — so an arrangement made in the app is a source change, not a browser
 * preference. Saving it to localStorage meant it followed one machine and one
 * browser, which is exactly what the team hit. See docs/DECISIONS.md D30.
 *
 * Dev only (`apply: 'serve'`). The deployed site is static and has nowhere to
 * write; there the app downloads the file instead.
 */
function manifestWriter(): Plugin {
  const TARGET = fileURLToPath(new URL('./public/brand/sponsors/manifest.json', import.meta.url));
  const MAX_BYTES = 256 * 1024;

  return {
    name: 'mt-manifest-writer',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__manifest', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('POST only');
          return;
        }

        let body = '';
        let tooBig = false;
        req.on('data', (chunk: Buffer) => {
          body += chunk.toString('utf8');
          if (body.length > MAX_BYTES) {
            tooBig = true;
            req.destroy();
          }
        });

        req.on('end', () => {
          void (async () => {
            if (tooBig) {
              res.statusCode = 413;
              res.end('too large');
              return;
            }
            try {
              // Parse before writing: a malformed body must not truncate the
              // manifest, and the path is fixed so nothing can be redirected.
              const parsed: unknown = JSON.parse(body);
              if (
                typeof parsed !== 'object' ||
                parsed === null ||
                !Array.isArray((parsed as { sponsors?: unknown }).sponsors)
              ) {
                res.statusCode = 400;
                res.end('not a sponsor manifest');
                return;
              }
              await writeFile(TARGET, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
              res.statusCode = 200;
              res.setHeader('content-type', 'application/json');
              res.end(JSON.stringify({ written: 'public/brand/sponsors/manifest.json' }));
            } catch {
              res.statusCode = 400;
              res.end('invalid json');
            }
          })();
        });
      });
    },
  };
}

export default defineConfig({
  // '/' suits Vercel. For a GitHub Pages project site build with VITE_BASE=/<repo>/.
  base: process.env.VITE_BASE ?? '/',
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [
    manifestWriter(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // src/main.tsx registers it, so the update can be taken immediately rather
      // than a tab-close later. Two registrations would fight over that.
      injectRegister: null,
      // Artwork and fonts only: `brand/**/*` would sweep the sponsor manifest back
      // into the precache behind globIgnores' back.
      includeAssets: ['brand/**/*.{svg,png}', 'fonts/**/*.woff2'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,json}'],
        // The sponsor board is editable DATA, not a build artefact. Precaching it
        // pins whatever arrangement the last build shipped, so a save followed by a
        // refresh looks like it reverted — and does so on any origin that has ever
        // served a build, dev server included. Network first instead, with the
        // cache kept only as the offline fallback (docs/DECISIONS.md D32).
        globIgnores: ['**/brand/sponsors/manifest.json'],
        runtimeCaching: [
          {
            urlPattern: ({ url }: { url: URL }) =>
              url.pathname.endsWith('/brand/sponsors/manifest.json'),
            handler: 'NetworkFirst',
            options: { cacheName: 'mt-sponsor-manifest', expiration: { maxEntries: 1 } },
          },
        ],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
      manifest: {
        name: 'Mongol-Tori Brand Kit',
        short_name: 'MT Brand Kit',
        description: 'Brand-consistent image overlays for BRACU Mongol-Tori.',
        theme_color: '#0A0A0A',
        background_color: '#0A0A0A',
        display: 'standalone',
        icons: [{ src: 'brand/mongoltori-light.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
    }),
  ],
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
  },
} as Parameters<typeof defineConfig>[0]);
