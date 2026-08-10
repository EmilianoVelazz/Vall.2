/*
 * Capa de cálculo de la sección Mercados — funciones puras, sin DOM.
 *
 * En pages/mercados.html estas fórmulas estaban entretejidas con ~200 llamadas
 * a getElementById: calcIPI leía y escribía nodos, renderGrainIntelligence
 * calculaba y pintaba en la misma pasada. Aquí solo calculan y devuelven datos;
 * el componente decide cómo mostrarlos.
 *
 * Las constantes numéricas (pesos del IPI, factor 39.368 bu→MT, diesel = WTI/42
 * × 1.30 + 0.50, flete = diesel × 8.5) se conservan EXACTAS respecto al
 * original: son el modelo de negocio de la sección, no detalles de
 * presentación, y cambiarlas alteraría las cifras que ve el usuario.
 */

export const BU_POR_MT = 39.368;

const num = (v, fallback = 0) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : fallback);

/* ── Índice de Presión de Insumos ──────────────────────────────────────────
   Media ponderada de las variaciones mensuales, reescalada a 0-100 con 50 como
   punto neutro. Los pesos suman 1.00 y reflejan el impacto de cada insumo en el
   costo pecuario mexicano. */
const PESOS_IPI = [
  ['maiz_pct', 0.22], ['diesel_pct', 0.21], ['wti_pct', 0.16], ['soja_pct', 0.13],
  ['trigo_pct', 0.10], ['cobre_pct', 0.09], ['gasnat_pct', 0.09],
];

export function calcIPI(p) {
  const ponderado = PESOS_IPI.reduce((acc, [clave, peso]) => acc + num(p[clave]) * peso, 0);
  const score = Math.round(Math.max(0, Math.min(100, 50 + ponderado * 4)));
  const color = score >= 75 ? '#dc2626' : score >= 60 ? '#ea580c' : score >= 45 ? '#d97706' : score >= 30 ? '#0284c7' : '#16a34a';
  const label = score >= 75 ? '🔴 CRÍTICO — Revisión inmediata de contratos'
    : score >= 60 ? '🟠 ALTO — Presión relevante en costos'
      : score >= 45 ? '🟡 MODERADO — Monitoreo activo'
        : score >= 30 ? '🔵 BAJO — Condiciones favorables'
          : '🟢 MUY BAJO — Oportunidad de cobertura';
  return { score, color, label };
}

/* Etiqueta de impacto por commodity. Los metales se leen al revés que los
   insumos: para cobre y aluminio una subida es señal de demanda industrial
   (buena), mientras que en maíz o diesel es presión de costo (mala). */
export function impactoLabel(tipo, pct) {
  const c = num(pct);
  if (tipo === 'cobre' || tipo === 'aluminio') {
    if (c > 2.5) return { lbl: '📈 SEÑAL ↑', color: '#16a34a', nota: 'Demanda industrial activa' };
    if (c >= -0.3) return { lbl: '⚖️ ÍNDICE', color: '#7c3aed', nota: 'Mercado lateral' };
    return { lbl: '📉 SEÑAL ↓', color: '#dc2626', nota: 'Moderación en manufactura' };
  }
  const flecha = c > 0.2 ? '↑' : c < -0.2 ? '↓' : '→';
  if (c > 4) return { lbl: `🔴 CRÍTICO ${flecha}`, color: '#dc2626', nota: 'Alza fuerte — revisar contratos' };
  if (c > 1.5) return { lbl: `🟠 ALTO ${flecha}`, color: '#ea580c', nota: 'Tendencia alcista activa' };
  if (c > 0.3) return { lbl: `🟡 ALZA ${flecha}`, color: '#d97706', nota: 'Incremento leve' };
  if (c >= -0.3) return { lbl: `🔵 ESTABLE ${flecha}`, color: '#0284c7', nota: 'Sin cambio relevante' };
  if (c >= -1.5) return { lbl: `🟢 BAJA ${flecha}`, color: '#16a34a', nota: 'Corrección favorable' };
  return { lbl: `🟢 CAÍDA ${flecha}`, color: '#15803d', nota: 'Descenso pronunciado' };
}

