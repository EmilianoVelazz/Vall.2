// Logica verbatim de mercados.html (extraida). La usa MercadoS.jsx (React).
// Reutiliza window.VDS + LightweightCharts. Define globals (mktTab, openCmModal, etc.).

const CM_PROFILES = {
  bovino: {
    name: 'Ración Bovino Engorda', ticker: 'Índice Sintético VALL', exchange: 'Estimación', unit: '$/MT',
    gradient: 'linear-gradient(135deg,#7c2d12,#9a3412)',
    context: 'Costo sintético ponderado (65% Maíz, 20% Sorgo, 15% Soja). Este es el principal driver del costo de producción de la carne de res en feedlots.',
    watching: ['Clima en zonas productoras de forraje','Precio del Maíz CME y exportaciones', 'Fluctuación de la Soja'],
    impacts: [{a:'Ganadería Bovina', d:'Afecta márgenes de operación de engorda'},{a:'Precio de la carne', d:'Traslado de costos al consumidor'}],
    color: '#9a3412'
  },
  porcino: {
    name: 'Ración Porcino Engorda', ticker: 'Índice Sintético VALL', exchange: 'Estimación', unit: '$/MT',
    gradient: 'linear-gradient(135deg,#9d174d,#be185d)',
    context: 'Costo sintético ponderado (55% Maíz, 30% Soja, 15% Trigo). Crítico para la rentabilidad en la porcicultura nacional.',
    watching: ['Precio de la Pasta de Soja CME','Brotes de fiebre porcina global','Importaciones de maíz amarillo'],
    impacts: [{a:'Márgenes porcinos', d:'El alimento representa el 70% del costo total vivo'},{a:'Precio del Cerdo', d:'Impacto directo en cortes de cerdo'}],
    color: '#be185d'
  },
  aves: {
    name: 'Ración Avícola', ticker: 'Índice Sintético VALL', exchange: 'Estimación', unit: '$/MT',
    gradient: 'linear-gradient(135deg,#b45309,#d97706)',
    context: 'Costo sintético ponderado (65% Maíz, 32% Soja, 3% Sorgo). El alimento avícola requiere alta proteína y lisina de la soja.',
    watching: ['Gripe aviar en EE.UU y México','Precio de la Soja y Maíz','Importaciones de pollo vs producción local'],
    impacts: [{a:'Huevo blanco/rojo', d:'Impacta directamente el costo del huevo'},{a:'Pollo vivo', d:'Determina la viabilidad operativa de granjas avícolas'}],
    color: '#d97706'
  },
  costo_energia: {
    name: 'Índice de Costo Energético', ticker: 'Índice Sintético VALL', exchange: 'Estimación', unit: '$/Día',
    gradient: 'linear-gradient(135deg,#1e3a8a,#3b82f6)',
    context: 'Índice compuesto por Diesel (70%) y Gas Natural (30%). Mide el impacto en maquinaria, calefacción en granjas y operación de cuartos fríos.',
    watching: ['WTI Crude y destilados','Temperaturas invernales (Gas Nat)','Subsidios gubernamentales (IEPS)'],
    impacts: [{a:'Operación agrícola', d:'Uso intensivo de tractores y transporte'},{a:'Calefacción granjas', d:'Esencial para cría avícola y porcina en invierno'}],
    color: '#3b82f6'
  },
  maiz: {
    name: 'Maíz Amarillo #2', ticker: 'ZC=F', exchange: 'CME · CBOT Chicago', unit: '$/bu',
    gradient: 'linear-gradient(135deg,#b45309,#d97706)',
    context: 'El maíz CME es el precio de referencia mundial para el cereal más producido del planeta. Determina el costo base de la alimentación animal (bovino, porcino, aves) y representa el 65% de la ración típica de engorda. México importa el 35% de su consumo de maíz amarillo principalmente de EE.UU.',
    watching: ['WASDE USDA mensual (oferta/demanda global)','Crop Progress semanal (estado del cultivo EUA)','Export Sales semanales (demanda de China y México)','Clima en Corn Belt (Illinois, Iowa, Indiana)','Tipo de cambio USD/MXN (costo de importación)','Aranceles USMCA entre México y EE.UU.'],
    impacts: [{a:'Ración Bovina', d:'65% del costo — impacto directo en costo de ganado'},{a:'Ración Avícola', d:'65% del costo — principal driver de pollo/huevo'},{a:'Sorgo', d:'Correlación 0.92 — sustituto energético parcial'},{a:'Soja', d:'Correlación complementaria en dieta animal'},{a:'USD/MXN', d:'Multiplica el impacto para productores MX'}],
    color: '#d97706',
  },
  soja: {
    name: 'Soja en Grano', ticker: 'ZS=F', exchange: 'CME · CBOT Chicago', unit: '$/MT',
    gradient: 'linear-gradient(135deg,#166534,#16a34a)',
    context: 'La soja es la principal fuente de proteína vegetal para alimento animal. La pasta de soja (SBM) es el concentrado proteico más usado en dietas pecuarias. Brasil y EE.UU. producen el 80% mundial. El USDA Argentina también es factor relevante para los precios.',
    watching: ['WASDE USDA — proyecciones de producción Brasil/EE.UU.','Clima en zonas productoras de Brasil (Mato Grosso)','Demanda de China (principal comprador mundial)','Relación soja/maíz (ratio de sustitución)','Exportaciones semanales USDA','Producción de pasta de soja (crush margin)'],
    impacts: [{a:'Ración Porcina', d:'30% del costo — proteína principal'},{a:'Ración Avícola', d:'32% del costo — fuente de lisina'},{a:'Aceite vegetal', d:'Subproducto clave del procesamiento'},{a:'Pasta Soja (ZM=F)', d:'Derivado directo — se mueve en paralelo'},{a:'BRL/MXN', d:'Real brasileño impacta exportaciones MX'}],
    color: '#16a34a',
  },
  trigo: {
    name: 'Trigo SRW Chicago', ticker: 'ZW=F', exchange: 'CME · CBOT Chicago', unit: '$/bu',
    gradient: 'linear-gradient(135deg,#92400e,#d97706)',
    context: 'El trigo Chicago SRW (Soft Red Winter) es la referencia de trigo harinero para alimentación humana y animal. El trigo duro (durum) para pasta cotiza separado. México importa trigo para harinas de consumo humano. En nutrición animal, el trigo es sustituto parcial del maíz en dietas porcinas.',
    watching: ['Clima en grandes planicies EUA (Kansas, Oklahoma)','Producción en Mar Negro (Rusia, Ucrania — 35% global)','Exportaciones semanales USDA','Tensión geopolítica Rusia-Ucrania','Demanda de países MENA (Norte de África/Medio Oriente)','Comparativo precio trigo vs maíz para sustitución'],
    impacts: [{a:'Ración Porcina', d:'15% del costo — sustituto energético'},{a:'Harina para consumo humano', d:'Impacto directo en panadería y tortilla'},{a:'Maíz CME', d:'Correlación ~0.70 — mercados de granos en general'},{a:'Riesgo geopolítico', d:'Ucrania provee 10% de exportaciones mundiales'}],
    color: '#d97706',
  },
  sorgo: {
    name: 'Sorgo Amarillo', ticker: 'Est. Maíz ×0.92', exchange: 'Est. CME', unit: '$/bu',
    gradient: 'linear-gradient(135deg,#78350f,#b45309)',
    context: 'El sorgo no tiene un contrato futuro líquido propio. Su precio se calcula como estimación respecto al maíz (0.88–0.95× el maíz, típicamente 0.92). Es el tercer grano más importante en México después del maíz y el trigo. Tiene menor contenido energético pero mejor resistencia a sequía.',
    watching: ['Precio del maíz CME (referencia directa)','Ratio sorgo/maíz en mercado spot mexicano','Producción en Tamaulipas, Sinaloa y Guanajuato','Demanda de industria avícola y porcina MX','Condiciones climáticas en zonas productoras MX','Volumen de importaciones desde EE.UU. vía USMCA'],
    impacts: [{a:'Ración Bovina', d:'20% del costo — componente energético'},{a:'Ración Avícola', d:'3% del costo — complemento menor'},{a:'Maíz CME', d:'Correlación 0.92 — precio derivado directamente'},{a:'Productor regional MX', d:'Competencia directa con maíz importado'}],
    color: '#b45309',
  },
  wti: {
    name: 'Petróleo WTI', ticker: 'CL=F', exchange: 'NYMEX · New York', unit: '$/bbl',
    gradient: 'linear-gradient(135deg,#7f1d1d,#dc2626)',
    context: 'El West Texas Intermediate (WTI) es la referencia del petróleo crudo americano y el driver principal del precio del diesel y gasolinas. Para productores agropecuarios, el WTI determina el costo de combustible (diesel, gas LP), fertilizantes nitrogenados y fletes. México exporta petróleo mixto Maya (descuento ~10% vs WTI).',
    watching: ['OPEP+ · decisiones de producción (cuotas)','Inventarios semanales EIA (cada miércoles 10:30 EST)','Producción de shale oil EE.UU. (Permian Basin)','Tensión geopolítica en Medio Oriente','Demanda de China y Asia emergente','DXY · petróleo denominado en dólares'],
    impacts: [{a:'Diesel ULSD', d:'Derivado directo — flete terrestre MX'},{a:'Gasolina', d:'Derivado directo — costo logístico'},{a:'Fertilizantes N', d:'Gas natural → urea → mayor costo insumos'},{a:'Flete MX', d:'~8.5 MXN/ton·100km por cada $1/gal diesel'},{a:'USD/MXN', d:'Ingresos Pemex soportan al peso mexicano'}],
    color: '#dc2626',
  },
  gas: {
    name: 'Gas Natural Henry Hub', ticker: 'NG=F', exchange: 'NYMEX · New York', unit: '$/MMBtu',
    gradient: 'linear-gradient(135deg,#1e3a5f,#0284c7)',
    context: 'El gas natural Henry Hub es la referencia norteamericana para el insumo energético más barato por BTU. En operaciones agropecuarias, el gas natural es clave para secado de granos, calefacción en granjas porcinas y avícolas, y generación eléctrica. México importa gas natural de EE.UU. vía gasoductos y LNG.',
    watching: ['Inventarios semanales EIA (gas storage)','Clima invernal y veraniego EUA (demanda de AC/calefacción)','Producción en Permian Basin y Appalachia','Exportaciones LNG desde EE.UU. a Europa y Asia','Precio del carbón (sustituto energético)','Capacidad de regasificación en México'],
    impacts: [{a:'Costo energético granja', d:'Gas natural para calefacción/secado'},{a:'Electricidad CFE', d:'Gas = 60% de la generación eléctrica MX'},{a:'Urea y fertilizantes N', d:'Gas → amoniaco → urea → nutrición cultivos'},{a:'WTI', d:'Correlación moderada como energético de referencia'},{a:'Diesel', d:'Sustituto parcial en generación eléctrica rural'}],
    color: '#0284c7',
  },
  diesel: {
    name: 'Diesel ULSD (Estimado)', ticker: 'HO=F est.', exchange: 'NYMEX est.', unit: '$/galón',
    gradient: 'linear-gradient(135deg,#374151,#4b5563)',
    context: 'El diesel ULSD (Ultra Low Sulfur Diesel) se calcula como estimación derivada del WTI. El precio del diesel es el mayor costo variable de la logística terrestre en México y el principal combustible de maquinaria agrícola. Precio estimado: WTI/42 × 1.30 + $0.50/gal (refino y margen).',
    watching: ['WTI Crude — driver principal del costo','Márgenes de refino ULSD (crack spread)','Inventarios de destilados EIA semanales','Precio en estaciones de servicio (PEMEX)','Tipo de cambio USD/MXN para costos en MXN','Clima invernal (mayor demanda de calefacción = diesel)'],
    impacts: [{a:'Flete terrestre MX', d:'8.5 MXN/ton·100km por cada $1/gal'},{a:'Maquinaria agrícola', d:'Cosecha y siembra — consumo directo'},{a:'Ración energética', d:'70% del costo energético operativo diario'},{a:'Logística frigorificada', d:'Cuartos fríos y transporte refrigerado'},{a:'IEPS diesel', d:'Subsidio/impuesto del gobierno MX — efecto amortiguador'}],
    color: '#475569',
  },
  cobre: {
    name: 'Cobre Grado A', ticker: 'HG=F', exchange: 'COMEX / LME London', unit: '$/lb',
    gradient: 'linear-gradient(135deg,#7e4f1e,#b45309)',
    context: 'El cobre es el "doctor Copper" — su precio anticipa el ciclo económico global. Más cobre = más construcción e industria = mayor actividad. Para México, el cobre impacta costos de construcción de instalaciones pecuarias y es un indicador de demanda de China. Grupo México es el mayor productor minero de cobre en el país.',
    watching: ['PIB y PMI manufacturero de China (mayor consumidor)','Inventarios LME y COMEX (stocks registrados)','Producción en Chile y Perú (50% de la oferta mundial)','Transición energética — demanda de EVs y energía solar','Huelgas en minas (Escondida, Las Bambas)','DXY — cobre denominado en dólares'],
    impacts: [{a:'Construcción instalaciones', d:'Electricidad y cableado — costo de inversión'},{a:'Maquinaria y equipos', d:'Componente en motores y transformadores'},{a:'Señal de ciclo económico', d:'Cobre alto = demanda industrial activa = riesgo alcista'},{a:'Grupo Mexico (GMEXICOB)', d:'Acción de bolsa MX con correlación directa'},{a:'DXY / USD', d:'Cobre cae cuando el dólar se fortalece'}],
    color: '#b45309',
  },
  aluminio: {
    name: 'Aluminio Primario', ticker: 'ALI=F', exchange: 'LME London / COMEX', unit: '$/MT',
    gradient: 'linear-gradient(135deg,#0f172a,#334155)',
    context: 'El aluminio primario LME es la referencia mundial para el tercer metal más consumido. En agronegocio, el aluminio es clave para silos, instalaciones de almacenamiento, empaque y equipos de proceso. Su precio está fuertemente influenciado por el costo de energía eléctrica (el aluminio consume 14 MWh por tonelada).',
    watching: ['Costo de electricidad en China (mayor productor)','Producción en China (60% del aluminio mundial)','Inventarios LME y aluminio premios regionales','Demanda de industria automotriz y aeroespacial','Sanciones y aranceles (aluminio ruso)','Transición a aluminio reciclado (menor consumo energético)'],
    impacts: [{a:'Silos y almacenamiento', d:'Chapa y perfilería — inversión en infraestructura'},{a:'Empaque y packaging', d:'Latas, papel aluminio, film de protección'},{a:'Equipos eléctricos', d:'Cables de aluminio — subestaciones y distribución'},{a:'Costo energético', d:'Aluminio es muy intensivo en electricidad'},{a:'Cobre LME', d:'Competencia como conductor eléctrico — correlación positiva'}],
    color: '#475569',
  },
  mxn: {
    name: 'Tipo de Cambio USD/MXN', ticker: 'MXN=X', exchange: 'Forex · Open Exchange Rates', unit: 'pesos/USD',
    gradient: 'linear-gradient(135deg,#1e3a8a,#2563eb)',
    context: 'El tipo de cambio USD/MXN es el multiplicador crítico para todos los costos de insumos importados: maíz, soja, trigo, petróleo, fertilizantes y maquinaria. Un peso débil encarece directamente la ración animal y los fletes de importación. México importa el 35% de su maíz amarillo y prácticamente toda la soja de EE.UU.',
    watching: ['Política monetaria Banxico (tasas TIIE)','Política de la Fed (tasas EUA — diferencial de tasas)','DXY — índice del dólar americano','Remesas (soporte estructural al peso)','Balanza comercial y cuenta corriente México','Riesgo político y calificaciones soberanas MX'],
    impacts: [{a:'Maíz importado', d:'Cada $1 MXN/USD sube ~$39 MXN por tonelada'},{a:'Soja en grano', d:'Precio en MXN sube directamente con el dólar'},{a:'Diesel importado', d:'Costo de combustible agrícola en pesos'},{a:'Fertilizantes', d:'Urea y fosfatos cotizados en USD'},{a:'Deuda en dólares', d:'Empresas con pasivos USD ven mayor carga financiera'}],
    color: '#2563eb',
  },
};
let _mktPrecios   = {};
let _mktMxnRate   = null;
let _mktCharts    = {};
let _mktIntervals = { granos: '1y', energia: '1y', metales: '1y' };
let _mktTickers   = { granos: 'ZC=F', energia: 'CL=F', metales: 'HG=F' };
let _newsAll      = [];
let _newsAutoScrollTimers = {};
const MKT_CK = 'mkt_v22';
     function mktTab(name, btnEl) {
  document.querySelectorAll('.mkt-tab-card').forEach(b => b.classList.remove('active'));
  const activeBtn = btnEl || document.querySelector(`[data-tab="${name}"]`);
  if (activeBtn) activeBtn.classList.add('active');
  ['pane-general','pane-granos','pane-energia','pane-metales','pane-costos'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  const pane = document.getElementById('pane-' + name);
  if (pane) pane.style.display = 'block';
  if (name === 'granos'  && !_mktCharts.granos)  setTimeout(() => loadMktChart(_mktTickers.granos,  'granos'),  100);
  if (name === 'energia' && !_mktCharts.energia)  setTimeout(() => loadMktChart(_mktTickers.energia, 'energia'), 100);
  if (name === 'metales' && !_mktCharts.metales)   setTimeout(() => loadMktChart(_mktTickers.metales, 'metales'),  100);
  try { localStorage.setItem('mkt_active_tab', name); } catch(e){}
  window.scrollTo({ top: 0, behavior: 'smooth' });
}function setMktInt(interval, pane) {
  _mktIntervals[pane] = interval;
  document.querySelectorAll(`#pane-${pane} .chart-int-btn`).forEach(b => {
    const onclick = b.getAttribute('onclick') || '';
    b.classList.toggle('active', onclick.includes(`'${interval}'`));
  });
  loadMktChart(_mktTickers[pane], pane);
}

async function loadMktChart(ticker, pane) {
  _mktTickers[pane] = ticker;
  const containerId = `mkt-chart-${pane}`;
  const container   = document.getElementById(containerId);
  if (!container) return;

  if (_mktCharts[pane]) { try { _mktCharts[pane].remove(); } catch(e){} _mktCharts[pane] = null; }

  container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94a3b8;font-size:.72rem;gap:.5rem"><i class="fas fa-spinner fa-spin"></i> Cargando gráfico…</div>';

  const range = _mktIntervals[pane] || '1y'; 
  
  const intMap = {
    '1mo': '1h',
    '3mo': '1d',
    '6mo': '1d',
    '1y':  '1d',
    '3y':  '1wk',
    '5y':  '1wk',
    'max': '1mo'
  };
  const apiInt = intMap[range] || '1d';

  try {
    const r = await fetch(`/api/stock-history?ticker=${encodeURIComponent(ticker)}&interval=${apiInt}&range=${range}`);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();

    container.innerHTML = '';
    const chart = LightweightCharts.createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight || 280,
      layout: { background: { color: '#fff' }, textColor: '#334155' },
      grid: { vertLines: { color: 'rgba(0,33,58,.05)' }, horzLines: { color: 'rgba(0,33,58,.05)' } },
      crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
      timeScale: { borderColor: 'rgba(0,33,58,.08)', timeVisible: true, secondsVisible: false },
      rightPriceScale: { borderColor: 'rgba(0,33,58,.08)' },
    });
    _mktCharts[pane] = chart;

    const quotes = (d.candles || []).filter(q => q.open != null && q.close != null);
    if (quotes.length > 0) {
      const candleSeries = chart.addCandlestickSeries({
        upColor: '#16a34a', downColor: '#dc2626',
        borderUpColor: '#16a34a', borderDownColor: '#dc2626',
        wickUpColor: '#16a34a', wickDownColor: '#dc2626',
      });
      candleSeries.setData(quotes.map(q => ({
        time: q.time,
        open: q.open, high: q.high, low: q.low, close: q.close,
      })));
      chart.timeScale().fitContent();
    } else {
      container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94a3b8;font-size:.72rem;">Sin datos para este período</div>';
    }

    const ro = new ResizeObserver(() => {
      if (!_mktCharts[pane]) return;
      try { chart.applyOptions({ width: container.clientWidth }); } catch(e){}
    });
    ro.observe(container);
  } catch(e) {
    container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#dc2626;font-size:.72rem;gap:.4rem"><i class="fas fa-exclamation-circle"></i> Error: ${e.message}</div>`;
  }
}
function updateMktTicker(p, mxn) {        
  function setTk(idVal, idPct, price, pct, prefix='$', suffix='') {
    const v = document.getElementById(idVal);
    const c = document.getElementById(idPct);
    if (v && price != null) v.textContent = prefix + parseFloat(price).toFixed(2) + suffix;
    if (c && pct  != null) {
      c.textContent = (pct >= 0 ? '+' : '') + parseFloat(pct).toFixed(2) + '%';
      c.className = 'tk-pct ' + (pct >= 0 ? 'up' : 'down');
    }
  }
  setTk('tk-maiz',    'tk-maiz-p',    p.maiz,    p.maiz_pct,    '$', '/bu');
  setTk('tk-soja',    'tk-soja-p',    p.soja,    p.soja_pct,    '$', '/MT');
  setTk('tk-trigo',   'tk-trigo-p',   p.trigo,   p.trigo_pct,   '$', '/bu');
  setTk('tk-sorgo',   'tk-sorgo-p',   p.sorgo,   p.sorgo_pct,   '$', '/bu');
  setTk('tk-wti',     'tk-wti-p',     p.wti,     p.wti_pct,     '$', '/bbl');
  setTk('tk-gas',     'tk-gas-p',     p.gasnat,  p.gasnat_pct,  '$', '/MMBtu');
  setTk('tk-cobre',   'tk-cobre-p',   p.cobre,   p.cobre_pct,   '$', '/lb');
  setTk('tk-aluminio','tk-aluminio-p',p.aluminio, p.aluminio_pct,'$', '/MT');
  const mxnEl = document.getElementById('tk-mxn');
  if (mxnEl && mxn) mxnEl.textContent = '$' + parseFloat(mxn).toFixed(4);
}
function updateHub(p, mxn) {
  const set  = (id, v) => { const e = document.getElementById(id); if (e && v != null) e.textContent = v; };
  const setPct = (id, pct) => {
    const e = document.getElementById(id);
    if (!e || pct == null) return;
    const n = parseFloat(pct);
    e.textContent = (n >= 0 ? '▲ +' : '▼ ') + Math.abs(n).toFixed(2) + '%';
    e.className   = 'hub-card-pct ' + (n >= 0 ? 'up' : 'down');
  };
  if (p.maiz)    { set('hub-maiz', '$' + parseFloat(p.maiz).toFixed(2) + '/bu');    setPct('hub-maiz-pct', p.maiz_pct); }
  if (p.soja)    { set('hub-soja', '$' + parseFloat(p.soja).toFixed(2) + '/MT');    setPct('hub-soja-pct', p.soja_pct); }
  if (p.wti)     { set('hub-wti',  '$' + parseFloat(p.wti).toFixed(2)  + '/bbl');   setPct('hub-wti-pct',  p.wti_pct);  }
  if (p.cobre)   { set('hub-cobre','$' + parseFloat(p.cobre).toFixed(2) + '/lb');   setPct('hub-cobre-pct',p.cobre_pct); }
  if (mxn)       { set('hub-mxn', '$' + parseFloat(mxn).toFixed(4)); }
  if (p.maiz)    { const mv = '$' + parseFloat(p.maiz).toFixed(2) + '/bu'; set('mhub-hdr-maiz', mv); set('mhub-maiz', mv); }
  if (p.soja)    { set('mhub-soja',    '$' + parseFloat(p.soja).toFixed(2) + '/MT'); }
  if (p.trigo)   { set('mhub-trigo',   '$' + parseFloat(p.trigo).toFixed(2) + '/bu'); }
  if (p.wti)     { const wv = '$' + parseFloat(p.wti).toFixed(2) + '/bbl'; set('mhub-hdr-wti', wv); set('mhub-wti', wv); }
  if (p.gasnat)  { set('mhub-gas',  '$' + parseFloat(p.gasnat).toFixed(3)); }
  if (p.diesel)  { set('mhub-diesel', '$' + parseFloat(p.diesel).toFixed(2) + '/gal'); set('mhub-flete', '~' + (parseFloat(p.diesel) * 8.5).toFixed(0) + ' MXN/t'); }
  if (p.cobre)   { const cv = '$' + parseFloat(p.cobre).toFixed(2) + '/lb'; set('mhub-hdr-cobre', cv); set('mhub-cobre', cv); }
  if (p.aluminio){ set('mhub-aluminio', '$' + parseFloat(p.aluminio).toFixed(0) + '/MT'); }
  if (mxn)       { const mx2 = parseFloat(mxn).toFixed(4); set('mhub-hdr-mxn', mx2); set('mhub-mxn', mx2); }
  const ts = document.getElementById('hub-timestamp');
  if (ts) ts.textContent = new Date().toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'});
}

