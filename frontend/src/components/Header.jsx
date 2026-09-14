import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import useTema from '../lib/tema.js';
import { apiPost } from '../api/client.js';

/*
 * Cabecera compartida: barra superior fina + rail lateral de secciones.
 *
 * Antes eran DOS filas completas (logo con eslogan centrado, y debajo los
 * enlaces separados por líneas verticales), unos 118 px de alto fijo en todas
 * las rutas. Ahora la barra mide 52 px y las secciones viven en un rail
 * vertical de 68 px, así que el contenido recupera altura de pantalla, que es
 * lo que escasea en las páginas de datos.
 *
 * El rail es `position: fixed`, y el desplazamiento del contenido lo hace
 * `body.vn-rail { padding-left }` — se pone al montar y se quita al desmontar,
 * el mismo patrón que el piloto oscuro. Los modales `position: fixed` a 100vw
 * siguen cubriendo la pantalla entera a propósito: son superposiciones.
 *
 * Sigue usando <Link>/<NavLink>: la navegación ocurre dentro de la SPA, sin
 * recargar el documento ni volver a descargar CSS y datos.
 */

/* `tono` es la familia de color de sección de base.css, validada para visión
   con deficiencia de color. Se reutiliza aquí para que el indicador del rail
   diga de qué sección se trata también por color, no solo por posición. */
/* `corto` es lo que se pinta en el rail, que solo tiene 68 px de ancho.
   "Geopolítica" no cabe y salía recortada con puntos suspensivos, que es la
   peor de las opciones: ocupa lo mismo y además no se lee. La abreviatura va
   explícita, y el nombre completo se conserva en `texto` para el cajón móvil,
   la paleta de comandos y el título accesible del enlace. */
/* `claves` son sinónimos para la paleta: lo que uno teclea buscando una sección
   casi nunca es su nombre. "dólar" o "tipo de cambio" llevan a México, "bolsa"
   o "tasas" a Finanzas. Van sin acentos porque la comparación se hace sobre
   texto aplanado. */
const SECCIONES = [
  { a: '/inicio', icono: 'fa-house', texto: 'Inicio', tono: null, claves: 'portada home principal resumen' },
  { a: '/finanzas', icono: 'fa-chart-line', texto: 'Finanzas', tono: 'finanzas', claves: 'bolsa tasas deuda bonos divisas banxico tiie acciones' },
  { a: '/mercados', icono: 'fa-globe', texto: 'Mercados', tono: 'mercados', claves: 'commodities materias primas petroleo wti maiz granos cobre indices' },
  { a: '/geopolitica', icono: 'fa-landmark', texto: 'Geopolítica', corto: 'Geopol.', tono: 'geo', claves: 'riesgo conflictos rutas mapa acled guerra suministro' },
  { a: '/mexico', icono: 'fa-flag', texto: 'México', tono: 'mexico', claves: 'peso dolar tipo de cambio inflacion nacional mxn' },
  { a: '/vall-ai', icono: 'fa-wand-magic-sparkles', texto: 'VALL AI', tono: 'ai', claves: 'asistente inteligencia artificial chat analisis prediccion' },
];

/* Fuera del rail pero alcanzables desde la paleta: sacarlas del menú no debería
   dejar la página sin ninguna puerta de entrada. Ajustes tiene además el avatar
   de la barra. */
const OTRAS = [
  { a: '/mercado-proteinas', icono: 'fa-leaf', texto: 'Proteínas', tono: 'proteinas', claves: 'carne cerdo res pollo maiz forraje raciones cme' },
  { a: '/configuracion', icono: 'fa-gear', texto: 'Configuración', tono: null, claves: 'ajustes tema cuenta preferencias perfil' },
];

/** Inicial para el avatar. El correo es lo único que hay del usuario. */
function inicialDe(correo) {
  const letra = (correo || '').trim()[0];
  return letra ? letra.toUpperCase() : '·';
}

/**
 * Marca en el nombre el trozo que coincide con lo tecleado.
 *
 * Se compara sobre el texto aplanado pero se recorta el ORIGINAL, para no
 * devolver "Mexico" donde pone "México". Los índices cuadran porque quitar una
 * tilde de un carácter precompuesto deja un carácter: si algún día entrara
 * texto ya descompuesto, el resaltado se correría una letra —feo, no roto.
 *
 * Devuelve el texto tal cual cuando la coincidencia vino por sinónimo o por
 * letras sueltas: ahí no hay un tramo continuo que marcar.
 */