/* Color de celda del mapa de calor según la variación mensual. */
export function colorCalor(pct) {
  if (pct == null) return 'linear-gradient(135deg,#334155,#475569)';
  const n = num(pct);
  if (n > 3) return 'linear-gradient(135deg,#7f1d1d,#dc2626)';
  if (n > 1.5) return 'linear-gradient(135deg,#92400e,#ea580c)';
  if (n > 0.3) return 'linear-gradient(135deg,#78350f,#d97706)';
  if (n >= -0.3) return 'linear-gradient(135deg,#0f172a,#334155)';
  if (n >= -1.5) return 'linear-gradient(135deg,#14532d,#16a34a)';
  if (n >= -3) return 'linear-gradient(135deg,#052e16,#15803d)';
  return 'linear-gradient(135deg,#042314,#166534)';
}

/* Fase del calendario agrícola del hemisferio norte. */
export function faseEstacional(fecha = new Date()) {
  const mes = fecha.getMonth() + 1;
  if (mes >= 3 && mes <= 5) return { fase: 'Siembra norte', nota: 'Clima, avance de siembra y superficie sembrada.' };
  if (mes >= 6 && mes <= 8) return { fase: 'Desarrollo crítico', nota: 'Temperatura, humedad y potencial de rendimiento.' };
  if (mes >= 9 && mes <= 11) return { fase: 'Cosecha norte', nota: 'Rendimientos, ritmo de cosecha y oferta disponible.' };
  return { fase: 'Demanda y stocks', nota: 'Exportaciones, inventarios y siembra sudamericana.' };
}

const direccionDe = (pct) => (pct > 0.25 ? `sube ${pct.toFixed(1)}%`
  : pct < -0.25 ? `corrige ${Math.abs(pct).toFixed(1)}%`
    : 'permanece estable');

const lideraMovimiento = (lista) => [...lista].sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))[0];

/* ── Inteligencia de granos ────────────────────────────────────────────────
   La soja cotiza en USD/MT y el maíz en USD/bu: compararlos exige convertir el
   maíz a tonelada (×39.368) antes de dividir. Sin esa conversión el spread da
   un número ~40 veces menor y la lectura sale al revés. */
export function inteligenciaGranos(p, mxn) {
  const maiz = num(p.maiz, 4.82);
  const soja = num(p.soja, 342.5);
  const maizMT = maiz * BU_POR_MT;
  const spread = soja / Math.max(maizMT, 1);
  const canasta = maizMT * 0.6 + soja * 0.4;

  const cambios = [num(p.maiz_pct), num(p.soja_pct), num(p.trigo_pct)];
  const volatilidadMedia = cambios.reduce((s, v) => s + Math.abs(v), 0) / cambios.length;
  const presion = Math.max(0, Math.min(100, Math.round(
    50 + (cambios[0] * 0.45 + cambios[1] * 0.35 + cambios[2] * 0.20) * 4.5,
  )));

  const etiquetaPresion = presion >= 70 ? 'Presión alta · revisar coberturas'
    : presion >= 50 ? 'Presión moderada · monitoreo activo'
      : presion >= 30 ? 'Presión baja · compras escalonadas'
        : 'Presión muy baja · ventana favorable';

  const { fase, nota } = faseEstacional();
  const lider = lideraMovimiento([
    { name: 'maíz', pct: cambios[0] }, { name: 'soja', pct: cambios[1] }, { name: 'trigo', pct: cambios[2] },
  ]);

  const textoFx = mxn
    ? ` Con USD/MXN en $${num(mxn).toFixed(2)}, la canasta base equivale aproximadamente a $${(canasta * num(mxn)).toFixed(0)} MXN/MT.`
    : '';

  return {
    presion,
    etiquetaPresion,
    spread,
    notaSpread: spread > 2.0 ? 'La proteína conserva una prima elevada frente a la energía.'
      : spread > 1.55 ? 'La relación proteína–energía permanece equilibrada.'
        : 'La soja ofrece una prima contenida frente al maíz.',
    canasta,
    volatilidad: volatilidadMedia >= 5 ? 'Alta' : volatilidadMedia >= 2.2 ? 'Media' : 'Baja',
    notaVolatilidad: `Movimiento medio absoluto de ${volatilidadMedia.toFixed(1)}% mensual en maíz, soja y trigo.`,
    fase,
    notaFase: nota,
    lectura: `El ${lider.name} concentra el mayor movimiento del complejo y ${direccionDe(lider.pct)} mensual. `
      + `La presión conjunta se ubica en ${presion}/100. Durante la fase de ${fase.toLowerCase()}, `
      + `el mercado mantiene el foco en ${nota.toLowerCase()}${textoFx}`,
  };
}

