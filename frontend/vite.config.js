import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// El backend Express (VALLNews) corre en :3001 y sirve tanto /api como los
// estáticos legacy (css, img, js, Logotipos). En desarrollo hacemos proxy de
// todo eso hacia Express para reutilizar el backend y el diseño SIN cambios.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Solo API + assets estáticos legacy (css/js/img/Logotipos) van al backend.
      // Las páginas .html legacy YA NO se sirven: todo se migró a rutas React, así
      // que cualquier enlace .html cae al SPA en vez de mostrar la página vieja.
      '/api':       'http://localhost:3001',
      '/css':       'http://localhost:3001',
      '/js':        'http://localhost:3001',
      '/img':       'http://localhost:3001',
      '/Logotipos': 'http://localhost:3001',
      '/fonts':     'http://localhost:3001',
    },
  },
});