/* ── RAW DATA PANELS ─────────────────────────────── */
function updateRawPanels(p, mxn) {
  function rd(idVal, price, pct, prefix='$', suffix='') {
    const el = document.getElementById(idVal);
    if (!el) return;
    if (price == null) { el.innerHTML = '<span style="color:#94a3b8">–</span>'; return; }
    const n = parseFloat(pct);
    const pctHtml = pct != null ? `<span class="rd-pct ${n >= 0 ? 'up':'down'}">${n >= 0 ? '+':''}${n.toFixed(1)}%</span>` : '';
    el.innerHTML = `${prefix}${parseFloat(price).toFixed(2)}${suffix}${pctHtml}`;
  }
  rd('rd-maiz',    p.maiz,    p.maiz_pct,    '$', '/bu');
  rd('rd-soja',    p.soja,    p.soja_pct,    '$', '/MT');
  rd('rd-trigo',   p.trigo,   p.trigo_pct,   '$', '/bu');
  rd('rd-wti',     p.wti,     p.wti_pct,     '$', '/bbl');
  rd('rd-gas',     p.gasnat,  p.gasnat_pct,  '$', '/MMBtu');
  rd('rd-cobre',   p.cobre,   p.cobre_pct,   '$', '/lb');
  rd('rd-aluminio',p.aluminio,p.aluminio_pct,'$', '/MT');
  if (p.sorgo) { const e = document.getElementById('rd-sorgo'); if (e) e.textContent = '$' + parseFloat(p.sorgo).toFixed(2) + '/bu'; }
  if (p.diesel){ const e = document.getElementById('rd-diesel');if (e) e.textContent = '$' + parseFloat(p.diesel).toFixed(2) + '/gal'; }

  const mxnStr = mxn ? '$' + parseFloat(mxn).toFixed(4) : '–';
  ['rd-mxn-g','rd-mxn-e','rd-mxn-m'].forEach(id => { const e = document.getElementById(id); if (e) e.textContent = mxnStr; });

  if (p.diesel && mxn) {
    const flete = (parseFloat(p.diesel) * 8.5).toFixed(0);
    const fe = document.getElementById('rd-flete');
    if (fe) fe.textContent = '~' + flete + ' MXN/ton·100km';
  }
}

