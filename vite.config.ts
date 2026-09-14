import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Espetaria Sabor da Carne — Gestão & Comandas',
        short_name: 'Sabor da Carne',
        description: 'Sistema Integrado de Gestão Operacional para Espetaria',
        theme_color: '#116558',
        background_color: '#f5f7f8',
        display: 'standalone',
        orientation: 'any',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,ico,png,svg}'] },
    }),
  ],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: { 
    port: 3000, 
    host: true,
    watch: {
      ignored: ['**/.interface-work/**', '**/browser-profile/**']
    }
  },
});
