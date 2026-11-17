import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const PUERTO_WEB = Number(process.env.VN_WEB_PORT) || 5273;
const API = `http://localhost:${Number(process.env.VN_API_PORT) || 3101}`;
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../dist',
    manifest: true,
    emptyOutDir: true,
    assetsDir: 'vn-app',
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalized = id.replace(/\\/g, '/');
          if (normalized.includes('/node_modules/three/')) return 'vendor-three';
          if (normalized.includes('/node_modules/pdfjs-dist/')) return 'vendor-pdfjs';
          if (normalized.includes('/node_modules/animejs/')) return 'vendor-animejs';
          if (
            normalized.includes('/node_modules/react/')
            || normalized.includes('/node_modules/react-dom/')
            || normalized.includes('/node_modules/react-router/')
            || normalized.includes('/node_modules/react-router-dom/')
            || normalized.includes('/node_modules/scheduler/')
          ) {
            return 'vendor-react';
          }
          if (normalized.endsWith('/shared/report-languages.json')) return 'report-i18n';
          if (
            normalized.endsWith('/shared/report-mercolleida-markets.json')
            || normalized.endsWith('/frontend/src/lib/produccion-proteinas.js')
            || normalized.endsWith('/shared/mexico-state-production.json')
            || normalized.endsWith('/shared/mexico-annual-trade.json')
            || normalized.endsWith('/shared/report-bond-countries.json')
          ) {
            return 'report-datasets';
          }
          return undefined;
        },
      },
    },
  },
  server: {
    port: PUERTO_WEB,
    strictPort: true,
    proxy: {
      '/api':        API,
      '/assets':     API,
      '/inicio.html': API,
    },
  },
});