function calcIPI(p) {
  const entries = [
    { pct: parseFloat(p.maiz_pct)   || 0, w: 0.22 },
    { pct: parseFloat(p.diesel_pct) || 0, w: 0.21 },
    { pct: parseFloat(p.wti_pct)    || 0, w: 0.16 },
    { pct: parseFloat(p.soja_pct)   || 0, w: 0.13 },
    { pct: parseFloat(p.trigo_pct)  || 0, w: 0.10 },
    { pct: parseFloat(p.cobre_pct)  || 0, w: 0.09 },
    { pct: parseFloat(p.gasnat_pct) || 0, w: 0.09 },
  ];
  const ws    = entries.reduce((a, e) => a + e.pct * e.w, 0);
  const score = Math.max(0, Math.min(100, 50 + ws * 4));
  const r     = Math.round(score);
  const color = r >= 75 ? '#dc2626' : r >= 60 ? '#ea580c' : r >= 45 ? '#d97706' : r >= 30 ? '#0284c7' : '#16a34a';
  const label = r >= 75 ? '🔴 CRÍTICO — Revisión inmediata de contratos'
              : r >= 60 ? '🟠 ALTO — Presión relevante en costos'
              : r >= 45 ? '🟡 MODERADO — Monitoreo activo'
              : r >= 30 ? '🔵 BAJO — Condiciones favorables'
              :           '🟢 MUY BAJO — Oportunidad de cobertura';
  return { score: r, color, label };
}

function updateIPI(p) {
  const ipi = calcIPI(p);
  ['ipi-score-hub','rd-ipi-g'].forEach(id => { const e = document.getElementById(id); if (e) { e.textContent = ipi.score + ' / 100'; e.style.color = ipi.color; } });
  const bar = document.getElementById('ipi-bar-hub');
  if (bar) { bar.style.width = ipi.score + '%'; bar.style.background = ipi.color; }
  const vrd = document.getElementById('ipi-verdict-hub');
  if (vrd) { vrd.textContent = ipi.label; vrd.style.color = ipi.color; }
  const ipiLbl = document.getElementById('hub-ipi-lbl');
  const ipiBadge = document.getElementById('hub-ipi-badge');
  if (ipiBadge) ipiBadge.textContent = 'IPI ' + ipi.score + '/100';
  const mhubIpi = document.getElementById('mhub-ipi');
  if (mhubIpi) { mhubIpi.textContent = ipi.score + '/100'; mhubIpi.style.color = ipi.color; }
  const mhubIpiMet = document.getElementById('mhub-ipi-met');
  if (mhubIpiMet) { mhubIpiMet.textContent = ipi.score + '/100'; mhubIpiMet.style.color = ipi.color; }
  if (ipiLbl) ipiLbl.textContent = `IPI ${ipi.score}/100`;

  function pctBig(id, pct) {
    const e = document.getElementById(id);
    if (!e || pct == null) return;
    const n = parseFloat(pct);
    e.textContent = (n >= 0 ? '+' : '') + n.toFixed(2) + '% m/m';
    e.style.color = n > 1.5 ? '#dc2626' : n > 0.3 ? '#d97706' : n < -0.3 ? '#16a34a' : '#64748b';
  }
  pctBig('ipi-m-maiz',  p.maiz_pct);
  pctBig('ipi-m-soja',  p.soja_pct);
  pctBig('ipi-m-diesel',p.diesel_pct);
  pctBig('ipi-m-wti',   p.wti_pct);

  const rdIpiLbl = document.getElementById('rd-ipi-g-lbl');
  if (rdIpiLbl) rdIpiLbl.textContent = ipi.label;
}

function renderHeatMap(p, mxn) {
  const grid = document.getElementById('heatGrid');
  if (!grid) return;
  const items = [
    { key: 'maiz',    lbl: 'Maíz',     price: p.maiz,    pct: p.maiz_pct,    unit: '$/bu',    emoji: '🌽' },
    { key: 'soja',    lbl: 'Soja',     price: p.soja,    pct: p.soja_pct,    unit: '$/MT',    emoji: '🫘' },
    { key: 'trigo',   lbl: 'Trigo',    price: p.trigo,   pct: p.trigo_pct,   unit: '$/bu',    emoji: '🌾' },
    { key: 'wti',     lbl: 'WTI',      price: p.wti,     pct: p.wti_pct,     unit: '$/bbl',   emoji: '🛢' },
    { key: 'gas',     lbl: 'Gas Nat.', price: p.gasnat,  pct: p.gasnat_pct,  unit: '$/MMBtu', emoji: '🔥' },
    { key: 'diesel',  lbl: 'Diesel',   price: p.diesel,  pct: p.diesel_pct,  unit: '$/gal',   emoji: '⛽' },
    { key: 'cobre',   lbl: 'Cobre',    price: p.cobre,   pct: p.cobre_pct,   unit: '$/lb',    emoji: '🔩' },
    { key: 'aluminio',lbl: 'Aluminio', price: p.aluminio,pct: p.aluminio_pct,unit: '$/MT',    emoji: '🏗' },
    { key: 'mxn',     lbl: 'USD/MXN',  price: mxn,       pct: null,          unit: 'pesos',   emoji: '💱' },
  ];
  grid.innerHTML = items.map(it => {
    const n = parseFloat(it.pct);
    let bg;
    if (it.pct == null) {
      bg = 'linear-gradient(135deg,#334155,#475569)';
    } else if (n > 3)  bg = 'linear-gradient(135deg,#7f1d1d,#dc2626)';
    else if (n > 1.5)  bg = 'linear-gradient(135deg,#92400e,#ea580c)';
    else if (n > 0.3)  bg = 'linear-gradient(135deg,#78350f,#d97706)';
    else if (n >= -0.3)bg = 'linear-gradient(135deg,#0f172a,#334155)';
    else if (n >= -1.5)bg = 'linear-gradient(135deg,#14532d,#16a34a)';
    else if (n >= -3)  bg = 'linear-gradient(135deg,#052e16,#15803d)';
    else               bg = 'linear-gradient(135deg,#042314,#166534)';

    const pctStr = it.pct != null ? ((n >= 0 ? '+' : '') + n.toFixed(2) + '%') : 'Ref.';
    const priceStr = it.price != null ? '$' + parseFloat(it.price).toFixed(it.key === 'gasnat' ? 3 : 2) : '—';
    return `<div class="heat-cell" style="background:${bg}" onclick="openCmModal('${it.key}')">
      <div class="heat-cell-lbl">${it.emoji} ${it.lbl}</div>
      <div class="heat-cell-price">${priceStr}</div>
      <div class="heat-cell-pct">${pctStr}</div>
      <div class="heat-cell-unit">${it.unit}</div>
    </div>`;
  }).join('');
}

function impactoLabel(tipo, pct) {
  const c = parseFloat(pct) || 0;
  if (tipo === 'cobre' || tipo === 'aluminio') {
    if (c > 2.5)  return { lbl: '📈 SEÑAL ↑',  color: '#16a34a', nota: 'Demanda industrial activa' };
    if (c >= -0.3) return { lbl: '⚖️ ÍNDICE',   color: '#7c3aed', nota: 'Mercado lateral' };
    return              { lbl: '📉 SEÑAL ↓',  color: '#dc2626', nota: 'Moderación en manufactura' };
  }
  const arr = c > 0.2 ? '↑' : c < -0.2 ? '↓' : '→';
  if (c > 4)   return { lbl: `🔴 CRÍTICO ${arr}`,  color: '#dc2626', nota: 'Alza fuerte — revisar contratos' };
  if (c > 1.5) return { lbl: `🟠 ALTO ${arr}`,     color: '#ea580c', nota: 'Tendencia alcista activa' };
  if (c > 0.3) return { lbl: `🟡 ALZA ${arr}`,     color: '#d97706', nota: 'Incremento leve' };
  if (c >= -0.3)return { lbl: `🔵 ESTABLE ${arr}`, color: '#0284c7', nota: 'Sin cambio relevante' };
  if (c >= -1.5)return { lbl: `🟢 BAJA ${arr}`,    color: '#16a34a', nota: 'Corrección favorable' };
  return          { lbl: `🟢 CAÍDA ${arr}`,  color: '#15803d', nota: 'Descenso pronunciado' };
}

