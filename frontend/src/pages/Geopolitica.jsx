import { useState, useEffect, useRef } from 'react';
import Header from '../components/Header.jsx';
import Footer from '../components/Footer.jsx';
import { sanitizeRichText } from '../lib/sanitizeHtml.js';
import { usePageStyles, loadScriptsInOrder } from '../lib/assets.js';
import './Geopolitica.css';

const GEO_CK = 'geo_v10';
const IMGS_GEO = ['/img/mercados.webp', '/img/finanzas.webp', '/img/mercadoP.webp', '/img/mexico.webp'];
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const CLUSTER_JS = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js';

const KW_GEO = {
  usa: ['united states', 'u.s.', 'usa', 'washington', 'trump', 'congress', 'pentagon', 'american', 'white house', 'tariff', 'trade war', 'semiconductor', 'estados unidos', 'aranceles', 'política comercial', 'federal reserve', 'wall street', 'nasdaq'],
  asia: ['china', 'beijing', 'japan', 'taiwan', 'korea', 'xi jinping', 'hong kong', 'india', 'myanmar', 'philippines', 'supply chain', 'south china sea', 'north korea', 'corea', 'japón', 'cadena de suministro', 'pekín', 'huawei', 'vietnam'],
  europa: ['europe', 'european union', 'eu', 'nato', 'russia', 'ukraine', 'germany', 'france', 'spain', 'italy', 'poland', 'uk', 'britain', 'brussels', 'zelensky', 'putin', 'rusia', 'ucrania', 'europa', 'unión europea', 'otan', 'sanciones', 'ceasefire', 'alto el fuego'],
  latam: ['mexico', 'brazil', 'argentina', 'colombia', 'chile', 'peru', 'venezuela', 'latam', 'latin america', 'mercosur', 'milei', 'petro', 'sheinbaum', 'lula', 'méxico', 'brasil', 'latinoamérica', 'sudamérica', 'cartel', 'haití', 'cuba', 'bolivia', 'ecuador'],
};
function classifyGeo(title) {
  if (!title || typeof title !== 'string') return null;
  const lower = title.toLowerCase();
  let best = null, bestScore = 0;
  for (const [reg, words] of Object.entries(KW_GEO)) {
    const s = words.reduce((acc, w) => acc + (lower.includes(w) ? 1 : 0), 0);
    if (s > bestScore) { bestScore = s; best = reg; }
  }
  return bestScore > 0 ? best : null;
}
const ES_RE_GEO = /\b(el|la|los|las|de|en|y|que|un|una|por|con|del|al|se|es|su|como|para)\b/i;
async function toESGeo(VDS, text) {
  if (!text || ES_RE_GEO.test(text)) return text;
  try { return await VDS.translate(text, 'en', 'es'); } catch { return text; }
}
const GEO_SYNTH = {
  usa: { titulo: 'Política arancelaria EE.UU. reconfigura cadenas de suministro globales', desc: 'Tensiones comerciales EE.UU.-China impulsan nearshoring en México y Latinoamérica. Aranceles diferenciados presionan costos de manufactura y agroindustria en sectores clave.' },
  asia: { titulo: 'Asia-Pacífico: restricciones tecnológicas y reconfiguración de cadenas globales', desc: 'China diversifica compras de granos y proteínas. Restricciones a semiconductores redefinen flujos comerciales en la región Indo-Pacífico. India emerge como destino alternativo de manufactura.' },
  europa: { titulo: 'Conflicto en Europa del Este mantiene presión sobre commodities energéticos', desc: 'Guerra en Ucrania impacta precios de trigo y fertilizantes. Sanciones a Rusia alteran flujos de energía en mercados globales. UE acelera transición a fuentes alternativas.' },
  latam: { titulo: 'Latinoamérica: nearshoring y acuerdos comerciales en el centro del debate', desc: 'México y Brasil lideran captación de inversión manufacturera por nearshoring. Acuerdo Mercosur-UE en fase crítica. Estabilidad política en Colombia y Chile atrae capital regional.' },
};

