import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'SalesTrack — Business POS',
        short_name: 'SalesTrack',
        description: 'POS, Inventory, Appointments, Analytics & CRM for African businesses',
        theme_color: '#8b2550',
        background_color: '#fdf5f7',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/app/dashboard',
        scope: '/',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable'
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ],
        shortcuts: [
          {
            name: 'New Sale',
            short_name: 'New Sale',
            description: 'Go straight to the POS and start a sale',
            url: '/app/pos',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }]
          },
          {
            name: "Today's Sales",
            short_name: 'Sales',
            description: "View today's sales summary",
            url: '/app/sales',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }]
          },
          {
            name: 'Add Expense',
            short_name: 'Expense',
            description: 'Quickly record a business expense',
            url: '/app/expenses',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }]
          }
        ]
      },
      workbox: {
        navigateFallbackDenylist: [
          /^\/robots\.txt$/,
          /^\/sitemap\.xml$/,
          /^\/landing\.html$/,
          /^\/blog(?:\/|$)/,
          /^\/legal(?:\/|$)/,
          /^\/marketing(?:\/|$)/,
          /^\/icons(?:\/|$)/,
          /^\/manifest\.webmanifest$/,
          /^\/favicon(?:\.|$)/
        ],
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fieldtrack-kenya\.fly\.dev\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pocketbase-api',
              networkTimeoutSeconds: 5,
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts' }
          }
        ]
      },
      devOptions: {
        enabled: true
      }
    })
  ],
  server: { port: 5174, host: true }
})