function renderGranosTable(p, mxn) {
  const tb = document.getElementById('granos-tbody');
  if (!tb) return;
  const rows = [
    { key: 'maiz',  name: 'Maíz Amarillo #2',   sub: 'CME · CBOT Chicago',    price: p.maiz,  pct: p.maiz_pct,  pct3m: p.maiz_a_pct3m,  unit: '/MT',    hist: p.soja_hist },
    { key: 'trigo', name: 'Trigo SRW Chicago',   sub: 'CBOT · SRW',            price: p.trigo, pct: p.trigo_pct, pct3m: p.tripct3m,  unit: '/bu',    hist: p.maiz_hist },
    { key: 'soja',  name: 'Soja en Grano',       sub: 'CME · CBOT Chicago',    price: p.soja,  pct: p.soja_pct,  pct3m: p.sojgo_pct3m, unit: '/bu',    hist: p.trigo_hist },
    { key: 'sorgo', name: 'Sorgo Amarillo',       sub: 'Est. Maíz ×0.92',      price: p.sorgo, pct: p.sorgo_pct, pct3m: null,          unit: '/bu',    hist: null },
  ];
  tb.innerHTML = rows.map(r => {
    if (!r.price) return `<tr onclick="openCmModal('${r.key}')"><td colspan="6" style="color:var(--muted);font-size:.65rem;padding:.6rem .4rem">${r.name} — Sin dato</td></tr>`;
    const imp = impactoLabel(r.key, r.pct);
    const n   = parseFloat(r.pct) || 0;
    const n3m = r.pct3m != null ? parseFloat(r.pct3m) : null;
    const prcMxn = mxn ? '$' + (parseFloat(r.price) * parseFloat(mxn) * (r.unit === '/MT' ? 1 : 39.368)).toFixed(0) + ' MXN/MT' : '—';
    const sparkHtml = buildSpark(r.hist);
    return `<tr onclick="openCmModal('${r.key}')">
      <td><div class="cmt-name">${r.name}</div><div class="cmt-sub">${r.sub}</div>${sparkHtml}</td>
      <td><div class="cmt-price">$${parseFloat(r.price).toFixed(2)}${r.unit}</div></td>
      <td><div class="cmt-pct ${n >= 0 ? 'up':'down'}">${n >= 0 ? '+':''}${n.toFixed(2)}%</div></td>
      <td style="font-size:.65rem;color:${n3m != null ? (n3m > 0 ? 'var(--red)':'var(--green)') : 'var(--muted)'};">${n3m != null ? (n3m >= 0 ? '+':'') + n3m.toFixed(1) + '% 3M' : '—'}</td>
      <td><b style="color:${imp.color};font-size:.65rem">${imp.lbl}</b> <span style="color:var(--muted);font-size:.6rem">· ${imp.nota}</span></td>
      <td><div class="cmt-mxn">${prcMxn}</div></td>
    </tr>`;
  }).join('');
}

function renderEnergiaTable(p, mxn) {
  const tb = document.getElementById('energia-tbody');
  if (!tb) return;
  const rows = [
    { key: 'wti',    name: 'Petróleo WTI',       sub: 'NYMEX · New York',  price: p.wti,    pct: p.wti_pct,    unit: '/bbl' },
    { key: 'gas',    name: 'Gas Natural H.Hub',   sub: 'NYMEX · MMBtu',     price: p.gasnat, pct: p.gasnat_pct, unit: '/MMBtu' },
    { key: 'diesel', name: 'Diesel ULSD Est.',    sub: 'NYMEX · Est.',       price: p.diesel, pct: p.diesel_pct, unit: '/gal' },
  ];
  tb.innerHTML = rows.map(r => {
    if (!r.price) return `<tr><td colspan="5" style="color:var(--muted);font-size:.65rem;">${r.name} — Sin dato</td></tr>`;
    const imp = impactoLabel(r.key, r.pct);
    const n   = parseFloat(r.pct) || 0;
    const mxnVal = mxn ? '$' + (parseFloat(r.price) * parseFloat(mxn)).toFixed(2) + ' MXN' + r.unit : '—';
    return `<tr onclick="openCmModal('${r.key}')">
      <td><div class="cmt-name">${r.name}</div><div class="cmt-sub">${r.sub}</div></td>
      <td><div class="cmt-price">$${parseFloat(r.price).toFixed(r.key==='gas'?3:2)}${r.unit}</div></td>
      <td><div class="cmt-pct ${n >= 0 ? 'up':'down'}">${n >= 0 ? '+':''}${n.toFixed(2)}%</div></td>
      <td><b style="color:${imp.color};font-size:.65rem">${imp.lbl}</b></td>
      <td><div class="cmt-mxn">${mxnVal}</div></td>
    </tr>`;
  }).join('');
}

function renderMetalesTable(p, mxn) {
  const tb = document.getElementById('metales-tbody');
  if (!tb) return;
  const rows = [
    { key: 'cobre',   name: 'Cobre Grado A',      sub: 'LME / COMEX',  price: p.cobre,    pct: p.cobre_pct,    unit: '/lb',  hist: p.cobre_hist },
    { key: 'aluminio',name: 'Aluminio Primario',   sub: 'LME London',   price: p.aluminio, pct: p.aluminio_pct, unit: '/MT',  hist: p.aluminio_hist },
  ];
  tb.innerHTML = rows.map(r => {
    if (!r.price) return `<tr><td colspan="5" style="color:var(--muted);font-size:.65rem;">${r.name} — Sin dato</td></tr>`;
    const imp = impactoLabel(r.key, r.pct);
    const n   = parseFloat(r.pct) || 0;
    const mxnVal = mxn ? '$' + (parseFloat(r.price) * parseFloat(mxn) * (r.unit === '/MT' ? 1 : 2204.62)).toFixed(0) + ' MXN/MT' : '—';
    const sparkHtml = buildSpark(r.hist);
    return `<tr onclick="openCmModal('${r.key}')">
      <td><div class="cmt-name">${r.name}</div><div class="cmt-sub">${r.sub}</div>${sparkHtml}</td>
      <td><div class="cmt-price">$${parseFloat(r.price).toFixed(r.unit==='/MT'?0:2)}${r.unit}</div></td>
      <td><div class="cmt-pct ${n >= 0 ? 'up':'down'}">${n >= 0 ? '+':''}${n.toFixed(2)}%</div></td>
      <td><b style="color:${imp.color};font-size:.65rem">${imp.lbl}</b> <span style="color:var(--muted);font-size:.6rem">· ${imp.nota}</span></td>
      <td><div class="cmt-mxn">${mxnVal}</div></td>
    </tr>`;
  }).join('');
}

function buildSpark(hist) {
  if (!Array.isArray(hist) || hist.length < 2) return '';
  const vals = hist.slice(-6);
  const mn = Math.min(...vals), mx = Math.max(...vals), rng = mx - mn || 1;
  const bars = vals.map((v, i) => {
    const h = Math.round(((v - mn) / rng) * 14) + 3;
    const isLast = i === vals.length - 1;
    const col = isLast ? (v >= vals[i-1] ? '#ef4444' : '#22c55e') : '#cbd5e1';
    return `<div class="spark-b" style="height:${h}px;background:${col};flex-shrink:0;width:3px;border-radius:1px 1px 0 0;"></div>`;
  }).join('');
  return `<div class="cmt-spark">${bars}</div>`;
}

/* ── RACIONES ─────────────────────────────────────── */
function renderRaciones(p, mxn) {
  const maizMT  = parseFloat(p.maiz)  * 39.368;
  const sojaMT  = parseFloat(p.soja)  || 0;
  const trigoMT = parseFloat(p.trigo) * 36.744;
  const sorgoMT = parseFloat(p.sorgo) * 39.368;

  const bovino  = maizMT*0.65 + sorgoMT*0.20 + sojaMT*0.15;
  const porcino = maizMT*0.55 + sojaMT*0.30  + trigoMT*0.15;
  const aves    = maizMT*0.65 + sojaMT*0.32  + sorgoMT*0.03;
  const dieselGal = parseFloat(p.diesel) || 2.5;
  const gasN      = parseFloat(p.gasnat) || 2.5;
  const energia   = dieselGal * 50 + gasN * 5;
  const anyReal   = p.maiz_real || p.soja_real;

  function fmtR(val, idUsd, idMxn, idPct, refPct) {
    if (!val || isNaN(val)) return;
    const setEl = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    setEl(idUsd, '$' + val.toFixed(2) + '/MT');
    if (mxn) setEl(idMxn, '$' + (val * parseFloat(mxn)).toFixed(0) + ' MXN/MT');
    const el = document.getElementById(idPct);
    if (el && refPct !== undefined) {
      const n = parseFloat(refPct) || 0;
      el.textContent = anyReal
        ? (n > 0 ? `↑ +${n.toFixed(1)}% m/m vs mes ant.` : n < 0 ? `↓ ${n.toFixed(1)}% m/m vs mes ant.` : '→ Sin cambio m/m')
        : 'Datos de referencia';
      el.className = 'racion-pct ' + (n > 0.5 ? 'up' : n < -0.5 ? 'down' : 'neu');
    }
  }
  fmtR(bovino,  'racion-bovino-usd',  'racion-bovino-mxn',  'racion-bovino-pct',  (parseFloat(p.maiz_pct)*0.65 + parseFloat(p.sorgo_pct||0)*0.20 + parseFloat(p.soja_pct)*0.15));
  fmtR(porcino, 'racion-porcino-usd', 'racion-porcino-mxn', 'racion-porcino-pct', (parseFloat(p.maiz_pct)*0.55 + parseFloat(p.soja_pct)*0.30 + parseFloat(p.trigo_pct)*0.15));
  fmtR(aves,    'racion-aves-usd',    'racion-aves-mxn',    'racion-aves-pct',    (parseFloat(p.maiz_pct)*0.65 + parseFloat(p.soja_pct)*0.32 + parseFloat(p.sorgo_pct||0)*0.03));
  const enEl = document.getElementById('racion-energia-usd');
  if (enEl) enEl.textContent = '$' + energia.toFixed(2) + '/día';
  if (mxn) { const el = document.getElementById('racion-energia-mxn'); if (el) el.textContent = '$' + (energia * parseFloat(mxn)).toFixed(0) + ' MXN/día'; }
  const enPct = document.getElementById('racion-energia-pct');
  if (enPct) {
    const n = parseFloat(p.wti_pct) || 0;
    enPct.textContent = p.wti_real ? (n > 0 ? `↑ +${n.toFixed(1)}% WTI m/m` : n < 0 ? `↓ ${n.toFixed(1)}% WTI m/m` : '→ Estable m/m') : 'Estimado ref.';
    enPct.className = 'racion-pct ' + (n > 0.5 ? 'up' : n < -0.5 ? 'down' : 'neu');
  }
}

