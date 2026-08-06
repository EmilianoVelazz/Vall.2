import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/*
 * El backend Express corre en :3001 y sirve tanto /api como los estáticos y las
 * páginas HTML. En desarrollo se hace proxy de todo eso para reutilizar backend
 * y diseño SIN cambios.
 *
 * Nota sobre las rutas: el árbol usa /assets/** (css, js, img). La versión
 * anterior de este archivo proxeaba /css, /js e /img, que en este repositorio ya
 * no existen — de ahí que haya que declarar /assets.
 *
 * Las páginas .html SÍ se proxean, al revés que antes: LegacyPage las trae por
 * fetch en tiempo de ejecución, así que tienen que llegar al backend.
 */
export default defineConfig({
  plugins: [react()],
  build: {
    // Por defecto Vite emite a dist/assets, que es justo el nombre de la carpeta
    // de estáticos del sitio legacy (assets/css, assets/img, assets/js). Hoy no
    // chocarían porque el legacy solo tiene subcarpetas, pero mezclar el bundle
    // de React con los assets heredados hace imposible distinguirlos en dist/.
    assetsDir: 'vn-app',
  },
  server: {
    port: 5173,
    proxy: {
      '/api':        'http://localhost:3001',
      '/assets':     'http://localhost:3001',
      '/pages':      'http://localhost:3001',
      '/inicio.html': 'http://localhost:3001',
      '/index.html':  'http://localhost:3001',
      // Legado: algunas rutas antiguas siguen apareciendo en enlaces sueltos.
      '/Logotipos':  'http://localhost:3001',
      '/fonts':      'http://localhost:3001',
    },
  },
});