/* ── Inteligencia de energéticos ───────────────────────────────────────────
   El diesel no se cotiza: se estima del WTI (barril de 42 galones, margen de
   refinación 1.30 y 0.50 de logística). El flete son 8.5 MXN por tonelada cada
   100 km por cada dólar de diesel. */
export function estimarDiesel(wti) {
  return (num(wti, 70) / 42) * 1.30 + 0.50;
}

export function inteligenciaEnergia(p, mxn) {
  const wti = num(p.wti, 70);
  const gas = num(p.gasnat, 2.5);
  const diesel = num(p.diesel, estimarDiesel(wti));
  const wtiPct = num(p.wti_pct);
  const gasPct = num(p.gasnat_pct);
  const dieselPct = num(p.diesel_pct, wtiPct);

  const movimiento = wtiPct * 0.45 + dieselPct * 0.35 + gasPct * 0.20;
  const presion = Math.max(0, Math.min(100, Math.round(50 + movimiento * 4.2)));
  const flete = diesel * 8.5;
  const canasta = diesel * 50 + gas * 5;
  const volatilidadMedia = (Math.abs(wtiPct) + Math.abs(gasPct) + Math.abs(dieselPct)) / 3;

  const lider = lideraMovimiento([
    { name: 'WTI', pct: wtiPct }, { name: 'gas natural', pct: gasPct }, { name: 'diesel', pct: dieselPct },
  ]);

  const textoFx = mxn
    ? ` Con USD/MXN en $${num(mxn).toFixed(2)}, la canasta operativa equivale a $${(canasta * num(mxn)).toFixed(0)} MXN por día indicativo.`
    : '';

  return {
    presion,
    diesel,
    flete,
    canasta,
    etiquetaPresion: presion >= 70 ? 'Presión alta · revisar combustibles y fletes'
      : presion >= 50 ? 'Presión moderada · monitoreo activo'
        : presion >= 30 ? 'Presión baja · contratación escalonada'
          : 'Presión muy baja · ventana logística favorable',
    notaFlete: `Referencia por tonelada cada 100 km con diesel en $${diesel.toFixed(2)}/gal.`,
    volatilidad: volatilidadMedia >= 7 ? 'Alta' : volatilidadMedia >= 3 ? 'Media' : 'Baja',
    notaVolatilidad: `Movimiento medio absoluto de ${volatilidadMedia.toFixed(1)}% mensual en WTI, gas y diesel.`,
    transmision: presion >= 70 ? 'Alta' : presion >= 45 ? 'Media' : 'Baja',
    notaTransmision: presion >= 70 ? 'Alta probabilidad de traslado a transporte, frío y operación.'
      : presion >= 45 ? 'Traslado parcial; vigilar contratos y tipo de cambio.'
        : 'Presión contenida sobre costos productivos inmediatos.',
    lectura: `El ${lider.name} concentra el mayor movimiento y ${direccionDe(lider.pct)} mensual. `
      + `La presión logística se ubica en ${presion}/100; el flete de referencia ronda `
      + `$${flete.toFixed(0)} MXN por tonelada cada 100 km.${textoFx}`,
  };
}

/* Simulador de escenario energético: los presets multiplican la base y el
   resultado se acota a rangos plausibles de mercado. */
export const ESCENARIOS_ENERGIA = {
  actual: { wti: 1, gas: 1, fx: 1 },
  stress: { wti: 1.15, gas: 1.15, fx: 1.06 },
  relief: { wti: 0.90, gas: 0.90, fx: 0.97 },
};

export function aplicarEscenarioEnergia(base, modo) {
  const f = ESCENARIOS_ENERGIA[modo] || ESCENARIOS_ENERGIA.actual;
  return {
    wti: Math.max(35, Math.min(150, base.wti * f.wti)),
    gas: Math.max(1, Math.min(12, base.gas * f.gas)),
    fx: Math.max(14, Math.min(26, base.fx * f.fx)),
  };
}

export function resultadoEscenarioEnergia({ wti, gas, fx }) {
  const diesel = estimarDiesel(wti);
  const flete = diesel * 8.5;
  const operacionUsd = diesel * 50 + gas * 5;
  return { diesel, flete, operacionUsd, operacionMxn: operacionUsd * fx };
}

