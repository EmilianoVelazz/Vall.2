import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const PUERTO_WEB = Number(process.env.VN_WEB_PORT) || 5273;
const API = `http://localhost:${Number(process.env.VN_API_PORT) || 3101}`;
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    assetsDir: 'vn-app',
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
