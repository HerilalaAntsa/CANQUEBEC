import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'assets/logo.jpg', 'assets/logo-24.jpg'],
      manifest: {
        name: 'Québec Coupe des Nations 2026',
        short_name: 'QCN 2026',
        description: 'Calendrier, classement et statistiques de la Coupe des Nations de Québec 2026',
        theme_color: '#003087',
        background_color: '#f4f6f9',
        display: 'standalone',
        start_url: '/',
        orientation: 'portrait',
        icons: [
          {
            src: '/icons/pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icons/pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/icons/pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        // Cache les assets statiques
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg}'],
        // Ne pas mettre en cache les appels Supabase
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: /^\/data\/.+\.xlsx$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'excel-data',
              expiration: { maxAgeSeconds: 60 * 60 * 24 }, // 24h
            },
          },
        ],
      },
    }),
  ],
})
