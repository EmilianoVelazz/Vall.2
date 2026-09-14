/*
 * La sala de noticias de Mercados, CON LA PLANTILLA DE DAILY NEWS.
 *
 * ── Qué es esto exactamente ────────────────────────────────────────────────
 * Es el marcado de Finanzas › Daily News (`Finanzas.jsx`, líneas 505-832)
 * copiado pieza por pieza —cabecera, pulso, ruta de lectura, navegación
 * interna, temas, mesa, portada, radar, dossiers, claves, cobertura e índice—
 * con el mismo árbol de clases `.fnb-*`, para que herede TAL CUAL sus cuatro
 * hojas de estilo. Lo que cambia es de dónde salen los datos: allí son finanzas
 * globales, aquí son los insumos y materias primas de Mercados.
 *
 * ── Por qué se puede heredar su hoja sin romper Mercados ───────────────────
 * El tema oscuro de Daily News NO vive en `daily-news-favro.css` (esa es la
 * base clara): son 1.264 reglas repartidas en `daily-news-editorial.css`,
 * `-coverage-window` y `-story-index`, todas colgadas de
 * `html.vn-dark-pilot body.vn-dark-finanzas.ff-detail-noticias`. Sin esas tres
 * clases, esto se vería BLANCO dentro de una página oscura.
 *
 * Ponerlas en Mercados parecía arriesgado —`dark-pilot.css` tiene otras 1.123
 * reglas colgadas de `body.vn-dark-finanzas`— así que se midió antes: se
 * cargaron las cuatro hojas sobre Mercados, se añadieron las clases y se
 * compararon los estilos calculados de las 64 piezas del cromo de la página
 * (cabecera, cinta, pestañas, enlaces, títulos, pie). Cambiaron CERO: todas esas
 * reglas apuntan a selectores `.ff-*` y `.fin-*` que en Mercados no existen. De
 * ahí que las clases se pongan y se quiten con la pestaña, desde Mercados.jsx.
 *
 * ── La fuente ──────────────────────────────────────────────────────────────
 * `/api/daily-news-markets` (backend/routes/finanzas.js). Es la misma tubería
 * editorial que Daily News pero apuntada a materias primas: NewsAPI + Finnhub +
 * GDELT, reescritos al español por Gemini, con `category`, `impact`, `sentiment`
 * y un `insight` por nota («qué significa para el costo»), más un `briefing` de
 * la jornada. Se consume tal cual: NO se reclasifica aquí con el clasificador de
 * palabras de lib/mercados.js — hacerlo sería pisar una categoría editorial con
 * una heurística peor.
 *
 * ── Ojo con los `id` ───────────────────────────────────────────────────────
 * Los del marcado original (`#fnb-grid`, `#fnb-lead`…) son los que
 * `finanzas-favro.js` usa para rellenar la sala de Finanzas. Aquí NO corre ese
 * script —esto es React y se pinta solo—, y por si algún día se cargara en esta
 * página, los id propios van con prefijo `mkt-` para no colisionar.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clasificarNoticia, impactoNoticia } from '../lib/mercados.js';

const CAT_ICONO = {
  granos: 'fa-seedling',
  energia: 'fa-oil-well',
  metales: 'fa-layer-group',
  logistica: 'fa-ship',
  macro: 'fa-chart-line',
};
const CAT_ES = {
  granos: 'Granos', energia: 'Energía', metales: 'Metales',
  logistica: 'Logística', macro: 'Macro',
};

/* El impacto NO lleva color en línea: la plantilla ya tiene `.fnb-impact.alto`,
   `.medio` y `.bajo` con su propio tratamiento (borde de `currentColor` y tinta
   del nivel). Pintarlo desde el JSX le ganaba a la hoja y rompía justo la parte
   que se quería copiar literal. Los valores que llegan de la API son esos tres. */

/* ── El pulso ──────────────────────────────────────────────────────────────
   NO son divs posicionados: en la plantilla el pulso es un SVG, y su hoja
   estiliza `<circle class="fnb-pulse-dot">` con `fill`/`stroke` dentro de un
   `<g class="fnb-pulse-node s-{sentimiento} i-{impacto}">`. Con divs, las 24
   historias estaban en el DOM y el campo salía VACÍO — `fill` no pinta un div.

   Las constantes de geometría son las mismas de finanzas-favro.js (líneas
   2862-2868) para que el campo caiga exactamente donde la hoja lo espera: el
   `viewBox`, los márgenes que reservan sitio al rótulo de horas y a la onda, y
   los tres radios por banda de impacto. Si allí se tocan, aquí también. */
const PULSO_W = 1000;
const PULSO_H = 320;
const PULSO_PAD = { izq: 78, der: 26, arriba: 26, abajo: 94 };
const PULSO_ONDA_BASE = PULSO_H - 6;
const PULSO_ONDA_ALTO = 42;
const PULSO_BANDAS = [
  { key: 'alto', etiqueta: 'Alto', radio: 10 },
  { key: 'medio', etiqueta: 'Medio', radio: 7.5 },
  { key: 'bajo', etiqueta: 'Bajo', radio: 5.5 },
];

const catClave = (n) => (CAT_ES[n?.category] ? n.category : 'macro');
const catNombre = (n) => n?.categoryLabel || CAT_ES[catClave(n)];
const impClave = (n) => {
  const i = (n?.impact || '').toLowerCase();
  return i === 'alto' || i === 'bajo' ? i : 'medio';
};
const esImagen = (u) => typeof u === 'string' && /^(?:https?:\/\/|\/api\/)/.test(u);

/* ── Logotipo o fotografía ─────────────────────────────────────────────────
   No todas las «imágenes» que llegan son de la noticia. De las 24 de una edición
   típica, 13 son el LOGOTIPO de la agencia —Finnhub sirve
   `static2.finnhub.io/file/finnhub/logo/reuters_logo.jpeg` cuando el artículo no
   trae foto— y 11 son fotos reales del medio (`image.cnbcfm.com`).

   Antes se desenfocaban las 24 por igual para que el logotipo no se leyera
   detrás del titular. Eso arreglaba las 13 malas y ESTROPEABA las 11 buenas: una
   foto real quedaba convertida en una mancha de color.

   La ruta lo dice sin ambigüedad, así que se separan: la foto se enseña nítida y
   el logotipo no se enseña —la pieza cae a su fondo de reserva, que es lo que la
   plantilla ya prevé—. Enseñar el logotipo de Reuters como si fuera la imagen de
   la noticia no informa de nada. */