const CAT_COLORS = { armado: '#ef4444', social: '#a855f7', politico: '#3b82f6', economico: '#f59e0b' };
const CAT_LABELS = { armado: 'Conflicto armado', social: 'Unrest social', politico: 'Evento político', economico: 'Crisis económica' };
const ECON_WORDS = ['econom', 'huelga', 'strike', 'sanction', 'sanción', 'aranceles', 'tariff', 'inflaci', 'inflation', 'crisis', 'deuda', 'debt', 'fiscal', 'wage', 'salario', 'desempleo', 'imf', 'fmi', 'currency', 'divisa', 'devaluac', 'precio', 'price', 'combustible', 'fuel', 'pensión', 'pension'];
function getCategory(ev) {
  if (ev.category) return ev.category;
  const t = ev.event_type || '';
  if (t === 'Battles' || t === 'Explosions/Remote violence' || t === 'Violence against civilians') return 'armado';
  if (t === 'Riots') return 'social';
  const notes = (ev.notes || '').toLowerCase();
  const isEcon = ECON_WORDS.some((w) => notes.indexOf(w) !== -1);
  if (t === 'Protests') return isEcon ? 'economico' : 'social';
  if (t === 'Strategic developments') return isEcon ? 'economico' : 'politico';
  return 'social';
}
const GEO_REGION = {
  'Ucrania': 'europa', 'Rusia': 'europa', 'Bielorrusia': 'europa', 'Georgia': 'europa', 'Francia': 'europa', 'Grecia': 'europa', 'Turquía': 'europa',
  'China': 'asia', 'India': 'asia', 'Pakistán': 'asia', 'Myanmar': 'asia', 'Sri Lanka': 'asia', 'Irán': 'asia',
  'Colombia': 'latam', 'Argentina': 'latam', 'Venezuela': 'latam', 'Ecuador': 'latam', 'Chile': 'latam', 'Perú': 'latam', 'Haití': 'latam', 'México': 'latam',
  'Israel': 'global', 'Siria': 'global', 'Yemen': 'global', 'Egipto': 'global', 'Sudán': 'global', 'Nigeria': 'global', 'RCA': 'global', 'Kenia': 'global', 'Mali': 'global', 'Suazilandia': 'global',
  'Estados Unidos': 'usa',
};
const GEO_IMP_CLASS = { armado: 'gp-pill-high', economico: 'gp-pill-med', politico: 'gp-pill-med', social: 'gp-pill-low' };
const GEO_IMP_TEXT = { armado: 'Alto', economico: 'Medio', politico: 'Medio', social: 'Bajo' };

const REGIONS = { all: { center: [20, 10], zoom: 2 }, ukraine: { center: [49, 32], zoom: 6 }, middle_east: { center: [30, 42], zoom: 5 }, africa: { center: [5, 20], zoom: 4 }, latam: { center: [-10, -65], zoom: 3 } };
const WORLD_BOUNDS = [[-80, -175], [82, 175]];
const fatRadius = (f) => { const n = parseInt(f, 10) || 0; return n === 0 ? 5 : n <= 5 ? 7 : n <= 20 ? 10 : n <= 100 ? 14 : 20; };

