import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ORIGENES_GRANOS, PAPELES } from '../lib/granos-mapa.js';
import { produccionDe, ESCALA, CAMPANA, FUENTE } from '../lib/produccion-granos.js';
import { nombreEs } from '../lib/paises-es.js';

/*
 * Mapa coroplético de Mercados. Nació para Granos y hoy lo comparten Granos y
 * Proteínas, que es de donde le viene el nombre del archivo.
 *
 * Reutiliza la geometría del mapa de Finanzas: assets/js/world-map-data.js
 * publica window.VN_WORLD_MAP con los trazos ya proyectados sobre un lienzo de
 * 1000×500. No hay d3 ni peticiones de red; solo se leen esos datos y se pintan
 * como <path>.
 *
 * ── Qué codifica el color, y por qué cambió ────────────────────────────────
 * El relleno es una CANTIDAD del país: una rampa de un solo tono, de tenue a
 * intenso. Antes el relleno eran cuatro colores categóricos —dorado, morado,
 * verde, rosa— que codificaban el «papel» de seis países en la formación del
 * precio. Dos problemas: cuatro identidades para un dato que no es identidad
 * sino cantidad, y colores prestados de otras secciones, donde ya significan
 * otra cosa. El mapa parecía un arlequín y su color no decía nada de lo que la
 * ficha contaba.
 *
 * El papel no se perdió: pasó a marca SECUNDARIA. Los países que mueven el
 * precio llevan contorno y un punto, se listan en las pastillas de abajo y su
 * papel encabeza la ficha. Así el mapa se lee de un vistazo por cantidad, y la
 * capa de «quién manda en el precio» se lee encima sin competir por el mismo
 * canal visual.
 *
 * ── De un mapa a dos ───────────────────────────────────────────────────────
 * Granos pinta la cosecha del USDA; Proteínas pinta la producción y el consumo
 * de carne y huevo de la FAO, con un conmutador entre las dos métricas. Lo que
 * cambia entre secciones son los DATOS y la rampa, no la mecánica, así que todo
 * eso entra por props (`datosDe`, `escala`, `metricas`, `prefijoBanda`) y los
 * valores por defecto son los de Granos, que fue quien lo estrenó.
 *
 * Cuando hay `metricas`, el conmutador vive aquí y no en la página: el estado de
 * qué se está pintando no le sirve a nadie más, y subirlo obligaría a cada
 * sección a repetir el mismo par de useState.
 *
 * ── La línea de tiempo ─────────────────────────────────────────────────────
 * Con `anios`, el mapa deja de ser una foto: la barra recorre la serie y el
 * relleno se repinta año a año. Proteínas la usa con los catorce años de la FAO;
 * Granos no la pasa y el control no se monta.
 *
 * Lo que hace que esto signifique algo es que la ESCALA NO SE MUEVE. Los cortes
 * de color son absolutos y los mismos para todos los años (ver CORTES en
 * proteinas-mapa.js), así que un país que se oscurece está creciendo de verdad.
 * Con cortes por cuantil recalculados en cada fotograma pasaría lo contrario: el
 * mapa parecería moverse entero mientras el mundo no cambia, y un país podría
 * aclararse el año en que más produce solo porque sus vecinos crecieron más.
 *
 * El estado vive aquí por lo mismo que el de la métrica, y el reloj se para solo
 * al llegar al último año: dejarlo en bucle convierte el bloque en un GIF de
 * fondo que se mueve mientras se intenta leer la ficha de un país.
 *
 * ── La ficha es flotante, no una columna ───────────────────────────────────
 * El posicionamiento copia el de finanzas-world-map.js (`colocar`): absoluto
 * dentro del marco y no `fixed`, porque cualquier ancestro con `transform`
 * convertiría un fixed en absolute y descolocaría el flotante.
 */

/* A nivel de módulo y no como arrow en la lista de props: `cifras` la lleva en
   sus dependencias, y una función nueva en cada render obligaría a rehacer los
   ~175 cruces de país en cada uno. Por el mismo motivo, quien pase `datosDe`
   debe pasar una referencia estable. */
