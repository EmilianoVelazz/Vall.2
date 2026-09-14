import { Fragment, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/Header.jsx';
import Footer from '../components/Footer.jsx';
import ExecutiveReportsHub from '../components/ExecutiveReportsHub.jsx';
import usePageStyles from '../lib/usePageStyles.js';
import loadScripts from '../lib/loadScripts.js';
import iniciarFondo from '../lib/fondoWebGL.js';
import { useRevelado, useCifrasVivas } from '../lib/animaInicio.js';
import './Inicio.css';
import { DARK_PILOT, DATOS } from '../lib/hojasComunes.js';

/*
 * Portada VALLNews — diario financiero instrumentado.
 *
 * QUÉ SE FUE Y POR QUÉ
 * La versión anterior era una pila de rectángulos redondeados: bienvenida,
 * carrusel, nota, pulso, llamada a VALL AI y cuatro tarjetas laterales, todos
 * con el mismo relleno, el mismo radio y el mismo hueco. Con todo al mismo peso
 * no había jerarquía y la página se leía como una cuadrícula, no como una
 * portada. Además el carrusel repetía exactamente el recurso de la nota
 * principal —foto a sangre con titular serif enorme— y empujaba el contenido
 * real por debajo del pliegue.
 *
 * Ahora la estructura la marcan reglas finas y columnas, no cajas: cinta de
 * cotizaciones fija, cabecera a sangre con fondo WebGL, espina de datos al
 * costado del titular, portada a dos columnas y tira de secciones al pie.
 *
 * EL CONTRATO CON live-engine.js — LO IMPORTANTE
 * live-engine escribe por getElementById. Si un id desaparece, ese dato deja de
 * actualizarse SIN ERROR: se queda el texto de ejemplo del marcado y parece que
 * funciona. Están todos aquí, y esta versión monta además cinco que el marcado
 * anterior no tenía, así que ahora sí se actualizan:
 *   cinta      tickerInner
 *   portada    slide-finanzas (fondo), st-finanzas, sd-fin-desc
 *   río        st-mercados/geo/mexico, sd-mkt/geo/mex-desc,
 *              sd-0…sd-2 (marcas de tiempo),
 *              slide-mercados/geo/mexico (miniaturas)
 *   tira       card-finanzas/mercados/geo/mexico (fondos),
 *              ct-finanzas/mercados/geopolitica/mexico
 *   VALL·AI    idx-vai-arc/num/asset/verdict/warn, vaiSelect(+Icon/+Lbl)
 *   pulso      pulse-usdmxn/tiie/corn/wti y pulse-corn/wti-change
 *   chrome     sectionDate, lastUpdated, backendBadge, refreshBtn
 *
 * Proteínas salió de la portada el 2026-08-18, así que ya NO se montan
 * st-proteinas, sd-prot-desc, sd-3, slide-proteinas, card-proteinas ni
 * ct-proteinas. No hay que tocar live-engine: set() y _bgFor() comprueban que
 * el nodo exista y no hacen nada si falta. La cifra del maíz sí se conserva
 * (pulse-corn), porque es un precio que se lee por sí mismo.
 *
 * Los ids de imagen (slide-*, card-*) van en la CAPA de la foto, no en el
 * enlace: _bgFor() lee y reescribe `style.backgroundImage` de ese nodo, y si
 * fuese el enlace entero no se podría escalar la foto en hover sin arrastrar el
 * texto con ella.
 */

const HOJAS = [
  '/assets/css/base.css?v=2',
  '/assets/css/header.css',
  '/assets/css/footer.css',
  '/assets/css/responsive.css',
  DARK_PILOT,
];

const LIBS = [
  ...DATOS,
  '/assets/js/live-engine.js?v=25',
];

/* El titular se parte en palabras para revelarlas escalonadas. En el marcado y
   no calculado con split() en render: así el <em> de "mañana" queda explícito y
   no hay que reconstruir el énfasis a partir de la posición. */
const TITULAR = [
  { txt: 'Entiende' }, { txt: 'hoy' }, { txt: 'lo' }, { txt: 'que' },
  { txt: 'moverá' }, { txt: 'mañana.', em: true },
];

/* La espina de datos: las cuatro cifras que resumen el día. `idCambio` solo lo
   tienen las dos que live-engine sabe variar; inventarle un porcentaje a las
   otras dos sería fabricar un dato. */
const PULSO = [
  { clave: 'dolar', etiqueta: 'Dólar FIX',    idValor: 'pulse-usdmxn', valor: '$17.20', detalle: 'Banxico · MXN',      icono: 'fa-peso-sign',        ruta: '/mexico',             tono: 'mexico' },
  { clave: 'tiie',  etiqueta: 'TIIE 28d',     idValor: 'pulse-tiie',   valor: '6.50%',  detalle: 'Tasa interbancaria', icono: 'fa-building-columns', ruta: '/finanzas',           tono: 'finanzas' },
  /* El maíz se queda —es un precio relevante por sí mismo y live-engine ya lo
     trae— pero apunta a Mercados y no a Proteínas: Proteínas salió de la
     portada, y Mercados cotiza el mismo contrato (ZC=F, Granos & Forrajes). */
  { clave: 'maiz',  etiqueta: 'Maíz CME',     idValor: 'pulse-corn',   valor: '$4.97',  detalle: 'CME · $/bushel',     icono: 'fa-seedling',         ruta: '/mercados',           tono: 'proteinas', idCambio: 'pulse-corn-change' },
  { clave: 'wti',   etiqueta: 'Petróleo WTI', idValor: 'pulse-wti',    valor: '$80.46', detalle: 'Energía global',     icono: 'fa-oil-well',         ruta: '/mercados',           tono: 'mercados',  idCambio: 'pulse-wti-change' },
];

/* Los cuatro titulares secundarios. `idFoto` es el slide-* cuya imagen sustituye
   live-engine por la del artículo real; `img` es la de reserva del marcado, a la
   que _bgFor vuelve cuando la noticia llega sin foto propia. */
const RIO = [
  {
    clave: 'mercados', ruta: '/mercados', tono: 'mercados', etiqueta: 'Mercados',
    icono: 'fa-chart-bar', fuente: 'BLOOMBERG', img: '/assets/img/mercados.webp',
    idTitulo: 'st-mercados', idDesc: 'sd-mkt-desc', idFecha: 'sd-0', idFoto: 'slide-mercados',
    titulo: 'Mercados globales: volatilidad ante datos macro de EE.UU.',
    desc: 'Los índices reaccionan a los datos de empleo y a las expectativas de política monetaria de la Fed.',
  },
  {
    clave: 'geo', ruta: '/geopolitica', tono: 'geo', etiqueta: 'Geopolítica',
    icono: 'fa-earth-americas', fuente: 'REUTERS', img: '/assets/img/geo.webp',
    idTitulo: 'st-geo', idDesc: 'sd-geo-desc', idFecha: 'sd-1', idFoto: 'slide-geo',
    titulo: 'Tensiones globales incrementan el riesgo en cadenas de suministro',
    desc: 'Las tensiones en regiones clave afectan directamente a las cadenas de suministro globales.',
  },
  {
    clave: 'mexico', ruta: '/mexico', tono: 'mexico', etiqueta: 'México',
    icono: 'fa-peso-sign', fuente: 'BANXICO', img: '/assets/img/mexico2.webp',
    idTitulo: 'st-mexico', idDesc: 'sd-mex-desc', idFecha: 'sd-2', idFoto: 'slide-mexico',
    titulo: 'Tipo de cambio: el peso frente al dólar en tiempo real',
    desc: 'El mercado cambiario refleja el pulso de la economía mexicana.',
  },
];

/* La tira del pie: acceso a las cinco secciones. live-engine rota aquí el
   titular (ct-*) y la fotografía (card-*) con las noticias clasificadas. */
const MODULOS = [
  { clave: 'finanzas',  ruta: '/finanzas',          tono: 'finanzas',  img: '/assets/img/finanzas.webp', icono: 'fa-chart-line',     etiqueta: 'Finanzas',    idCard: 'card-finanzas',  idTitulo: 'ct-finanzas',    resumen: 'Tasas, divisas y deuda en una sola lectura.',           titulo: 'Banxico: expectativas de inflación para el cierre de Q2' },
  { clave: 'mercados',  ruta: '/mercados',          tono: 'mercados',  img: '/assets/img/mercados.webp', icono: 'fa-globe',          etiqueta: 'Mercados',    idCard: 'card-mercados',  idTitulo: 'ct-mercados',    resumen: 'Commodities y señales que mueven tus costos.',          titulo: 'Cierre de refinería en la Costa del Golfo' },
  { clave: 'geo',       ruta: '/geopolitica',       tono: 'geo',       img: '/assets/img/geo.webp',      icono: 'fa-earth-americas', etiqueta: 'Geopolítica', idCard: 'card-geo',       idTitulo: 'ct-geopolitica', resumen: 'Riesgo global y rutas comerciales con contexto.',       titulo: 'El cierre de rutas en Medio Oriente encarece los contenedores un 22 %' },
  { clave: 'mexico',    ruta: '/mexico',            tono: 'mexico',    img: '/assets/img/mexico2.webp',  icono: 'fa-peso-sign',      etiqueta: 'México',      idCard: 'card-mexico',    idTitulo: 'ct-mexico',      resumen: 'Peso, Banxico y el pulso económico del país.',          titulo: 'Dólar a $17.20 · tipo de cambio al día' },
];

/* Para escribir el número de secciones con letra en la tira. Solo los que puede
   dar MODULOS; si algún día se pasa, se cae al dígito y no a «undefined». */
const NUMEROS = { 3: 'Tres', 4: 'Cuatro', 5: 'Cinco', 6: 'Seis', 7: 'Siete' };

/* Lo que se ve en la cinta hasta que llega el primer dato real. Va con los
   mismos valores del marcado del pulso para no contarle al lector dos cifras
   distintas del mismo indicador en la misma pantalla. */
const CINTA_INICIAL = [
  ['USD/MXN', '$17.20'], ['TIIE 28d', '6.50%'], ['Maíz CME', '$4.97/bu'],
  ['WTI', '$80.46/bbl'], ['Cargando…', '—'],
];

export default function Inicio() {
  usePageStyles(HOJAS);

  const raiz = useRef(null);
  const lienzo = useRef(null);

  useEffect(() => {
    document.documentElement.classList.add('vn-dark-pilot');
    document.body.classList.add('vn-dark-pilot', 'vn-dark-inicio');
    return () => {
      document.documentElement.classList.remove('vn-dark-pilot');
      document.body.classList.remove('vn-dark-pilot', 'vn-dark-inicio');
    };
  }, []);

  // Se congela al montar: live-engine reescribe sd-0…sd-3 con su propia marca
  // de tiempo, y si este valor cambiara en un re-render React se la pisaría.
  const [fechas] = useState(() => {
    const hoy = new Date();
    return {
      corta: hoy.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }),
      larga: hoy.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
      saludo: hoy.getHours() < 12 ? 'Buenos días' : hoy.getHours() < 19 ? 'Buenas tardes' : 'Buenas noches',
    };
  });

  useRevelado(raiz);
  useCifrasVivas(['pulse-usdmxn', 'pulse-tiie', 'pulse-corn', 'pulse-wti', 'idx-vai-num']);

  // ── Fondo WebGL de la cabecera ──────────────────────────────────────────────
  useEffect(() => iniciarFondo(lienzo.current) || undefined, []);

  // ── Motor de datos en vivo ──────────────────────────────────────────────────
  useEffect(() => {
    let vivo = true;

    (async () => {
      try {
        await loadScripts(LIBS);
      } catch (e) {
        console.error('Inicio: no se pudo cargar el motor de datos en vivo', e);
        return;
      }
      if (!vivo) return;
      // En la primera visita el propio script ya arrancó al cargarse; init() es
      // idempotente, así que esta llamada solo hace algo al volver a la página.
      window.VNLive?.init();
    })();

    return () => {
      vivo = false;
      window.VNLive?.stop();
    };
  }, []);

  return (
    <>
      <Header />
      <div className="hdr-divider" />

      {/* ── Cinta de cotizaciones ─────────────────────────────────────────────
          Se queda pegada bajo la barra al bajar: es el indicador de que los
          datos siguen vivos mientras se lee el resto de la portada. */}
      <div className="in-cinta">
        <span className="in-cinta-etq" aria-hidden="true">
          <span className="in-live-dot" /> En vivo
        </span>
        <div className="in-cinta-pista">
          {/* live-engine sustituye el contenido entero por la fila duplicada y le
              aplica la animación `vn-ticker`. Hasta entonces se ve esto. */}
          <div className="in-cinta-int" id="tickerInner">
            {CINTA_INICIAL.map(([lbl, val], i) => (
              /* El separador va como hermano, no dentro del item: es como lo
                 emite renderTicker, y así el marcado inicial y el de después
                 caen sobre exactamente las mismas reglas. */
              <Fragment key={lbl}>
                {i > 0 && <span className="tk-sep">◆</span>}
                <span className="tk-item">
                  <span className="tk-lbl">{lbl}</span>
                  <span className="tk-val">{val}</span>
                </span>
              </Fragment>
            ))}
          </div>
        </div>
      </div>

      <main className="in-main" ref={raiz}>

        {/* ── Cabecera editorial ───────────────────────────────────────────── */}
        <header className="in-masthead">
          {/* El lienzo es decoración: si no hay WebGL se queda transparente y
              manda el degradado de .in-masthead, que ya es un fondo completo. */}
          <canvas className="in-masthead-lienzo" ref={lienzo} aria-hidden="true" />
          <span className="in-masthead-velo" aria-hidden="true" />

          <div className="in-chrome">
            <span className="in-chrome-marca">
              <span className="in-punto" aria-hidden="true" />Portada
            </span>
            <time className="in-fecha" id="sectionDate">{fechas.larga}</time>
            <span className="in-regla" aria-hidden="true" />
            <span className="in-upd">Act.&nbsp;<span id="lastUpdated">—</span></span>
            <span className="in-badge" id="backendBadge">VALL AI</span>
            <button className="in-refresh" id="refreshBtn" type="button" title="Actualizar datos" aria-label="Actualizar datos">
              <i className="fas fa-rotate-right" aria-hidden="true" />
            </button>
          </div>

          <div className="in-masthead-cuerpo">
            <div className="in-titular">
              <span className="in-kicker" data-revelar="">
                <span className="in-live-dot" aria-hidden="true" /> {fechas.saludo} · Inteligencia en vivo
              </span>
              <h1>
                {TITULAR.map((p, i) => (
                  <span className="in-palabra" key={p.txt} style={{ '--i': i }}>
                    <span className={p.em ? 'in-palabra-int in-palabra-em' : 'in-palabra-int'}>{p.txt}</span>
                  </span>
                ))}
              </h1>
              <p data-revelar="">
                Mercados, México y riesgo global convertidos en una lectura clara para tomar
                mejores decisiones.
              </p>
              <div className="in-acciones" data-revelar="">
                <a className="in-cta in-cta-primary" href="#portada-hoy">
                  Ver la portada de hoy <i className="fas fa-arrow-down" aria-hidden="true" />
                </a>
                <Link className="in-cta in-cta-ghost" to="/vall-ai">
                  Preguntar a VALL AI <i className="fas fa-wand-magic-sparkles" aria-hidden="true" />
                </Link>
              </div>
            </div>

            {/* ── Espina de datos ────────────────────────────────────────────
                Lo que antes era una retícula de cuatro tarjetas. Aquí son
                cuatro filas separadas por una regla: se leen como una tabla de
                cotizaciones y no como cuatro botones. */}
            {/* role="group": sin él, un aria-label sobre un <div> genérico no lo
                expone ningún lector de pantalla. */}
            <div className="in-espina" role="group" aria-label="Pulso del mercado">
              <div className="in-espina-cab">
                <span>Pulso del mercado</span>
                <span className="in-espina-live"><span aria-hidden="true" /> en vivo</span>
              </div>
              {PULSO.map((dato, i) => (
                <Link
                  className={`in-cifra in-tono-${dato.tono}`}
                  to={dato.ruta}
                  key={dato.clave}
                  data-revelar=""
                  style={{ '--i': i }}
                >
                  <span className="in-cifra-icono"><i className={`fas ${dato.icono}`} aria-hidden="true" /></span>
                  <span className="in-cifra-texto">
                    <span className="in-cifra-etq">{dato.etiqueta}</span>
                    <span className="in-cifra-pie">{dato.detalle}</span>
                  </span>
                  <span className="in-cifra-valor">
                    <strong id={dato.idValor}>{dato.valor}</strong>
                    {dato.idCambio && <span className="in-cifra-var" id={dato.idCambio}>—</span>}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </header>

        <ExecutiveReportsHub />

        {/* ── Portada ──────────────────────────────────────────────────────── */}
        <section className="in-portada" id="portada-hoy">
          <div className="in-columna-mayor">
            <Link className="in-lead" to="/finanzas" data-revelar="">
              <span
                className="in-lead-fondo"
                aria-hidden="true"
                style={{ backgroundImage: "url('/assets/img/finanzas.webp')" }}
              >
                <span
                  className="in-lead-foto"
                  id="slide-finanzas"
                  style={{ backgroundImage: "url('/assets/img/finanzas.webp')" }}
                />
              </span>
              <span className="in-lead-velo" aria-hidden="true" />
              {/* <div> y no <span>: lleva dentro un <h2> y un <p>, y <span> es
                  contenido de frase. <a> en cambio es transparente, así que el
                  enlace envolviéndolo todo sí es válido. */}
              <div className="in-lead-int">
                <span className="in-lead-meta">
                  <span className="in-pill" data-tono="finanzas">
                    <i className="fas fa-building-columns" aria-hidden="true" /> Macro MX
                  </span>
                  <span className="in-sub">BANXICO</span>
                  <span className="in-riesgo in-riesgo-alto">
                    <i className="fas fa-triangle-exclamation" aria-hidden="true" /> Alto impacto
                  </span>
                </span>
                <h2 className="in-lead-tit" id="st-finanzas">
                  Banxico: expectativas de inflación para el cierre de Q2
                </h2>
                <p className="in-lead-desc" id="sd-fin-desc">
                  El consenso de analistas proyecta movimientos en tasas y mercados globales.
                </p>
                <span className="in-ir">
                  Abrir Finanzas <i className="fas fa-arrow-right" aria-hidden="true" />
                </span>
              </div>
            </Link>

            <Link className="in-descubre" to="/vall-ai" data-revelar="">
              <span className="in-descubre-icono"><i className="fas fa-wand-magic-sparkles" aria-hidden="true" /></span>
              <span className="in-descubre-texto">
                <small>Análisis personalizado</small>
                <strong>Convierte estos datos en una decisión con VALL AI</strong>
              </span>
              <span className="in-descubre-ir">Analizar ahora <i className="fas fa-arrow-right" aria-hidden="true" /></span>
            </Link>
          </div>

          <aside className="in-columna-menor">
            {/* ── VALL·AI ───────────────────────────────────────────────────── */}
            <div className="in-vai" data-revelar="">
              <div className="in-vai-cab">
                <span className="in-vai-marca">VALL<span className="in-vai-punto">·</span>AI</span>
                <div
                  className="in-vai-sel"
                  id="vaiSelect"
                  role="button"
                  tabIndex={0}
                  title="Clic para alternar entre vista México y vista Global"
                >
                  <i className="fas fa-chart-line" id="vaiSelectIcon" aria-hidden="true" />
                  <span id="vaiSelectLbl">Finanzas</span>
                  <i className="fas fa-chevron-down in-vai-flecha" aria-hidden="true" />
                </div>
              </div>

              <div className="in-vai-cuerpo">
                <div className="in-vai-aguja">
                  <svg viewBox="0 0 100 100" aria-hidden="true">
                    <circle className="in-g-bg" cx="50" cy="50" r="40" />
                    {/* 251.2 = circunferencia de r=40. live-engine calcula el
                        strokeDashoffset contra ese número exacto; cambiar el
                        radio descuadra la aguja sin dar ningún error. */}
                    <circle id="idx-vai-arc" className="in-g-arc" cx="50" cy="50" r="40" />
                  </svg>
                  <div className="in-g-num" id="idx-vai-num">74%</div>
                </div>
                <div className="in-vai-lectura">
                  <span className="in-vai-lbl">Predicción</span>
                  <span className="in-vai-activo" id="idx-vai-asset">MERCADO MX</span>
                  <span className="in-vai-veredicto" id="idx-vai-verdict">Bajista</span>
                </div>
              </div>
              <p className="in-vai-aviso" id="idx-vai-warn">Cargando datos en vivo…</p>
            </div>

            {/* ── Río de titulares ──────────────────────────────────────────── */}
            <div className="in-rio-cab">
              <h2>Lo último</h2>
              <span className="in-rio-cuenta">{RIO.length} secciones</span>
            </div>
            <ul className="in-rio">
              {RIO.map((n, i) => (
                <li key={n.clave} data-revelar="" style={{ '--i': i }}>
                  <Link className={`in-rio-item in-tono-${n.tono}`} to={n.ruta}>
                    {/* Misma pareja de capas que en la nota principal: la de
                        fuera es el respaldo que live-engine no toca. */}
                    <span
                      className="in-rio-fondo"
                      aria-hidden="true"
                      style={{ backgroundImage: `url('${n.img}')` }}
                    >
                      <span
                        className="in-rio-foto"
                        id={n.idFoto}
                        style={{ backgroundImage: `url('${n.img}')` }}
                      />
                    </span>
                    <span className="in-rio-texto">
                      <span className="in-rio-linea">
                        <span className="in-rio-sec">
                          <i className={`fas ${n.icono}`} aria-hidden="true" /> {n.etiqueta}
                        </span>
                        <span className="in-rio-fecha" id={n.idFecha}>{fechas.corta}</span>
                      </span>
                      <span className="in-rio-tit" id={n.idTitulo}>{n.titulo}</span>
                      <span className="in-rio-desc" id={n.idDesc}>{n.desc}</span>
                      <span className="in-rio-src">{n.fuente}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </aside>
        </section>

        {/* ── Tira de secciones ────────────────────────────────────────────── */}
        <section className="in-tira" aria-labelledby="tira-titulo">
          <div className="in-tira-cab">
            <h2 id="tira-titulo">Explora la plataforma</h2>
            {/* El número sale de MODULOS y no está escrito a mano: al quitar
                Proteínas, «Cinco frentes» se quedó mintiendo un rato. */}
            <span className="in-tira-nota">{NUMEROS[MODULOS.length] || MODULOS.length} frentes, una misma lectura del riesgo</span>
          </div>
          <nav className="in-tira-pista" aria-label="Secciones del sitio">
            {MODULOS.map((m, i) => (
              <Link
                className={`in-col in-tono-${m.tono}`}
                to={m.ruta}
                key={m.clave}
                data-revelar=""
                style={{ '--i': i }}
              >
                <span
                  className="in-col-fondo"
                  aria-hidden="true"
                  style={{ backgroundImage: `url('${m.img}')` }}
                >
                  <span
                    className="in-col-foto"
                    id={m.idCard}
                    style={{ backgroundImage: `url('${m.img}')` }}
                  />
                </span>
                <span className="in-col-int">
                  <span className="in-col-num" aria-hidden="true">0{i + 1}</span>
                  <span className="in-col-etq">
                    <i className={`fas ${m.icono}`} aria-hidden="true" /> {m.etiqueta}
                  </span>
                  <span className="in-col-tit" id={m.idTitulo}>{m.titulo}</span>
                  <span className="in-col-resumen">{m.resumen}</span>
                  <span className="in-col-ir">Explorar <i className="fas fa-arrow-right" aria-hidden="true" /></span>
                </span>
              </Link>
            ))}
          </nav>
        </section>

      </main>

      <Footer />
    </>
  );
}