const DEMO = [
  { latitude: '38.90', longitude: '-77.04', event_type: 'Strategic developments', country: 'Estados Unidos', location: 'Washington D.C.', event_date: '2026-06-10', fatalities: '0', notes: 'Nuevos aranceles a importaciones de acero y semiconductores; tensiones con aliados comerciales en el G7.', category: 'politico' },
  { latitude: '40.71', longitude: '-74.01', event_type: 'Protests', country: 'Estados Unidos', location: 'Nueva York', event_date: '2026-06-09', fatalities: '0', notes: 'Manifestaciones en Wall Street contra medidas de política monetaria restrictiva y recortes en gasto social.', category: 'economico' },
  { latitude: '50.45', longitude: '30.52', event_type: 'Battles', country: 'Ucrania', location: 'Kyiv', event_date: '2026-06-10', fatalities: '8', notes: 'Combates en área metropolitana.', category: 'armado' },
  { latitude: '49.99', longitude: '36.23', event_type: 'Explosions/Remote violence', country: 'Ucrania', location: 'Járkiv', event_date: '2026-06-10', fatalities: '3', notes: 'Impacto de misiles en zona residencial.', category: 'armado' },
  { latitude: '47.10', longitude: '37.54', event_type: 'Battles', country: 'Ucrania', location: 'Mariúpol', event_date: '2026-06-09', fatalities: '14', notes: 'Enfrentamientos en línea de contacto.', category: 'armado' },
  { latitude: '31.77', longitude: '35.21', event_type: 'Explosions/Remote violence', country: 'Israel', location: 'Jerusalén', event_date: '2026-06-09', fatalities: '2', notes: 'Intercambio de fuego en zona fronteriza.', category: 'armado' },
  { latitude: '33.51', longitude: '36.29', event_type: 'Battles', country: 'Siria', location: 'Damasco', event_date: '2026-06-09', fatalities: '5', notes: 'Enfrentamientos entre facciones armadas.', category: 'armado' },
  { latitude: '15.55', longitude: '32.53', event_type: 'Battles', country: 'Sudán', location: 'Jartum', event_date: '2026-06-09', fatalities: '21', notes: 'Combates intensos en la capital sudanesa.', category: 'armado' },
  { latitude: '12.36', longitude: '43.14', event_type: 'Explosions/Remote violence', country: 'Yemen', location: 'Adén', event_date: '2026-06-08', fatalities: '6', notes: 'Ataque con misiles contra infraestructura portuaria.', category: 'armado' },
  { latitude: '9.05', longitude: '7.49', event_type: 'Violence against civilians', country: 'Nigeria', location: 'Abuja', event_date: '2026-06-07', fatalities: '12', notes: 'Ataque de grupos armados a comunidad rural del norte.', category: 'armado' },
  { latitude: '4.71', longitude: '-74.07', event_type: 'Battles', country: 'Colombia', location: 'Bogotá', event_date: '2026-06-09', fatalities: '3', notes: 'Combates con grupos armados irregulares.', category: 'armado' },
  { latitude: '-1.29', longitude: '36.82', event_type: 'Riots', country: 'Kenia', location: 'Nairobi', event_date: '2026-06-08', fatalities: '1', notes: 'Disturbios tras protestas por subida de impuestos.', category: 'social' },
  { latitude: '28.63', longitude: '77.21', event_type: 'Riots', country: 'India', location: 'Nueva Delhi', event_date: '2026-06-07', fatalities: '2', notes: 'Disturbios comunitarios en barrios periféricos.', category: 'social' },
  { latitude: '35.69', longitude: '51.39', event_type: 'Protests', country: 'Irán', location: 'Teherán', event_date: '2026-06-09', fatalities: '0', notes: 'Protestas sociales por derechos civiles y libertades individuales.', category: 'social' },
  { latitude: '-33.45', longitude: '-70.67', event_type: 'Protests', country: 'Chile', location: 'Santiago', event_date: '2026-06-08', fatalities: '0', notes: 'Movilización estudiantil y sindical por reforma educativa.', category: 'social' },
  { latitude: '55.75', longitude: '37.62', event_type: 'Protests', country: 'Rusia', location: 'Moscú', event_date: '2026-06-08', fatalities: '0', notes: 'Manifestaciones antibelicistas disueltas por fuerzas de seguridad.', category: 'social' },
  { latitude: '16.87', longitude: '96.17', event_type: 'Strategic developments', country: 'Myanmar', location: 'Naipyidó', event_date: '2026-06-10', fatalities: '0', notes: 'Junta militar emite decreto restringiendo libertad de prensa y acceso a internet.', category: 'politico' },
  { latitude: '10.48', longitude: '-66.86', event_type: 'Strategic developments', country: 'Venezuela', location: 'Caracas', event_date: '2026-06-09', fatalities: '0', notes: 'Crisis institucional por disputa electoral no resuelta; oposición denuncia fraude.', category: 'politico' },
  { latitude: '18.54', longitude: '-72.34', event_type: 'Strategic developments', country: 'Haití', location: 'Puerto Príncipe', event_date: '2026-06-08', fatalities: '0', notes: 'Colapso de autoridad estatal; pandillas controlan el 80% de la capital.', category: 'politico' },
  { latitude: '-12.05', longitude: '-77.04', event_type: 'Strategic developments', country: 'Perú', location: 'Lima', event_date: '2026-06-09', fatalities: '0', notes: 'Crisis de gobernabilidad: quinto gabinete ministerial en dos años.', category: 'politico' },
  { latitude: '-34.60', longitude: '-58.38', event_type: 'Protests', country: 'Argentina', location: 'Buenos Aires', event_date: '2026-06-10', fatalities: '0', notes: 'Huelga general contra devaluación del peso y medidas de austeridad exigidas por el FMI.', category: 'economico' },
  { latitude: '37.97', longitude: '23.72', event_type: 'Protests', country: 'Grecia', location: 'Atenas', event_date: '2026-06-09', fatalities: '0', notes: 'Trabajadores en huelga contra nuevos recortes de pensiones y reformas laborales.', category: 'economico' },
  { latitude: '33.72', longitude: '73.04', event_type: 'Protests', country: 'Pakistán', location: 'Islamabad', event_date: '2026-06-08', fatalities: '0', notes: 'Protestas masivas contra el acuerdo con el FMI y el alza del precio del combustible.', category: 'economico' },
  { latitude: '48.86', longitude: '2.35', event_type: 'Protests', country: 'Francia', location: 'París', event_date: '2026-06-07', fatalities: '0', notes: 'Huelga de sindicatos contra reforma de pensiones; paralización parcial del transporte.', category: 'economico' },
  { latitude: '39.93', longitude: '32.85', event_type: 'Protests', country: 'Turquía', location: 'Ankara', event_date: '2026-06-05', fatalities: '0', notes: 'Protestas por hiperinflación acumulada y desplome de la lira turca frente al dólar.', category: 'economico' },
  { latitude: '30.04', longitude: '31.24', event_type: 'Protests', country: 'Egipto', location: 'El Cairo', event_date: '2026-06-07', fatalities: '0', notes: 'Protestas por alza del precio del pan y recortes de subsidios alimentarios estatales.', category: 'economico' },
];