/* ── LOGISTICS PANEL ─────────────────────────────── */
function renderLogistica(p, mxn) {
  const wtiN    = parseFloat(p.wti)    || 70;
  const dieselG = parseFloat(p.diesel) || 2.67;

  const set = (id, v) => { const e = document.getElementById(id); if (e && v != null) e.textContent = v; };
  // BDI — use wti proxy context (actual BDI would need dedicated API)
  const bdiEst = Math.round(1200 + wtiN * 8.5);
  set('bdi-val', bdiEst.toLocaleString('es-MX'));
  set('bdi-sub', 'Índice de flete marítimo seco · Est. VALL');
  const bdiTrend = document.getElementById('bdi-trend');
  if (bdiTrend) {
    const cls = wtiN > 75 ? 'lt-up' : wtiN < 65 ? 'lt-dn' : 'lt-neu';
    const lbl = wtiN > 75 ? '↑ PRESIÓN ALTA' : wtiN < 65 ? '↓ FLETE BAJO' : '→ MERCADO NEUTRO';
    bdiTrend.innerHTML = `<span class="log-trend ${cls}">${lbl}</span>`;
  }

  const fleteMX = (dieselG * 8.5).toFixed(0);
  set('flete-mx', `~${fleteMX} MXN/ton·100km`);
  if (mxn) { set('flete-mx-sub', `Diesel $${dieselG.toFixed(2)}/gal × 8.5`); }

  set('log-diesel', `$${dieselG.toFixed(2)}/gal`);
  if (mxn) { set('log-diesel-mxn', `≈ $${(dieselG * parseFloat(mxn)).toFixed(2)} MXN/gal`); }

  set('log-wti-val', `$${wtiN.toFixed(2)}/bbl`);
  if (mxn) { set('log-wti-mxn', `≈ $${(wtiN * parseFloat(mxn)).toFixed(0)} MXN/bbl`); }

  const contUSD = Math.round(1800 + bdiEst * 0.15);
  set('cont-usd', `~$${contUSD.toLocaleString()} USD <span style="font-size:.55rem;color:var(--muted)">(REF.)</span>`);
  const contEl = document.getElementById('cont-usd');
  if (contEl) contEl.innerHTML = `~$${contUSD.toLocaleString()} USD <span style="font-size:.55rem;color:var(--muted)">(REF.)</span>`;
  if (mxn) { const e = document.getElementById('cont-mxn'); if (e) e.textContent = `≈ $${(contUSD * parseFloat(mxn)).toFixed(0)} MXN`; }

  const aereoKg = (wtiN * 0.064 + 1.20).toFixed(2);
  set('aereo-usd', `~$${aereoKg}/kg (REF.)`);
  if (mxn) { const e = document.getElementById('aereo-mxn'); if (e) e.textContent = `≈ $${(parseFloat(aereoKg) * parseFloat(mxn)).toFixed(2)} MXN/kg`; }

  const logCtx = document.getElementById('log-context');
  if (logCtx) logCtx.innerHTML = `<i class="fas fa-robot"></i> <span>WTI ${wtiN > 75 ? 'sobre $75/bbl — presión alta en fletes.' : wtiN > 65 ? '$65–$75/bbl — costo logístico moderado.' : 'bajo $65/bbl — ventana favorable para contratar fletes.'} Diesel $${dieselG.toFixed(2)}/gal${p.wti_real ? ' (tiempo real)' : ' (ref.)'}. Flete terrestre est.: ${fleteMX} MXN/ton·100km.</span>`;
}