/* ── Inteligencia de metales ───────────────────────────────────────────────
   El cobre cotiza en USD/lb y el aluminio en USD/MT: para compararlos hay que
   pasar el cobre a tonelada (×2204.62 libras). Mismo tipo de trampa que el
   spread soja/maíz. */
export const LB_POR_MT = 2204.62;

export function inteligenciaMetales(p, mxn) {
  const cobre = num(p.cobre, 4.18);
  const aluminio = num(p.aluminio, 2400);
  const fx = num(mxn, 18);
  const cobrePct = num(p.cobre_pct);
  const aluminioPct = num(p.aluminio_pct);

  const cobreMT = cobre * LB_POR_MT;
  const ratio = cobreMT / Math.max(aluminio, 1);
  const canastaUsd = cobreMT * 0.35 + aluminio * 0.65;
  const canastaMxn = canastaUsd * fx;

  const movimiento = cobrePct * 0.60 + aluminioPct * 0.40;
  const score = Math.max(0, Math.min(100, Math.round(50 + movimiento * 4.5)));
  const volatilidadMedia = (Math.abs(cobrePct) + Math.abs(aluminioPct)) / 2;
  const capexScore = Math.max(0, Math.min(100, Math.round(50 + movimiento * 3 + (fx - 18) * 5)));

  const amplitud = cobrePct > 0.25 && aluminioPct > 0.25 ? 'Expansiva'
    : cobrePct < -0.25 && aluminioPct < -0.25 ? 'Contractiva' : 'Mixta';

  const lider = Math.abs(cobrePct) >= Math.abs(aluminioPct)
    ? { name: 'cobre', pct: cobrePct } : { name: 'aluminio', pct: aluminioPct };
  const direccion = lider.pct > 0.25 ? `avanza ${lider.pct.toFixed(1)}%`
    : lider.pct < -0.25 ? `corrige ${Math.abs(lider.pct).toFixed(1)}%` : 'permanece estable';

  const mxnFmt = (v) => v.toLocaleString('es-MX', { maximumFractionDigits: 0 });

  return {
    score,
    cobreMT,
    ratio,
    canastaMxn,
    cobreMxnMT: cobreMT * fx,
    aluminioMxnMT: aluminio * fx,
    etiquetaCiclo: score >= 70 ? 'Impulso fuerte · demanda industrial activa'
      : score >= 50 ? 'Expansión moderada · monitoreo de inventarios'
        : score >= 30 ? 'Ciclo débil · amplitud limitada'
          : 'Contracción marcada · cautela en CAPEX',
    amplitud,
    notaAmplitud: amplitud === 'Expansiva' ? 'Ambos metales avanzan en el mes.'
      : amplitud === 'Contractiva' ? 'Ambos metales retroceden en el mes.'
        : 'Los metales muestran direcciones divergentes.',
    volatilidad: volatilidadMedia >= 6 ? 'Alta' : volatilidadMedia >= 2.5 ? 'Media' : 'Baja',
    notaVolatilidad: `Movimiento medio absoluto de ${volatilidadMedia.toFixed(1)}% mensual.`,
    demanda: score >= 65 ? 'Fuerte' : score >= 45 ? 'Neutral' : 'Débil',
    notaDemanda: `Impulso combinado de ${score}/100 en cobre y aluminio.`,
    presionFx: fx >= 20 ? 'Alta' : fx >= 17.5 ? 'Media' : 'Baja',
    riesgoCapex: capexScore >= 67 ? 'Alto' : capexScore >= 44 ? 'Medio' : 'Bajo',
    notaCapex: `Presión estimada de ${capexScore}/100 para nuevas inversiones.`,
    lectura: `El ${lider.name} concentra el mayor movimiento y ${direccion} mensual. `
      + `La amplitud del complejo es ${amplitud.toLowerCase()} y el impulso industrial se ubica en ${score}/100. `
      + `La canasta de infraestructura equivale a $${mxnFmt(canastaMxn)} MXN/MT.`,
    callout: score >= 65
      ? 'El complejo favorece una lectura de demanda activa; revisar inventarios, China y disponibilidad minera antes de contratar CAPEX.'
      : score < 40
        ? 'La señal apunta a menor impulso industrial; escalonar compras y evitar sobreinventario de materiales.'
        : 'El ciclo permanece equilibrado; separar el efecto del metal del traslado cambiario en pesos.',
  };
}