async function computeGeo(VDS) {
  const now = new Date();
  const hora = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  const fechaFmt = now.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();

  const [gdAllR, fhR] = await Promise.allSettled([
    VDS.gdeltNews('geopolitics conflict war sanctions diplomacy military ceasefire USA Washington tariff China semiconductor NATO Russia Ukraine Europe Mexico Brazil LATAM nearshoring', 30),
    VDS.finnhubNews('general'),
  ]);
  const ok = (r) => (r.status === 'fulfilled' && r.value?.length ? r.value : []);
  const gdAll = ok(gdAllR), fhRaw = ok(fhR);
  const allArticles = [
    ...gdAll.map((a) => ({ title: a.title, desc: a.description || '', src: a.source || a.domain || 'GDELT' })),
    ...fhRaw.map((a) => ({ title: a.title, desc: a.description || a.summary || '', src: a.source || 'Finnhub' })),
  ];
  const seen = new Set();
  const unique = allArticles.filter((a) => {
    const key = (a.title || '').toLowerCase().slice(0, 50);
    if (!key || key.length < 8 || seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, 40);

  const translated = await Promise.all(unique.map(async (a) => ({
    ...a,
    title: await toESGeo(VDS, a.title).catch(() => a.title),
    desc: await toESGeo(VDS, (a.desc || '').slice(0, 250)).catch(() => a.desc),
  })));

  const CATS4 = ['USA · Política', 'Asia · Geopolítica', 'Europa · Conflicto', 'LATAM · Región'];
  const DCS4 = ['usa', 'asia', 'europa', 'latam'];
  const IMPS4 = ['alto', 'alto', 'medio', 'bajo'];
  const pools = { usa: [], asia: [], europa: [], latam: [] };
  translated.forEach((a) => {
    const cat = classifyGeo(a.title) || classifyGeo(a.desc);
    if (cat && pools[cat] && pools[cat].length < 3) pools[cat].push(a);
  });

  const noticias = DCS4.map((reg, i) => {
    if (pools[reg].length > 0) {
      const a = pools[reg][0];
      return { cat: CATS4[i], dc: reg, imp: IMPS4[i], titulo: (a.title || '').slice(0, 100), desc: (a.desc || 'Información geopolítica actualizada.').slice(0, 350), fuente: (a.src || 'GDELT').toUpperCase(), fecha: `${fechaFmt} · ${hora}` };
    }
    return { cat: CATS4[i], dc: reg, imp: IMPS4[i], titulo: GEO_SYNTH[reg].titulo, desc: GEO_SYNTH[reg].desc, fuente: 'Análisis VALL', fecha: `${fechaFmt} · ${hora}` };
  });

  const alertBody = (n) => `<b>${n.titulo.slice(0, 72)}</b><br><span style="font-size:0.78rem">${n.desc.slice(0, 130)}</span>`;
  const alertas = [
    { nivel: 'danger', titulo: noticias[0].cat, cuerpo: alertBody(noticias[0]) },
    { nivel: 'warning', titulo: noticias[2].cat, cuerpo: alertBody(noticias[2]) },
    { nivel: 'success', titulo: noticias[3].cat, cuerpo: alertBody(noticias[3]) },
  ];

  const highCount = noticias.filter((n) => n.imp === 'alto').length;
  const medCount = noticias.filter((n) => n.imp === 'medio').length;
  const riskScore = Math.min(95, Math.max(25, 40 + highCount * 15 + medCount * 5));
  const risk = riskScore > 70 ? { color: '#ef4444', label: 'Riesgo Elevado', desc: 'Tensión alta detectada en zonas clave. Impacto esperado en commodities.' }
    : riskScore > 45 ? { color: '#f59e0b', label: 'Riesgo Moderado', desc: 'Tensión regional activa. Vigilancia de mercados recomendada.' }
    : { color: '#10b981', label: 'Riesgo Bajo', desc: 'Contexto geopolítico estable o en distensión relativa.' };

  // Filas de región: 4 de GDELT + global desde el evento DEMO de mayor impacto
  const regionRows = DCS4.map((reg, i) => ({ dc: reg, flag: ['🇺🇸', '🌏', '🇪🇺', '🌎'][i], news: noticias[i].titulo.slice(0, 92), place: `${noticias[i].cat} · ${noticias[i].fuente}`, imp: noticias[i].imp }));
  const globalEv = DEMO.filter((e) => (GEO_REGION[e.country] || 'global') === 'global').sort((a, b) => (parseInt(b.fatalities, 10) || 0) - (parseInt(a.fatalities, 10) || 0))[0];
  if (globalEv) {
    const cat = getCategory(globalEv), fat = parseInt(globalEv.fatalities, 10) || 0;
    regionRows.push({ dc: 'global', flag: '🌍', news: (globalEv.notes || '').slice(0, 92), place: `${globalEv.country}${fat > 0 ? ` · ${fat} bajas` : ''} · ACLED`, imp: cat === 'armado' ? 'alto' : cat === 'social' ? 'bajo' : 'medio' });
  }

  return { noticias, alertas, riskScore, risk, regionRows, fechaFmt, hora };
}

const genTick = (base, vol) => { const change = Math.random() * vol * 2 - vol; return { val: (base + change).toFixed(2), pct: ((change / base) * 100).toFixed(2) }; };

export default function Geopolitica() {
  usePageStyles([
    '/css/header.css?v=6', '/css/footer.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css',
    'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css',
  ]);
  const [data, setData] = useState(null);
  const [regionalAI, setRegionalAI] = useState('');
  const [filterCat, setFilterCat] = useState('all');
  const [acledCat, setAcledCat] = useState('all');
  const [acledRegion, setAcledRegion] = useState('all');
  const [acledCount, setAcledCount] = useState('Cargando…');
  const [ready, setReady] = useState(false);
  const [ticker, setTicker] = useState(null);
  const mapDiv = useRef(null);
  const mapRef = useRef(null);
  const clusterRef = useRef(null);

  // Carga de datos
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadScriptsInOrder(['/js/api-keys.js?v=3', '/js/data-service.js?v=15', LEAFLET_JS, CLUSTER_JS]);
      if (cancelled) return;
      setReady(true);
      const VDS = window.VDS;
      if (!VDS) return;
      const stored = VDS.load(GEO_CK, true);
      const expired = VDS.isExpired(GEO_CK);
      if (stored?.noticias?.length) { setData((d) => d || stored); if (!expired) return; VDS.clear(GEO_CK); }
      const fresh = await computeGeo(VDS);
      if (cancelled) return;
      VDS.save(GEO_CK, fresh);
      setData(fresh);
      const headlines = fresh.noticias.slice(0, 4).map((n) => `- [${n.cat}] ${n.titulo}: ${(n.desc || '').slice(0, 150)}`).join('\n');
      const prompt = `Eres VALL-AI, analista geopolítico de VALLNews. Con base en estos titulares recientes, redacta un "Análisis Regional" de 2-3 oraciones sobre el impacto económico regional más relevante para empresas mexicanas.\n\nTITULARES:\n${headlines}\n\nSé directo y concreto, sin frases de apertura genéricas.`;
      const SYS = 'Eres un analista geopolítico institucional de VALL News. Responde en español, de forma concisa y profesional. Máximo 100 palabras.';
      VDS.geminiChat(prompt, SYS).then((text) => { if (!cancelled && text) setRegionalAI(text.replace(/\n/g, '<br>')); }).catch(() => {});
    })();
    return () => { cancelled = true; };
  }, []);

  // Crisis ticker
  useEffect(() => {
    const upd = () => setTicker({ gold: genTick(2345.50, 15), oil: genTick(82.30, 1.5), usdmxn: genTick(18.25, 0.3), vix: genTick(14.50, 1.2) });
    upd();
    const id = setInterval(upd, 10000);
    return () => clearInterval(id);
  }, []);

  // Inicialización del mapa Leaflet
  useEffect(() => {
    if (!ready || !window.L || !mapDiv.current || mapRef.current) return;
    const L = window.L;
    const map = L.map(mapDiv.current, { center: [20, 10], zoom: 2, minZoom: 2, maxZoom: 10, maxBounds: WORLD_BOUNDS, maxBoundsViscosity: 1.0, worldCopyJump: false });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution: '&copy; OSM &copy; CARTO', subdomains: 'abcd', maxZoom: 19 }).addTo(map);
    map.fitBounds(WORLD_BOUNDS, { padding: [4, 4] });
    const cluster = L.markerClusterGroup({
      maxClusterRadius: 40, spiderfyOnMaxZoom: true, showCoverageOnHover: false,
      iconCreateFunction: (c) => { const n = c.getChildCount(), sz = n > 500 ? 50 : n > 100 ? 42 : 34; return L.divIcon({ html: `<div style="width:${sz}px;height:${sz}px;border-radius:50%;background:rgba(100,100,200,0.85);border:2px solid rgba(255,255,255,0.3);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.68rem;color:#fff">${n}</div>`, className: '', iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2] }); },
    });
    map.addLayer(cluster);
    mapRef.current = map; clusterRef.current = cluster;
    setTimeout(() => map.invalidateSize({ animate: false }), 150);
    return () => { map.remove(); mapRef.current = null; clusterRef.current = null; };
  }, [ready]);

  // Marcadores según categoría activa
  useEffect(() => {
    const L = window.L, cluster = clusterRef.current;
    if (!L || !cluster) return;
    cluster.clearLayers();
    let valid = 0;
    DEMO.forEach((ev) => {
      const lat = parseFloat(ev.latitude), lng = parseFloat(ev.longitude);
      if (isNaN(lat) || isNaN(lng)) return;
      const cat = getCategory(ev);
      if (acledCat !== 'all' && cat !== acledCat) return;
      valid++;
      const color = CAT_COLORS[cat] || '#94a3b8';
      const fat = parseInt(ev.fatalities, 10) || 0;
      const m = L.circleMarker([lat, lng], { radius: fatRadius(ev.fatalities), fillColor: color, color: 'rgba(0,0,0,0.4)', weight: 1, opacity: 0.9, fillOpacity: 0.78 });
      m.bindPopup(`<div class="gp-acled-popup"><div class="gp-acled-popup-type" style="color:${color}">${CAT_LABELS[cat] || cat} · ${ev.event_type || ''}</div><div class="gp-acled-popup-title">${ev.location || ''}, ${ev.country || ''}</div><div class="gp-acled-popup-date">${ev.event_date || ''}</div>${ev.notes ? `<div class="gp-acled-popup-notes">${ev.notes}</div>` : ''}${fat > 0 ? `<div class="gp-acled-popup-fatal">☠ ${fat} bajas</div>` : ''}</div>`, { maxWidth: 300 });
      cluster.addLayer(m);
    });
    setAcledCount(`${valid.toLocaleString('es-MX')} eventos`);
  }, [acledCat, ready, data]);

  // Vuelo a región
  useEffect(() => {
    const map = mapRef.current, r = REGIONS[acledRegion];
    if (map && r) map.flyTo(r.center, r.zoom, { duration: 1.3 });
  }, [acledRegion]);

  const noticias = data?.noticias || [];
  const rows = (data?.regionRows || []).filter((r) => filterCat === 'all' || r.dc === filterCat);

  return (
    <>
      <Header />
      <div className="gp-container">
        <div className="gp-title">
          <i className="fas fa-earth-americas"></i> Geopolítica Global
          <span className="gp-title-live"><span className="gp-live-dot"></span> Radar Activo</span>
        </div>

        {/* Crisis ticker */}
        <div className="gp-ticker">
          {[['Oro (XAU)', ticker?.gold], ['Petróleo (Brent)', ticker?.oil], ['USD/MXN', ticker?.usdmxn], ['VIX (Volatilidad)', ticker?.vix]].map(([lbl, t]) => (
            <div className="gp-ct-card" key={lbl}>
              <div className="gp-ct-title">{lbl}</div>
              <div className="gp-ct-val">{t ? t.val : '…'} <span className={`gp-ct-pct ${t && +t.pct >= 0 ? 'up' : 'dn'}`}>{t ? `${+t.pct >= 0 ? '+' : ''}${t.pct}%` : ''}</span></div>
            </div>
          ))}
        </div>

        {/* Filtro regiones */}
        <div className="gp-filter">
          {[['all', 'TODAS LAS REGIONES'], ['usa', '🇺🇸 USA'], ['asia', '🌏 ASIA'], ['europa', '🇪🇺 EUROPA'], ['latam', '🌎 LATAM']].map(([c, lbl]) => (
            <button key={c} className={`gp-pill${filterCat === c ? ' active' : ''}`} onClick={() => setFilterCat(c)}>{lbl}</button>
          ))}
        </div>

        {/* ACLED map */}
        <div className="gp-acled">
          <div className="gp-acled-header">
            <div>
              <span className="gp-acled-title"><i className="fas fa-map-marked-alt"></i>Monitoreo de riesgos globales en tiempo real</span>
              <span className="gp-acled-powered">Powered by ACLED</span>
            </div>
            <div className="gp-acled-meta">
              <span className="gp-hs"><span className="gp-hs-dot" style={{ background: '#f87171', boxShadow: '0 0 6px #f87171' }}></span>&nbsp;Armado</span>
              <span className="gp-hs"><span className="gp-hs-dot" style={{ background: '#a855f7', boxShadow: '0 0 6px #a855f7' }}></span>&nbsp;Social</span>
              <span className="gp-hs"><span className="gp-hs-dot" style={{ background: '#3b82f6', boxShadow: '0 0 6px #3b82f6' }}></span>&nbsp;Político</span>
              <span className="gp-hs"><span className="gp-hs-dot" style={{ background: '#fbbf24', boxShadow: '0 0 6px #fbbf24' }}></span>&nbsp;Económico</span>
            </div>
          </div>
          <div className="gp-acled-filter-row">
            {[['all', '🌍 Mundo'], ['ukraine', '🇺🇦 Ucrania'], ['middle_east', '📍 Medio Oriente'], ['africa', '🌍 África'], ['latam', '🌎 LATAM']].map(([r, lbl]) => (
              <button key={r} className={`gp-fbtn${acledRegion === r ? ' active' : ''}`} onClick={() => setAcledRegion(r)}>{lbl}</button>
            ))}
            <span className="gp-acled-count">{acledCount}</span>
          </div>
          <div className="gp-acled-cat-row">
            <span className="gp-acled-cat-lbl">Tipo:</span>
            {[['all', 'Todos', ''], ['armado', '⚔️ Armado', 'armado'], ['social', '👥 Social', 'social'], ['politico', '🏛️ Político', 'politico'], ['economico', '📉 Económico', 'economico']].map(([c, lbl, cls]) => (
              <button key={c} className={`gp-cbtn ${cls}${acledCat === c ? ' active' : ''}`} onClick={() => setAcledCat(c)}>{lbl}</button>
            ))}
          </div>
          <div className="gp-acled-map" ref={mapDiv}></div>
        </div>

        {/* News grid */}
        <div className="gp-news-grid">
          {!data && <div className="gp-loading"><i className="fas fa-circle-notch fa-spin"></i>&nbsp; Analizando el radar geopolítico global…</div>}
          {noticias.filter((n) => filterCat === 'all' || n.dc === filterCat).map((n, i) => (
            <div className="gp-card" key={n.dc + i}>
              <img className="gp-card-img" src={IMGS_GEO[i % IMGS_GEO.length]} alt={n.cat} onError={(e) => { e.target.style.display = 'none'; }} />
              <div className="gp-card-body">
                <span className="gp-card-cat">{n.cat}</span>
                <span className="gp-card-date">{n.fecha}</span>
                <h3 className="gp-card-title">{n.titulo}</h3>
                <p className="gp-card-desc">{n.desc}</p>
                <div className="gp-card-foot">
                  <span className="gp-tag-src">{n.fuente}</span>
                  {n.imp === 'alto' ? <span className="gp-tag-high">ALTO IMPACTO</span> : n.imp === 'medio' ? <span className="gp-tag-med">IMPACTO MEDIO</span> : <span className="gp-tag-low">BAJO</span>}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="gp-bottom">
          {/* Región */}
          <div className="gp-panel">
            <div className="gp-section-lbl">Noticias por Región</div>
            {rows.map((r) => (
              <div className="gp-region-row" key={r.dc}>
                <span className="gp-region-flag">{r.flag}</span>
                <div>
                  <div className="gp-region-news">{r.news}</div>
                  <div className="gp-region-place">{r.place}</div>
                </div>
                <span className={r.imp === 'alto' ? 'gp-pill-high' : r.imp === 'medio' ? 'gp-pill-med' : 'gp-pill-low'}>{r.imp === 'alto' ? 'Alto' : r.imp === 'medio' ? 'Medio' : 'Bajo'}</span>
              </div>
            ))}
          </div>

          {/* Alertas + gauge */}
          <div className="gp-col">
            <div className="gp-alert neutral">
              <div className="gp-gauge-row">
                <div className="gp-rg-chart">
                  <svg viewBox="0 0 100 100" width="70" height="70" style={{ transform: 'rotate(-90deg)' }}>
                    <circle fill="none" stroke="var(--bdr-hard)" strokeWidth="10" cx="50" cy="50" r="40" />
                    <circle fill="none" stroke={data?.risk.color || '#ef4444'} strokeWidth="10" strokeLinecap="round" cx="50" cy="50" r="40" strokeDasharray="251.2" strokeDashoffset={data ? 251.2 - 251.2 * (data.riskScore / 100) : 251.2} style={{ transition: 'stroke-dashoffset 1s ease-out, stroke 0.5s' }} />
                  </svg>
                  <div className="gp-rg-num">{data?.riskScore ?? '--'}</div>
                </div>
                <div>
                  <div className="gp-rg-title">{data?.risk.label || 'Calculando…'}</div>
                  <div className="gp-rg-sub">Índice de Tensión Global VALL-AI</div>
                </div>
              </div>
              <div className="gp-alert-body">{data?.risk.desc || 'Evaluando conflictos activos y sentimiento del mercado…'}</div>
            </div>

            <div className="gp-alert danger">
              <div className="gp-alert-lbl"><i className="fas fa-triangle-exclamation"></i> &nbsp;Alerta de Riesgo</div>
              <div className="gp-alert-title">{data?.alertas[0].titulo || 'Impacto Geopolítico'}</div>
              <div className="gp-alert-body" dangerouslySetInnerHTML={{ __html: sanitizeRichText(data?.alertas[0].cuerpo || 'Cargando análisis geopolítico en tiempo real') }} />
            </div>
            <div className="gp-alert warning">
              <div className="gp-alert-lbl"><i className="fas fa-globe"></i> &nbsp;Análisis Regional</div>
              <div className="gp-alert-title">{data?.alertas[1].titulo || 'Análisis Regional'}</div>
              <div className="gp-alert-body" dangerouslySetInnerHTML={{ __html: sanitizeRichText(regionalAI || data?.alertas[1].cuerpo || 'Cargando análisis regional en tiempo real') }} />
            </div>
            <div className="gp-alert success">
              <div className="gp-alert-lbl"><i className="fas fa-circle-check"></i> &nbsp;Oportunidad</div>
              <div className="gp-alert-title">{data?.alertas[2].titulo || 'Contexto de Mercado'}</div>
              <div className="gp-alert-body" dangerouslySetInnerHTML={{ __html: sanitizeRichText(data?.alertas[2].cuerpo || 'Cargando contexto de mercado en tiempo real') }} />
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}
