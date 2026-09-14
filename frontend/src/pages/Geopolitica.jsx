import { useEffect, useMemo, useState } from 'react';
import Header from '../components/Header.jsx';
import Footer from '../components/Footer.jsx';
import AcledMap from '../components/AcledMap.jsx';
import usePageStyles from '../lib/usePageStyles.js';
import loadScripts, { globalLegado } from '../lib/loadScripts.js';
import textoEnriquecido from '../lib/textoEnriquecido.js';
import acledDemo, { REGION_POR_PAIS, categoriaDe } from '../data/acledDemo.js';
import './Geopolitica.css';
import { ESQUELETO } from '../lib/hojasComunes.js';

/*
 * Geopolítica en React idiomático (antes pages/geopolitica.html, 1205 líneas).
 *
 * CAMBIO DE FONDO — el ticker de crisis ya no inventa precios.
 * El original llamaba a genTick(), que generaba un número ALEATORIO alrededor
 * de una base fija cada 10 segundos: `base + (Math.random()*vol*2 - vol)`. Las
 * bases estaban desfasadas (oro en 2345 cuando cotiza sobre 4400), así que la
 * página mostraba cifras inventadas bajo etiquetas reales —"Oro (XAU)",
 * "USD/MXN"— junto a un indicador de "Radar Activo". Ahora las cuatro salen de
 * /api/stock-history y, si una fuente no responde, se muestra "—" en vez de un
 * número fabricado. Es el mismo criterio que la propia plataforma declara en
 * Finanzas: no completar con cifras estimadas lo que la fuente no da.
 *
 * Además:
 *  - El mapa Leaflet vive en <AcledMap>, que sí se destruye al desmontar. El
 *    original nunca llamaba a map.remove(), así que al volver a la sección
 *    Leaflet fallaba con "Map container is already initialized".
 *  - Los dos setInterval (ticker y refresco de noticias) ahora se cancelan.
 *  - Las filas "Noticias por Región" se calculan; antes las escribían por
 *    turnos dos rutinas distintas (GDELT y ACLED) peleándose por el mismo nodo
 *    con una marca `data-gdelt` para no pisarse.
 */

const HOJAS = [
  ...ESQUELETO,
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css',
  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css',
];

const LIBS = ['/assets/js/api-keys.js?v=5', '/assets/js/data-service.js?v=23'];
const LIBS_MAPA = [
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js',
];

const CLAVE_CACHE = 'geo_v10';
const MS_REFRESCO = 30 * 60 * 1000;
const MS_TICKER = 5 * 60 * 1000;

/* Ticker: cuatro instrumentos reales vía /api/stock-history. */
const TICKER = [
  { clave: 'gold', titulo: 'Oro (XAU)', ticker: 'GC=F', decimales: 2 },
  { clave: 'oil', titulo: 'Petróleo (Brent)', ticker: 'BZ=F', decimales: 2 },
  { clave: 'usdmxn', titulo: 'USD/MXN', ticker: 'MXN=X', decimales: 2 },
  { clave: 'vix', titulo: 'VIX (Volatilidad)', ticker: '^VIX', decimales: 2 },
];

/* Iconos y no emoji. Windows no dibuja las banderas emoji: 🇺🇸 se pintaba como
   las letras «US» sueltas y 🇪🇺 como «EU», que parecía un fallo de codificación.
   Font Awesome ya está cargado en todas las rutas y se ve igual en todas. */
const REGIONES_MAPA = [
  { id: 'all', texto: 'Mundo', icono: 'fa-globe' },
  { id: 'ukraine', texto: 'Ucrania', icono: 'fa-crosshairs' },
  { id: 'middle_east', texto: 'Medio Oriente', icono: 'fa-location-dot' },
  { id: 'africa', texto: 'África', icono: 'fa-earth-africa' },
  { id: 'latam', texto: 'LATAM', icono: 'fa-earth-americas' },
];

const CATEGORIAS_MAPA = [
  { id: 'all', texto: 'Todos', icono: 'fa-layer-group' },
  { id: 'armado', texto: 'Armado', icono: 'fa-crosshairs' },
  { id: 'social', texto: 'Social', icono: 'fa-users' },
  { id: 'politico', texto: 'Político', icono: 'fa-landmark' },
  { id: 'economico', texto: 'Económico', icono: 'fa-arrow-trend-down' },
];