const esLogo = (u) => /\/logos?\/|[-_]logo\./i.test(decodeURIComponent(u || ''));

/** La imagen SOLO si es una fotografía de la noticia; null si es un logotipo. */
const fotoDe = (n) => {
  if (!esImagen(n?.image)) return null;
  return esLogo(n.imageRaw || n.image) ? null : n.image;
};

/* Un enlace si hay url, un div si no. La plantilla usa <button> porque abre su
   lector modal; aquí la noticia se abre en su medio, así que es <a> con `rel`
   puesto, que es lo que se olvida. */
function Enlace({ a, className, children, ...resto }) {
  const C = a?.url ? 'a' : 'div';
  return (
    <C
      className={className}
      {...(a?.url ? { href: a.url, target: '_blank', rel: 'noopener noreferrer' } : {})}
      {...resto}
    >
      {children}
    </C>
  );
}

function Chips({ n }) {
  const c = catClave(n);
  const i = impClave(n);
  return (
    <div className="fnb-chips">
      <span className="fnb-cat" data-cat={c}>
        <i className={`fas ${CAT_ICONO[c]}`} aria-hidden="true" /> {catNombre(n)}
      </span>
      <span className={`fnb-impact ${i}`}>Impacto {i}</span>
    </div>
  );
}

const DOSSIERS = [
  ['granos', 'fa-seedling', 'Granos'],
  ['energia', 'fa-oil-well', 'Energía'],
  ['metales', 'fa-layer-group', 'Metales'],
  ['logistica', 'fa-ship', 'Flete'],
];

/* ── El respaldo ───────────────────────────────────────────────────────────
 * La sala vivía de UNA sola llamada, `/api/daily-news-markets`. Si esa llamada
 * fallaba —backend recién arrancado y fuentes de origen caídas, que devuelven
 * 502/503 con más frecuencia de la que parece— la sección se quedaba en un
 * cartel de «edición no disponible». Un solo punto de fallo para todo el
 * apartado.
 *
 * Mercados YA carga noticias por su cuenta, con una tubería DISTINTA e
 * independiente (`cargarNoticias` en Mercados.jsx: Alpha Vantage, Finnhub,
 * GDELT y los boletines propios de VALL). Se le pasan a la sala como respaldo:
 * para que las dos caigan a la vez tienen que fallar dos cadenas separadas.
 *
 * El respaldo NO trae lo que aporta el editorial de Gemini —está en inglés y no
 * tiene `insight` ni `sentiment`—, así que se adapta a la misma forma y se
 * marca: la cabecera dice de dónde viene la edición y el pulso pinta todo como
 * neutral en vez de inventarse un sentimiento. Es peor edición que la buena,
 * pero es una edición.
 */
function adaptarRespaldo(a) {
  const cat = clasificarNoticia(a.title) || clasificarNoticia(a.desc) || 'macro';
  const imp = impactoNoticia(a).etiqueta[0];
  return {
    title: a.title,
    description: a.desc || '',
    insight: null,
    category: cat,
    categoryLabel: CAT_ES[cat],
    /* Sin sentimiento en esta tubería: el pulso lo pinta neutral. Inventarle una
       dirección al precio a partir del titular sería justo lo que esta sección
       no hace. */
    sentiment: 'neutral',
    impact: imp === '▲' ? 'alto' : imp === '◆' ? 'medio' : 'bajo',
    source: a.src || 'Agencia',
    url: a.url || '',
    image: a.image || '',
    imageRaw: a.image || '',
    publishedAt: a.ts ? new Date(a.ts).toISOString() : null,
    fecha: a.fecha || '',
  };
}

