/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

import { cloudflare } from "@cloudflare/vite-plugin";

// O plugin da Cloudflare só entra no build de produção (atrapalha os testes e o modo demonstração)
export default defineConfig(({ command, mode }) => ({
  plugins: [react(), VitePWA({
    registerType: 'prompt',
    includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
    manifest: {
      name: 'Ponto — Sabor da Carne',
      short_name: 'Ponto',
      description: 'Sistema Integrado de Gestão Operacional para Espetaria',
      theme_color: '#B5502E',
      background_color: '#F5EFE6',
      display: 'standalone',
      orientation: 'any',
      icons: [
        { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    // Nova versão assume imediatamente (sem ficar presa na versão antiga do cache)
    workbox: {
      globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
      // skipWaiting/clientsClaim desligados: eram eles que recarregavam a página ao abrir
      clientsClaim: true,
      cleanupOutdatedCaches: true,
    },
  }), ...(command === 'build' && mode !== 'demo' && !process.env.VITEST ? [cloudflare()] : [])],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: { 
    port: 3002, 
    strictPort: true,
    host: true,
    watch: {
      ignored: ['**/.interface-work/**', '**/browser-profile/**']
    }
  },
  test: {
    // Nunca usar o Supabase real (.env) durante os testes
    env: {
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_ANON_KEY: '',
    },
  },
  preview: {
    port: 3002,
    strictPort: true,
    host: true,
  },
}));