const FILTROS = [
  { id: 'all', texto: 'Todas las regiones', icono: 'fa-globe' },
  { id: 'usa', texto: 'USA', icono: 'fa-flag-usa' },
  { id: 'asia', texto: 'Asia', icono: 'fa-earth-asia' },
  { id: 'europa', texto: 'Europa', icono: 'fa-euro-sign' },
  { id: 'latam', texto: 'LATAM', icono: 'fa-earth-americas' },
];

const LEYENDA = [
  { texto: 'Armado', color: '#f87171', retraso: '0s' },
  { texto: 'Social', color: '#a855f7', retraso: '.3s' },
  { texto: 'Político', color: '#3b82f6', retraso: '.6s' },
  { texto: 'Económico', color: '#fbbf24', retraso: '.9s' },
];

/* Clasificador semántico por región: mira el contenido del titular, no la
   fuente que lo originó. */
const PALABRAS = {
  usa: ['united states', 'u.s.', 'usa', 'washington', 'trump', 'congress', 'pentagon', 'american', 'white house', 'tariff', 'trade war', 'semiconductor', 'estados unidos', 'aranceles', 'política comercial', 'federal reserve', 'cia', 'state department', 'nfib', 'dow jones', 'nasdaq', 'silicon valley', 'wall street'],
  asia: ['china', 'beijing', 'japan', 'taiwan', 'korea', 'xi jinping', 'hong kong', 'india', 'myanmar', 'philippines', 'indonesia', 'supply chain', 'south china sea', 'north korea', 'corea', 'japón', 'cadena de suministro', 'asia pacífico', 'pekín', 'shanghai', 'tokio', 'seúl', 'huawei', 'byd', 'vietnam', 'bangladesh'],
  europa: ['europe', 'european union', 'eu', 'nato', 'russia', 'ukraine', 'germany', 'france', 'spain', 'italy', 'poland', 'uk', 'britain', 'brussels', 'zelensky', 'putin', 'rusia', 'ucrania', 'europa', 'unión europea', 'otan', 'alemania', 'reino unido', 'macron', 'scholz', 'bruselas', 'sanciones', 'ceasefire', 'alto el fuego'],
  latam: ['mexico', 'brazil', 'argentina', 'colombia', 'chile', 'peru', 'venezuela', 'latam', 'latin america', 'mercosur', 'milei', 'petro', 'sheinbaum', 'lula', 'boric', 'méxico', 'brasil', 'latinoamérica', 'sudamérica', 'centroamérica', 'cartel', 'narco', 'haití', 'cuba', 'bolivia', 'ecuador', 'guatemala', 'morena'],
};

function clasificar(texto) {
  if (!texto || typeof texto !== 'string') return null;
  const t = texto.toLowerCase();
  let mejor = null;
  let mejorPuntos = 0;
  for (const [region, palabras] of Object.entries(PALABRAS)) {
    const puntos = palabras.reduce((acc, w) => acc + (t.includes(w) ? 1 : 0), 0);
    if (puntos > mejorPuntos) { mejorPuntos = puntos; mejor = region; }
  }
  return mejorPuntos > 0 ? mejor : null;
}

/* Contenido de respaldo por región: contextual y etiquetado como análisis
   propio, nunca presentado como titular de agencia. */
const RESPALDO = {
  usa: { titulo: 'Política arancelaria EE.UU. reconfigura cadenas de suministro globales', desc: 'Tensiones comerciales EE.UU.–China impulsan nearshoring en México y Latinoamérica. Aranceles diferenciados presionan costos de manufactura y agroindustria en sectores clave.' },
  asia: { titulo: 'Asia-Pacífico: restricciones tecnológicas y reconfiguración de cadenas globales', desc: 'China diversifica compras de granos y proteínas. Restricciones a semiconductores redefinen flujos comerciales en la región Indo-Pacífico. India emerge como destino alternativo de manufactura.' },
  europa: { titulo: 'Conflicto en Europa del Este mantiene presión sobre commodities energéticos', desc: 'Guerra en Ucrania impacta precios de trigo y fertilizantes. Sanciones a Rusia alteran flujos de energía en mercados globales. UE acelera transición a fuentes alternativas.' },
  latam: { titulo: 'Latinoamérica: nearshoring y acuerdos comerciales en el centro del debate', desc: 'México y Brasil lideran captación de inversión manufacturera por nearshoring. Acuerdo Mercosur-UE en fase crítica. Estabilidad política en Colombia y Chile atrae capital regional.' },
};