function resaltar(texto, consulta) {
  const q = plano(consulta.trim());
  if (!q) return texto;
  const i = plano(texto).indexOf(q);
  if (i < 0) return texto;
  return (
    <>
      {texto.slice(0, i)}
      <mark className="vn-paleta-marca">{texto.slice(i, i + q.length)}</mark>
      {texto.slice(i + q.length)}
    </>
  );
}

/** Sin acentos ni mayúsculas: buscar "mexico" tiene que encontrar "México".
    El rango de marcas diacriticas va escapado y no con los caracteres
    literales: son combinantes invisibles, y cualquier reguardado del archivo con
    otra codificación los destruye sin dejar rastro en el diff. */
const plano = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [paletaOpen, setPaletaOpen] = useState(false);
  const [consulta, setConsulta] = useState('');
  const [marcado, setMarcado] = useState(0);

  const menuButtonRef = useRef(null);
  const navRef = useRef(null);
  const listaRef = useRef(null);
  const inputRef = useRef(null);
  const paletaRef = useRef(null);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const seccionActual = SECCIONES.find((seccion) => seccion.a === pathname) || SECCIONES[0];

  const { user, logout } = useAuth();
  const [tema, alternarTema] = useTema();

  // ── Rail: desplaza el contenido mientras esta cabecera esté montada ─────────
  useEffect(() => {
    document.body.classList.add('vn-rail');
    return () => document.body.classList.remove('vn-rail');
  }, []);

  // ── Aguja: un único indicador que se desliza al elemento activo ─────────────
  /* Antes cada elemento activo dibujaba su propia barrita con un ::before. Con
     una sola que se mueve, el cambio de sección se ve —el ojo sigue la barra— y
     además desaparece el salto entre dos marcas distintas.
     Se mide el DOM en vez de calcularlo: la altura del elemento depende de si la
     etiqueta cabe en una línea o en dos, y eso solo lo sabe el navegador.
     useLayoutEffect y no useEffect: midiendo después de pintar se ve un
     fotograma con la aguja en el sitio anterior. */
  const [aguja, setAguja] = useState(null);
  useLayoutEffect(() => {
    const lista = listaRef.current;
    if (!lista) return undefined;
    const medir = () => {
      const activo = lista.querySelector('.vn-nav-item.activo');
      setAguja(activo ? { y: activo.offsetTop, alto: activo.offsetHeight } : null);
    };
    medir();
    // El rail cambia de forma al pasar a cajón móvil y al reflotar las
    // etiquetas; sin observarlo la aguja se queda donde estaba.
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(medir);
    ro.observe(lista);
    return () => ro.disconnect();
  }, [pathname]);

  // ── Cerrar sesión ───────────────────────────────────────────────────────────
  /* El backend ya tenía POST /api/logout (borra la cookie httpOnly `vn_token`) y
     el contexto ya tenía logout(), pero no había un solo sitio en la interfaz
     desde donde llamarlos: la única forma de salir era cerrar el navegador.
     Hay que hacer las DOS cosas: logout() solo limpia sessionStorage, que es lo
     que mira ProtectedRoute, y dejaría la cookie viva hasta que caducara. */
  const [saliendo, setSaliendo] = useState(false);
  const cerrarSesion = useCallback(async () => {
    if (saliendo) return;
    setSaliendo(true);
    // Si la red falla se sale igual: quedarse dentro porque el servidor no
    // contesta es peor que dejar una cookie que caduca sola en 8 h.
    try { await apiPost('/api/logout', {}); } catch { /* sin conexión */ }
    logout();
    navigate('/', { replace: true });
  }, [saliendo, logout, navigate]);

  // ── Menú móvil: bloqueo de scroll, foco atrapado y Escape ───────────────────
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    if (menuOpen) requestAnimationFrame(() => navRef.current?.querySelector('a[href]')?.focus());

    const handleKeyDown = (event) => {
      if (!menuOpen) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        setMenuOpen(false);
        requestAnimationFrame(() => menuButtonRef.current?.focus());
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...(navRef.current?.querySelectorAll('a[href], button:not([disabled])') || [])];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const handleResize = () => {
      if (window.innerWidth > 900) setMenuOpen(false);
    };

    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleResize, { passive: true });
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleResize);
    };
  }, [menuOpen]);

  // ── Paleta de comandos: ⌘K / Ctrl+K ────────────────────────────────────────
  /* Es navegación, no búsqueda de contenido: salta a cualquier sección
     escribiendo. Se eligió esto y no un buscador porque no hay índice de
     contenido detrás — un campo que no encuentra nada es peor que no tenerlo.
     La etiqueta dice "Ir a…" para no prometer lo que no hace. */
  const abrirPaleta = useCallback(() => {
    setConsulta('');
    setMarcado(0);
    setPaletaOpen(true);
  }, []);

  useEffect(() => {
    const atajo = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletaOpen((abierta) => {
          if (abierta) return false;
          setConsulta('');
          setMarcado(0);
          return true;
        });
      }
    };
    document.addEventListener('keydown', atajo);
    return () => document.removeEventListener('keydown', atajo);
  }, []);

  /* Las acciones son lo que la paleta NO podía hacer antes: solo listaba rutas,
     así que para cambiar el tema había que ir a Configuración y volver. Llevan
     `hacer` en vez de `a`, y es lo único que las distingue al ejecutarlas. */
  const ACCIONES = useMemo(() => [
    {
      id: 'tema', icono: tema === 'dark' ? 'fa-sun' : 'fa-moon', tono: 'ai',
      texto: tema === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro',
      claves: 'tema modo oscuro claro apariencia color',
      hacer: alternarTema, cerrar: false,
    },
    {
      id: 'salir', icono: 'fa-arrow-right-from-bracket', tono: null,
      texto: 'Cerrar sesión', claves: 'salir logout desconectar cuenta',
      hacer: cerrarSesion, cerrar: true,
    },
  ], [tema, alternarTema, cerrarSesion]);

  const TODO = useMemo(
    () => [
      ...SECCIONES.map((d) => ({ ...d, grupo: 'Secciones' })),
      ...OTRAS.map((d) => ({ ...d, grupo: 'Otras páginas' })),
      ...ACCIONES.map((d) => ({ ...d, grupo: 'Acciones' })),
    ],
    [ACCIONES]
  );

  /* Puntuación. Antes era un `includes` sobre el nombre y nada más: escribir
     "dolar" no encontraba México, y "geo" sí encontraba Geopolítica solo porque
     el nombre empieza igual. Ahora se mira también la lista de sinónimos, y en
     último lugar se acepta que las letras aparezcan EN ORDEN aunque no sean
     seguidas ("gpl" → Geopolítica), que es lo que hace que teclear rápido
     funcione. El número que devuelve es la calidad de la coincidencia, para
     que lo mejor quede arriba y no lo primero que se declaró. */
  const puntuar = useCallback((destino, q) => {
    const nombre = plano(destino.texto);
    if (nombre === q) return 100;
    if (nombre.startsWith(q)) return 90;
    if (nombre.includes(q)) return 75;
    const claves = plano(destino.claves || '');
    if (claves.split(/\s+/).some((k) => k.startsWith(q))) return 60;
    if (claves.includes(q)) return 45;
    let i = 0;
    for (const c of nombre) if (c === q[i]) i++;
    return i === q.length ? 20 : 0;
  }, []);

  const resultados = useMemo(() => {
    const q = plano(consulta.trim());
    if (!q) return TODO;
    return TODO
      .map((d) => ({ d, p: puntuar(d, q) }))
      .filter((x) => x.p > 0)
      .sort((a, b) => b.p - a.p)
      .map((x) => x.d);
  }, [consulta, TODO, puntuar]);

  /* La lista se pinta por grupos, pero el teclado recorre una sola secuencia:
     por eso el índice del marcado es el de `resultados` y los encabezados se
     insertan al pintar. Con la lista ordenada por puntuación, los grupos solo
     aparecen si el orden no los mezcla, así que al buscar se muestran planos. */
  const agrupados = useMemo(() => {
    if (consulta.trim()) return [{ grupo: null, items: resultados }];
    const orden = ['Secciones', 'Otras páginas', 'Acciones'];
    return orden
      .map((grupo) => ({ grupo, items: resultados.filter((d) => d.grupo === grupo) }))
      .filter((g) => g.items.length);
  }, [consulta, resultados]);

  useEffect(() => {
    if (paletaOpen) requestAnimationFrame(() => inputRef.current?.focus());
  }, [paletaOpen]);

  // El marcado se sale de rango al filtrar; se vuelve al primero.
  useEffect(() => { setMarcado(0); }, [consulta]);

  const ejecutar = useCallback((destino) => {
    if (!destino) return;
    if (destino.hacer) {
      // El interruptor de tema deja la paleta abierta a propósito: se ve el
      // cambio detrás y se puede volver atrás sin reabrirla.
      if (destino.cerrar !== false) setPaletaOpen(false);
      destino.hacer();
      return;
    }
    setPaletaOpen(false);
    navigate(destino.a);
  }, [navigate]);

  const teclasPaleta = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); setPaletaOpen(false); return; }
    const n = resultados.length;
    if (e.key === 'ArrowDown') { e.preventDefault(); setMarcado((i) => (i + 1) % Math.max(n, 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setMarcado((i) => (i - 1 + n) % Math.max(n, 1)); return; }
    if (e.key === 'Home') { e.preventDefault(); setMarcado(0); return; }
    if (e.key === 'End') { e.preventDefault(); setMarcado(Math.max(n - 1, 0)); return; }
    if (e.key === 'Enter') { e.preventDefault(); ejecutar(resultados[marcado]); }
  };

  const closeMenu = () => setMenuOpen(false);

  return (
    <>
      <header className="vn-topbar">
        <Link className="vn-brand" to="/inicio">
          <span className="vn-rail-cap" aria-hidden="true">
            <img src="/assets/img/logo1.png" alt="" />
          </span>
          <span className="vn-brand-txt">VALLNews</span>
        </Link>

        <span
          className="vn-contexto"
          style={seccionActual.tono ? { '--tono': `var(--sec-${seccionActual.tono})` } : undefined}
          aria-label={`Sección actual: ${seccionActual.texto}`}
        >
          <span className="vn-contexto-punto" aria-hidden="true" />
          <span className="vn-contexto-etq">Sección</span>
          <strong>{seccionActual.texto}</strong>
        </span>

        <button type="button" className="vn-cmd" onClick={abrirPaleta}>
          <i className="fas fa-magnifying-glass" aria-hidden="true" />
          {/* Antes decía "Ir a una sección…". Ahora la paleta también ejecuta
              acciones, así que la etiqueta lo dice: sigue sin prometer que
              busque noticias, que es lo que no hay detrás. */}
          <span className="vn-cmd-txt">Buscar sección o acción…</span>
          <kbd className="vn-cmd-kbd">⌘K</kbd>
        </button>

        {/* La inicial del correo en vez de un icono de persona genérico: es el
            único dato real que hay del usuario y confirma con qué cuenta se
            está dentro, que es justo lo que se viene a mirar aquí. */}
        <Link to="/configuracion" className="vn-cuenta" title={user ? `Cuenta: ${user}` : 'Configuración de cuenta'}>
          <span className="vn-cuenta-inicial" aria-hidden="true">{inicialDe(user)}</span>
          <span className="vn-sr">{user ? `Cuenta de ${user}. Ir a configuración` : 'Configuración de cuenta'}</span>
        </Link>

        <button
          ref={menuButtonRef}
          className={`vn-hamburger${menuOpen ? ' vn-ham-open' : ''}`}
          type="button"
          aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
          aria-controls="vn-react-primary-navigation"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span /><span /><span />
        </button>
      </header>

      <nav
        ref={navRef}
        id="vn-react-primary-navigation"
        className={`vn-nav${menuOpen ? ' vn-nav-open' : ''}`}
        aria-label="Navegación principal"
      >
        <div className="vn-nav-lista" ref={listaRef}>
          {/* La aguja va ANTES que los enlaces para quedar por debajo de ellos
              sin necesidad de z-index. Sale del marcado cuando no hay sección
              activa (una ruta que no esté en el rail), en vez de quedarse
              apuntando a un sitio que ya no corresponde. */}
          {aguja && (
            <span
              className="vn-nav-aguja"
              aria-hidden="true"
              style={{
                '--y': `${aguja.y}px`,
                '--alto': `${aguja.alto}px`,
                '--tono': seccionActual.tono ? `var(--sec-${seccionActual.tono})` : '#7fb2e6',
              }}
            />
          )}
          {SECCIONES.map(({ a, icono, texto, corto, tono }) => (
            <NavLink
              key={a}
              to={a}
              className={({ isActive }) => `vn-nav-item${isActive ? ' activo' : ''}`}
              style={tono ? { '--tono': `var(--sec-${tono})` } : undefined}
              onClick={closeMenu}
              title={texto}
            >
              <i className={`fas ${icono}`} aria-hidden="true" />
              {/* Dos etiquetas, una visible cada vez: el rail estrecho usa la
                  abreviatura y el cajón móvil, que tiene sitio de sobra, el
                  nombre completo. La que no se ve queda oculta a la vista pero
                  legible por lector de pantalla, así que la navegación asistida
                  nunca oye "Geopol.". */}
              <span className="vn-nav-txt vn-nav-corto" aria-hidden="true">{corto || texto}</span>
              <span className="vn-nav-txt vn-nav-largo">{texto}</span>
            </NavLink>
          ))}
        </div>

        {/* ── Pie del rail ──────────────────────────────────────────────────
            El rail tenía siete secciones arriba y dos tercios de alto vacíos
            debajo. Aquí van las tres acciones de cuenta, separadas de la
            navegación por una regla: no son destinos, son cosas que se hacen. */}
        <div className="vn-nav-pie">
          <button
            type="button"
            className="vn-nav-item vn-nav-accion"
            onClick={alternarTema}
            title={tema === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
            aria-pressed={tema === 'dark'}
          >
            <i className={`fas ${tema === 'dark' ? 'fa-sun' : 'fa-moon'}`} aria-hidden="true" />
            <span className="vn-nav-txt">{tema === 'dark' ? 'Claro' : 'Oscuro'}</span>
          </button>

          {/* Ajustes salió del rail el 2026-08-18. Se llega por el avatar de la
              barra y por la paleta; no hacía falta una tercera puerta. */}
          <button
            type="button"
            className="vn-nav-item vn-nav-accion vn-nav-salir"
            onClick={cerrarSesion}
            disabled={saliendo}
            title={user ? `Cerrar la sesión de ${user}` : 'Cerrar sesión'}
          >
            <i className={`fas ${saliendo ? 'fa-circle-notch vn-girando' : 'fa-arrow-right-from-bracket'}`} aria-hidden="true" />
            <span className="vn-nav-txt">{saliendo ? 'Saliendo' : 'Salir'}</span>
          </button>
        </div>
      </nav>

      {paletaOpen && (
        <div
          className="vn-paleta-fondo"
          role="presentation"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setPaletaOpen(false); }}
        >
          { }
          <div
            ref={paletaRef}
            className="vn-paleta"
            role="dialog"
            aria-modal="true"
            aria-label="Ir a una sección"
            onKeyDown={teclasPaleta}
          >
            <div className="vn-paleta-campo">
              <i className="fas fa-magnifying-glass" aria-hidden="true" />
              <input
                ref={inputRef}
                type="text"
                value={consulta}
                onChange={(e) => setConsulta(e.target.value)}
                placeholder="Busca una sección o una acción…"
                aria-label="Buscar sección o acción"
                autoComplete="off"
                spellCheck="false"
              />
              {consulta && (
                <button
                  type="button"
                  className="vn-paleta-limpiar"
                  onClick={() => { setConsulta(''); inputRef.current?.focus(); }}
                  aria-label="Borrar la búsqueda"
                >
                  <i className="fas fa-xmark" aria-hidden="true" />
                </button>
              )}
              <kbd>ESC</kbd>
            </div>

            <ul className="vn-paleta-lista" role="listbox" aria-label="Resultados">
              {agrupados.map(({ grupo, items }) => (
                <Fragment key={grupo || '_'}>
                  {grupo && <li className="vn-paleta-grupo" role="presentation">{grupo}</li>}
                  {items.map((d) => {
                    // El índice es el de la lista PLANA: el teclado recorre una
                    // sola secuencia aunque se pinte separada por grupos.
                    const i = resultados.indexOf(d);
                    return (
                      <li key={d.a || d.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={i === marcado}
                          className={`vn-paleta-item${i === marcado ? ' marcado' : ''}`}
                          onMouseEnter={() => setMarcado(i)}
                          onClick={() => ejecutar(d)}
                          style={d.tono ? { '--tono': `var(--sec-${d.tono})` } : undefined}
                        >
                          <i className={`fas ${d.icono}`} aria-hidden="true" />
                          <span className="vn-paleta-txt">{resaltar(d.texto, consulta)}</span>
                          <span className="vn-paleta-ruta">
                            {d.hacer ? <><i className="fas fa-bolt" aria-hidden="true" /> acción</> : d.a}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </Fragment>
              ))}
              {!resultados.length && (
                <li className="vn-paleta-vacio">
                  <i className="fas fa-magnifying-glass" aria-hidden="true" />
                  <p>Nada coincide con «{consulta.trim()}».</p>
                  {/* Decir qué se puede buscar es más útil que decir que no hay
                      nada: aquí no hay índice de artículos, solo secciones y
                      acciones, y conviene que se note. */}
                  <small>Se buscan secciones y acciones, no noticias. Prueba con «dólar», «bolsa» o «tema».</small>
                </li>
              )}
            </ul>

            <div className="vn-paleta-pie">
              <span><kbd>↑</kbd><kbd>↓</kbd> moverse</span>
              <span><kbd>↵</kbd> abrir</span>
              <span><kbd>esc</kbd> cerrar</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