export default function SalaNoticiasMercados({ respaldo = [], horaRespaldo = '' }) {
  const [noticias, setNoticias] = useState([]);
  const [briefing, setBriefing] = useState([]);
  const [meta, setMeta] = useState({ generado: '', fuente: '', editorial: false });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const [dossier, setDossier] = useState('granos');
  const [busca, setBusca] = useState('');
  const [ordenIndice, setOrdenIndice] = useState('recent');
  const [foco, setFoco] = useState(0);
  const [punto, setPunto] = useState(null);

  useEffect(() => {
    let vivo = true;
    setCargando(true);

    /* Cae al respaldo tanto si la llamada revienta como si vuelve VACÍA: una
       respuesta 200 con cero noticias deja la sección igual de muerta que un
       502, y era el caso que no estaba cubierto. */
    const alRespaldo = (motivo) => {
      if (!vivo) return;
      const lista = respaldo.filter((a) => a && a.title).map(adaptarRespaldo);
      if (lista.length) {
        setNoticias(lista);
        setBriefing(respaldo.filter((a) => a.brief).slice(0, 3).map((a) => a.desc || a.title));
        setMeta({
          generado: horaRespaldo ? `Actualizada ${horaRespaldo}` : 'Edición de reserva',
          fuente: 'Fuentes directas de la sección · edición sin asistencia editorial',
          editorial: false,
        });
        setError(null);
      } else {
        setError(motivo);
      }
      setCargando(false);
    };

    fetch('/api/daily-news-markets')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j) => {
        if (!vivo) return;
        const d = j?.data || {};
        const lista = Array.isArray(d.noticias) ? d.noticias.filter((n) => n && n.title) : [];
        if (!lista.length) { alRespaldo('la edición llegó vacía'); return; }
        setNoticias(lista);
        setBriefing(Array.isArray(d.briefing) ? d.briefing : []);
        setMeta({ generado: d.generado || '', fuente: d.fuente || '', editorial: !!d.editorial });
        setError(null);
        setCargando(false);
      })
      .catch((e) => alRespaldo(e.message));

    return () => { vivo = false; };
    /* `respaldo` es un array nuevo en cada render de la página; la longitud es
       una clave estable y basta: lo que importa es reintentar cuando el respaldo
       PASA de vacío a lleno, no cuando cambia una noticia. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [respaldo.length, horaRespaldo]);

  const ed = useMemo(() => {
    const portada = noticias[0] || null;
    const parrilla = noticias.slice(1, 7);
    const restantes = noticias.slice(7);
    const cuenta = {};
    for (const n of noticias) {
      const c = catClave(n);
      cuenta[c] = (cuenta[c] || 0) + 1;
    }
    const dom = Object.entries(cuenta).sort((a, b) => b[1] - a[1])[0];
    const palabras = noticias.reduce(
      (s, n) => s + `${n.title || ''} ${n.description || ''}`.split(/\s+/).filter(Boolean).length, 0,
    );
    return {
      portada,
      parrilla,
      restantes,
      cuenta,
      alto: noticias.filter((n) => impClave(n) === 'alto').length,
      propias: noticias.filter((n) => catClave(n) !== 'macro').length,
      foco: dom ? CAT_ES[dom[0]] : '—',
      minutos: Math.max(1, Math.round(palabras / 200)),
      /* La cobertura es el carrusel VISUAL de la plantilla: solo entran las que
         traen FOTOGRAFÍA. Con el logotipo de la agencia la tarjeta quedaba en un
         rectángulo de color con el titular encima, que es justo lo que el
         usuario vio como «solo recuadros». */
      cobertura: noticias.filter((n) => fotoDe(n)).slice(0, 8),
      /* Las claves salen del `insight` que ya trae cada nota — «qué significa
         para el costo»—, no de un modelo aparte ni de un texto inventado. */
      claves: noticias.filter((n) => n.insight).slice(0, 6),
    };
  }, [noticias]);

  const indice = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const plano = (s) => (s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
    const lista = q
      ? noticias.filter((n) => plano(`${n.title} ${n.description} ${n.source} ${catNombre(n)}`).includes(plano(q)))
      : noticias;
    const peso = { alto: 3, medio: 2, bajo: 1 };
    return [...lista].sort((a, b) => (ordenIndice === 'impact'
      ? peso[impClave(b)] - peso[impClave(a)]
      : new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0)));
  }, [noticias, busca, ordenIndice]);

  const delDossier = useMemo(
    () => noticias.filter((n) => catClave(n) === dossier).slice(0, 6),
    [noticias, dossier],
  );

  /* Los puntos del campo, ya en coordenadas del viewBox. El eje X es la hora de
     publicación —el pulso es cronológico, que es lo que le da sentido— y la
     banda es el impacto. Las notas sin fecha utilizable se reparten por su
     posición en la lista en vez de amontonarse en el origen. */
  const pulso = useMemo(() => {
    if (!noticias.length) return { puntos: [], onda: '', horas: [] };
    const ancho = PULSO_W - PULSO_PAD.izq - PULSO_PAD.der;
    const alto = PULSO_H - PULSO_PAD.arriba - PULSO_PAD.abajo;
    const conT = noticias.map((n, i) => {
      const t = new Date(n.publishedAt || 0).getTime();
      return { n, i, t: Number.isFinite(t) && t > 0 ? t : null };
    });
    const validos = conT.map((p) => p.t).filter(Boolean);
    const min = validos.length ? Math.min(...validos) : 0;
    const max = validos.length ? Math.max(...validos) : 1;
    const x = (p) => (p.t == null
      ? PULSO_PAD.izq + (p.i / Math.max(1, noticias.length - 1)) * ancho
      : PULSO_PAD.izq + ((p.t - min) / (max - min || 1)) * ancho);

    const puntos = conT.map((p) => {
      const imp = impClave(p.n);
      const banda = PULSO_BANDAS.findIndex((b) => b.key === imp);
      return {
        n: p.n,
        idx: p.i,
        x: x(p),
        y: PULSO_PAD.arriba + (alto / PULSO_BANDAS.length) * (banda + 0.5),
        r: PULSO_BANDAS[banda].radio,
        sentimiento: p.n.sentiment || 'neutral',
        impacto: imp,
      };
    }).sort((a, b) => a.x - b.x);

    /* La onda de intensidad del pie: cuánta carga informativa hay en cada tramo
       de la jornada. Se dibuja con el mismo `path` que la plantilla. */
    const peso = { alto: 1, medio: 0.6, bajo: 0.3 };
    const onda = puntos.length
      ? puntos.map((p, i) => {
        const y = PULSO_ONDA_BASE - peso[p.impacto] * PULSO_ONDA_ALTO;
        return `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${y.toFixed(1)}`;
      }).join(' ')
      : '';

    const hora = (t) => new Date(t).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    const horas = validos.length
      ? [0, 0.5, 1].map((f) => ({
        x: PULSO_PAD.izq + f * ancho,
        txt: hora(min + (max - min) * f),
      }))
      : [];

    return { puntos, onda, horas, alto };
  }, [noticias]);

  /* La plantilla ancla su navegación con `data-news-jump`, que maneja
     finanzas-favro.js. Aquí ese script no corre, así que el salto es propio. */
  const irA = useCallback((id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const mover = useCallback((paso) => {
    setFoco((f) => {
      const n = ed.cobertura.length;
      return n ? (f + paso + n) % n : 0;
    });
  }, [ed.cobertura.length]);

  /* ── El carrusel tiene que DESPLAZARSE ────────────────────────────────────
     `.fnb-coverage-grid` es una tira con `overflow-x: auto` y ~5.500 px de
     ancho dentro de una ventana de ~1.400. Cambiar `foco` solo movía la clase
     `is-active`: el contador avanzaba, la tarjeta marcada cambiaba… y la tira no
     se movía ni un píxel, así que a partir de la tercera historia el usuario
     pulsaba la flecha y no veía pasar nada. Eso es el «carrusel estático».

     En la plantilla el desplazamiento lo hace finanzas-favro.js, que aquí no
     corre; se reimplementa con el mismo efecto.

     Se mide con rectángulos y no con `offsetLeft`: la tarjeta activa lleva
     `transform` y su `offsetParent` no es necesariamente la tira, así que
     `offsetLeft` devuelve una distancia que no es la que hay que desplazar. */
  const pistaRef = useRef(null);
  useEffect(() => {
    const pista = pistaRef.current;
    const tarjeta = pista?.children?.[foco];
    if (!pista || !tarjeta) return;
    const rp = pista.getBoundingClientRect();
    const rt = tarjeta.getBoundingClientRect();
    // Centrada en la ventana de la tira, y sin salirse de los extremos.
    const destino = pista.scrollLeft + (rt.left - rp.left) - (rp.width - rt.width) / 2;
    pista.scrollTo({
      left: Math.max(0, Math.min(destino, pista.scrollWidth - pista.clientWidth)),
      behavior: 'smooth',
    });
  }, [foco, ed.cobertura.length]);

  if (cargando) {
    return (
      <section className="ff-newsroom fnb-newsroom" aria-busy="true">
        <div className="fnb-top">
          <div className="fnb-card is-skeleton" style={{ minHeight: '420px' }}><div className="fnb-card-media" /></div>
          <div className="fnb-card is-skeleton" style={{ minHeight: '420px' }}><div className="fnb-card-media" /></div>
        </div>
      </section>
    );
  }

  /* Solo se llega aquí si fallaron LAS DOS cadenas: el editorial y el respaldo
     directo de la sección. Con una sola caída, arriba ya se rellenó con la otra. */
  if (error || !noticias.length) {
    return (
      <section className="ff-newsroom fnb-newsroom">
        <div className="fnb-desk">
          <div style={{ gridColumn: '1 / -1' }}>
            <span>Sala de insumos</span>
            <strong>Edición no disponible</strong>
            <small>
              No respondió ni la edición asistida ni las fuentes directas de la sección
              {error ? ` (${error})` : ''}. Se reintenta al recargar.
            </small>
          </div>
        </div>
      </section>
    );
  }

  const notaPunto = punto != null ? noticias[punto] : null;
  const enFoco = ed.cobertura[foco] || ed.cobertura[0];

  return (
    <section className="ff-newsroom fnb-newsroom" aria-labelledby="mkt-news-title">
      {/* ══ Cabecera de edición ══ */}
      <section className="fnb-masthead" aria-labelledby="mkt-news-title">
        <header className="fnb-cover-copy">
          <div className="fnb-brand">
            <span className="fnb-kicker"><span className="fnb-live" /> Mesa de Insumos y Materias Primas</span>
            <h2 className="fnb-title" id="mkt-news-title">Mercados <em>Hoy</em></h2>
            <p className="fnb-cover-statement">Lee el costo <span>antes de que llegue a la factura.</span></p>
            <p className="fnb-sub">Una edición viva que conecta el titular, el insumo que toca y el precio que puede mover.</p>
          </div>

          <div className="fnb-edition" aria-live="polite">
            <span>Edición de insumos</span>
            <strong>{meta.generado || 'Edición del día'}</strong>
            <small>{meta.fuente || 'Fuentes de mercado conectadas'}</small>
          </div>

          <div className="fnb-cover-actions">
            <button className="is-primary" type="button" onClick={() => irA('mkt-front-page')}>
              <span>Entrar a la edición</span><i className="fas fa-arrow-down" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => irA('mkt-brief-section')}>
              <span>Resumen en 30 segundos</span><i className="fas fa-bolt" aria-hidden="true" />
            </button>
          </div>

          <div className="fnb-signal" aria-hidden="true">
            <span /><span /><span /><span /><span /><span /><span /><span />
          </div>
        </header>

        {/* ══ El pulso de la sesión ══ */}
        <section className="fnb-pulse" id="mkt-pulse-section" aria-labelledby="mkt-pulse-title">
          <header className="fnb-pulse-head">
            <div className="fnb-pulse-intro">
              <span className="fnb-pulse-kicker"><i className="fas fa-wave-square" aria-hidden="true" /> Radar de insumos en vivo</span>
              <h3 id="mkt-pulse-title">El pulso de la sesión</h3>
              <p>Cada punto es una historia: la altura es su impacto y el color, hacia dónde empuja el costo.</p>
            </div>
            <dl className="fnb-pulse-stats">
              <div><dt>Historias</dt><dd>{noticias.length}</dd></div>
              <div><dt>Alto impacto</dt><dd>{ed.alto}</dd></div>
              <div><dt>De la sección</dt><dd>{ed.propias}</dd></div>
              <div><dt>Foco</dt><dd>{ed.foco}</dd></div>
            </dl>
          </header>

          <div className="fnb-pulse-plot" id="mkt-pulse-plot">
            <svg className="fnb-pulse-svg" viewBox={`0 0 ${PULSO_W} ${PULSO_H}`} role="img" aria-label="Campo de historias por hora e impacto">
              <g className="fnb-pulse-grid">
                {PULSO_BANDAS.map((b, i) => {
                  const y = PULSO_PAD.arriba + (pulso.alto / PULSO_BANDAS.length) * (i + 0.5);
                  return (
                    <g key={b.key}>
                      <line x1={PULSO_PAD.izq} y1={y} x2={PULSO_W - PULSO_PAD.der} y2={y} />
                      <text className="fnb-pulse-band-label" x={PULSO_PAD.izq - 22} y={y + 4}>{b.etiqueta}</text>
                    </g>
                  );
                })}
              </g>

              {pulso.horas.map((h) => (
                <g key={h.txt}>
                  <line className="fnb-pulse-tick" x1={h.x} y1={PULSO_PAD.arriba} x2={h.x} y2={PULSO_H - PULSO_PAD.abajo} />
                  <text className="fnb-pulse-tick-label" x={h.x} y={PULSO_H - PULSO_PAD.abajo + 26}>{h.txt}</text>
                </g>
              ))}

              {pulso.onda && <path className="fnb-pulse-wave-line" d={pulso.onda} />}

              <g className="fnb-pulse-nodes">
                {pulso.puntos.map((p, orden) => (
                  <g
                    key={p.n.url || p.n.title}
                    className={`fnb-pulse-node s-${p.sentimiento} i-${p.impacto}${punto === p.idx ? ' is-active' : ''}`}
                    data-cat={catClave(p.n)}
                    tabIndex={0}
                    role="button"
                    aria-label={`${catNombre(p.n)}, impacto ${p.impacto}: ${p.n.title}`}
                    /* La entrada escalonada la hace la propia hoja con esta
                       variable; se replica el tope de 1.400 ms del original
                       para que 24 historias no tarden un minuto en aparecer. */
                    style={{ '--fnb-pulse-delay': `${Math.min(orden * 45, 1400)}ms` }}
                    onMouseEnter={() => setPunto(p.idx)}
                    onFocus={() => setPunto(p.idx)}
                    onClick={() => setPunto(p.idx)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPunto(p.idx); } }}
                  >
                    <circle className="fnb-pulse-halo" cx={p.x} cy={p.y} r={p.r + 7} />
                    <circle className="fnb-pulse-dot" cx={p.x} cy={p.y} r={p.r} />
                  </g>
                ))}
              </g>
            </svg>
          </div>

          <div className="fnb-pulse-legend">
            <span className="fnb-pulse-key up"><i aria-hidden="true" /> Presiona al alza</span>
            <span className="fnb-pulse-key down"><i aria-hidden="true" /> Presiona a la baja</span>
            <span className="fnb-pulse-key flat"><i aria-hidden="true" /> Neutral</span>
            <span className="fnb-pulse-hint">Toca o señala un punto</span>
          </div>

          <article className="fnb-pulse-detail" id="mkt-pulse-detail" aria-live="polite">
            {/* Las clases de esta ficha son las propias de la plantilla
                (`fnb-pulse-detail-*`), no las genéricas de tarjeta: la hoja las
                estiliza aparte y con otro nombre. */}
            {notaPunto ? (
              <>
                <span className="fnb-pulse-detail-cat" data-cat={catClave(notaPunto)}>
                  <i className={`fas ${CAT_ICONO[catClave(notaPunto)]}`} aria-hidden="true" /> {catNombre(notaPunto)}
                </span>
                <span className={`fnb-pulse-detail-impact i-${impClave(notaPunto)}`}>Impacto {impClave(notaPunto)}</span>
                <h4>{notaPunto.title}</h4>
                {notaPunto.insight && <p className="fnb-pulse-detail-insight">{notaPunto.insight}</p>}
                <div className="fnb-pulse-detail-foot">
                  <span className="fnb-pulse-detail-meta">{notaPunto.source} · {notaPunto.fecha}</span>
                  {notaPunto.url && (
                    <a className="fnb-pulse-detail-read" href={notaPunto.url} target="_blank" rel="noopener noreferrer">
                      Leer <i className="fas fa-arrow-right" aria-hidden="true" />
                    </a>
                  )}
                </div>
              </>
            ) : (
              <p className="fnb-pulse-empty">Selecciona un punto para leer la historia.</p>
            )}
          </article>
        </section>

        <div className="fnb-cover-scroll" aria-hidden="true"><span>Desliza para leer</span><i className="fas fa-arrow-down" /></div>
      </section>

      {/* ══ Ruta de lectura ══ */}
      <section className="fnb-reading-route" aria-labelledby="mkt-route-title">
        <header className="fnb-route-head">
          <div className="fnb-route-heading">
            <span><i className="fas fa-location-arrow" aria-hidden="true" /> Lectura guiada</span>
            <h3 id="mkt-route-title">¿Cuánto tiempo tienes hoy?</h3>
            <p>Elige un ritmo y entra directamente a la profundidad que necesitas.</p>
          </div>
          <div className="fnb-refresh fnb-route-refresh">
            <i className="fas fa-rotate-right" aria-hidden="true" /><span>{meta.editorial ? 'Edición asistida' : 'Edición directa'}</span>
          </div>
        </header>
        <div className="fnb-reading-route-track">
          <button className="is-flash" type="button" onClick={() => irA('mkt-brief-section')}>
            <span className="fnb-route-top">
              <span className="fnb-route-index">00:30</span>
              <span className="fnb-route-visual" aria-hidden="true"><i className="fas fa-bolt" /><b><span /><span /><span /></b></span>
            </span>
            <span className="fnb-route-copy"><small>Flash de la mesa</small><strong>Lo esencial en tres claves</strong><em>El resumen de la jornada, en tres frases.</em></span>
            <span className="fnb-route-action">Comenzar <i className="fas fa-arrow-right" aria-hidden="true" /></span>
          </button>
          <button className="is-context" type="button" onClick={() => irA('mkt-front-page')}>
            <span className="fnb-route-top">
              <span className="fnb-route-index">{String(Math.min(9, ed.minutos)).padStart(2, '0')}:00</span>
              <span className="fnb-route-visual" aria-hidden="true"><i className="fas fa-chart-line" /><b><span /><span /><span /></b></span>
            </span>
            <span className="fnb-route-copy"><small>Contexto editorial</small><strong>La historia detrás del movimiento</strong><em>Titular, insumo afectado e impacto en una secuencia.</em></span>
            <span className="fnb-route-action">Entrar a portada <i className="fas fa-arrow-right" aria-hidden="true" /></span>
          </button>
          <button className="is-explore" type="button" onClick={() => irA('mkt-archive-section')}>
            <span className="fnb-route-top">
              <span className="fnb-route-index">LIBRE</span>
              <span className="fnb-route-visual" aria-hidden="true"><i className="fas fa-compass" /><b><span /><span /><span /></b></span>
            </span>
            <span className="fnb-route-copy"><small>Exploración</small><strong>Sigue el insumo que te interesa</strong><em>Recorre grano, energía, metales y flete a tu ritmo.</em></span>
            <span className="fnb-route-action">Explorar edición <i className="fas fa-arrow-right" aria-hidden="true" /></span>
          </button>
        </div>
      </section>

      {/* ══ Navegación interna ══ */}
      <nav className="fnb-native-nav" aria-label="Navegación de la edición">
        <div className="fnb-native-context"><i className="fas fa-compass" aria-hidden="true" /><span>Portada</span></div>
        <div className="fnb-native-links">
          <button className="is-active" type="button" onClick={() => irA('mkt-front-page')}><i className="fas fa-house" aria-hidden="true" /><span>Portada</span></button>
          <button type="button" onClick={() => irA('mkt-pulse-section')}><i className="fas fa-wave-square" aria-hidden="true" /><span>Pulso</span></button>
          <button type="button" onClick={() => irA('mkt-radar-section')}><i className="fas fa-tower-broadcast" aria-hidden="true" /><span>En vivo</span></button>
          <button type="button" onClick={() => irA('mkt-departments-section')}><i className="fas fa-layer-group" aria-hidden="true" /><span>Insumos</span></button>
          <button type="button" onClick={() => irA('mkt-insights-section')}><i className="fas fa-lightbulb" aria-hidden="true" /><span>Claves</span></button>
          <button type="button" onClick={() => irA('mkt-coverage-section')}><i className="fas fa-earth-americas" aria-hidden="true" /><span>Cobertura</span></button>
          <button type="button" onClick={() => irA('mkt-archive-section')}><i className="fas fa-lines-leaning" aria-hidden="true" /><span>Índice</span></button>
        </div>
        <div className="fnb-native-progress" aria-hidden="true"><span /></div>
      </nav>

      {/* ══ Temas en desarrollo ══ */}
      <div className="fnb-trending" aria-label="Temas en desarrollo">
        <span className="fnb-trending-label"><i className="fas fa-circle" aria-hidden="true" /> Ahora</span>
        <div className="fnb-trending-track">
          {Object.entries(ed.cuenta).sort((a, b) => b[1] - a[1]).map(([c, n]) => (
            <span key={c}><i className={`fas ${CAT_ICONO[c]}`} aria-hidden="true" /> {CAT_ES[c]} · {n}</span>
          ))}
        </div>
      </div>

      {/* ══ La mesa ══ */}
      <div className="fnb-desk" aria-label="Resumen de la edición">
        <div><span>Cobertura</span><strong>Insumos</strong><small>Grano, energía, metales y flete</small></div>
        <div><span>Historias</span><strong>{noticias.length}</strong><small>{ed.propias} tocan la sección</small></div>
        <div><span>Foco de hoy</span><strong>{ed.foco}</strong><small>Mayor concentración informativa</small></div>
        <div><span>Lectura</span><strong>{ed.minutos} min</strong><small>Edición completa</small></div>
      </div>

      {/* ══ 01 · Portada ══ */}
      <div className="fnb-top" id="mkt-front-page">
        {ed.portada && (
          <Enlace a={ed.portada} className="fnb-lead">
            {/* Foto NÍTIDA: `fotoDe` ya descartó los logotipos, así que no hace
                falta desenfocar. El velo que la hace compatible con el titular
                vive en la hoja (.mkt-foto). Sin foto, el bloque de reserva de la
                plantilla. */}
            {fotoDe(ed.portada) ? (
              <span className="mkt-foto" style={{ backgroundImage: `url("${fotoDe(ed.portada)}")` }} aria-hidden="true" />
            ) : (
              <div className="fnb-lead-fallback"><i className="fas fa-newspaper" /></div>
            )}
            <div className="fnb-lead-body">
              <Chips n={ed.portada} />
              <h3>{ed.portada.title}</h3>
              {ed.portada.description && <p className="fnb-lead-dek">{ed.portada.description}</p>}
              <div className="fnb-lead-meta">
                <span className="fnb-src">{ed.portada.source}</span>
                <span>{ed.portada.fecha}</span>
                {ed.portada.url && <span className="fnb-go">Leer <i className="fas fa-arrow-right" /></span>}
              </div>
            </div>
          </Enlace>
        )}

        <aside className="fnb-brief" id="mkt-brief-section" aria-label="Briefing del día">
          <span className="fnb-brief-h"><i className="fas fa-bolt" aria-hidden="true" /> En 30 segundos</span>
          <h3>Las claves de la jornada</h3>
          <ol>
            {(briefing.length ? briefing : ['La edición se está preparando con las fuentes conectadas.']).map((b, i) => (
              <li key={b}><span>{String(i + 1).padStart(2, '0')}</span><p>{b}</p></li>
            ))}
          </ol>
          <div className="fnb-brief-foot">
            <i className="fas fa-shield-halved" aria-hidden="true" />
            <span>{meta.fuente || 'Síntesis editorial basada en las fuentes conectadas.'}</span>
          </div>
        </aside>
      </div>

      {/* ══ 02 · Radar ══ */}
      <section className="fnb-radar" aria-labelledby="mkt-radar-title">
        <div className="fnb-section-head fnb-radar-head" id="mkt-radar-section">
          <div className="fnb-radar-copy">
            <span>Radar de insumos <b>02</b></span>
            <h3 id="mkt-radar-title">Análisis y contexto <em>en movimiento.</em></h3>
            <p>Las señales que explican la sesión, ordenadas por relevancia antes que por ruido.</p>
            <div className="fnb-radar-legend" aria-label="Cómo leer el radar">
              <span><i className="is-priority" aria-hidden="true" /> Prioridad</span>
              <span><i className="is-context" aria-hidden="true" /> Contexto</span>
              <span><i className="is-live" aria-hidden="true" /> En vivo</span>
            </div>
          </div>
          <div className="fnb-radar-scope" aria-label="Estado del radar editorial">
            <div className="fnb-radar-scope-visual" aria-hidden="true">
              <span className="fnb-scope-ring" />
              <i className="fnb-scope-dot one" /><i className="fnb-scope-dot two" /><i className="fnb-scope-dot three" />
            </div>
            <div className="fnb-radar-scope-copy">
              <span><i aria-hidden="true" /> Escaneo de la mesa</span>
              <strong><b>{ed.propias}</b> señales de la sección</strong>
              <small><b>{ed.restantes.length}</b> actualizaciones en la línea temporal</small>
            </div>
          </div>
        </div>
        <div className="fnb-news-layout">
          <div className="fnb-grid">
            {ed.parrilla.map((n) => (
              <Enlace key={n.url || n.title} a={n} className="fnb-card">
                {/* La franja de imagen se pinta SOLO si hay fotografía. Antes se
                    pintaba también con el logotipo y quedaba media parrilla con
                    banda y media sin ella, sin motivo visible. */}
                {fotoDe(n) && (
                  <div
                    className="fnb-card-media"
                    aria-hidden="true"
                    style={{ backgroundImage: `url("${fotoDe(n)}")`, backgroundSize: 'cover', backgroundPosition: 'center' }}
                  />
                )}
                <div className="fnb-card-body">
                  <Chips n={n} />
                  <h4>{n.title}</h4>
                  {n.insight && <p>{n.insight}</p>}
                  <div className="fnb-card-meta">
                    <span className="fnb-src">{n.source}</span>
                    <span>{n.fecha}</span>
                  </div>
                </div>
              </Enlace>
            ))}
          </div>
          <aside className="fnb-latest" aria-labelledby="mkt-latest-title">
            <div className="fnb-latest-head">
              <div><span>Minuto a minuto</span><h3 id="mkt-latest-title">Últimas noticias</h3></div>
              <div className="fnb-latest-meter" aria-hidden="true"><i /><i /><i /><i /></div>
            </div>
            <div className="fnb-stream">
              {ed.restantes.map((n) => (
                <Enlace key={n.url || n.title} a={n} className="fnb-stream-item">
                  <span className="fnb-stream-time">{n.fecha}</span>
                  <span className="fnb-stream-copy">
                    <span>{catNombre(n)}</span>
                    <h4>{n.title}</h4>
                    <small>{n.source}</small>
                  </span>
                </Enlace>
              ))}
              {!ed.restantes.length && <p className="fnb-pulse-empty">Todo lo de esta edición está arriba.</p>}
            </div>
          </aside>
        </div>
      </section>

      {/* ══ 03 · Dossiers por insumo ══ */}
      <section className="fnb-departments" id="mkt-departments-section" aria-labelledby="mkt-departments-title">
        <header className="fnb-editorial-heading fnb-departments-heading">
          <div className="fnb-departments-intro">
            <span>La edición por dentro <b>03</b></span>
            <h3 id="mkt-departments-title">Sigue el insumo <em>que más te importa.</em></h3>
            <p>Grano, energía, metales y flete como una sola conversación de costo.</p>
          </div>
          <nav className="fnb-thread-map" aria-label="Ir a un dossier de la edición">
            {DOSSIERS.map(([id, ico, txt], i) => (
              <button
                key={id}
                className={dossier === id ? 'is-active' : undefined}
                type="button"
                aria-current={dossier === id ? 'true' : undefined}
                onClick={() => setDossier(id)}
              >
                <i className={`fas ${ico}`} aria-hidden="true" />
                <span><small>0{i + 1}</small>{txt}</span>
              </button>
            ))}
          </nav>
        </header>
        <div className="fnb-department-host" aria-live="polite">
          {delDossier.length ? (
            <div className="fnb-grid">
              {delDossier.map((n) => (
                <Enlace key={n.url || n.title} a={n} className="fnb-card">
                  <div className="fnb-card-body">
                    <Chips n={n} />
                    <h4>{n.title}</h4>
                    {n.insight && <p>{n.insight}</p>}
                    <div className="fnb-card-meta">
                      <span className="fnb-src">{n.source}</span>
                      <span>{n.fecha}</span>
                    </div>
                  </div>
                </Enlace>
              ))}
            </div>
          ) : (
            <p className="fnb-pulse-empty">Hoy no hay notas de {CAT_ES[dossier]} en la edición.</p>
          )}
        </div>
        <aside className="fnb-priority" aria-labelledby="mkt-priority-title">
          <div className="fnb-priority-head">
            <div className="fnb-priority-status"><span>Selección de la mesa</span><em><i aria-hidden="true" /> Mesa activa</em></div>
            <h3 id="mkt-priority-title">Prioridad editorial</h3>
            <p>Las noticias con mayor capacidad de mover el costo del insumo.</p>
          </div>
          <ol>
            {noticias.filter((n) => impClave(n) === 'alto').slice(0, 3).map((n, i) => (
              <li key={n.url || n.title}><span>{String(i + 1).padStart(2, '0')}</span><p>{n.title}</p></li>
            ))}
            {!ed.alto && <li><span>—</span><p>Ninguna nota de alto impacto en esta edición.</p></li>}
          </ol>
        </aside>
      </section>

      {/* ══ 04 · Claves ══ */}
      {ed.claves.length > 0 && (
        <section className="fnb-perspectives" id="mkt-insights-section" aria-labelledby="mkt-perspectives-title">
          <header className="fnb-intelligence-head">
            <div className="fnb-intelligence-intro">
              <span>Inteligencia de la mesa <b>04</b></span>
              <h3 id="mkt-perspectives-title">Las claves <em>del costo.</em></h3>
              <p>Qué significa cada titular para la ración, el flete y la obra.</p>
            </div>
            <div className="fnb-intelligence-method" aria-label="Método de lectura editorial">
              <div><span>Modelo de lectura</span><strong><b>{ed.claves.length}</b> lecturas activas</strong></div>
              <ol>
                <li><b>01</b><span>Qué ocurrió<small>Hecho verificable</small></span></li>
                <li><b>02</b><span>Por qué importa<small>Impacto en el costo</small></span></li>
                <li><b>03</b><span>Qué seguir<small>Próxima señal</small></span></li>
              </ol>
            </div>
          </header>
          <div className="fnb-perspectives-grid">
            {ed.claves.map((n) => (
              <Enlace key={n.url || n.title} a={n} className="fnb-perspective">
                <Chips n={n} />
                <h4>{n.title}</h4>
                <p>{n.insight}</p>
                <small className="fnb-src">{n.source} · {n.fecha}</small>
              </Enlace>
            ))}
          </div>
        </section>
      )}

      {/* ══ 05 · Cobertura ══ */}
      {ed.cobertura.length > 0 && (
        <section className="fnb-coverage" id="mkt-coverage-section" aria-labelledby="mkt-coverage-title">
          <header className="fnb-editorial-heading fnb-carousel-heading fnb-coverage-head">
            <div className="fnb-coverage-intro">
              <span>Cobertura internacional <b>05</b></span>
              <h3 id="mkt-coverage-title">El mundo del insumo, <em>historia por historia.</em></h3>
              <p>Una selección visual que conecta cosecha, crudo, metal y ruta comercial.</p>
            </div>
            <div className="fnb-carousel-actions">
              <div className="fnb-world-window" aria-hidden="true">
                <span className="fnb-world-orbit" /><i className="one" /><i className="two" /><i className="three" />
              </div>
              <div className="fnb-coverage-instruction"><span><i aria-hidden="true" /> Ventana global activa</span><strong>Recorre la edición con las flechas</strong></div>
              <div className="fnb-carousel-controls" aria-label="Controles del carrusel de noticias">
                <button type="button" onClick={() => mover(-1)} aria-label="Ver noticias anteriores"><i className="fas fa-arrow-left" aria-hidden="true" /></button>
                <span aria-live="polite">{foco + 1} / {ed.cobertura.length}</span>
                <button type="button" onClick={() => mover(1)} aria-label="Ver noticias siguientes"><i className="fas fa-arrow-right" aria-hidden="true" /></button>
              </div>
            </div>
          </header>
          <div className="fnb-carousel-shell">
            <div className="fnb-coverage-console">
              <span><i className="fas fa-earth-americas" aria-hidden="true" /> Historia en foco</span>
              <strong>{enFoco?.title}</strong>
              <em><i className="fas fa-hand-pointer" aria-hidden="true" /> Usa las flechas para recorrer</em>
            </div>
            <div className="fnb-coverage-grid" ref={pistaRef} aria-label="Carrusel de cobertura de insumos">
              {ed.cobertura.map((n, i) => (
                <Enlace
                  key={n.url || n.title}
                  a={n}
                  className={`fnb-coverage-card${i === foco ? ' is-active' : ''}`}
                >
                  {/* La foto va en una CAPA PROPIA y no en el fondo de la
                      tarjeta. El tema de la plantilla hace
                      `background: var(--dn-dark) !important` sobre
                      `.fnb-coverage-card` (daily-news-editorial.css:771), y un
                      `!important` le gana hasta al estilo en línea: las ocho
                      tarjetas salían como recuadros vacíos. Sobre una clase
                      propia esa regla no tiene nada que decir. */}
                  <span className="mkt-cob-foto" style={{ backgroundImage: `url("${fotoDe(n)}")` }} aria-hidden="true" />
                  <div className="fnb-coverage-copy">
                    <Chips n={n} />
                    <h4>{n.title}</h4>
                    <small>{n.source} · {n.fecha}</small>
                  </div>
                </Enlace>
              ))}
            </div>
            <div className="fnb-coverage-navigation">
              <div className="fnb-carousel-dots" aria-label="Seleccionar noticia del carrusel">
                {ed.cobertura.map((n, i) => (
                  <button
                    key={n.url || n.title}
                    type="button"
                    className={i === foco ? 'is-active' : undefined}
                    onClick={() => setFoco(i)}
                    aria-label={`Historia ${i + 1}`}
                  />
                ))}
              </div>
              <div className="fnb-coverage-progress" aria-hidden="true">
                <span style={{ width: `${((foco + 1) / ed.cobertura.length) * 100}%` }} />
              </div>
              <small>MESA DE INSUMOS · EDICIÓN GLOBAL</small>
            </div>
          </div>
        </section>
      )}

      {/* ══ 06 · Índice vivo ══ */}
      <section className="fnb-archive fnb-story-index" id="mkt-archive-section" aria-labelledby="mkt-archive-title">
        <header className="fnb-story-index-head">
          <div className="fnb-story-index-chapter" aria-hidden="true"><span>ÍNDICE VIVO</span><b>06</b></div>
          <div className="fnb-story-index-title">
            <span><i aria-hidden="true" />Edición completa · mesa de insumos</span>
            <h3 id="mkt-archive-title">La jornada, <em>noticia por noticia.</em></h3>
            <p>Todas las historias de la edición, organizadas para que encuentres primero lo que de verdad toca tu costo.</p>
          </div>
          <div className="fnb-story-index-state">
            <span><i aria-hidden="true" />Actualización continua</span>
            <strong>Explora a tu ritmo</strong>
            <small>Busca, ordena y abre cualquier historia.</small>
          </div>
        </header>

        {ed.portada && (
          <>
            <div className="fnb-story-feature-label"><span>01</span><strong>La historia esencial</strong><i /><small>El punto de partida recomendado por la mesa</small></div>
            <div className="fnb-archive-spotlight">
              <Enlace a={ed.portada} className="fnb-spotlight-card">
                <Chips n={ed.portada} />
                <h4>{ed.portada.title}</h4>
                {ed.portada.insight && <p>{ed.portada.insight}</p>}
                <small>{ed.portada.source} · {ed.portada.fecha}</small>
              </Enlace>
            </div>
          </>
        )}

        <div className="fnb-story-desk">
          <div className="fnb-story-desk-label">
            <span>02</span>
            <div><small>Mesa de exploración</small><strong>Construye tu propia edición</strong></div>
          </div>
          <div className="fnb-archive-console fnb-story-index-console">
            <label className="fnb-archive-search" htmlFor="mkt-archive-search">
              <i className="fas fa-magnifying-glass" aria-hidden="true" />
              <input
                id="mkt-archive-search"
                type="search"
                placeholder="Insumo, mercado o tema…"
                autoComplete="off"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </label>
            <div className="fnb-archive-sort" role="group" aria-label="Ordenar noticias">
              <button
                className={ordenIndice === 'recent' ? 'is-active' : undefined}
                type="button"
                aria-pressed={ordenIndice === 'recent'}
                onClick={() => setOrdenIndice('recent')}
              >
                <i className="fas fa-clock" aria-hidden="true" /> Recientes
              </button>
              <button
                className={ordenIndice === 'impact' ? 'is-active' : undefined}
                type="button"
                aria-pressed={ordenIndice === 'impact'}
                onClick={() => setOrdenIndice('impact')}
              >
                <i className="fas fa-bolt" aria-hidden="true" /> Impacto
              </button>
            </div>
            <div className="fnb-archive-result" aria-live="polite"><strong>{indice.length}</strong><span>historias</span></div>
          </div>
        </div>

        <div className="fnb-story-ledger-head"><span>03</span><strong>El resto de la jornada</strong><i /><small>Abre cualquier historia en su medio</small></div>
        <div className="fnb-archive-list" aria-live="polite">
          {indice.map((n) => (
            <Enlace key={n.url || n.title} a={n} className="fnb-archive-item">
              <span className="fnb-archive-stamp">
                {n.fecha}
                <strong>{catNombre(n)}</strong>
              </span>
              <span className="fnb-archive-copy">
                <h4>{n.title}</h4>
                <small>{n.source}</small>
              </span>
            </Enlace>
          ))}
          {!indice.length && <p className="fnb-pulse-empty">Ninguna historia coincide con «{busca}».</p>}
        </div>
      </section>
    </section>
  );
}
