import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const shared = (p: string) => fileURLToPath(new URL(`../web/src/${p}`, import.meta.url));

export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  resolve: {
    alias: { '@core': shared('core'), '@audio': shared('audio'), '@storage': shared('storage'), '@llm': shared('llm') },
  },
  server: { fs: { allow: ['..'] } },
  build: {
    rollupOptions: {
      output: { manualChunks: { firebase: ['firebase/app', 'firebase/auth'] } },
    },
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'worklet.js'],
      manifest: {
        name: 'LMS for Arts',
        short_name: 'Arts',
        description: 'Raaga singing practice and Kuchipudi dance practice in one place.',
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
      workbox: { globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'] },
    }),
  ],
});
