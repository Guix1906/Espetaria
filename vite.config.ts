/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

import { cloudflare } from "@cloudflare/vite-plugin";

const buildTime = new Date().toISOString();

// O plugin da Cloudflare só entra no build de produção (atrapalha os testes e o modo demonstração)
export default defineConfig(({ command, mode }) => ({
  define: {
    __APP_BUILD_TIME__: JSON.stringify(buildTime),
  },
  plugins: [
    react(),
    {
      name: 'build-version-generator',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify({
            buildTime,
            timestamp: Date.now(),
          }),
        });
      },
    },
    {
      name: 'cardapio-modulepreload',
      apply: 'build',
      transformIndexHtml: {
        order: 'post',
        handler(_html, ctx) {
          const bundle = ctx.bundle;
          if (!bundle) return;
          const page = Object.values(bundle).find((item) => item.type === 'chunk' && item.facadeModuleId?.endsWith('PublicMenuPage.tsx'));
          if (!page) return;
          const files = new Set<string>();
          const walk = (name: string) => {
            const item = bundle[name];
            if (files.has(name) || !item || item.type !== 'chunk' || item.isEntry) return;
            files.add(name);
            item.imports.forEach(walk);
          };
          walk(page.fileName);
          const urls = JSON.stringify([...files].map((file) => `/${file}`));
          return [{ tag: 'script', injectTo: 'head' as const, children: `if(/^\\/cardapio\\/?$/.test(location.pathname)){${urls}.forEach(function(u){var l=document.createElement('link');l.rel='modulepreload';l.href=u;document.head.appendChild(l)})}` }];
        },
      },
    },
    VitePWA({
      registerType: 'autoUpdate',
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
      // Nova versão assume imediatamente e limpa versões antigas
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
        // Fotos dos produtos (Supabase Storage ou outro link): ficam guardadas no aparelho e abrem na hora
        runtimeCaching: [{
          urlPattern: ({ request }) => request.destination === 'image',
          handler: 'StaleWhileRevalidate',
          options: { cacheName: 'product-images', expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 }, cacheableResponse: { statuses: [0, 200] } },
        }],
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
      },
    }),
    ...(command === 'build' && mode !== 'demo' && !process.env.VITEST ? [cloudflare()] : [])
  ],
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
  },
}));
