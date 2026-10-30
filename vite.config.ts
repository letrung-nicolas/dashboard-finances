import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';

// CSP stricte : aucune requête sortante après chargement.
// Injectée au build seulement (le serveur de dev a besoin de scripts inline).
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'none'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
].join('; ');

function cspPlugin(): Plugin {
  return {
    name: 'inject-csp',
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}

export default defineConfig({
  base: '/dashboard-finances/',
  plugins: [react(), cspPlugin()],
  build: {
    target: 'es2017',
    sourcemap: false,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