const COSECHA_GRANOS = (ne) => produccionDe(ne);

const NOTAS_GRANOS = [
  { clase: 'gm-marca-muestra', texto: 'Remarcado: mueve el precio de referencia' },
  { clase: 'gm-ue-muestra', texto: 'Rayado: dato solo del bloque UE' },
];

export default function MapaGranos({
  precios, num, fmtPct,
  origenes = ORIGENES_GRANOS,
  titulo = 'De dónde viene el grano',
  kicker = 'Origen del precio',
  entradilla = 'Cada país pintado según el grano que cosechó. Pasa el cursor para ver su desglose; los remarcados son los que mueven la referencia de Chicago.',
  pie = `Producción de maíz, trigo y soja de la campaña ${CAMPANA} según ${FUENTE}. Los precios son la referencia de Chicago, que es global: el mapa no reparte ese precio por país.`,
  tono = 'granos',
  precioDe,

  /* ── Fuente de datos del relleno ──────────────────────────────────────────
     `datosDe(ne, metrica)` devuelve lo que la ficha y el color necesitan de un
     país, o null si no hay dato. Por defecto, la cosecha de Granos. */
  datosDe = COSECHA_GRANOS,
  escala = ESCALA,
  prefijoBanda = 'gm-p',
  unidad = 'Mt',
  leyendaTitulo = 'Color del país',
  leyendaSub = `Grano cosechado en ${CAMPANA} · millones de toneladas`,
  notasEscala = NOTAS_GRANOS,
  bloqueTitulo = `Cosecha ${CAMPANA}`,
  avisoBloque = 'Cifra del conjunto de la Unión Europea: el USDA no publica el desglose por país.',
  metricas = null,
  etiquetaMapa = `Producción mundial de maíz, trigo y soja en la campaña ${CAMPANA}`,

  /* ── Línea de tiempo ──────────────────────────────────────────────────────
     `anios` es la lista completa en orden. Sin ella no se monta el control y el
     mapa se comporta exactamente como antes, que es lo que hace Granos. */
  anios = null,
  /* Con qué año abre. Por defecto el final de la serie, pero Proteínas abre por
     el último año MEDIDO: sus dos últimos años son estimaciones encadenadas y
     pintan la mitad de países, así que abrir ahí daría un planisferio medio
     gris como primera impresión de un mapa que tiene 152 países de dato. La
     estimación está a un paso de la barra, que es donde debe estar: se llega a
     ella queriendo. */
  anioInicial = null,
  ritmoMs = 780,
  /* Años de la serie que NO son dato medido sino estimación encadenada. Se
     marcan en la barra y llevan su propio cartel: mezclarlos con los medidos
     sin decirlo convierte el control en una forma de mentir despacio. */
  aniosEstimados = [],
  notaEstimado = null,
}) {
  const [mapa, setMapa] = useState(() => (typeof window !== 'undefined' ? window.VN_WORLD_MAP : null));
  /* `senalado` es el del cursor; `fijado` el que se dejó clavado con un clic o
     con una pastilla. Separados porque al salir del mapa hay que volver al
     fijado, no perderlo. En táctil no hay hover: ahí el clic es la única vía,
     y por eso las pastillas de abajo siguen existiendo. */
  const [senalado, setSenalado] = useState(null);
  const [fijado, setFijado] = useState(null);
  const [pos, setPos] = useState(null);
  const [metricaId, setMetricaId] = useState(() => metricas?.[0]?.id ?? null);

  /* Se abre por el año más reciente con dato pleno y no por el primero: es el
     dato vigente, y el que rotula el resto de la sección. La línea de tiempo es
     para moverse desde ahí, hacia atrás o hacia la estimación. */
  const [anio, setAnio] = useState(() => {
    if (!anios) return null;
    return anios.includes(anioInicial) ? anioInicial : anios[anios.length - 1];
  });
  const [jugando, setJugando] = useState(false);

  const refMarco = useRef(null);
  const refTip = useRef(null);

  const visible = senalado || fijado;
  const metrica = metricas?.find((m) => m.id === metricaId) || null;

  const iAnio = anios ? anios.indexOf(anio) : -1;
  const ultimoAnio = anios ? anios[anios.length - 1] : null;
  /* En un Set y en un useMemo: se consulta una vez por cada marca de la barra
     en cada render, y la lista llega como prop nueva en cada uno. */
  const estimados = useMemo(() => new Set(aniosEstimados), [aniosEstimados]);

  /* El reloj de la reproducción. Se para SOLO al llegar al final en vez de
     volver a empezar: en bucle, el bloque queda animándose indefinidamente
     detrás de quien está leyendo la ficha de un país, y el movimiento gana
     siempre a la lectura. */
  useEffect(() => {
    if (!jugando || !anios) return undefined;
    const t = setInterval(() => {
      setAnio((a) => {
        const i = anios.indexOf(a);
        if (i < 0 || i >= anios.length - 1) { setJugando(false); return anios[anios.length - 1]; }
        return anios[i + 1];
      });
    }, ritmoMs);
    return () => clearInterval(t);
  }, [jugando, anios, ritmoMs]);

  /* Pulsar «reproducir» estando ya en el último año vuelve al principio: si no,
     el botón no haría nada visible y parecería roto. */
  const alternarPlay = () => {
    if (!anios) return;
    if (!jugando && anio === ultimoAnio) setAnio(anios[0]);
    setJugando((v) => !v);
  };

  /* world-map-data.js se carga con el resto de scripts heredados y puede no
     estar listo en el primer render; se espera a que aparezca en lugar de
     asumirlo. */
  useEffect(() => {
    if (mapa) return undefined;
    let vivo = true;
    const t = setInterval(() => {
      if (!vivo) return;
      if (window.VN_WORLD_MAP) { setMapa(window.VN_WORLD_MAP); clearInterval(t); }
    }, 220);
    return () => { vivo = false; clearInterval(t); };
  }, [mapa]);

  const porNe = useMemo(() => {
    const m = new Map();
    origenes.forEach((o) => m.set(o.ne, o));
    return m;
  }, [origenes]);

  /* México no está en `paises`: el generador lo excluye ahí porque el mapa de
     Bolsa no lo dibuja, y lo publica aparte en `suplementos` justo para que
     otros mapas puedan recuperarlo sin mantener una segunda cartografía (ver
     scripts/build-world-map.mjs). Sin esta unión el país queda inerte — que es
     exactamente lo que advierte el catálogo de bolsas sobre las claves que no
     casan. */
  const trazos = useMemo(() => {
    if (!mapa || !Array.isArray(mapa.paises)) return [];
    const extra = Object.entries(mapa.suplementos || {}).map(([ne, v]) => ({ ne, d: v.d }));
    return [...mapa.paises, ...extra];
  }, [mapa]);

  /* Se resuelve una vez por país en lugar de en cada render de cada <path>:
     son ~175 trazos y el dato se consulta también al pintar la ficha. Depende
     de la métrica activa porque el color entero cambia al conmutarla. */
  const cifras = useMemo(() => {
    const m = new Map();
    trazos.forEach((p) => {
      const c = datosDe(p.ne, metricaId, anio);
      if (c) m.set(p.ne, c);
    });
    return m;
  }, [trazos, datosDe, metricaId, anio]);

  /* Colocación del flotante. En useLayoutEffect y no en useEffect porque mide
     el tamaño ya renderizado del propio flotante: con useEffect el navegador
     llega a pintar un fotograma con la posición del país anterior. */
  useLayoutEffect(() => {
    const marco = refMarco.current;
    const tip = refTip.current;
    if (!visible || !marco || !tip) return;
    const nodo = marco.querySelector(`[data-ne="${CSS.escape(visible)}"]`);
    if (!nodo) return;

    const caja = marco.getBoundingClientRect();
    const r = nodo.getBoundingClientRect();
    const ancho = tip.offsetWidth;
    const alto = tip.offsetHeight;
    const MARGEN = 10;

    let x = (r.left - caja.left) + r.width / 2 - ancho / 2;
    let y = (r.top - caja.top) - alto - MARGEN;
    // Si no cabe encima del país, se pone debajo.
    if (y < MARGEN) y = (r.bottom - caja.top) + MARGEN;
    // Y siempre dentro del marco, para que no se salga por los lados.
    x = Math.max(MARGEN, Math.min(x, caja.width - ancho - MARGEN));
    y = Math.max(MARGEN, Math.min(y, caja.height - alto - MARGEN));

    setPos({ x, y });
  }, [visible, metricaId, anio]);

  const ficha = visible ? porNe.get(visible) : null;
  const cifra = visible ? cifras.get(visible) : null;
  const hayTip = Boolean(visible && (ficha || cifra));

  /* Cada sección resuelve su propio dato: Granos lo saca de `precios` por el
     nombre del cultivo. Proteínas no pasa `precioDe` a propósito —su referencia
     del CME es global y repetirla en ciento cincuenta fichas no diría nada—, y
     entonces el bloque de precio no se pinta. */
  let dato = null;
  if (ficha) {
    if (precioDe) dato = precioDe(ficha);
    else if (ficha.cultivo) {
      dato = {
        valor: precios?.[ficha.cultivo],
        pct: precios?.[`${ficha.cultivo}_pct`],
        unidad: ficha.cultivo === 'soja' ? '/MT' : '/bu',
      };
    }
  }
  const precio = dato?.valor;
  const pct = dato?.pct;
  const unidadPrecio = dato?.unidad ?? '';

  if (!mapa || !Array.isArray(mapa.paises)) {
    return (
      <section className={`grain-map es-${tono}`} aria-labelledby="grain-map-t">
        <header className="grain-map-head">
          <div>
            <span className="grain-map-kicker"><i className="fas fa-earth-americas" aria-hidden="true" /> {kicker}</span>
            <h3 id="grain-map-t">{titulo}</h3>
          </div>
        </header>
        <p className="grain-map-cargando">Preparando el mapa…</p>
      </section>
    );
  }

  const elegir = (ne) => setFijado((actual) => (actual === ne ? null : ne));
  const fmtMt = (v) => v.toLocaleString('es-MX', { maximumFractionDigits: v >= 10 ? 0 : v >= 1 ? 1 : 2 });

  /* Los rótulos de una métrica pueden venir como función del año: con la línea
     de tiempo, una leyenda con el año escrito duro mentiría en trece de los
     catorce fotogramas. Se admiten las dos formas para no obligar a Granos, que
     no tiene años, a envolver sus cadenas en funciones. */
  const rotulo = (v, reserva) => (typeof v === 'function' ? v(anio) : (v ?? reserva));
  const sub = rotulo(metrica?.leyenda, leyendaSub);
  const tituloBloque = rotulo(metrica?.tipTitulo, bloqueTitulo);

  return (
    <section className={`grain-map es-${tono}`} aria-labelledby="grain-map-t">
      <header className="grain-map-head">
        <div>
          <span className="grain-map-kicker"><i className="fas fa-earth-americas" aria-hidden="true" /> {kicker}</span>
          <h3 id="grain-map-t">{titulo}</h3>
          <p>{entradilla}</p>

          {/* El conmutador de métrica va bajo la entradilla y no en la esquina
              de la leyenda: es un control, no una clave de lectura, y desde aquí
              se ve antes de mirar el mapa — que es cuando hay que decidir qué se
              está mirando. */}
          {metricas && (
            <div className="gm-metricas" role="group" aria-label="Qué pinta el mapa">
              {metricas.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={m.id === metricaId ? 'is-activo' : undefined}
                  aria-pressed={m.id === metricaId}
                  onClick={() => setMetricaId(m.id)}
                  title={m.ayuda}
                >
                  <i className={`fas ${m.icono}`} aria-hidden="true" />
                  {m.etiqueta}
                </button>
              ))}
              {metrica?.ayuda && <span className="gm-metricas-ayuda">{metrica.ayuda}</span>}
            </div>
          )}

        </div>

        {/* La leyenda es la escala de magnitud, no una lista de categorías:
            es lo que hay que saber para leer el relleno. El papel va debajo,
            como lo que ahora es — una marca sobre el color, no el color. */}
        {/* El encabezado dice «Color del país» y no solo «Cosecha»: sin esa
            frase la escalera es una fila de números que no se sabe a qué se
            refieren — no queda dicho en ninguna parte que sea la clave para
            leer el relleno del mapa. */}
        <div className="gm-escala" aria-label={`${sub}. Color de cada país según esa cantidad.`}>
          <span className="gm-escala-lbl">
            {leyendaTitulo}
            <em>{sub}</em>
          </span>
          <ol className="gm-escala-pasos">
            {escala.map((e) => (
              <li key={e.banda}>
                <i className={`${prefijoBanda}${e.banda}`} aria-hidden="true" />
                <b>{e.etiqueta}</b>
              </li>
            ))}
          </ol>
          <div className="gm-escala-notas">
            {notasEscala.map((n) => (
              <span className="gm-escala-nota" key={n.texto}>
                <i className={n.clase} aria-hidden="true" />
                {n.texto}
              </span>
            ))}
          </div>
        </div>

        {/* ── Línea de tiempo ────────────────────────────────────────────────
            Va fuera de la columna del texto y como tercer hijo de la cabecera,
            que es flex con wrap: así ocupa una banda propia a todo lo ancho,
            justo encima del mapa. Dentro de la columna medía 405 px —el ancho
            del párrafo, que está limitado a 52ch— y los catorce años caían a
            menos de veinte píxeles cada uno: se podía arrastrar, pero no
            apuntar a un año concreto.

            El año va en un <output> grande y aparte del deslizador: mientras
            corre la reproducción es lo único que dice qué se está mirando, y
            buscarlo dentro del control obliga a apartar la vista del mapa justo
            cuando el mapa se está moviendo.

            La barra es un <input type="range"> de verdad y no un carril pintado
            a mano: así trae gratis el teclado (flechas, Inicio, Fin) y el rol
            que anuncia el valor. Recorre el ÍNDICE de la lista y no el año: con
            2010–2023 seguidos daría igual, pero deja de darlo en cuanto la
            fuente se salte un año, y entonces el control apuntaría a una columna
            que no existe. */}
        {anios && (
          <div className="gm-tiempo">
            <button
              type="button"
              className={`gm-tiempo-play${jugando ? ' is-jugando' : ''}`}
              onClick={alternarPlay}
              aria-label={jugando ? 'Pausar el recorrido por los años' : 'Recorrer los años'}
            >
              <i className={`fas ${jugando ? 'fa-pause' : 'fa-play'}`} aria-hidden="true" />
            </button>

            <output className="gm-tiempo-anio" htmlFor="gm-tiempo-barra">{anio}</output>

            <input
              id="gm-tiempo-barra"
              className="gm-tiempo-barra"
              type="range"
              min={0}
              max={anios.length - 1}
              step={1}
              value={iAnio < 0 ? anios.length - 1 : iAnio}
              /* Tocar la barra para la reproducción: si no, el reloj sigue
                 corriendo y arrastra el año por debajo de la mano. */
              onChange={(e) => { setJugando(false); setAnio(anios[Number(e.target.value)]); }}
              aria-label="Año que pinta el mapa"
              aria-valuetext={String(anio)}
            />

            {/* Los años intermedios, como marcas del carril. Con la banda a todo
                lo ancho hay sitio de sobra, y sin ellos la barra solo dice dónde
                empieza y dónde acaba: no se puede ir a 2016 sin tantear.

                Los estimados van marcados AQUÍ, sobre la propia barra, y no
                solo en un pie: es donde se elige el año, así que es donde hay
                que saber qué clase de año se está eligiendo. */}
            <div className="gm-tiempo-extremos" aria-hidden="true">
              {anios.map((a) => (
                <span
                  key={a}
                  className={[
                    a === anio ? 'is-activo' : '',
                    estimados.has(a) ? 'es-estimado' : '',
                  ].filter(Boolean).join(' ') || undefined}
                >
                  {a}
                </span>
              ))}
            </div>

            {/* El cartel solo aparece cuando se está mirando un año estimado.
                Fijo, se leería como una advertencia sobre todo el mapa —trece
                de los dieciséis años son dato medido. */}
            {estimados.has(anio) && notaEstimado && (
              <p className="gm-tiempo-nota">
                <i className="fas fa-triangle-exclamation" aria-hidden="true" />
                {typeof notaEstimado === 'function' ? notaEstimado(anio) : notaEstimado}
              </p>
            )}
          </div>
        )}
      </header>

      <div className="grain-map-cuerpo gmc-ancho">
        <div
          className="grain-map-marco"
          ref={refMarco}
          onMouseLeave={() => setSenalado(null)}
        >
          <div className="grain-map-lienzo">
            <svg viewBox={`0 0 ${mapa.ancho} ${mapa.alto}`} role="img" aria-label={metrica ? sub : etiquetaMapa}>
              {/* Rayado para los socios de la UE. Sin esto había que darles la
                  banda del bloque, y el mapa pintaba Luxemburgo del mismo color
                  que Estados Unidos: 204.8 Mt son de los veintiséis juntos.
                  Una textura dice «hay cosecha, pero no desglosada» sin ocupar
                  un escalón de la rampa que no les corresponde. */}
              <defs>
                <pattern id="gm-ue-rayas" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect width="6" height="6" className="gm-ue-fondo" />
                  <line x1="0" y1="0" x2="0" y2="6" className="gm-ue-raya" />
                </pattern>
              </defs>

              {/* Una sola capa: cada país lleva su banda de color, y los del
                  catálogo añaden la clase de la marca. Separarlos en dos grupos
                  como antes obligaba a dibujar dos veces los destacados. */}
              <g className="gm-paises">
                {trazos.map((p) => {
                  const c = cifras.get(p.ne);
                  const o = porNe.get(p.ne);
                  const interactivo = Boolean(c || o);
                  const clases = [
                    !c ? 'gm-sin-dato' : c.esBloque ? 'gm-ue' : `${prefijoBanda}${c.banda}`,
                    o && PAPELES[o.papel].marca ? 'es-motor' : '',
                    visible === p.ne ? 'is-activo' : '',
                  ].filter(Boolean).join(' ');
                  return (
                    <path
                      key={p.ne}
                      d={p.d}
                      data-ne={p.ne}
                      className={clases}
                      tabIndex={interactivo ? 0 : undefined}
                      role={interactivo ? 'button' : undefined}
                      /* El papel se dice aquí y solo aquí: el contorno que
                         marca a estos países es puramente visual, así que sin
                         esto un lector de pantalla no tendría forma de saber
                         que Ucrania está señalada ni por qué. */
                      aria-label={interactivo
                        ? [
                          nombreEs(p.ne),
                          /* Con línea de tiempo, la cifra sin año no dice nada:
                             quien navega con lector de pantalla no ve el
                             deslizador mientras recorre el mapa. */
                          c ? `${fmtMt(c.total)} millones de toneladas${anio ? ` en ${anio}` : ''}` : null,
                          o && PAPELES[o.papel].marca ? PAPELES[o.papel].etiqueta : null,
                        ].filter(Boolean).join(': ')
                        : undefined}
                      onMouseEnter={interactivo ? () => setSenalado(p.ne) : undefined}
                      onFocus={interactivo ? () => setSenalado(p.ne) : undefined}
                      onBlur={interactivo ? () => setSenalado(null) : undefined}
                      onClick={interactivo ? () => elegir(p.ne) : undefined}
                      onKeyDown={interactivo
                        ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); elegir(p.ne); } }
                        : undefined}
                    />
                  );
                })}
              </g>
            </svg>
          </div>

          {/* Se monta solo cuando hay país. `pointer-events:none` en la hoja: si
              el flotante capturase el ratón, aparecer bajo el cursor dispararía
              el mouseleave del marco y entraría en un parpadeo infinito. */}
          {hayTip && (
            <div
              className={`gm-tip${fijado === visible ? ' is-fijado' : ''}`}
              ref={refTip}
              role="tooltip"
              style={{ left: pos ? `${pos.x}px` : 0, top: pos ? `${pos.y}px` : 0, visibility: pos ? 'visible' : 'hidden' }}
            >
              {/* Sin chip de papel. La ficha empieza por el nombre del país:
                  el «Origen exportador / Demanda / Destino» que iba aquí ya lo
                  cuenta el `factor` de la línea siguiente con palabras propias
                  («Corredor del Mar Negro», «Demanda de importación»), que dice
                  más y no obliga a aprenderse una taxonomía. La categoría sigue
                  viva donde sirve: decide qué países marca el mapa, y viaja en
                  el aria-label para quien no ve el contorno. */}
              <h4>{nombreEs(visible)}</h4>
              {ficha && <p className="grain-map-factor">{ficha.factor}</p>}

              {cifra && (
                <div className="gm-tip-cosecha">
                  <span className="gm-tip-cosecha-lbl">
                    {tituloBloque}
                    <b>{fmtMt(cifra.total)} {unidad}</b>
                  </span>
                  <ul>
                    {cifra.filas.map((c) => (
                      <li key={c.clave}>
                        <b>{c.nombre}</b>
                        <em>{fmtMt(c.mt)}<i>{unidad}</i></em>
                      </li>
                    ))}
                  </ul>
                  {/* Sin esta línea, la ficha de Luxemburgo diría que produce
                      204.8 Mt de grano. El USDA no desglosa a los socios de la
                      UE y el mapa no lo va a repartir a ojo. */}
                  {cifra.esBloque && <p className="gm-tip-aviso">{avisoBloque}</p>}
                  {/* Y sin esta, un año encadenado se leería como uno medido.
                      Va en la ficha además de en la leyenda porque es aquí
                      donde se lee la cifra de un país concreto. */}
                  {cifra.aviso && <p className="gm-tip-aviso es-estimado">{cifra.aviso}</p>}
                </div>
              )}

              {/* Contexto que el color no puede dar, porque solo pinta una de las
                  dos métricas a la vez: la otra cifra y el consumo por persona. */}
              {cifra?.extra?.length > 0 && (
                <ul className="gm-tip-extra">
                  {cifra.extra.map((e) => (
                    <li key={e.etiqueta}>
                      <span>{e.etiqueta}</span>
                      <strong>{fmtMt(e.valor)}<em>{e.unidad}</em></strong>
                      {e.pie && <i>{e.pie}</i>}
                    </li>
                  ))}
                </ul>
              )}

              {ficha && dato && (
                <div className="grain-map-dato">
                  <span>{ficha.etiquetaCultivo}</span>
                  {precio != null ? (
                    <strong>
                      ${num(precio).toFixed(2)}<em>{unidadPrecio}</em>
                      {pct != null && <i className={num(pct) >= 0 ? 'up' : 'down'}>{fmtPct(pct)}</i>}
                    </strong>
                  ) : (
                    <strong className="sin-dato">Sin cotización disponible</strong>
                  )}
                </div>
              )}

              {ficha && <p className="grain-map-nota">{ficha.nota}</p>}
            </div>
          )}
        </div>
      </div>

      <div className="grain-map-pastillas" role="group" aria-label="Países que mueven el precio">
        {origenes.map((o) => (
          <button
            key={o.ne}
            type="button"
            className={fijado === o.ne ? 'is-activo' : undefined}
            aria-pressed={fijado === o.ne}
            onClick={() => elegir(o.ne)}
          >
            {o.pais}
          </button>
        ))}
      </div>

      <p className="grain-map-pie">
        <i className="fas fa-circle-info" aria-hidden="true" />
        {pie}
      </p>
    </section>
  );
}
