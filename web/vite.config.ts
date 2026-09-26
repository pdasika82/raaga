import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Set base to '/<repo>/' when deploying to GitHub Pages project sites.
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'worklet.js'],
      manifest: {
        name: 'Raaga',
        short_name: 'Raaga',
        description: 'Singing practice: live pitch against scales and ragas, recordings, and coach feedback.',
        theme_color: '#7b3f6e',
        background_color: '#faf9fb',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
        navigateFallbackDenylist: [/^\/api/],
      },
    }),
  ],
});