const REGIONES = ['usa', 'asia', 'europa', 'latam'];
const CATEGORIA_TXT = { usa: 'USA · Política', asia: 'Asia · Geopolítica', europa: 'Europa · Conflicto', latam: 'LATAM · Región' };
const IMPACTO = { usa: 'alto', asia: 'alto', europa: 'medio', latam: 'bajo' };
const BANDERA = { usa: 'fa-flag-usa', asia: 'fa-earth-asia', europa: 'fa-euro-sign', latam: 'fa-earth-americas', global: 'fa-globe' };
const REGION_TXT = { usa: 'USA', asia: 'Asia', europa: 'Europa', latam: 'LATAM', global: 'Global' };

/* UNA sola imagen, la de la sección, para las cuatro regiones.
   Antes se repartían cuatro fotos de OTRAS secciones —granos, finanzas,
   proteínas, México— por orden de índice, sin ninguna relación con el titular
   que les tocaba encima. Salía una foto de carne bajo «Europa · Conflicto:
   Emiratos dice que Irán le lanzó dos misiles», que es exactamente la pareja
   titular-imagen que no se debe publicar. Lo que distingue ahora una región de
   otra es el tono: filo, icono y cintillo, como en Mercados. */
const IMG_SECCION = '/assets/img/geo.webp';

/** Recorta sin partir palabras. `slice(0,100)` a secas dejaba titulares
    terminados en «…suben los re». */
function recortar(texto, max) {
  const t = (texto || '').trim();
  if (t.length <= max) return t;
  const corte = t.slice(0, max);
  const espacio = corte.lastIndexOf(' ');
  return `${(espacio > max * 0.6 ? corte.slice(0, espacio) : corte).replace(/[.,;:·\-\s]+$/, '')}…`;
}

/** ¿La descripción no aporta nada sobre el titular?
    GDELT y Finnhub devuelven a menudo el mismo texto en los dos campos, y la
    tarjeta acababa diciendo lo mismo dos veces seguidas. */
function repiteTitulo(desc, titulo) {
  const limpia = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const d = limpia(desc);
  const t = limpia(titulo).replace(/…$/, '');
  if (!d) return true;
  return d.startsWith(t.slice(0, 40)) || t.startsWith(d.slice(0, 40));
}

const RE_ES = /\b(el|la|los|las|de|en|y|que|un|una|por|con|del|al|se|es|su|como|para)\b/i;

async function aEspanol(VDS, texto) {
  if (!texto || RE_ES.test(texto)) return texto;
  try { return await VDS.translate(texto, 'en', 'es'); } catch { return texto; }
}