function renderCalendario() {
  const container = document.getElementById('mkt-calendar-events');
  if (!container) return;
  const today = new Date(); today.setHours(0,0,0,0);

  function rel(d) {
    const diff = Math.round((d - today) / 864e5);
    if (diff < 0)   return { txt: 'Publicado', cls: 'cb-past' };
    if (diff === 0) return { txt: '⚡ HOY',    cls: 'cb-today' };
    if (diff === 1) return { txt: 'Mañana',    cls: 'cb-soon' };
    if (diff <= 7)  return { txt: `en ${diff} días`, cls: 'cb-soon' };
    return { txt: d.toLocaleDateString('es-MX',{day:'2-digit',month:'short'}).toUpperCase(), cls: 'cb-past' };
  }

  const events = [
    { icon:'📊', title:'WASDE USDA · Julio 2026', desc:'Oferta y demanda mundial de granos y oleaginosas. Impacto alto en maíz, soja, trigo y sorgo.', date: new Date(2026,6,11), imp:'high' },
    { icon:'🛢', title:'Inventarios EIA · Petróleo', desc:'Stocks semanales de crudo y destilados. Mueve WTI y diesel. Cada miércoles 10:30 EST.', date: new Date(), imp:'med' },
    { icon:'🌾', title:'Crop Progress USDA · Semanal', desc:'Estado del cultivo en EE.UU. — maíz y soya. Señal temprana de cosecha y calidad.', date: (() => { const d = new Date(today); const dm = (8 - d.getDay()) % 7 || 7; d.setDate(d.getDate() + dm); return d; })(), imp:'med' },
    { icon:'🚢', title:'Export Sales USDA · Granos', desc:'Ventas semanales de exportación de granos. Indica demanda de China y México.', date: (() => { const d = new Date(today); const dt = 4 - d.getDay(); d.setDate(d.getDate() + (dt <= 0 ? dt + 7 : dt)); return d; })(), imp:'med' },
    { icon:'🏦', title:'Banxico · Decisión de Tasas', desc:'Tasa TIIE de referencia MX. Impacta USD/MXN y costo de importación de insumos.', date: new Date(2026,7,6), imp:'high' },
    { icon:'🏛', title:'FOMC Fed · Política Monetaria', desc:'Tasa de fondos federales EUA. Mueve el dólar y el costo de coberturas en commodities.', date: new Date(2026,6,28), imp:'high' },
    { icon:'🛢', title:'OPEP+ · Reunión de Producción', desc:'Cuotas de producción de crudo. Mueve WTI y precio del diesel agropecuario.', date: new Date(2026,7,6), imp:'med' },
    { icon:'📋', title:'IPC México · INEGI', desc:'Inflación general y subyacente MX. Referencia para contratos agropecuarios indexados.', date: new Date(2026,7,10), imp:'low' },
  ];

  container.innerHTML = events.map(ev => {
    const r = rel(ev.date);
    return `<div class="cal-card ${ev.imp}">
      <div class="cal-icon">${ev.icon}</div>
      <div class="cal-body">
        <div class="cal-title">${ev.title}</div>
        <div class="cal-desc">${ev.desc}</div>
        <div class="cal-badges">
          <span class="cal-badge ${ev.imp === 'high' ? 'cb-high' : ev.imp === 'med' ? 'cb-med' : 'cb-low'}">${ev.imp === 'high' ? 'IMPACTO ALTO' : ev.imp === 'med' ? 'IMPACTO MEDIO' : 'IMPACTO BAJO'}</span>
          <span class="cal-badge ${r.cls}">${r.txt}</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

function renderReportes() {
  const rc = document.getElementById('reportesContainer');
  if (!rc) return;
  const today = new Date(); today.setHours(0,0,0,0);
  function rel(d) {
    const diff = Math.round((d - today) / 864e5);
    if (diff < 0)   return { txt: 'PUBLICADO', cls: 'past' };
    if (diff === 0) return { txt: 'HOY ⚡',    cls: 'today-tag' };
    if (diff === 1) return { txt: 'MAÑANA',    cls: 'soon' };
    if (diff <= 7)  return { txt: `EN ${diff} DÍAS`, cls: 'soon' };
    return { txt: d.toLocaleDateString('es-MX',{day:'2-digit',month:'short'}).toUpperCase(), cls: 'past' };
  }
  const reportes = [
    { icon:'fa-file-chart-column', name:'WASDE Report · USDA', desc:'Oferta/demanda mundial de granos y oleaginosas. Alto impacto en maíz, soja, trigo.', date: new Date(2026,6,11) },
    { icon:'fa-building-columns',  name:'Minuta FOMC · Fed',   desc:'Decisión de tasas EUA. Mueve dólar, crédito agrícola y costo de coberturas.', date: new Date(2026,6,28) },
    { icon:'fa-university',        name:'Banxico · Política Monetaria', desc:'Tasa de referencia MX. Impacta USD/MXN y costo de insumos importados.', date: new Date(2026,7,6) },
    { icon:'fa-oil-well',          name:'Inventarios Petróleo · EIA', desc:'Stocks de crudo y destilados EUA. Mueve WTI y precio del diesel.', date: (() => { const d = new Date(today); const dw = 3 - d.getDay(); d.setDate(d.getDate() + (dw <= 0 ? dw + 7 : dw)); return d; })() },
    { icon:'fa-wheat-awn',         name:'Crop Progress · USDA', desc:'Estado del cultivo semanal. Señal temprana de cosecha de maíz y soya EUA.', date: (() => { const d = new Date(today); const dm = (8 - d.getDay()) % 7 || 7; d.setDate(d.getDate() + dm); return d; })() },
    { icon:'fa-ship',              name:'Export Sales · USDA Grains', desc:'Ventas semanales de exportación de granos. Indica demanda de China/México.', date: (() => { const d = new Date(today); const dt = 4 - d.getDay(); d.setDate(d.getDate() + (dt <= 0 ? dt + 7 : dt)); return d; })() },
    { icon:'fa-chart-line',        name:'IPC México · INEGI', desc:'Inflación general y subyacente MX. Referencia para contratos indexados.', date: new Date(2026,7,10) },
  ];
  rc.innerHTML = reportes.map(r => {
    const rv = rel(r.date);
    return `<div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-start;padding:.7rem 0;border-bottom:1px solid rgba(0,0,0,.06);gap:.2rem 0">
      <span style="color:var(--slate);font-weight:500;font-size:.76rem;flex:1 1 auto"><i class="fas ${r.icon}" style="color:var(--navy);margin-right:6px"></i>${r.name}</span>
      <span style="font-size:.65rem;font-weight:700;white-space:nowrap;color:${rv.cls === 'soon' || rv.cls === 'today-tag' ? 'var(--red)' : 'var(--muted)'}">${rv.txt}</span>
      <span style="flex:1 1 100%;font-size:.62rem;color:#64748b;line-height:1.35;padding-bottom:.15rem">${r.desc}</span>
    </div>`;
  }).join('');

  const rCtx = document.getElementById('reportes-ctx-txt');
  if (rCtx) {
    const nw = reportes[0]; const rw = rel(nw.date);
    rCtx.textContent = `Próximo WASDE: ${rCtx.cls === 'soon' ? '📊 ' + rw.txt + ' — preparar posiciones antes de la publicación USDA.' : rw.txt + ' — monitorear estimados previos al reporte.'}`;
  }
}

const KW_MKT = {
  granos:   ['corn','maiz','soybean','soja','wheat','trigo','grain','grano','cbot','usda','wasde','harvest','cosecha','crop','feedlot','forraje','canola'],
  energia:  ['oil','wti','brent','crude','petróleo','diesel','gas natural','natural gas','opec','energy','energía','fuel','gasolina','shale','barrel','lng'],
  metales:  ['copper','cobre','gold','oro','silver','plata','aluminum','aluminio','metal','lme','steel','acero','nickel','zinc','mining','minería'],
  logistica:['shipping','freight','logistics','flete','bdi','baltic','container','contenedor','port','puerto','supply chain','cargo','transport','maritime'],
  divisas:  ['dollar','dólar','peso','forex','currency','mxn','usd','euro','yen','exchange rate','tipo de cambio','dxy','divisa'],
  macro:    ['gdp','pib','interest rate','tasa','fed','federal reserve','central bank','inflation','inflación','economy','economía','tariff','arancel','cpi'],
};
function classifyMkt(title) {
  if (!title) return null;
  const lower = title.toLowerCase();
  let best = null, bestScore = 0;
  for (const [cat, words] of Object.entries(KW_MKT)) {
    const s = words.reduce((acc, w) => acc + (lower.includes(w) ? 1 : 0), 0);
    if (s > bestScore) { bestScore = s; best = cat; }
  }
  return bestScore > 0 ? best : null;
}

// Almacén de artículos renderizados (containerId → array)
const _renderedNews = {};

function escapeMktNewsText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function safeMktNewsUrl(value) {
  try {
    const parsed = new URL(String(value || ''), window.location.origin);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '#';
  } catch {
    return '#';
  }
}

function renderNews(articles, containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const list = articles.slice(0, 10);
  _renderedNews[containerId] = list;
  if (!list.length) {
    el.innerHTML = '<div class="news-item"><div class="news-cat">Sin noticias</div><div class="news-title" style="color:var(--muted)">No hay noticias disponibles para este filtro.</div></div>';
    return;
  }
  const CAT_LABEL = { granos:'🌽 Granos', energia:'🛢 Energía', metales:'🔩 Metales', logistica:'🚢 Logística', divisas:'💱 Divisas', macro:'📊 Macro' };
  el.innerHTML = list.map((a, i) => {
    const cat = classifyMkt(a.title) || classifyMkt(a.desc) || 'macro';
    const catLabel = CAT_LABEL[cat] || '📰 Mercados';
    const hasDesc = (a.desc || '').length > 20;
    const lower = (a.title + ' ' + (a.desc||'')).toLowerCase();
    const isHigh = /crash|colapso|crisis|record|surge|spike|dispara|máximo|mínimo|ban|war|guerra|sanción|sanction|opec|cut|recorte/.test(lower);
    const isMed  = /rise|fall|increase|decrease|sube|baja|alza|caída|report|dato|cpi|fed|opec|inventario/.test(lower);
    const impactColor = isHigh ? '#dc2626' : isMed ? '#d97706' : '#2563eb';
    const impactLabel = isHigh ? '▲ ALTO' : isMed ? '◆ MEDIO' : '● MONITOREO';
    
    return `<div class="news-item" onclick="openMktNewsDetail('${containerId}',${i})" role="button" tabindex="0" onkeydown="if(event.key==='Enter')openMktNewsDetail('${containerId}',${i})">
      <div class="news-meta-row">
        <span class="news-cat">${catLabel}</span>
        <span class="news-impact-tag" style="background:${impactColor}">${impactLabel}</span>
      </div>
      <div class="news-title">${escapeMktNewsText((a.title || '').slice(0, 110))}</div>
      <div class="news-src">
        <span>${escapeMktNewsText(a.src || 'API')}</span>
        <span>${escapeMktNewsText(a.fecha || '')} ${hasDesc ? ' <i class="fas fa-file-alt" style="color:var(--navy);margin-left:4px;" title="Reporte Completo"></i>' : ''}</span>
      </div>
    </div>`;
  }).join('');

  const vp = el.closest('.news-scroll-viewport');
  if (vp) {
    if (vp._scrollTimer) clearInterval(vp._scrollTimer);
    el.style.transform = 'translateY(0)';
  }
}

function startNewsAutoScroll(vp, inner) {
  // Desactivado temporalmente por preferencia de UI (Scroll manual)
}

function filterNews(cat, btn, pane) {
  const bar = btn.closest('.news-filter-bar');
  if (bar) bar.querySelectorAll('.news-fpill').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  const filtered = cat === 'all' ? _newsAll : _newsAll.filter(a => (classifyMkt(a.title) || classifyMkt(a.desc)) === cat);
  renderNews(filtered.length ? filtered : _newsAll, `news-${pane}`);
}

/* ── Modal de noticia de mercado ────────────────────────── */
function openMktNewsDetail(containerId, idx) {
  const a = (_renderedNews[containerId] || [])[idx];
  if (!a) return;
  const titulo = a.title || 'Noticia de mercado';
  const desc   = a.desc || '';
  const src    = (a.src || 'API').toUpperCase();
  const fecha  = a.fecha || '';
  const url    = a.url || '#';
  const cat    = classifyMkt(titulo) || classifyMkt(desc) || 'macro';
  const catLabel = { granos:'🌽 Granos & Forrajes', energia:'🛢 Energéticos', metales:'🔩 Metales', logistica:'🚢 Logística', divisas:'💱 Divisas', macro:'📊 Macro' }[cat] || '📰 Mercados';

  // Detectar impacto por keywords
  const lower = titulo.toLowerCase() + ' ' + desc.toLowerCase();
  const isHigh = /crash|colapso|crisis|record|surge|spike|dispara|máximo|mínimo|ban|war|guerra|sanción|sanction|opec|cut|recorte/.test(lower);
  const isMed  = /rise|fall|increase|decrease|sube|baja|alza|caída|report|dato|cpi|fed|opec|inventario/.test(lower);
  const impact = isHigh ? 'alto' : isMed ? 'medio' : 'bajo';
  const impColor = impact === 'alto' ? '#dc2626' : impact === 'medio' ? '#d97706' : '#2563eb';
  const impLabel = impact === 'alto' ? 'IMPACTO ALTO' : impact === 'medio' ? 'IMPACTO MEDIO' : 'MONITOREO';

  document.getElementById('nm-cat').textContent = catLabel;
  const pill = document.getElementById('nm-impact');
  pill.textContent = impLabel; pill.style.background = impColor;
  document.getElementById('nm-title').textContent = titulo;
  document.getElementById('nm-source').textContent = `${src}${fecha ? ' · ' + fecha : ''}`;

  const imgEl = document.getElementById('nm-img');
  if (imgEl) {
    if (a.image) {
      imgEl.src = a.image;
      imgEl.style.display = 'block';
    } else {
      imgEl.style.display = 'none';
      imgEl.src = '';
    }
  }

  // Traducción con MyMemory (gratuita, sin gasto de tokens Gemini)
  const isEnglish = /\b(the|and|for|with|that|this|from|have|are|was|were)\b/i.test(desc) && desc.length > 20;
  document.getElementById('nm-desc').textContent = desc || '(Sin descripción disponible)';
  if (isEnglish && desc) {
    document.getElementById('nm-desc').textContent = 'Traduciendo…';
    _mktTranslate(desc.slice(0, 500)).then(text => {
      const el = document.getElementById('nm-desc');
      if (el) el.textContent = text || desc;
    }).catch(() => { const el = document.getElementById('nm-desc'); if (el) el.textContent = desc; });
  }

  // Activos relacionados
  const kw = _mktNewsKeywords(titulo + ' ' + desc + ' ' + catLabel);
  document.getElementById('nm-related').innerHTML = kw.map(k =>
    `<div class="nm-related-row"><span class="nm-rel-asset">${k.a}</span><span class="nm-rel-dir">${k.dir}</span></div>`
  ).join('');

  // URL
  const extLink = document.getElementById('nm-ext-link');
  const safeUrl = safeMktNewsUrl(url);
  extLink.href = safeUrl;
  extLink.rel = 'noopener noreferrer';
  extLink.style.display = safeUrl !== '#' ? 'flex' : 'none';

  // Reporte estático (sin IA, instantáneo)
  document.getElementById('nm-report').textContent = _buildMktNewsReport(titulo, catLabel, src, fecha, impact, desc, kw);

  // Análisis VALL-AI: solo se genera cuando el usuario lo pide
  const elA = document.getElementById('nm-analysis');
  elA.innerHTML = '';
  const genBtn = document.createElement('button');
  genBtn.className = 'nm-btn nm-btn-outline';
  genBtn.style.cssText = 'font-size:.65rem;margin-top:.2rem;';
  genBtn.innerHTML = '<i class="fas fa-robot"></i> Generar análisis VALL-AI';
  genBtn.onclick = () => {
    genBtn.disabled = true;
    genBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Analizando…';
    elA.appendChild(document.createElement('br'));
    _loadGeminiMktNews(titulo, desc, catLabel, impact, genBtn);
  };
  elA.appendChild(genBtn);

  document.getElementById('nm-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function _mktNewsKeywords(text) {
  const t = text.toLowerCase();
  const assets = [
    { a:'Maíz CME', kw:['corn','maiz','maíz','cbot'], dir:'impacto directo en precio' },
    { a:'Soja CME', kw:['soybean','soja'], dir:'afecta pasta y aceite' },
    { a:'Trigo CME', kw:['wheat','trigo'], dir:'presión en costos harinas' },
    { a:'WTI Crude', kw:['oil','wti','crude','petróleo','barrel'], dir:'costo energético y fletes' },
    { a:'Gas Natural', kw:['natural gas','gas natural','lng','gnl'], dir:'costo calórico industrial' },
    { a:'Diesel', kw:['diesel','ulsd','gasoil'], dir:'fletes y maquinaria agrícola' },
    { a:'Cobre LME', kw:['copper','cobre'], dir:'señal de actividad industrial' },
    { a:'USD/MXN', kw:['peso','mxn','dollar','dólar','dxy','forex'], dir:'multiplica costo de insumos' },
    { a:'Fed / Tasas', kw:['fed','interest rate','tasa','fomc','inflation','inflación'], dir:'apetito de riesgo y crédito' },
    { a:'OPEC', kw:['opec','oiproducer','barrel output','recorte producción'], dir:'oferta y precio del crudo' },
  ];
  return assets.filter(a => a.kw.some(k => t.includes(k))).slice(0, 5);
}

function _buildMktNewsReport(titulo, cat, fuente, fecha, impact, desc, kw) {
  const sep  = '─'.repeat(44);
  const sep2 = '═'.repeat(44);
  const impDesc = impact === 'alto' ? 'ALTO — Monitoreo inmediato requerido'
               : impact === 'medio' ? 'MEDIO — Seguimiento recomendado'
               : 'BAJO / MONITOREO — Sin acción urgente';
  const assets = kw.map(k => `  • ${k.a} — ${k.dir}`).join('\n') || '  • Mercados globales';
  return [
    sep2,
    'REPORTE DE NOTICIA — MERCADOS VALL',
    'VALLNews Intelligence · ' + new Date().toLocaleString('es-MX'),
    sep2,
    '',
    'TITULAR',
    titulo,
    '',
    sep,
    'DETALLES',
    `  Categoría   : ${cat}`,
    `  Fuente      : ${fuente}`,
    `  Fecha       : ${fecha || 'N/A'}`,
    `  Impacto     : ${impDesc}`,
    sep,
    '',
    'DESCRIPCIÓN',
    desc || '(sin descripción disponible)',
    '',
    sep,
    'ACTIVOS Y MERCADOS RELACIONADOS',
    assets,
    '',
    sep,
    'ANÁLISIS VALL-AI',
    '(generando análisis inteligente...)',
    '',
    sep2,
    '© VALLNews · Información con fines educativos',
  ].join('\n');
}

async function _loadGeminiMktNews(titulo, desc, cat, impact, triggerBtn) {
  const elA = document.getElementById('nm-analysis');
  const elR = document.getElementById('nm-report');
  const SYS = 'Eres un analista financiero institucional de VALL News especializado en mercados de commodities y agroindustria. Responde en español, de forma concisa y profesional. Máximo 180 palabras.';
  const prompt = `Eres VALL-AI, analista de mercados para empresas agropecuarias mexicanas. Analiza esta noticia en 3 puntos concisos:\n1) Impacto inmediato en mercados de commodities y energéticos\n2) Activos y sectores más afectados (foco en México)\n3) Recomendación práctica para productores e importadores mexicanos\n\nNOTICIA: ${titulo}. Categoría: ${cat}. Impacto: ${impact}. Descripción: ${desc.slice(0, 600)}\n\nSé directo y práctico. Máximo 5 oraciones.`;
  try {
    const aiText = await VDS.geminiChat(prompt, SYS);
    const text = aiText || 'Análisis no disponible.';
    if (elA) elA.textContent = text;
    if (elR) elR.textContent = elR.textContent.replace('(generando análisis inteligente...)', text);
  } catch (e) {
    const msg = 'No se pudo conectar con VALL-AI. ' + (e.message || 'Verifica tu conexión.');
    if (elA) elA.textContent = msg;
    if (elR) elR.textContent = elR.textContent.replace('(generando análisis inteligente...)', msg);
    if (triggerBtn) { triggerBtn.disabled = false; triggerBtn.innerHTML = '<i class="fas fa-robot"></i> Reintentar análisis'; }
  }
}

function closeMktNewsModal() {
  document.getElementById('nm-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

function copyMktNewsReport() {
  const text = document.getElementById('nm-report').textContent;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.querySelector('#nm-panel .nm-btn-primary');
    if (btn) { btn.innerHTML = '<i class="fas fa-check"></i> Copiado'; setTimeout(() => { btn.innerHTML = '<i class="fas fa-copy"></i> Copiar'; }, 1800); }
  });
}

function printMktNewsReport() {
  const text = document.getElementById('nm-report').textContent;
  const w = window.open('', '_blank', 'width=700,height=900');
  if (!w) return;
  w.document.write(`<html><head><title>Reporte Noticia · VALLNews</title><style>body{font-family:Courier New,monospace;font-size:12px;padding:2cm;color:#1e293b}pre{white-space:pre-wrap;line-height:1.75}</style></head><body><pre>${text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre></body></html>`);
  w.document.close(); w.focus(); setTimeout(() => { w.print(); w.close(); }, 600);
}