/* Presupuesto de metales: toneladas × precio, con el reparto cobre/aluminio. */
export const PRESUPUESTOS_METAL = {
  light: { cobre: 2, aluminio: 8 },
  medium: { cobre: 5, aluminio: 20 },
  intensive: { cobre: 12, aluminio: 40 },
};

export function calcularPresupuestoMetal({ cobreT, aluminioT, fx }, precios) {
  const precioCobre = num(precios.cobre, 4.18) * LB_POR_MT;
  const precioAluminio = num(precios.aluminio, 2400);
  const costoCobre = cobreT * precioCobre;
  const costoAluminio = aluminioT * precioAluminio;
  const usd = costoCobre + costoAluminio;
  const mxn = usd * fx;
  const parteCobre = usd ? (costoCobre / usd) * 100 : 0;
  const riesgoFx = Math.max(15, Math.min(95, 35 + (fx - 17) * 12));

  return {
    usd,
    mxn,
    estres: mxn * 1.10,
    parteCobre,
    parteAluminio: 100 - parteCobre,
    riesgoFx,
    etiquetaFx: riesgoFx >= 70 ? 'Alta' : riesgoFx >= 45 ? 'Media' : 'Baja',
    resumenSuministro: parteCobre >= 60
      ? 'El cobre concentra la mayor parte del presupuesto; priorizar especificaciones, disponibilidad y cobertura cambiaria.'
      : (100 - parteCobre) >= 70
        ? 'El aluminio domina el volumen; vigilar energía en China, primas físicas y plazos de fundición.'
        : 'La exposición está diversificada entre cobre y aluminio; conviene escalonar ambos materiales y separar el riesgo FX.',
  };
}

/* ── Mercado de proteínas ──────────────────────────────────────────────────
   Los futuros CME cotizan en centavos por libra: ×0.0220462 los pasa a USD/kg.
   El pollo no tiene contrato en el tablero, así que se deriva del maíz y la
   soja, que son sus dos insumos dominantes.

   Los precios se acotan a rangos plausibles (clamp) porque un dato erróneo del
   proveedor produciría un precio de carne absurdo en pantalla. */
const CENTAVOS_LB_A_USD_KG = 0.0220462;
const BU_POR_MT_TRIGO = 36.744;

const acotar = (min, max, v) => Math.max(min, Math.min(max, v));

