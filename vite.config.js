import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Admin SPA is served under /admin — the public status page at / is
// server-rendered for speed and zero-JS loads.
export default defineConfig({
  root: 'client',
  base: '/admin/',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: '../dist',
    emptyOutDir: true
  },
  server: {
    port: 5442,
    proxy: {
      '/api': 'http://localhost:5342',
      '/hooks': 'http://localhost:5342',
      '/feed': 'http://localhost:5342'
    }
  }
});