// Cerrar modal con Escape
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMktNewsModal(); });

function renderForecast(p, mxn, containerId = 'forecastGridHub') {
  const grid = document.getElementById(containerId);
  if (!grid) return;
  const dirLabel = { alcista: '↑ ALCISTA', bajista: '↓ BAJISTA', lateral: '→ LATERAL' };
  const conf = (v) => v > 0.7 ? 'Confianza alta' : v > 0.4 ? 'Confianza media' : 'Señal débil';

  function dir(pct) {
    const n = parseFloat(pct) || 0;
    return n > 1.5 ? 'alcista' : n < -1.5 ? 'bajista' : 'lateral';
  }

  const items = [
    { name: 'Maíz CME',       price: p.maiz    ? '$' + parseFloat(p.maiz).toFixed(2) + '/bu'   : '—', dir: dir(p.maiz_pct),    conf: p.maiz_real ? 0.75 : 0.35,    driver: 'WASDE USDA · demanda China' },
    { name: 'Soja CME',       price: p.soja    ? '$' + parseFloat(p.soja).toFixed(2) + '/MT'   : '—', dir: dir(p.soja_pct),    conf: p.soja_real ? 0.72 : 0.35,    driver: 'Exportaciones Brasil · crush margin' },
    { name: 'Trigo CBOT',     price: p.trigo   ? '$' + parseFloat(p.trigo).toFixed(2) + '/bu'  : '—', dir: dir(p.trigo_pct),   conf: p.trigo_real ? 0.60 : 0.30,   driver: 'Geopolítica Mar Negro · clima' },
    { name: 'WTI Crude',      price: p.wti     ? '$' + parseFloat(p.wti).toFixed(2) + '/bbl'   : '—', dir: dir(p.wti_pct),     conf: p.wti_real ? 0.78 : 0.40,     driver: 'OPEP+ · inventarios EIA' },
    { name: 'Gas Natural',    price: p.gasnat  ? '$' + parseFloat(p.gasnat).toFixed(3) + '/MMBtu':'—', dir: dir(p.gasnat_pct),  conf: p.gasnat_real ? 0.65 : 0.35, driver: 'Clima · exportaciones LNG EUA' },
    { name: 'USD/MXN',        price: mxn       ? '$' + parseFloat(mxn).toFixed(4)               : '—', dir: parseFloat(mxn) > 18.5 ? 'alcista' : parseFloat(mxn) < 17 ? 'bajista' : 'lateral', conf: 0.60, driver: 'Diferencial tasas Banxico–Fed' },
  ];

  grid.innerHTML = items.map(it => `
    <div class="fc-card ${it.dir}">
      <div class="fc-name">${it.name}</div>
      <div class="fc-price">${it.price}</div>
      <div class="fc-dir ${it.dir}">${dirLabel[it.dir]}</div>
      <div class="fc-driver">${it.driver}</div>
      <div style="font-size:.57rem;color:var(--muted);font-style:italic;margin-top:.1rem">${conf(it.conf)} · 2–4 sem</div>
    </div>`).join('');
}

function openCmModal(key) {
  const p   = _mktPrecios;
  const mxn = _mktMxnRate;
  const prof = CM_PROFILES[key];
  if (!prof) return;

  const overlay = document.getElementById('cm-overlay');
  if (!overlay) return;

  document.getElementById('cm-hdr').style.background = prof.gradient;
  document.getElementById('cm-ticker').textContent   = `${prof.ticker} · ${prof.exchange}`;
  document.getElementById('cm-name').textContent     = prof.name;

  // Price & change
  const priceMap  = { maiz: p.maiz, soja: p.soja, trigo: p.trigo, sorgo: p.sorgo, wti: p.wti, gas: p.gasnat, diesel: p.diesel, cobre: p.cobre, aluminio: p.aluminio, mxn: mxn };
  const pctMap    = { maiz: p.maiz_pct, soja: p.soja_pct, trigo: p.trigo_pct, sorgo: p.sorgo_pct, wti: p.wti_pct, gas: p.gasnat_pct, diesel: p.diesel_pct, cobre: p.cobre_pct, aluminio: p.aluminio_pct, mxn: null };
  const price     = priceMap[key];
  const pct       = pctMap[key];
  const priceStr  = price != null ? '$' + parseFloat(price).toFixed(key === 'gas' ? 3 : key === 'mxn' ? 4 : 2) + ' ' + prof.unit : '—';
  const pctStr    = pct   != null ? (parseFloat(pct) >= 0 ? '+' : '') + parseFloat(pct).toFixed(2) + '%' : '—';
  const isUp      = parseFloat(pct) >= 0;

  document.getElementById('cm-price').textContent = priceStr;
  const chgEl = document.getElementById('cm-chg');
  chgEl.textContent = pctStr;
  chgEl.style.background = pct != null ? (isUp ? 'rgba(22,163,74,.3)' : 'rgba(220,38,38,.3)') : 'rgba(255,255,255,.15)';

  // Metrics
  const mxnVal = key === 'mxn' ? '—' : (price && mxn) ? '$' + (parseFloat(price) * parseFloat(mxn) * (prof.unit === '/MT' ? 1 : prof.unit === '/bu' ? 39.368 : prof.unit === '/lb' ? 2204.62 : 1)).toFixed(0) + ' MXN/MT est.' : '—';
  document.getElementById('cm-metrics').innerHTML = [
    ['Precio actual',   priceStr],
    ['Var. mensual m/m', pctStr],
    ['Mercado / Bolsa', prof.exchange],
    ['Unidad',          prof.unit],
    ['Equiv. MXN',      mxnVal],
  ].map(([l,v]) => `<div class="cm-metric-row"><span class="cm-metric-lbl">${l}</span><span class="cm-metric-val">${v}</span></div>`).join('');

  document.getElementById('cm-context').textContent = prof.context;

  document.getElementById('cm-watching').innerHTML = prof.watching.map(w =>
    `<div style="padding:.28rem 0;border-bottom:1px solid rgba(0,0,0,.04);font-size:.67rem;color:var(--slate);display:flex;align-items:flex-start;gap:.35rem"><span style="color:var(--navy);font-weight:700;flex-shrink:0">•</span>${w}</div>`
  ).join('');

  document.getElementById('cm-impacts').innerHTML = prof.impacts.map(im =>
    `<div class="cm-metric-row"><span class="cm-metric-lbl" style="font-weight:700">${im.a}</span><span style="font-size:.63rem;color:var(--muted)">${im.d}</span></div>`
  ).join('');

  document.getElementById('cm-report').textContent = buildCmReport(prof, key, priceStr, pctStr);

  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';

  loadCmAI(prof, key, priceStr, pctStr);
}

function buildCmReport(prof, key, priceStr, pctStr) {
  const sep  = '─'.repeat(44);
  const sep2 = '═'.repeat(44);
  const now  = new Date().toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' });
  return [
    sep2, 'REPORTE DE COMMODITY — ' + prof.name.toUpperCase(),
    'VALLNews Intelligence · ' + now, sep2, '',
    'TICKER    : ' + prof.ticker,
    'MERCADO   : ' + prof.exchange,
    'PRECIO    : ' + priceStr + '   VAR: ' + pctStr,
    sep, '', 'CONTEXTO', prof.context, '',
    sep, 'QUÉ MONITOREAR',
    prof.watching.map(w => '  • ' + w).join('\n'), '',
    sep, 'IMPACTO EN COSTOS DE PRODUCCIÓN',
    prof.impacts.map(im => '  • ' + im.a + ' — ' + im.d).join('\n'), '',
    sep, 'ANÁLISIS VALL-AI', '(generando análisis inteligente…)', '',
    sep2, '© VALLNews · Información con fines educativos'
  ].filter(Boolean).join('\n');
}

async function loadCmAI(prof, key, priceStr, pctStr) {
  const el = document.getElementById('cm-analysis');
  if (!el) return;
  el.textContent = 'Analizando con VALL-AI…';
  const prompt = `Eres VALL-AI, analista de commodities para VALLNews. Analiza este insumo agropecuario en ESPAÑOL, siendo directo y útil para productores mexicanos.

COMMODITY: ${prof.name} (${prof.ticker})
MERCADO: ${prof.exchange}
PRECIO ACTUAL: ${priceStr}
VARIACIÓN M/M: ${pctStr}
CONTEXTO: ${prof.context.slice(0,300)}

Entrega exactamente 3 secciones:
1. LECTURA ACTUAL (2 oraciones): interpreta el nivel de precio en contexto de costos de producción.
2. FACTORES CLAVE: 3 bullets de qué está moviendo el precio ahora.
3. RECOMENDACIÓN VALL: una acción concreta para productores agropecuarios mexicanos.

Sin frases de apertura genéricas. Sé directo y técnico.`;

  try {
    const text = await VDS.geminiChat(prompt, 'Eres un analista financiero institucional de VALL News especializado en mercados de commodities y agroindustria. Responde en español, de forma concisa y profesional. Máximo 180 palabras.');
    if (!text) throw new Error('vacía');
    el.textContent = text;
    // Update report
    const rep = document.getElementById('cm-report');
    if (rep) rep.textContent = rep.textContent.replace('(generando análisis inteligente…)', text);
  } catch(e) {
    el.textContent = 'No se pudo conectar con VALL-AI. ' + e.message;
  }
}