export function datosProteinas(p, mxn, hogsD, cattleD) {
  const hogs = num(hogsD?.price, 98);
  const cattle = num(cattleD?.price, 186);
  const maiz = num(p.maiz, 4.82);
  const soja = num(p.soja, 342.5);
  const trigo = num(p.trigo, 5.30);
  const sorgo = num(p.sorgo, maiz * 0.92);

  const maizMT = maiz * BU_POR_MT;
  const trigoMT = trigo * BU_POR_MT_TRIGO;
  const sorgoMT = sorgo * BU_POR_MT;

  // Raciones típicas por especie, en USD por tonelada de alimento.
  const raciones = {
    beef: maizMT * 0.65 + sorgoMT * 0.20 + soja * 0.15,
    pork: maizMT * 0.55 + soja * 0.30 + trigoMT * 0.15,
    chicken: maizMT * 0.65 + soja * 0.32 + sorgoMT * 0.03,
  };

  const precios = {
    pork: acotar(1.75, 3.75, hogs * CENTAVOS_LB_A_USD_KG),
    beef: acotar(3.10, 6.25, cattle * CENTAVOS_LB_A_USD_KG),
    chicken: acotar(2.35, 3.75, 2.88 + (maiz - 4.82) * 0.08 + (soja - 342.5) * 0.00035),
  };

  const variacion = {
    pork: num(hogsD?.pct),
    beef: num(cattleD?.pct),
    chicken: num(p.maiz_pct) * 0.65 + num(p.soja_pct) * 0.35,
  };

  // fcr = índice de conversión alimenticia (kg de alimento por kg de carne).
  const economia = {
    pork: { title: 'Porcino de engorda', ration: raciones.pork, fcr: 2.8, fixed: 0.42, corn: 55, soy: 30, other: 15, price: precios.pork, note: 'El alimento suele concentrar la mayor sensibilidad del costo porcino; soja y sanidad definen el riesgo marginal.' },
    chicken: { title: 'Avicultura de engorda', ration: raciones.chicken, fcr: 1.75, fixed: 0.48, corn: 65, soy: 32, other: 3, price: precios.chicken, note: 'La conversión alimenticia amortigua parte del costo, pero maíz, soja, energía y sanidad pueden mover el margen con rapidez.' },
    beef: { title: 'Bovino de engorda', ration: raciones.beef, fcr: 5.8, fixed: 1.55, corn: 65, soy: 15, other: 20, price: precios.beef, note: 'La engorda bovina combina una conversión más larga con exposición a grano, forraje y precio de reposición.' },
  };

  Object.values(economia).forEach((e) => {
    e.feedCost = (e.ration / 1000) * e.fcr;
    e.totalCost = e.feedCost + e.fixed;
    e.margin = e.price - e.totalCost;
    e.feedShare = e.totalCost > 0 ? Math.min(100, (e.feedCost / e.totalCost) * 100) : 0;
  });

  const masBarata = Object.entries(precios).sort((a, b) => a[1] - b[1])[0][0];
  const mejorMargen = Object.entries(economia).sort((a, b) => b[1].margin - a[1].margin)[0];
  const masEficiente = Object.entries(economia).sort((a, b) => a[1].fcr - b[1].fcr)[0][0];
  const presionAlimento = calcIPI(p).score;
  const fx = num(mxn, 17.5);

  const NOMBRE = { pork: 'cerdo', chicken: 'pollo', beef: 'res' };
  const tendencia = presionAlimento >= 60 ? 'una presión elevada'
    : presionAlimento >= 45 ? 'una presión moderada' : 'una presión contenida';

  return {
    precios,
    variacion,
    raciones,
    economia,
    fx,
    presionAlimento,
    etiquetaAlimento: presionAlimento >= 65 ? 'Presión alta: revisar coberturas'
      : presionAlimento >= 45 ? 'Presión moderada: monitoreo activo'
        : 'Presión contenida: entorno favorable',
    masBarata,
    mejorMargen: mejorMargen[0],
    masEficiente,
    ratioCerdoPollo: precios.pork / precios.chicken,
    ratioResCerdo: precios.beef / precios.pork,
    lectura: `El ${NOMBRE[masBarata]} conserva la referencia más competitiva del tablero. `
      + `Maíz y soja reflejan ${tendencia}; el USD/MXN en $${fx.toFixed(2)} seguirá definiendo `
      + 'el traslado del costo internacional a productores mexicanos.',
    lecturaEficiencia: `El ${NOMBRE[masEficiente]} presenta la menor conversión alimenticia del comparativo. `
      + 'La rentabilidad final depende también de precio de venta, mortalidad, energía, sanidad y duración del ciclo.',
  };
}

export const NOMBRE_ESPECIE = { pork: 'Cerdo', chicken: 'Pollo', beef: 'Res' };

/* ── Noticias ──────────────────────────────────────────────────────────────
   Clasificación por palabras clave: gana la categoría con más coincidencias en
   el titular; si ninguna acierta, la descripción es el segundo intento. */
const PALABRAS_MKT = {
  granos: ['corn', 'maiz', 'soybean', 'soja', 'wheat', 'trigo', 'grain', 'grano', 'cbot', 'usda', 'wasde', 'harvest', 'cosecha', 'crop', 'feedlot', 'forraje', 'canola'],
  energia: ['oil', 'wti', 'brent', 'crude', 'petróleo', 'diesel', 'gas natural', 'natural gas', 'opec', 'energy', 'energía', 'fuel', 'gasolina', 'shale', 'barrel', 'lng'],
  metales: ['copper', 'cobre', 'gold', 'oro', 'silver', 'plata', 'aluminum', 'aluminio', 'metal', 'lme', 'steel', 'acero', 'nickel', 'zinc', 'mining', 'minería'],
  logistica: ['shipping', 'freight', 'logistics', 'flete', 'bdi', 'baltic', 'container', 'contenedor', 'port', 'puerto', 'supply chain', 'cargo', 'transport', 'maritime'],
  divisas: ['dollar', 'dólar', 'peso', 'forex', 'currency', 'mxn', 'usd', 'euro', 'yen', 'exchange rate', 'tipo de cambio', 'dxy', 'divisa'],
  macro: ['gdp', 'pib', 'interest rate', 'tasa', 'fed', 'federal reserve', 'central bank', 'inflation', 'inflación', 'economy', 'economía', 'tariff', 'arancel', 'cpi'],
};