/* Cotización diaria real: último cierre frente al anterior. */
async function cotizacion(ticker) {
  const r = await fetch(`/api/stock-history?ticker=${encodeURIComponent(ticker)}&range=5d&interval=1d`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  const velas = (j?.candles || []).filter((c) => Number.isFinite(+c.close));
  if (!velas.length) throw new Error('serie vacía');
  const ultimo = +velas[velas.length - 1].close;
  const previo = velas.length > 1 ? +velas[velas.length - 2].close : null;
  return { precio: ultimo, pct: previo ? ((ultimo / previo) - 1) * 100 : null };
}

async function cargarNoticias(VDS) {
  const ahora = new Date();
  const hora = ahora.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  const fechaFmt = ahora.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();

  // Una sola consulta amplia: cinco simultáneas disparaban el límite de GDELT
  // (1 petición cada 5 s) y el clasificador ya reparte por región.
  const [gdR, fhR] = await Promise.allSettled([
    VDS.gdeltNews(
      'geopolitics conflict war sanctions diplomacy military ceasefire '
      + 'USA Washington tariff China semiconductor NATO Russia Ukraine Europe '
      + 'Mexico Brazil Argentina LATAM nearshoring', 30,
    ),
    VDS.finnhubNews('general'),
  ]);

  const usar = (r) => (r.status === 'fulfilled' && Array.isArray(r.value) ? r.value : []);
  const gd = usar(gdR);

  const crudas = [
    ...gd.map((a) => ({ title: a.title, desc: a.description || '', src: a.source || a.domain || 'GDELT' })),
    ...usar(fhR).map((a) => ({ title: a.title, desc: a.description || a.summary || '', src: a.source || 'Finnhub' })),
  ];

  const vistos = new Set();
  const unicas = crudas.filter((a) => {
    const k = (a.title || '').toLowerCase().slice(0, 50);
    if (!k || k.length < 8 || vistos.has(k)) return false;
    vistos.add(k);
    return true;
  }).slice(0, 40);

  const traducidas = await Promise.all(unicas.map(async (a) => ({
    ...a,
    title: await aEspanol(VDS, a.title).catch(() => a.title),
    desc: await aEspanol(VDS, (a.desc || '').slice(0, 250)).catch(() => a.desc),
  })));

  const grupos = { usa: [], asia: [], europa: [], latam: [] };
  traducidas.forEach((a) => {
    const reg = clasificar(a.title) || clasificar(a.desc);
    if (reg && grupos[reg].length < 3) grupos[reg].push(a);
  });

  const noticias = REGIONES.map((reg) => {
    const a = grupos[reg][0];
    const base = { region: reg, categoria: CATEGORIA_TXT[reg], impacto: IMPACTO[reg], fecha: `${fechaFmt} · ${hora}`, img: IMG_SECCION };
    if (a) {
      const titulo = recortar(a.title, 100);
      const desc = recortar(a.desc, 350);
      return {
        ...base,
        titulo,
        // Vacía en vez de repetida: la tarjeta ya sabe no pintarla.
        desc: repiteTitulo(desc, titulo) ? '' : desc,
        fuente: (a.src || 'GDELT').toUpperCase(),
      };
    }
    return { ...base, ...RESPALDO[reg], fuente: 'Análisis VALL' };
  });

  return { noticias, fechaFmt, hora };
}

function Alerta({ nivel, icono, etiqueta, titulo, cuerpo }) {
  return (
    <div className={`gp-alert-card ${nivel}`}>
      <div className="gp-alert-lbl"><i className={`fas ${icono}`} /> &nbsp;{etiqueta}</div>
      <div className="gp-alert-title">{titulo}</div>
      {/* El cuerpo lo compone la página, pero interpola titulares de GDELT y
          Alpha Vantage —texto de terceros—, así que pasa por el saneador. */}
      {/* eslint-disable-next-line react/no-danger */}
      <div className="gp-alert-body" dangerouslySetInnerHTML={{ __html: textoEnriquecido(cuerpo) }} />
    </div>
  );
}

export default function Geopolitica() {
  usePageStyles(HOJAS);

  /* El tema de la sección se activa por clase, no por media query:
     Geopolitica.css cuelga el fondo de body.vn-dark-geo. Se pone al montar y se
     quita al salir, para que no tiña el resto de rutas. Es el mismo patrón que
     usan Inicio, Finanzas y Mercados.

     La clase va también en <html>, y no es redundante: el <html> conserva el
     azul claro del tema heredado y asoma por detrás del body, lavando el color
     de la página entera. */
  useEffect(() => {
    document.documentElement.classList.add('vn-dark-geo');
    document.body.classList.add('vn-dark-geo');
    return () => {
      document.documentElement.classList.remove('vn-dark-geo');
      document.body.classList.remove('vn-dark-geo');
    };
  }, []);

  const [datos, setDatos] = useState(null);
  const [precios, setPrecios] = useState({});
  const [filtro, setFiltro] = useState('all');
  const [regionMapa, setRegionMapa] = useState('all');
  const [catMapa, setCatMapa] = useState('all');
  const [conteo, setConteo] = useState(null);
  const [mapaListo, setMapaListo] = useState(false);
  const [analisisIA, setAnalisisIA] = useState('');

  // ── Ticker con datos reales ─────────────────────────────────────────────────
  useEffect(() => {
    let vivo = true;

    const refrescar = async () => {
      const resultados = await Promise.allSettled(TICKER.map((t) => cotizacion(t.ticker)));
      if (!vivo) return;
      const siguiente = {};
      TICKER.forEach((t, i) => {
        const r = resultados[i];
        siguiente[t.clave] = r.status === 'fulfilled' ? r.value : null;
      });
      setPrecios(siguiente);
    };

    refrescar();
    const reloj = setInterval(refrescar, MS_TICKER);
    return () => { vivo = false; clearInterval(reloj); };
  }, []);

  // ── Leaflet ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    let vivo = true;
    loadScripts(LIBS_MAPA)
      .then(() => { if (vivo) setMapaListo(true); })
      .catch((e) => console.error('Geopolítica: Leaflet no cargó', e));
    return () => { vivo = false; };
  }, []);

  // ── Noticias ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let vivo = true;
    let reloj = null;

    const ejecutar = async (VDS) => {
      const d = await cargarNoticias(VDS);
      if (!vivo) return;
      VDS.save(CLAVE_CACHE, d);
      setDatos(d);

      try {
        const titulares = d.noticias.slice(0, 4)
          .map((n) => `- [${n.categoria}] ${n.titulo}: ${(n.desc || '').slice(0, 150)}`)
          .join('\n');
        const texto = await VDS.geminiChat(
          'Eres VALL-AI, analista geopolítico de VALLNews. Con base en estos titulares recientes, redacta un '
          + '"Análisis Regional" de 2-3 oraciones sobre el impacto económico regional más relevante para empresas '
          + `mexicanas (cadenas de suministro, comercio exterior, costos de insumos).\n\nTITULARES:\n${titulares}\n\n`
          + 'Sé directo y concreto, sin frases de apertura genéricas.',
          'Eres un analista geopolítico institucional de VALL News. Responde en español, de forma concisa y profesional. Máximo 100 palabras.',
        );
        if (vivo && texto) setAnalisisIA(texto.replace(/\n/g, '<br>'));
      } catch { /* se queda el análisis derivado de los titulares */ }
    };

    (async () => {
      try {
        await loadScripts(LIBS);
      } catch (e) {
        console.error('Geopolítica: no se pudo cargar data-service', e);
        return;
      }
      if (!vivo) return;

      const VDS = globalLegado('VDS');
      if (!VDS) { console.error('Geopolítica: data-service.js no expuso VDS.'); return; }

      const guardado = VDS.load(CLAVE_CACHE, true);
      if (guardado?.noticias?.length) {
        setDatos(guardado);
        window.VNLoader?.hide();
        if (!VDS.isExpired(CLAVE_CACHE)) return;
        VDS.clear(CLAVE_CACHE);
      }

      await ejecutar(VDS).catch((e) => console.error('Geopolítica:', e));
      window.VNLoader?.hide();
      reloj = setInterval(() => ejecutar(VDS).catch(() => {}), MS_REFRESCO);
    })();

    return () => { vivo = false; if (reloj) clearInterval(reloj); };
  }, []);

  const noticias = useMemo(
    () => (datos?.noticias || []).filter((n) => filtro === 'all' || n.region === filtro),
    [datos, filtro],
  );

  /* Filas "Noticias por Región": las cuatro regiones salen de los titulares ya
     clasificados; la fila global sale del evento más grave del mapa, que es la
     única que GDELT no cubre. */
  const filasRegion = useMemo(() => {
    const filas = (datos?.noticias || []).map((n) => ({
      region: n.region,
      texto: (n.titulo || '').slice(0, 92),
      lugar: `${n.categoria} · ${n.fuente}`,
      impacto: n.impacto,
    }));

    const peor = acledDemo
      .filter((ev) => !REGION_POR_PAIS[ev.country] || REGION_POR_PAIS[ev.country] === 'global')
      .sort((a, b) => (parseInt(b.fatalities, 10) || 0) - (parseInt(a.fatalities, 10) || 0))[0];

    if (peor) {
      const bajas = parseInt(peor.fatalities, 10) || 0;
      const cat = categoriaDe(peor);
      filas.push({
        region: 'global',
        texto: (peor.notes || `${peor.location}, ${peor.country}`).slice(0, 92),
        lugar: `${peor.country}${bajas > 0 ? ` · ${bajas} bajas` : ''} · ACLED (demo)`,
        impacto: cat === 'armado' ? 'alto' : cat === 'social' ? 'bajo' : 'medio',
      });
    }
    return filas;
  }, [datos]);

  /* Índice de tensión: derivado del reparto de impacto de los titulares. */
  const riesgo = useMemo(() => {
    const lista = datos?.noticias || [];
    if (!lista.length) return null;
    const altos = lista.filter((n) => n.impacto === 'alto').length;
    const medios = lista.filter((n) => n.impacto === 'medio').length;
    const puntos = Math.min(95, Math.max(25, 40 + altos * 15 + medios * 5));
    /* Los tres colores son los del sistema (armado / económico / alza), no unos
       rojos y verdes propios: el mismo rojo que marca «armado» en el mapa es el
       que marca riesgo elevado aquí, y eso los ata. */
    if (puntos > 70) return { puntos, color: '#e0605f', etiqueta: 'Riesgo elevado', desc: 'Tensión alta detectada en zonas clave. Impacto esperado en commodities.' };
    if (puntos > 45) return { puntos, color: '#e0b059', etiqueta: 'Riesgo moderado', desc: 'Tensión regional activa. Vigilancia de mercados recomendada.' };
    return { puntos, color: '#59d2aa', etiqueta: 'Riesgo bajo', desc: 'Contexto geopolítico estable o en distensión relativa.' };
  }, [datos]);

  const resumen = (n) => `<b>${(n.titulo || '').slice(0, 72)}</b><br><span style="font-size:0.78rem">${(n.desc || '').slice(0, 130)}</span>`;

  return (
    <div className="gp-page">
      <Header />
      <div className="hdr-divider" />

      <div className="gp-container">
        {/* ── Hero ──────────────────────────────────────────────────────────
            Mismo bloque que abre Mercados y Finanzas: cintillo, título grande,
            línea de alcance con la hora, y a la derecha los distintivos de
            estado. El índice de tensión sale del reparto de impacto de los
            titulares, así que no aparece hasta que hay titulares. */}
        <section className="gp-hero">
          <div className="gp-hero-copy">
            <span className="gp-hero-kicker">
              <span className="gp-live-dot" /> VALLNews · Riesgo global
            </span>
            <h1 className="gp-hero-title">Geopolítica</h1>
            <p className="gp-hero-sub">
              Conflictos · Rutas comerciales · Sanciones · Cadenas de suministro
              {datos?.hora && <> &nbsp;·&nbsp; {datos.hora}</>}
            </p>
          </div>
          <div className="gp-hero-badges">
            <span className="gp-badge-live"><span className="gp-live-dot" /> Radar activo</span>
            <span className="gp-badge-idx">
              Tensión {riesgo ? `${riesgo.puntos}/100` : '--'}
            </span>
          </div>
        </section>

        {/* ── Raíl de instrumentos ──────────────────────────────────────────
            Los cuatro que reaccionan a una crisis. Sin dato se muestra «—» y
            «s/d»: no se completa con cifras estimadas lo que la fuente no da. */}
        <div className="gp-rail">
          {TICKER.map((t) => {
            const d = precios[t.clave];
            const pct = d?.pct;
            const clase = pct == null ? 'na' : pct >= 0 ? 'up' : 'dn';
            return (
              <div className="gp-rail-item" key={t.clave}>
                <span className="gp-rail-lbl">{t.titulo}</span>
                <span className="gp-rail-val">
                  <strong>{d ? d.precio.toFixed(t.decimales) : '—'}</strong>
                  <span className={`gp-rail-pct ${clase}`}>
                    {pct == null ? 's/d' : `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`}
                  </span>
                </span>
              </div>
            );
          })}
        </div>

        <div className="gp-filter-bar">
          {FILTROS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`gp-fpill${filtro === f.id ? ' active' : ''}`}
              onClick={() => setFiltro(f.id)}
            >
              <i className={`fas ${f.icono}`} aria-hidden="true" /> {f.texto}
            </button>
          ))}
        </div>

        <div className="gp-acled-wrap">
          <div className="gp-acled-header">
            <div>
              <span className="gp-acled-title"><i className="fas fa-map-marked-alt" />Monitoreo de riesgos globales</span>
              <span className="gp-acled-powered">Powered by ACLED</span>
            </div>
            <div className="gp-acled-meta">
              {LEYENDA.map((l) => (
                <span className="gp-hs" key={l.texto}>
                  <span
                    className="gp-hs-dot"
                    style={{ background: l.color, boxShadow: `0 0 6px ${l.color}`, animationDelay: l.retraso }}
                  />
                  &nbsp;{l.texto}
                </span>
              ))}
            </div>
          </div>

          <div className="gp-acled-filter-row">
            {REGIONES_MAPA.map((r) => (
              <button
                key={r.id}
                type="button"
                className={`gp-acled-fbtn${regionMapa === r.id ? ' active' : ''}`}
                onClick={() => setRegionMapa(r.id)}
              >
                <i className={`fas ${r.icono}`} aria-hidden="true" /> {r.texto}
              </button>
            ))}
            <span className="gp-acled-count">
              {conteo == null ? 'Cargando…' : `${conteo.toLocaleString('es-MX')} eventos`}
            </span>
            <span className="gp-acled-date">Conjunto de demostración</span>
          </div>

          <div className="gp-acled-cat-row">
            <span className="gp-acled-cat-lbl">Tipo:</span>
            {CATEGORIAS_MAPA.map((c) => (
              <button
                key={c.id}
                type="button"
                data-cat={c.id}
                className={`gp-acled-cbtn${catMapa === c.id ? ' active' : ''}`}
                onClick={() => setCatMapa(c.id)}
              >
                <i className={`fas ${c.icono}`} aria-hidden="true" /> {c.texto}
              </button>
            ))}
          </div>

          <div className="gp-acled-map-frame">
            {mapaListo
              ? <AcledMap eventos={acledDemo} categoria={catMapa} region={regionMapa} onConteo={setConteo} />
              : <div className="gp-acled-map" />}
            <div className="gp-acled-map-vignette" />
          </div>

          {/* Aviso permanente: ACLED bloquea las llamadas desde el navegador
              (CORS), así que lo que se ve es el conjunto de demostración. */}
          <div className="gp-acled-error">
            <i className="fas fa-exclamation-triangle" style={{ marginRight: '.4rem', color: '#fbbf24' }} />
            <b>Datos de demostración.</b> La API de ACLED no permite llamadas directas desde el navegador.
            Para eventos en vivo hay que consultarla desde el servidor.
          </div>
        </div>

        {/* ── Módulos por región ────────────────────────────────────────────
            Misma pieza que las cuatro tarjetas de Mercados: fotografía a
            sangre, icono cuadrado, cintillo en versales, titular y la fuente
            arriba a la derecha. El titular sale de GDELT/Finnhub; cuando no hay
            nada clasificado para esa región se etiqueta «Análisis VALL», nunca
            como titular de agencia. */}
        <div className="gp-news-grid">
          {noticias.map((n) => (
            <article className={`gp-mod gp-mod-${n.region}`} key={n.region}>
              <span
                className="gp-mod-foto"
                aria-hidden="true"
                style={{ backgroundImage: `url('${n.img}')` }}
              />
              <span className="gp-mod-velo" aria-hidden="true" />
              <div className="gp-mod-top">
                <span className="gp-mod-icono"><i className={`fas ${BANDERA[n.region]}`} aria-hidden="true" /></span>
                <div className="gp-mod-encab">
                  <span className="gp-mod-cat">{n.categoria}</span>
                  <span className="gp-mod-fecha">{n.fecha}</span>
                </div>
                <span className="gp-mod-src">{n.fuente}</span>
              </div>
              <div className="gp-mod-pie">
                <h3 className="gp-mod-title">{n.titulo}</h3>
                {n.desc && <p className="gp-mod-desc">{n.desc}</p>}
                <span className={`gp-mod-impacto gp-imp-${n.impacto}`}>
                  <i className="fas fa-signal" aria-hidden="true" />
                  {n.impacto === 'alto' ? 'Alto impacto' : n.impacto === 'medio' ? 'Impacto medio' : 'Impacto bajo'}
                </span>
              </div>
            </article>
          ))}
          {!datos && <p className="gp-cargando">Cargando análisis geopolítico…</p>}
        </div>

        <div className="gp-bottom-grid">
          <div className="gp-panel">
            <div className="gp-section-lbl">Noticias por Región</div>
            {filasRegion.length === 0 && <div className="gp-region-news">Cargando eventos…</div>}
            {filasRegion.map((f) => (
              <div className="gp-region-row" key={f.region}>
                <span className="gp-region-flag" title={REGION_TXT[f.region]}>
                  <i className={`fas ${BANDERA[f.region]}`} aria-hidden="true" />
                  <span className="gp-region-cod">{REGION_TXT[f.region]}</span>
                </span>
                <div>
                  <div className="gp-region-news">{f.texto}</div>
                  <div className="gp-region-place">{f.lugar}</div>
                </div>
                <span className={f.impacto === 'alto' ? 'gp-pill-high' : f.impacto === 'medio' ? 'gp-pill-med' : 'gp-pill-low'}>
                  {f.impacto === 'alto' ? 'Alto' : f.impacto === 'medio' ? 'Medio' : 'Bajo'}
                </span>
              </div>
            ))}
          </div>

          <div className="gp-right-col">
            <div className="gp-alert-card gauge">
              <div className="gp-risk-gauge">
                <div className="gp-rg-chart">
                  <svg viewBox="0 0 100 100" width="70" height="70" style={{ transform: 'rotate(-90deg)' }}>
                    {/* El aro de fondo iba en #e2e8f0, un gris de tema claro que
                        sobre la superficie oscura se veía como un anillo blanco
                        rodeando la cifra. */}
                    <circle fill="none" stroke="rgba(255,255,255,.10)" strokeWidth="10" cx="50" cy="50" r="40" />
                    <circle
                      fill="none"
                      stroke={riesgo?.color || '#ef4444'}
                      strokeWidth="10"
                      strokeLinecap="round"
                      cx="50" cy="50" r="40"
                      strokeDasharray="251.2"
                      strokeDashoffset={riesgo ? 251.2 - 251.2 * (riesgo.puntos / 100) : 251.2}
                      style={{ transition: 'stroke-dashoffset 1s ease-out, stroke .5s' }}
                    />
                  </svg>
                  <div className="gp-rg-num">{riesgo?.puntos ?? '--'}</div>
                </div>
                <div className="gp-rg-label-box">
                  <div className="gp-rg-title">{riesgo?.etiqueta || 'Calculando...'}</div>
                  <div className="gp-rg-sub">Índice de Tensión Global VALL-AI</div>
                </div>
              </div>
              <div className="gp-rg-desc">
                {riesgo?.desc || 'Evaluando conflictos activos y sentimiento del mercado...'}
              </div>
            </div>

            <Alerta
              nivel="danger" icono="fa-triangle-exclamation" etiqueta="Alerta de Riesgo"
              titulo={datos?.noticias[0]?.categoria || 'Impacto Geopolítico'}
              cuerpo={datos ? resumen(datos.noticias[0]) : 'Cargando análisis geopolítico en tiempo real'}
            />
            <Alerta
              nivel="warning" icono="fa-globe" etiqueta="Análisis Regional"
              titulo={datos?.noticias[2]?.categoria || 'Análisis Regional'}
              cuerpo={analisisIA || (datos ? resumen(datos.noticias[2]) : 'Cargando análisis regional en tiempo real')}
            />
            <Alerta
              nivel="success" icono="fa-circle-check" etiqueta="Oportunidad"
              titulo={datos?.noticias[3]?.categoria || 'Contexto de Mercado'}
              cuerpo={datos ? resumen(datos.noticias[3]) : 'Cargando contexto de mercado en tiempo real'}
            />
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