function closeCmModal() {
  document.getElementById('cm-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

function downloadReportWord(reportId, filenamePrefix) {
  const text = (document.getElementById(reportId) || {}).textContent || '';
  if (!text || typeof VDS === 'undefined' || !VDS.downloadAsWord) return;
  const stamp = new Date().toLocaleDateString('es-MX',{day:'2-digit',month:'2-digit',year:'numeric'}).replace(/\//g,'-');
  VDS.downloadAsWord(filenamePrefix + '_' + stamp, text);
}

function copyCmReport() {
  const text = (document.getElementById('cm-report') || {}).textContent || '';
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.querySelector('#cm-overlay .cm-btn-primary');
    if (btn) { btn.innerHTML = '<i class="fas fa-check"></i> Copiado'; setTimeout(() => { btn.innerHTML = '<i class="fas fa-copy"></i> Copiar'; }, 2000); }
  });
}

function printCmReport() {
  const text = (document.getElementById('cm-report') || {}).textContent || '';
  const w = window.open('', '_blank', 'width=700,height=900');
  if (!w) return;
  w.document.write(`<html><head><title>Reporte Commodity · VALLNews</title><style>body{font-family:Courier New,monospace;font-size:12px;padding:2cm;color:#1e293b}pre{white-space:pre-wrap;line-height:1.75}</style></head><body><pre>${text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre></body></html>`);
  w.document.close(); w.focus();
  setTimeout(() => { w.print(); w.close(); }, 600);
}


/* ---- */


/* ── CARGA PRINCIPAL ─────────────────────────────── */

// Helpers directos: no dependen de VDS (const no siempre accesible entre bloques)
async function _mktTranslate(text) {
  if (!text || text.trim().length < 5) return text;
  try {
    const qs = new URLSearchParams({ q: text.slice(0, 500), langpair: 'en|es' });
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(`https://api.mymemory.translated.net/get?${qs}`, { signal: ctrl.signal });
    clearTimeout(tid);
    const j = await r.json();
    const t = j?.responseData?.translatedText;
    if (t && j?.responseStatus === 200 && !t.includes('PLEASE SELECT')) return t;
  } catch {}
  return text;
}

const ES_RE = /\b(el|la|los|las|de|en|y|que|un|una|por|con|del|al|se|es|su|como|para)\b/i;
async function toES(text) {
  if (!text || ES_RE.test(text)) return text;
  try { return await _mktTranslate(text); } catch { return text; }
}
function safeImgUrl(u) {
  if (!u || typeof u !== 'string') return false;
  try { const url = new URL(u); return ['http:','https:'].includes(url.protocol); } catch { return false; }
}

async function cargarMercados() {
  const now      = new Date();
  const hora     = now.toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit' });
  const fechaFmt = now.toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric' }).toUpperCase();

  // --- Fetch commodities
  const [maizR, sojaR, wtiR, cobreR, trigoR, gasnatR, aluminioR, mxnR] =
    await Promise.allSettled([
      VDS.commodityWithPct('CORN'),
      VDS.commodityWithPct('SOYBEANS'),
      VDS.commodityWithPct('CRUDE_OIL'),
      VDS.commodityWithPct('COPPER'),
      VDS.commodityWithPct('WHEAT'),
      VDS.commodityWithPct('NATURAL_GAS'),
      VDS.commodityWithPct('ALUMINUM'),
      VDS.usdmxn(),
    ]);

  const v = r => r.status === 'fulfilled' && r.value != null ? r.value : null;
  const maizD     = v(maizR);
  const sojaD     = v(sojaR);
  const wtiD      = v(wtiR);
  const cobreD    = v(cobreR);
  const trigoD    = v(trigoR);
  const gasnatD   = v(gasnatR);
  const aluminioD = v(aluminioR);
  const mxnRate   = v(mxnR);

  const wtiPrice  = wtiD?.price ?? 70.00;
  const dieselEst = +((wtiPrice / 42) * 1.30 + 0.50).toFixed(2);

  const precios = {
    maiz:      maizD     ? maizD.price.toFixed(2)           : '4.82',   maiz_pct:     maizD?.pct     ?? 0, maiz_pct3m:  maizD?.pct3m  ?? 0, maiz_hist:  maizD?.history,  maiz_real:  !!maizD,
    soja:      sojaD     ? sojaD.price.toFixed(2)           : '342.50', soja_pct:     sojaD?.pct     ?? 0, soja_pct3m:  sojaD?.pct3m  ?? 0, soja_hist:  sojaD?.history,  soja_real:  !!sojaD,
    trigo:     trigoD    ? trigoD.price.toFixed(2)          : '5.30',   trigo_pct:    trigoD?.pct    ?? 0, trigo_pct3m: trigoD?.pct3m ?? 0, trigo_hist: trigoD?.history, trigo_real: !!trigoD,
    sorgo:     maizD     ? (maizD.price * 0.92).toFixed(2)  : '4.43',   sorgo_pct:    maizD?.pct     ?? 0,
    diesel:    dieselEst.toFixed(2),                                     diesel_pct:   wtiD?.pct      ?? 0,
    wti:       wtiD      ? wtiD.price.toFixed(2)            : '70.00',  wti_pct:      wtiD?.pct      ?? 0, wti_pct3m:   wtiD?.pct3m   ?? 0, wti_hist:   wtiD?.history,   wti_real:   !!wtiD,
    gasnat:    gasnatD   ? gasnatD.price.toFixed(3)         : '2.450',  gasnat_pct:   gasnatD?.pct   ?? 0, gasnat_pct3m:gasnatD?.pct3m ?? 0, gasnat_hist:gasnatD?.history,gasnat_real:!!gasnatD,
    cobre:     cobreD    ? cobreD.price.toFixed(2)          : '4.18',   cobre_pct:    cobreD?.pct    ?? 0, cobre_pct3m: cobreD?.pct3m ?? 0, cobre_hist: cobreD?.history, cobre_real: !!cobreD,
    aluminio:  aluminioD ? aluminioD.price.toFixed(0)       : '2400',   aluminio_pct: aluminioD?.pct ?? 0, aluminio_pct3m: aluminioD?.pct3m ?? 0, aluminio_hist: aluminioD?.history, aluminio_real: !!aluminioD,
  };

  _mktPrecios  = precios;
  _mktMxnRate  = mxnRate;

  // Update all UI
  updateMktTicker(precios, mxnRate);
  updateHub(precios, mxnRate);
  updateRawPanels(precios, mxnRate);
  updateIPI(precios);
  renderHeatMap(precios, mxnRate);
  renderForecast(precios, mxnRate);
  renderGranosTable(precios, mxnRate);
  renderEnergiaTable(precios, mxnRate);
  renderMetalesTable(precios, mxnRate);
  renderRaciones(precios, mxnRate);
  renderLogistica(precios, mxnRate);

  // Strategy
  const ipi = calcIPI(precios);
  const stratEl = document.getElementById('hub-strategy');
  if (stratEl) {
    const wtiN = parseFloat(precios.wti), maizN = parseFloat(precios.maiz), dsl = parseFloat(precios.diesel);
    const parts = [];
    if (maizD)  parts.push(`Maíz $${precios.maiz}/bu`);
    if (wtiD)   parts.push(`WTI $${precios.wti}/bbl`);
    if (cobreD) parts.push(`Cobre $${precios.cobre}/lb`);
    stratEl.innerHTML = `<i class="fas fa-robot"></i> <span><b>ESTRATEGIA VALL-AI:</b> ${(parts.length ? parts.join(' · ') + ' · datos en tiempo real. ' : 'Datos de referencia. ')}Presión de insumos IPI: ${ipi.score}/100 (${ipi.label.split('—')[0].trim()}). Flete est.: ${(dsl * 8.5).toFixed(0)} MXN/ton·100km. ${wtiN > 75 ? 'WTI sobre $75/bbl — revisar coberturas de combustible.' : wtiN > 65 ? 'WTI en zona media: costo logístico moderado.' : 'WTI bajo $65/bbl: ventana favorable para contratar fletes.'}</span>`;
  }

  // Grains insight
  const gi = document.getElementById('granos-insight');
  if (gi) gi.innerHTML = `<i class="fas fa-robot"></i> <span>Maíz ${parseFloat(precios.maiz) > 5 ? 'sobre $5/bu — costos de ración elevados, evaluar cobertura.' : 'en rango moderado.'} Soja $${precios.soja}/MT — proteína en ${parseFloat(precios.soja_pct) > 0 ? 'tendencia alcista' : 'corrección'}. Sorgo estimado $${precios.sorgo}/bu (maíz ×0.92).</span>`;

  // Energy insight
  const ei = document.getElementById('energia-insight');
  if (ei) ei.innerHTML = `<i class="fas fa-robot"></i> <span>WTI $${precios.wti}/bbl · Diesel estimado $${precios.diesel}/gal → flete ~${(parseFloat(precios.diesel)*8.5).toFixed(0)} MXN/ton·100km. ${parseFloat(precios.wti) > 75 ? 'Presión alta en logística — revisar coberturas de combustible.' : 'Energéticos en zona moderada.'}</span>`;

  // Metals insight
  const mi = document.getElementById('metales-insight');
  if (mi) mi.innerHTML = `<i class="fas fa-robot"></i> <span>Cobre $${precios.cobre}/lb ${parseFloat(precios.cobre) > 4.5 ? '— nivel elevado refleja fuerte demanda industrial en Asia.' : '— en rango de equilibrio histórico.'}${mxnRate ? ` USD/MXN $${parseFloat(mxnRate).toFixed(4)} — costo de importación en pesos.` : ''}</span>`;

  // Costos insight
  const ci = document.getElementById('costos-strategy-txt');
  if (ci) { const maizMT = parseFloat(precios.maiz)*39.368, sojaMT = parseFloat(precios.soja)||0; const bovino = maizMT*0.65 + (parseFloat(precios.sorgo)*39.368)*0.20 + sojaMT*0.15; ci.textContent = bovino > 0 ? `Ración bovino estimada $${bovino.toFixed(2)}/MT${mxnRate ? ' · $' + (bovino*parseFloat(mxnRate)).toFixed(0) + ' MXN/MT' : ''}. IPI: ${ipi.score}/100. ${ipi.label.split('—')[1]?.trim() || ''}` : 'Calculando costos de raciones…'; }

  // Load news
  try {
    const [avCommR, fhR] = await Promise.allSettled([
      VDS.newsAlphaVantage('commodities', 8),
      VDS.finnhubNews('general'),
    ]);
    const avComm = (avCommR.status === 'fulfilled' ? avCommR.value : null) || [];
    const fh     = (fhR.status === 'fulfilled' ? fhR.value : null) || [];
    const all = [
      ...avComm.map(a => ({ title: a.title, desc: a.description || '', src: a.source || 'Alpha Vantage', url: a.url || '', fecha: hora, image: a.banner_image || a.image || '' })),
      ...fh.map(a => ({ title: a.title, desc: a.description || a.summary || '', src: a.source || 'Finnhub', url: a.url || '', fecha: hora, image: a.image || '' })),
    ];
    const seen = new Set();
    _newsAll = all.filter(a => { const k = (a.title || '').toLowerCase().slice(0, 50); if (!k || k.length < 8 || seen.has(k)) return false; seen.add(k); return true; });

    // Traducir solo top 5 con timeout por request (2.5s) + race global 6s
    const _tx = (text) => Promise.race([
      toES(text).catch(() => text),
      new Promise(res => setTimeout(() => res(text), 2500)),
    ]);
    const translateBatch = Promise.all(_newsAll.slice(0, 5).map(async a => ({
      ...a,
      title: await _tx(a.title),
    })));
    const translated = await Promise.race([
      translateBatch,
      new Promise(res => setTimeout(() => res(_newsAll.slice(0, 5)), 6000)),
    ]);
    _newsAll = [...translated, ..._newsAll.slice(5)];

    const granos  = _newsAll.filter(a => (classifyMkt(a.title) || classifyMkt(a.desc)) === 'granos');
    const energia  = _newsAll.filter(a => (classifyMkt(a.title) || classifyMkt(a.desc)) === 'energia');
    const metales  = _newsAll.filter(a => (classifyMkt(a.title) || classifyMkt(a.desc)) === 'metales');
    renderNews(granos.length  ? granos  : _newsAll, 'news-granos');
    renderNews(energia.length ? energia : _newsAll, 'news-energia');
    renderNews(metales.length ? metales : _newsAll, 'news-metales');
  } catch(e) { console.warn('news error', e); }

  window.VNLoader?.hide();
}

/* ── INIT (robusto: muestra la pestaña PRIMERO para que el panel siempre
       se vea aunque falle la carga de datos o el calendario) ─────────── */
(async () => {
  // 1) Mostrar la pestaña por defecto ANTES que nada
  try {
    const savedTab = (() => { try { return localStorage.getItem('mkt_active_tab'); } catch { return null; } })();
    const validTabs = ['general','granos','energia','metales','costos'];
    const tab = validTabs.includes(savedTab) ? savedTab : 'general';
    mktTab(tab, document.querySelector(`[data-tab="${tab}"]`));
  } catch (e) { console.warn('[mercados] mktTab init', e); }

  // 2) Contenido estático (tolerante a errores)
  try { renderCalendario(); } catch (e) { console.warn('[mercados] calendario', e); }
  try { renderReportes(); }  catch (e) { console.warn('[mercados] reportes', e); }

  // 3) Datos en vivo (tolerante a errores)
  try { await cargarMercados(); } catch (e) { console.warn('[mercados] cargarMercados', e); }
  setInterval(() => { try { cargarMercados(); } catch {} }, 20 * 60 * 1000);
})();


/* ---- */


(function () {
    const hamBtn = document.getElementById('hamBtn');
    const mainNav = document.getElementById('mainNav');
    if (!hamBtn || !mainNav || hamBtn.dataset.vnHeaderBound === '1') return;
    hamBtn.dataset.vnHeaderBound = '1';
    hamBtn.addEventListener('click', () => {
        hamBtn.classList.toggle('vn-ham-open');
        mainNav.classList.toggle('vn-nav-open');
    });
})();