export const ETIQUETA_CATEGORIA = {
  granos: '🌽 Granos', energia: '🛢 Energía', metales: '🔩 Metales',
  logistica: '🚢 Logística', divisas: '💱 Divisas', macro: '📊 Macro',
};

export function clasificarNoticia(texto) {
  if (!texto) return null;
  const t = texto.toLowerCase();
  let mejor = null;
  let puntos = 0;
  for (const [cat, palabras] of Object.entries(PALABRAS_MKT)) {
    const s = palabras.reduce((acc, w) => acc + (t.includes(w) ? 1 : 0), 0);
    if (s > puntos) { puntos = s; mejor = cat; }
  }
  return puntos > 0 ? mejor : null;
}

const RE_ALTO = /crash|colapso|crisis|record|surge|spike|dispara|máximo|mínimo|ban|war|guerra|sanción|sanction|opec|cut|recorte/;
const RE_MEDIO = /rise|fall|increase|decrease|sube|baja|alza|caída|report|dato|cpi|fed|opec|inventario/;

export function impactoNoticia(articulo) {
  const t = `${articulo.title || ''} ${articulo.desc || ''}`.toLowerCase();
  if (RE_ALTO.test(t)) return { color: '#dc2626', etiqueta: '▲ ALTO' };
  if (RE_MEDIO.test(t)) return { color: '#d97706', etiqueta: '◆ MEDIO' };
  return { color: '#2563eb', etiqueta: '● MONITOREO' };
}

/* Solo se aceptan imágenes con URL absoluta http(s): las relativas del feed
   apuntan al dominio del medio y romperían igual. */
export function imagenValida(u) {
  return typeof u === 'string' && /^https?:\/\//i.test(u);
}

/* ── Perspectiva a 2-4 semanas ─────────────────────────────────────────────
   La dirección sale de la variación mensual; la confianza baja a la mitad
   cuando el precio es de referencia y no una cotización real (`_real`). */
const direccionPct = (pct) => {
  const n = num(pct);
  return n > 1.5 ? 'alcista' : n < -1.5 ? 'bajista' : 'lateral';
};

export const ETIQUETA_DIRECCION = { alcista: '↑ ALCISTA', bajista: '↓ BAJISTA', lateral: '→ LATERAL' };

const etiquetaConfianza = (v) => (v > 0.7 ? 'Confianza alta' : v > 0.4 ? 'Confianza media' : 'Señal débil');

export function perspectiva(p, mxn) {
  const fila = (name, valor, unidad, decimales, dir, conf, driver) => ({
    name,
    price: valor ? `$${num(valor).toFixed(decimales)}${unidad}` : '—',
    dir,
    driver,
    confianza: etiquetaConfianza(conf),
  });

  const fx = num(mxn);
  return [
    fila('Maíz CME', p.maiz, '/bu', 2, direccionPct(p.maiz_pct), p.maiz_real ? 0.75 : 0.35, 'WASDE USDA · demanda China'),
    fila('Soja CME', p.soja, '/MT', 2, direccionPct(p.soja_pct), p.soja_real ? 0.72 : 0.35, 'Exportaciones Brasil · crush margin'),
    fila('Trigo CBOT', p.trigo, '/bu', 2, direccionPct(p.trigo_pct), p.trigo_real ? 0.60 : 0.30, 'Geopolítica Mar Negro · clima'),
    fila('WTI Crude', p.wti, '/bbl', 2, direccionPct(p.wti_pct), p.wti_real ? 0.78 : 0.40, 'OPEP+ · inventarios EIA'),
    fila('Gas Natural', p.gasnat, '/MMBtu', 3, direccionPct(p.gasnat_pct), p.gasnat_real ? 0.65 : 0.35, 'Clima · exportaciones LNG EUA'),
    fila('USD/MXN', mxn, '', 4, fx > 18.5 ? 'alcista' : fx < 17 ? 'bajista' : 'lateral', 0.60, 'Diferencial tasas Banxico–Fed'),
  ];
}

/* Boletines propios: cuando los proveedores de noticias no responden, la
   sección sigue teniendo lectura de mercado construida con los precios reales.
   Van marcados con `brief: true` y fuente "VALL", nunca como nota de agencia. */
