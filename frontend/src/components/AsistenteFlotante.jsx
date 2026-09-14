import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import loadScripts from '../lib/loadScripts.js';

/**
 * Burbuja de chat de VALL-AI.
 *
 * En el sitio en HTML, `chat-widget.js` iba en el <head> de cada página menos
 * vall-ai.html — la propia página del asistente — y configuracion no llevaba el
 * de banderas. Al migrar, ninguna página lo cargó y la burbuja desapareció de
 * todo el sitio sin que saltara ningún error.
 *
 * Aquí se carga UNA sola vez, a nivel de aplicación, en vez de por página: el
 * guion son 1.955 líneas que se automontan y guardan el historial de la
 * conversación en memoria. Montarlo y desmontarlo en cada navegación perdería
 * ese hilo, que es justo lo que un asistente flotante no debe hacer. Su
 * buildWidget() ya es idempotente (sale si #vn-cw existe), así que basta con
 * cargarlo y luego enseñar u ocultar el nodo según la ruta.
 */

const OCULTO_EN = new Set([
  '/',            // login: aún no hay sesión
  '/vall-ai',     // es la página del asistente; la burbuja sobra
]);

export default function AsistenteFlotante() {
  const { pathname } = useLocation();
  const visible = !OCULTO_EN.has(pathname);

  useEffect(() => {
    if (!visible) return undefined;
    let vivo = true;
    // v=35: informes extensos y mayor espera para Gemini Pro.
    loadScripts(['/assets/js/chat-widget.js?v=39']).catch((err) => {
      console.error('No se pudo cargar la burbuja de VALL-AI', err);
    });
    return () => { vivo = false; void vivo; };
  }, [visible]);

  /* El nodo lo crea el guion fuera de React, así que se controla por estilo en
     vez de desmontarlo: destruirlo obligaría a reconstruir el historial. */
  useEffect(() => {
    const nodo = document.getElementById('vn-cw');
    if (nodo) nodo.style.display = visible ? '' : 'none';
  });

  return null;
}
