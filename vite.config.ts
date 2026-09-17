import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  // '/' suits Vercel. For a GitHub Pages project site build with VITE_BASE=/<repo>/.
  base: process.env.VITE_BASE ?? '/',
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['brand/**/*', 'fonts/**/*'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,json}'],
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