export function boletinesGranos(p, mxn, hora) {
  const mov = (nombre, precio, pct, unidad) => ({
    title: `${nombre} ${num(pct) >= 0 ? 'avanza' : 'corrige'} ${Math.abs(num(pct)).toFixed(1)}%: referencia en $${num(precio).toFixed(2)}${unidad}`,
    desc: `${nombre} registra una variación mensual de ${num(pct) >= 0 ? '+' : ''}${num(pct).toFixed(2)}%. `
      + 'La señal se incorpora al costo de alimento y a las decisiones de cobertura del complejo pecuario.',
    src: 'VALL Mercado', fecha: hora, url: '', image: '', brief: true,
  });
  const canasta = num(p.maiz) * BU_POR_MT * 0.6 + num(p.soja) * 0.4;
  return [
    mov('Maíz CME', p.maiz, p.maiz_pct, '/bu'),
    mov('Soja CME', p.soja, p.soja_pct, '/MT'),
    mov('Trigo CBOT', p.trigo, p.trigo_pct, '/bu'),
    mov('Sorgo forrajero', p.sorgo, p.sorgo_pct, '/bu'),
    {
      title: `Canasta pecuaria indicativa en $${canasta.toFixed(0)}/MT`,
      desc: `La mezcla de 60% maíz y 40% soja equivale a ${mxn ? `$${(canasta * num(mxn)).toFixed(0)} MXN/MT` : `una referencia internacional de $${canasta.toFixed(0)}/MT`}. Es una guía comparativa, no una cotización física.`,
      src: 'VALL Intelligence', fecha: hora, url: '', image: '', brief: true,
    },
  ];
}

export function boletinesEnergia(p, mxn, hora) {
  const diesel = num(p.diesel);
  const gas = num(p.gasnat);
  const flete = diesel * 8.5;
  const canasta = diesel * 50 + gas * 5;
  const mov = (nombre, precio, pct, unidad, decimales, efecto) => ({
    title: `${nombre} ${num(pct) >= 0 ? 'avanza' : 'corrige'} ${Math.abs(num(pct)).toFixed(1)}%: referencia en $${num(precio).toFixed(decimales)}${unidad}`,
    desc: `${nombre} registra una variación mensual de ${num(pct) >= 0 ? '+' : ''}${num(pct).toFixed(2)}%. ${efecto}`,
    src: 'VALL Mercado', fecha: hora, url: '', image: '', brief: true,
  });
  return [
    mov('Petróleo WTI', p.wti, p.wti_pct, '/bbl', 2, 'Su movimiento se transmite a combustibles, petroquímica y tarifas logísticas.'),
    mov('Gas Natural Henry Hub', p.gasnat, p.gasnat_pct, '/MMBtu', 3, 'Es clave para calefacción, secado, electricidad y producción de fertilizantes.'),
    mov('Diesel ULSD estimado', p.diesel, p.diesel_pct, '/gal', 2, 'Determina el costo directo de maquinaria, transporte y cadena fría.'),
    {
      title: `Flete terrestre de referencia en ~$${flete.toFixed(0)} MXN por tonelada cada 100 km`,
      desc: 'Estimación basada en el precio del diesel. Peajes, retorno vacío, seguridad, disponibilidad y condiciones regionales pueden modificar la tarifa final.',
      src: 'VALL Logística', fecha: hora, url: '', image: '', brief: true,
    },
    {
      title: `Canasta operativa energética en $${canasta.toFixed(0)}/día indicativo`,
      desc: `La combinación de diesel y gas equivale a ${mxn ? `$${(canasta * num(mxn)).toFixed(0)} MXN/día` : `una referencia internacional de $${canasta.toFixed(0)}/día`}.`,
      src: 'VALL Intelligence', fecha: hora, url: '', image: '', brief: true,
    },
  ];
}

/* Formato corto para cifras grandes de presupuesto. */
export function montoCorto(v) {
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)} M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)} mil`;
  return `$${v.toFixed(0)}`;
}

/* Precio equivalente en MXN por tonelada. Las cotizaciones en /bu se convierten
   a tonelada; las que ya vienen en /MT solo se multiplican por el tipo de
   cambio. */
export function precioMxnPorTonelada(precio, mxn, unidad) {
  if (!mxn || precio == null) return null;
  const factor = unidad === '/MT' ? 1 : BU_POR_MT;
  return num(precio) * num(mxn) * factor;
}
