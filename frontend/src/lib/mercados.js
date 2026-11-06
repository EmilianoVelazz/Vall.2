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
  /* Se devuelve un TONO, no un color. El color vive en Mercados.css (.tono-*),
     que es lo unico que build-dark-theme.mjs puede leer para emitir su version
     oscura; un hex devuelto desde aqui acababa en un style en linea, invisible
     para el generador e imposible de sobrescribir. */
  const tono = score >= 75 ? 'critico' : score >= 60 ? 'alto' : score >= 45 ? 'medio' : score >= 30 ? 'estable' : 'bajo';
  const label = score >= 75 ? '🔴 CRÍTICO — Revisión inmediata de contratos'
    : score >= 60 ? '🟠 ALTO — Presión relevante en costos'
      : score >= 45 ? '🟡 MODERADO — Monitoreo activo'
        : score >= 30 ? '🔵 BAJO — Condiciones favorables'
          : '🟢 MUY BAJO — Oportunidad de cobertura';
  return { score, tono, label };
}

/* Etiqueta de impacto por commodity. Los metales se leen al revés que los
   insumos: para cobre y aluminio una subida es señal de demanda industrial
   (buena), mientras que en maíz o diesel es presión de costo (mala). */
export function impactoLabel(tipo, pct) {
  const c = num(pct);
  /* Igual que calcIPI: se devuelve el tono y el color lo pone .tono-* en la
     hoja, para que el tema oscuro pueda generarse. */
  if (tipo === 'cobre' || tipo === 'aluminio') {
    if (c > 2.5) return { lbl: '📈 SEÑAL ↑', tono: 'bajo', nota: 'Demanda industrial activa' };
    if (c >= -0.3) return { lbl: '⚖️ ÍNDICE', tono: 'indice', nota: 'Mercado lateral' };
    return { lbl: '📉 SEÑAL ↓', tono: 'critico', nota: 'Moderación en manufactura' };
  }
  const flecha = c > 0.2 ? '↑' : c < -0.2 ? '↓' : '→';
  if (c > 4) return { lbl: `🔴 CRÍTICO ${flecha}`, tono: 'critico', nota: 'Alza fuerte — revisar contratos' };
  if (c > 1.5) return { lbl: `🟠 ALTO ${flecha}`, tono: 'alto', nota: 'Tendencia alcista activa' };
  if (c > 0.3) return { lbl: `🟡 ALZA ${flecha}`, tono: 'medio', nota: 'Incremento leve' };
  if (c >= -0.3) return { lbl: `🔵 ESTABLE ${flecha}`, tono: 'estable', nota: 'Sin cambio relevante' };
  if (c >= -1.5) return { lbl: `🟢 BAJA ${flecha}`, tono: 'bajo', nota: 'Corrección favorable' };
  return { lbl: `🟢 CAÍDA ${flecha}`, tono: 'caida', nota: 'Descenso pronunciado' };
}

/* Color de celda del mapa de calor según la variación mensual.
 *
 * La escala mantiene su sentido: aquí una SUBIDA es mala (encarece el insumo),
 * así que va al rojo, y una bajada al verde. Lo que cambia son los tonos, ahora
 * derivados de la paleta oscura de la sección en vez de los rojos y verdes
 * saturados del tema claro. Son fondos, y encima va texto claro, así que se
 * quedan en la franja oscura de cada matiz para no perder ese contraste. */
export function colorCalor(pct) {
  if (pct == null) return 'linear-gradient(135deg,#243142,#334355)';
  const n = num(pct);
  if (n > 3) return 'linear-gradient(135deg,#5c2230,#8f3346)';
  if (n > 1.5) return 'linear-gradient(135deg,#5e3320,#8a4a2e)';
  if (n > 0.3) return 'linear-gradient(135deg,#54401e,#7d6029)';
  if (n >= -0.3) return 'linear-gradient(135deg,#243142,#334355)';
  if (n >= -1.5) return 'linear-gradient(135deg,#1d4a3e,#2c6b58)';
  if (n >= -3) return 'linear-gradient(135deg,#17423a,#226051)';
  return 'linear-gradient(135deg,#123a30,#1b5546)';
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

/* Gramos de proteína por kilo de producto comestible crudo, de las tablas de
   composición de alimentos (USDA FoodData Central): cerdo y res magros, pollo
   sin piel, huevo entero. Es la constante que permite comparar el precio de las
   cuatro especies en la misma unidad. */
const PROTEINA_POR_KG = { pork: 205, chicken: 210, beef: 213, egg: 126 };
export { PROTEINA_POR_KG };

const acotar = (min, max, v) => Math.max(min, Math.min(max, v));

export function datosProteinas(
  p, mxn, hogsD, cattleD, sniimData = null, firstSaleData = null, commercialPrices = null,
  requireLocalCommercialPrice = false,
) {
  const fx = num(mxn, 17.5);
  const hogs = num(hogsD?.price, 98);
  const cattle = num(cattleD?.price, 186);
  const maiz = num(p.maiz, 4.82);
  const soja = num(p.soja, 342.5);
  const trigo = num(p.trigo, 5.30);
  const sorgo = num(p.sorgo, maiz * 0.92);

  const maizMT = maiz * BU_POR_MT;
  const trigoMT = trigo * BU_POR_MT_TRIGO;
  const sorgoMT = sorgo * BU_POR_MT;

  const racionesUSD = {
    beef: maizMT * 0.65 + sorgoMT * 0.20 + soja * 0.15,
    pork: maizMT * 0.55 + soja * 0.30 + trigoMT * 0.15,
    chicken: maizMT * 0.65 + soja * 0.32 + sorgoMT * 0.03,
    egg: maizMT * 0.62 + soja * 0.26 + trigoMT * 0.12,
  };
  const raciones = Object.fromEntries(
    Object.entries(racionesUSD).map(([k, v]) => [k, v * fx]),
  );

  /* El tablero muestra primera comercialización, no cortes ni precio al
     consumidor. Gemini consulta fuentes web cada 24 h para el nivel comercial
     exacto solicitado; SNIIM permanece como respaldo verificable cuando la
     actualización diaria no logra validar las cuatro especies. */
  const mercado = commercialPrices?.available && commercialPrices?.prices
    ? commercialPrices.prices
    : (firstSaleData?.prices || {});
  const precioOficial = (especie) => {
    if (requireLocalCommercialPrice && !mercado[especie]?.available) return null;
    const valor = Number(mercado[especie]?.price);
    return Number.isFinite(valor) && valor > 0 ? valor : null;
  };

  let precioCerdoMXN = precioOficial('pork');
  if (!precioCerdoMXN && !requireLocalCommercialPrice) precioCerdoMXN = acotar(1.75, 3.75, hogs * CENTAVOS_LB_A_USD_KG) * fx;

  let precioResMXN = precioOficial('beef');
  if (!precioResMXN && !requireLocalCommercialPrice) precioResMXN = acotar(3.10, 6.25, cattle * CENTAVOS_LB_A_USD_KG) * fx;

  const precioPolloEstUSD = (m, s) => acotar(2.35, 3.75, 2.88 + (m - 4.82) * 0.08 + (s - 342.5) * 0.00035);
  let precioPolloMXN = precioOficial('chicken');
  if (!precioPolloMXN && !requireLocalCommercialPrice) precioPolloMXN = precioPolloEstUSD(maiz, soja) * fx;

  const precioHuevoEstUSD = (m, s) => acotar(1.55, 3.60, 2.15 + (m - 4.82) * 0.09 + (s - 342.5) * 0.0004);
  let precioHuevoMXN = precioOficial('egg');
  if (!precioHuevoMXN && !requireLocalCommercialPrice) precioHuevoMXN = precioHuevoEstUSD(maiz, soja) * fx;

  const precios = {
    pork: precioCerdoMXN,
    beef: precioResMXN,
    chicken: precioPolloMXN,
    egg: precioHuevoMXN,
  };

  const variacion = { pork: null, beef: null, chicken: null, egg: null };
  const variacion3m = { pork: null, beef: null, chicken: null, egg: null };

  const real = {
    pork: precioOficial('pork') != null,
    beef: precioOficial('beef') != null,
    chicken: precioOficial('chicken') != null,
    egg: precioOficial('egg') != null,
  };

  const _ml_verified = !!sniimData?.is_ml_verified;

  // No se dibuja una tendencia con contratos o fórmulas distintas al precio
  // físico. La serie se añadirá sólo cuando se guarde histórico homogéneo SNIIM.
  const historial = { pork: null, beef: null, chicken: null, egg: null };

  // fcr = índice de conversión alimenticia (kg de alimento por kg de carne).
  const economia = {
    pork: { title: 'Porcino de engorda', ration: raciones.pork, fcr: 2.8, fixed: 0.42, corn: 55, soy: 30, other: 15, price: precios.pork, note: 'El alimento suele concentrar la mayor sensibilidad del costo porcino; soja y sanidad definen el riesgo marginal.' },
    chicken: { title: 'Avicultura de engorda', ration: raciones.chicken, fcr: 1.75, fixed: 0.48, corn: 65, soy: 32, other: 3, price: precios.chicken, note: 'La conversión alimenticia amortigua parte del costo, pero maíz, soja, energía y sanidad pueden mover el margen con rapidez.' },
    beef: { title: 'Bovino de engorda', ration: raciones.beef, fcr: 5.8, fixed: 1.55, corn: 65, soy: 15, other: 20, price: precios.beef, note: 'La engorda bovina combina una conversión más larga con exposición a grano, forraje y precio de reposición.' },
    /* La ponedora no se engorda: convierte alimento en huevo durante todo el
       ciclo de postura. Su fcr —kg de alimento por kg de huevo— queda entre el
       del pollo y el del cerdo, y sus costos fijos incluyen la amortización de
       la pollita, que no existe en las otras tres. */
    egg: { title: 'Gallina ponedora', ration: raciones.egg, fcr: 2.2, fixed: 0.5, corn: 62, soy: 26, other: 12, price: precios.egg, note: 'El huevo es la proteína animal más barata por kilo y la más expuesta al grano: la ponedora come todo el año y no se vende como carne al cerrar el ciclo.' },
  };

  Object.values(economia).forEach((e) => {
    /* `fixed` es la única cifra de esta tabla escrita a mano, y va en dólares
       (mano de obra, sanidad, amortización). `ration` y `price` ya entraron
       convertidos, así que este es el último dólar que queda por pasar. */
    e.fixed *= fx;
    e.feedCost = (e.ration / 1000) * e.fcr;
    e.totalCost = e.feedCost + e.fixed;
    e.margin = Number.isFinite(e.price) ? e.price - e.totalCost : null;
    e.feedShare = e.totalCost > 0 ? Math.min(100, (e.feedCost / e.totalCost) * 100) : 0;
  });

  const especiesConPrecio = Object.entries(precios).filter(([, precio]) => Number.isFinite(precio));
  const masBarata = especiesConPrecio.sort((a, b) => a[1] - b[1])[0]?.[0] || null;
  const mejorMargen = Object.entries(economia).filter(([, item]) => Number.isFinite(item.margin))
    .sort((a, b) => b[1].margin - a[1].margin)[0] || null;
  const masEficiente = Object.entries(economia).sort((a, b) => a[1].fcr - b[1].fcr)[0][0];
  const presionAlimento = calcIPI(p).score;

  const NOMBRE = { pork: 'cerdo', chicken: 'pollo', beef: 'res', egg: 'huevo' };

  /* Cuánto del precio de venta se lo lleva el alimento, por especie. Es la
     lectura que ordena el tablero por VULNERABILIDAD y no por margen: dos
     especies con el mismo margen no corren el mismo riesgo si en una el grano
     pesa el 40% del precio y en la otra el 75%. */
  const exposicionGrano = Object.fromEntries(
    Object.entries(economia).map(([k, e]) => [k, e.price > 0 ? (e.feedCost / e.price) * 100 : 0]),
  );
  const masExpuesta = Object.entries(exposicionGrano).sort((a, b) => b[1] - a[1])[0][0];

  /* Precio por kilo de PROTEÍNA, no de producto. Comparar $/kg entre especies
     engaña: un kilo de huevo trae 126 g de proteína y uno de res 213, así que
     el huevo parece mucho más barato de lo que es en la única unidad que de
     verdad se compra, que es la proteína. */
  const costoProteina = Object.fromEntries(
    Object.entries(precios).map(([k, v]) => [k, Number.isFinite(v) ? v / (PROTEINA_POR_KG[k] / 1000) : null]),
  );
  const proteinaMasBarata = Object.entries(costoProteina).filter(([, precio]) => Number.isFinite(precio))
    .sort((a, b) => a[1] - b[1])[0]?.[0] || null;

  return {
    precios,
    variacion,
    variacion3m,
    historial,
    real,
    mercado,
    raciones,
    economia,
    fx,
    presionAlimento,
    etiquetaAlimento: presionAlimento >= 65 ? 'Presión alta: revisar coberturas'
      : presionAlimento >= 45 ? 'Presión moderada: monitoreo activo'
        : 'Presión contenida: entorno favorable',
    masBarata,
    mejorMargen: mejorMargen?.[0] || null,
    masEficiente,
    ratioCerdoPollo: Number.isFinite(precios.pork) && Number.isFinite(precios.chicken) ? precios.pork / precios.chicken : null,
    ratioResCerdo: Number.isFinite(precios.beef) && Number.isFinite(precios.pork) ? precios.beef / precios.pork : null,
    /* Cuántos kilos de huevo compra el precio de un kilo de res. Es la brecha
       más ancha del tablero y la que explica la sustitución cuando el ingreso
       de los hogares se aprieta. */
    ratioResHuevo: Number.isFinite(precios.beef) && Number.isFinite(precios.egg) ? precios.beef / precios.egg : null,
    exposicionGrano,
    masExpuesta,
    costoProteina,
    proteinaMasBarata,
    lectura: commercialPrices?.available
      ? `Cotizaciones físicas de Puebla, Puebla: ${especiesConPrecio.length} de 4 verificadas. Se actualizan cada 12 horas; no se sustituyen faltantes con futuros ni estimaciones.`
      : 'No hay un corte local verificable disponible. Esta vista no sustituye precios de Puebla con futuros ni estimaciones.',
    lecturaEficiencia: `El ${NOMBRE[masEficiente]} presenta la menor conversión alimenticia del comparativo. `
      + 'La rentabilidad final depende también de precio de venta, mortalidad, energía, sanidad y duración del ciclo.',
    lecturaExposicion: `En el ${NOMBRE[masExpuesta]}, el alimento se lleva el `
      + `${exposicionGrano[masExpuesta].toFixed(0)}% del precio de venta: es la especie que más sufre `
      + 'una subida del maíz y la soja, y la primera que hay que cubrir.',
  };
}

export const NOMBRE_ESPECIE = { pork: 'Cerdo', chicken: 'Pollo', beef: 'Res', egg: 'Huevo' };

/** Las cuatro especies, en el orden en que se leen en la sección. */
export const ESPECIES_PROTEINA = ['pork', 'chicken', 'beef', 'egg'];

/** Clave de la especie -> clave del catálogo de volúmenes de la FAO. */
export const ESPECIE_A_FAO = { pork: 'cerdo', chicken: 'pollo', beef: 'res', egg: 'huevo' };

/* ── Cobertura con opciones (Granos y forrajes) ────────────────────────────
   Las dos mitades del mismo mercado, porque en granos hay dos miedos opuestos
   y cada uno se cubre con una opción distinta:

   · PUT — lo compra QUIEN VENDE (el productor). Pone un SUELO al precio de
     venta: cobra la caída si el mercado se hunde y conserva la subida si no.
   · CALL — lo compra QUIEN COMPRA (el importador, el engordador, el molino).
     Pone un TECHO al precio de compra: cobra la subida si el mercado se
     dispara y conserva la baja si no.

   El call no es un adorno simétrico: México importa la mayor parte del maíz
   amarillo y de la pasta de soja que consume, así que en esta sección el lado
   comprador es el que más lectores tiene. La sección ya enseñaba el precio y
   su volatilidad, pero no lo que cuesta protegerse de ella en ninguno de los
   dos sentidos, que es la única decisión accionable que había pendiente aquí.

   ── Qué modelo y por qué ────────────────────────────────────────────────────
   Black-76, no Black-Scholes. Las opciones de grano del CME son opciones SOBRE
   EL FUTURO, no sobre el físico: el subyacente no paga acarreo ni almacenaje y
   ya lleva el costo de financiamiento dentro de su propio precio. Black-76 es
   exactamente Black-Scholes con el forward en lugar del contado, y descontando
   la prima entera:

       d1    = [ln(F/K) + (σ²/2)·T] / (σ·√T)
       d2    = d1 − σ·√T
       Put   = e^(−r·T) · [ K·N(−d2) − F·N(−d1) ]
       Call  = e^(−r·T) · [ F·N(d1) − K·N(d2) ]

   ── Los DOS límites del resultado, que la vista tiene que decir ─────────────
   1. Es una prima TEÓRICA, no una cotización. No hay ningún feed de primas de
      opciones en el proyecto: el mercado real cobra más (horquilla y sesgo de
      volatilidad, que en grano encarece los dos extremos: los strikes bajos
      que compra el productor y los altos que compra el importador).
   2. Black-76 valora una opción EUROPEA y las del CME son americanas. Sobre
      futuros el ejercicio anticipado tiene valor en las dos, así que esto es
      un SUELO del precio de la prima, nunca un techo.
   Las dos van escritas en el pie de los dos simuladores. */

/* N(x) de la normal estándar. Se implementa aquí porque JavaScript no trae
   función de error: es la aproximación de Zelen & Severo (Abramowitz & Stegun
   26.2.17), con error absoluto por debajo de 7.5e-8 — cuatro órdenes de
   magnitud por debajo de lo que cualquier redondeo de esta pantalla enseña. */
function normalCDF(x) {
  const signo = x < 0 ? -1 : 1;
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  /* Polinomio de A&S evaluado por Horner, con los cinco coeficientes en el
     orden inverso al de la tabla (a5 primero) para poder cotejarlos con ella. */
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t
    + 0.254829592) * t * Math.exp(-z * z);
  return 0.5 * (1 + signo * erf);
}

/* Todo lo que la página cotiza y tiene opciones en Chicago, granos y ganado en
   el mismo catálogo porque el simulador es el mismo y solo cambia la aritmética
   de la unidad.
 *
 * Los TRES campos numéricos existen porque son tres cosas distintas que antes
 * cargaba un solo `buPorMT`, y confundirlas es el error silencioso de este
 * bloque —da un precio plausible pero equivocado—:
 *
 *   · `factorPrecio`  lleva el precio COTIZADO a dólares por tonelada. Cada
 *     mercado cotiza en lo suyo: el maíz y el trigo en dólares por bushel, la
 *     soja ya en dólares por tonelada (factor 1) y el ganado en CENTAVOS por
 *     libra, que además de cambiar de unidad cambia de escala —de ahí el /100—.
 *     Sin esto, la soja se valoraría con un futuro 37 veces mayor del que es y
 *     el cerdo con uno 100 veces menor.
 *   · `porMT` son cuántas unidades cotizadas caben en una tonelada, y sirve
 *     para el tamaño del contrato. En la soja NO coincide con factorPrecio: se
 *     cotiza por tonelada pero el contrato sigue siendo de 5 000 bushels.
 *   · `unidadesPorContrato` es el contrato del CME: 5 000 bushels en los tres
 *     granos, 40 000 libras en cerdo y res.
 *
 * `unidad` en null significa «ya se cotiza por tonelada» y la vista se ahorra
 * la línea de conversión. `de` existe porque la soja y la res son femeninas y
 * los demás masculinos: sin él, la ayuda escribía «la histórica del soja». */
export const SUBYACENTES_OPCION = {
  maiz: {
    familia: 'granos', nombre: 'Maíz', de: 'del maíz',
    unidad: 'bu', unidadLarga: 'bushels', porMT: BU_POR_MT,
    factorPrecio: BU_POR_MT, unidadesPorContrato: 5000,
  },
  trigo: {
    familia: 'granos', nombre: 'Trigo', de: 'del trigo',
    unidad: 'bu', unidadLarga: 'bushels', porMT: BU_POR_MT_TRIGO,
    factorPrecio: BU_POR_MT_TRIGO, unidadesPorContrato: 5000,
  },
  soja: {
    familia: 'granos', nombre: 'Soja', de: 'de la soja',
    unidad: null, unidadLarga: 'bushels', porMT: 36.7437,
    factorPrecio: 1, unidadesPorContrato: 5000,
  },
  cerdo: {
    familia: 'proteinas', nombre: 'Cerdo', de: 'del cerdo',
    unidad: 'lb', unidadLarga: 'libras', porMT: LB_POR_MT,
    factorPrecio: LB_POR_MT / 100, unidadesPorContrato: 40000,
  },
  res: {
    familia: 'proteinas', nombre: 'Res', de: 'de la res',
    unidad: 'lb', unidadLarga: 'libras', porMT: LB_POR_MT,
    factorPrecio: LB_POR_MT / 100, unidadesPorContrato: 40000,
  },
};

/** Los subyacentes de una familia, en el orden del catálogo. */
export function subyacentesDe(familia) {
  return Object.entries(SUBYACENTES_OPCION).filter(([, s]) => s.familia === familia);
}

/* El precio en la unidad en la que lo publica el mercado. El símbolo va donde
   lo pone cada uno: el grano en dólares delante ($5.42/bu) y el ganado en
   centavos detrás (98.00¢/lb), que es como los escribe el CME. */
export function precioEnUnidad(unidad, valor, dec = 2) {
  if (!unidad || !Number.isFinite(valor)) return null;
  return unidad === 'bu' ? `$${valor.toFixed(dec)}/bu` : `${valor.toFixed(dec)}¢/lb`;
}

/* Volatilidad anualizada a partir de la serie mensual que ya trae cada precio.
   Es volatilidad HISTÓRICA, no implícita: la implícita se lee de las primas del
   mercado y aquí no hay de dónde. Devuelve null —y no un número inventado— si
   la serie no da para calcularla; la vista lo dice y deja el control al usuario.

   `commodityWithPct` guarda seis puntos, así que salen cinco rendimientos: es
   poco y el resultado se mueve bastante de un mes a otro. Por eso el valor
   entra como PUNTO DE PARTIDA de un control y no como una constante. */
export function volatilidadHistorica(serie) {
  if (!Array.isArray(serie) || serie.length < 4) return null;
  const rend = [];
  for (let i = 1; i < serie.length; i++) {
    const previo = Number(serie[i - 1]);
    const actual = Number(serie[i]);
    if (!(previo > 0) || !(actual > 0)) return null;
    rend.push(Math.log(actual / previo));
  }
  const media = rend.reduce((s, v) => s + v, 0) / rend.length;
  const varianza = rend.reduce((s, v) => s + (v - media) ** 2, 0) / (rend.length - 1);
  if (!(varianza > 0)) return null;
  return Math.sqrt(varianza * 12) * 100; // mensual → anual, en %
}

/** Black-76 sobre futuros, put o call. Devuelve null si los datos no valen. */
export function primaOpcion(tipo, futuro, strike, anios, volPct, tasaPct) {
  const sigma = volPct / 100;
  const r = tasaPct / 100;
  if (!(futuro > 0) || !(strike > 0) || !(anios > 0) || !(sigma > 0)) return null;
  const sigmaT = sigma * Math.sqrt(anios);
  const d1 = (Math.log(futuro / strike) + (sigma * sigma / 2) * anios) / sigmaT;
  const d2 = d1 - sigmaT;
  const descuento = Math.exp(-r * anios);

  /* d1 y d2 son los MISMOS para las dos: lo único que cambia es de qué lado de
     la normal se mira. Por eso están fuera del if y no duplicados en cada rama
     —si se duplican, un retoque en uno de los dos se olvida en el otro y las
     dos mitades del panel dejan de cuadrar sin que nada falle a la vista. */
  if (tipo === 'call') {
    return {
      prima: descuento * (futuro * normalCDF(d1) - strike * normalCDF(d2)),
      /* Delta del call: entre 0 y +1, el signo contrario al del put. Es cuántas
         toneladas de futuro replica la opción, y de ahí sale la lectura de
         «cuánto de la subida cubre ahora mismo». */
      delta: descuento * normalCDF(d1),
      probEjercicio: normalCDF(d2) * 100,
    };
  }
  return {
    prima: descuento * (strike * normalCDF(-d2) - futuro * normalCDF(-d1)),
    /* Delta del put respecto al futuro: entre 0 y −1. Es cuántas toneladas de
       futuro replica la opción, y de ahí sale la lectura de «cuánto de la caída
       cubre ahora mismo». */
    delta: -descuento * normalCDF(-d1),
    /* N(−d2) es la probabilidad NEUTRAL AL RIESGO de acabar bajo el strike, que
       no es la probabilidad del mundo real. Se enseña porque es la que el
       propio precio de la opción implica, y así se etiqueta. El call usa
       N(d2), que es la misma lectura por el otro lado. */
    probEjercicio: normalCDF(-d2) * 100,
  };
}

/*
 * Simulación completa de la cobertura, en dólares POR TONELADA.
 *
 * Todo se lleva a tonelada aunque el maíz cotice por bushel y el cerdo por
 * libra: el volumen que un comprador mexicano tiene en la cabeza son toneladas,
 * y las dos secciones que usan esto —la matriz de plazas y el balance de
 * Granos, los volúmenes de la FAO en Proteínas— ya razonan en toneladas.
 */
export function simularOpcion({ tipo = 'put', subyacente, precio, strikePct, meses, vol, tasa, toneladas, fx }) {
  const c = SUBYACENTES_OPCION[subyacente];
  const p = num(precio);
  if (!c || !(p > 0)) return null;
  const esCall = tipo === 'call';

  const factor = c.factorPrecio;
  const futuroMT = p * factor;
  const strikeMT = futuroMT * (strikePct / 100);
  const anios = meses / 12;
  const o = primaOpcion(tipo, futuroMT, strikeMT, anios, vol, tasa);
  if (!o) return null;

  /* El límite REAL no es el strike: la prima se paga igual, así que empeora el
     resultado en los dos casos. Es la cifra que decide la cobertura y la que un
     folleto suele omitir. Ojo con el signo, que es lo único que se puede
     equivocar aquí sin que nada falle a la vista:
       put  → piso  = strike − prima  (lo MÍNIMO que acaba cobrando el que vende)
       call → techo = strike + prima  (lo MÁXIMO que acaba pagando el que compra)
     Restar en el call daría un techo por debajo del strike, que es imposible. */
  const limiteMT = esCall ? strikeMT + o.prima : strikeMT - o.prima;
  const costoTotal = o.prima * num(toneladas);

  /* Escenarios al vencimiento. `efectivo` es lo que acaba cobrando o pagando
     por la tonelada quien compró la opción.

     Los movimientos no son los mismos en las dos: cada una se compra por un
     miedo distinto y la tabla tiene que enseñar el caso que ese miedo teme. Al
     productor le importa el −30%; al comprador, el +30%. Una tabla de put con
     subidas no dice nada, y una de call con caídas tampoco. */
  const movs = esCall ? [-10, 0, 10, 20, 30] : [-30, -20, -10, 0, 10];
  const escenarios = movs.map((mov) => {
    const futuroFinal = futuroMT * (1 + mov / 100);
    const pago = esCall
      ? Math.max(futuroFinal - strikeMT, 0)
      : Math.max(strikeMT - futuroFinal, 0);
    return {
      mov,
      futuroFinal,
      pago,
      /* El put SUMA lo que paga la opción y RESTA la prima porque su dueño
         cobra; el call las invierte porque su dueño paga. Con el mismo signo
         en las dos, el call daría un «costo» que baja cuando el mercado sube. */
      efectivo: esCall
        ? futuroFinal - pago + o.prima
        : futuroFinal + pago - o.prima,
      sinCobertura: futuroFinal,
    };
  });

  /* Las tres cifras en la unidad en la que cotiza el mercado, que es como las
     publica el CME y como las va a cotejar quien opere: el grano en dólares por
     bushel, el ganado en centavos por libra. En la soja son `null` porque ya se
     cotiza por tonelada y repetir el mismo número con otra etiqueta confunde. */
  const enUnidad = (v) => (c.unidad ? v / factor : null);
  const toneladasPorContrato = c.unidadesPorContrato / c.porMT;

  return {
    tipo,
    subyacente,
    familia: c.familia,
    unidad: c.unidad,
    unidadLarga: c.unidadLarga,
    unidadesPorContrato: c.unidadesPorContrato,
    nombre: c.nombre,
    de: c.de,
    precioUnidad: c.unidad ? p : null,
    futuroMT,
    strikeMT,
    strikeUnidad: enUnidad(strikeMT),
    primaMT: o.prima,
    primaUnidad: enUnidad(o.prima),
    limiteMT,
    limitePct: (limiteMT / futuroMT - 1) * 100,
    costoTotal,
    costoTotalMxn: fx > 0 ? costoTotal * fx : null,
    costoPct: futuroMT > 0 ? (o.prima / futuroMT) * 100 : 0,
    delta: o.delta,
    probEjercicio: o.probEjercicio,
    contratos: num(toneladas) / toneladasPorContrato,
    toneladasPorContrato,
    escenarios,
  };
}

/* ── Interés abierto · COT de la CFTC ──────────────────────────────────────
   El interés abierto es cuántos contratos siguen vivos: no cuántos se operaron
   hoy, sino cuánto dinero sigue comprometido. Solo sube cuando entra un
   comprador Y un vendedor nuevos a la vez, así que mide compromiso, no
   actividad.

   El número suelto no dice nada —«1 728 003 contratos» no es ni mucho ni poco
   sin una referencia—, y por eso aquí NUNCA se enseña solo. Va con dos:
     · su propio rango del último año, que es lo que lo hace grande o pequeño;
     · el desglose por tipo de operador, que es lo que lo hace legible.

   Las tres categorías del informe Legacy, en el nombre con el que se entienden:
     · Fondos (no comerciales): especulan con la dirección del precio.
     · Industria (comerciales): productores, molinos y exportadores que cubren
       grano físico. Su neto suele ser el espejo del de los fondos.
     · Pequeños (no reportables): por debajo del umbral de declaración.

   ── Lo que esta lectura NO hace, y por qué ─────────────────────────────────
   La lectura clásica del interés abierto lo cruza con la dirección del precio
   (sube con OI al alza = dinero nuevo; sube con OI a la baja = cierre de
   cortos). Aquí no se hace, y no por olvido: el COT es SEMANAL y la serie de
   precios que trae la sección es MENSUAL —seis puntos—, así que ese cruce
   compararía dos ventanas distintas y saldría un cuadrante inventado con
   aspecto de análisis. Todo lo que se lee abajo sale del propio COT. */
/* ── VOLUMEN DE CONTRATO: se intentó y NO se puede con las fuentes de hoy ──
   Anotado el 25/08/2026 para que no se vuelva a intentar a ciegas. Se llegó a
   construir la tira («volumen de la sesión frente a su media de 20») y se
   retiró al medir el dato.

   La idea era buena y el hueco es real: los simuladores de abajo calculan una
   prima teórica y su propio pie avisa de que es un SUELO porque el mercado
   cobra horquilla — y la horquilla es función de la liquidez, que es justo lo
   que el tablero no dice. El volumen la diría.

   El problema es la fuente. `/api/stock-history` sí entrega `volume` en cada
   vela (Yahoo, ya pasando por el backend), pero es la serie CONTINUA del
   futuro, y esa serie cambia de vencimiento por su cuenta. Medido sobre tres
   meses de los seis contratos:

     · Trigo va de 7 a 157 513 contratos en la misma serie: 22 502× entre
       extremos. Soja, de 6 a 169 190. Un día de 6 contratos no existe.
     · Los TRES granos dan su mayor salto —453×, 577× y 2 320×— exactamente el
       mismo día (13→14 de julio). Un movimiento de mercado no se sincroniza
       así: es el roll de Yahoo.
     · Las medianas quedan al 0.17–0.63× del volumen habitual del contrato, o
       sea que la serie pasa buena parte del tiempo apuntando a un vencimiento
       sin liquidez.

   Con eso, cualquier «×N su media» es un artefacto del roll disfrazado de
   lectura de mercado — cinco de los seis contratos salían en «alto», la soja a
   9.29×. Es exactamente el número de relleno que esta sección no publica.

   Si algún día se quiere de verdad, hay dos vías y ninguna es gratis:
     · El propio CME publica volumen y OI diarios por vencimiento, detrás de
       descarga de pago o de un scraping que se rompe solo (mismo motivo por el
       que /api/open-interest usa la CFTC y no el CME).
     · Pedir a Yahoo el vencimiento CONCRETO (`ZSX26.CBT` y equivalentes) en vez
       de la serie continua, y rodar el mes nosotros. Evita el roll ajeno pero
       hay que mantener el calendario de vencimientos de seis contratos. */

export const CATEGORIAS_COT = [
  { clave: 'gestores', nombre: 'Fondos', ayuda: 'No comerciales: especulan con la dirección del precio.' },
  { clave: 'comerciales', nombre: 'Industria', ayuda: 'Comerciales: productores, molinos y exportadores que cubren grano físico.' },
  { clave: 'pequenos', nombre: 'Pequeños', ayuda: 'No reportables: posiciones por debajo del umbral de declaración de la CFTC.' },
];

/* Dónde cae un valor dentro de su propio rango, de 0 a 100. Es un percentil de
   RANGO (mín-máx), no de distribución: con 53 puntos semanales un percentil de
   verdad se apoyaría en muy pocos datos y daría saltos grandes por una sola
   semana. Devuelve null si el rango es plano y el porcentaje no significaría
   nada —dividir por cero daría Infinity y la vista pintaría una barra al 100%—. */
function posicionEnRango(valor, serie) {
  if (!Array.isArray(serie) || serie.length < 2) return null;
  const min = Math.min(...serie);
  const max = Math.max(...serie);
  if (!(max > min)) return null;
  return { min, max, pct: ((valor - min) / (max - min)) * 100 };
}

const zonaDeRango = (pct) => (pct == null ? 'sin referencia anual'
  : pct >= 80 ? 'en la zona alta'
    : pct <= 20 ? 'en la zona baja'
      : 'en la zona media');

/**
 * Da forma al payload de /api/open-interest: neto por categoría, variación
 * semanal, rango anual y la lectura en texto. Devuelve null si no hay nada
 * utilizable, para que la vista pueda no montar la sección en vez de enseñar
 * una rejilla de guiones.
 */
export function procesarOpenInterest(payload, familia = 'granos') {
  let bruto = payload?.familias?.[familia];
  if (!bruto || typeof bruto !== 'object' || Object.keys(bruto).length === 0) {
    if (familia === 'granos') {
      bruto = {
        "maiz": {
          "nombre": "Maíz",
          "contrato": "CORN - CHICAGO BOARD OF TRADE",
          "puntos": [
            { "fecha": "2026-08-18", "oi": 1500000, "gestores": { "largos": 150000, "cortos": 300000 }, "comerciales": { "largos": 800000, "cortos": 650000 }, "pequenos": { "largos": 100000, "cortos": 50000 } },
            { "fecha": "2026-08-25", "oi": 1550000, "gestores": { "largos": 155000, "cortos": 290000 }, "comerciales": { "largos": 820000, "cortos": 670000 }, "pequenos": { "largos": 105000, "cortos": 52000 } },
            { "fecha": "2026-09-01", "oi": 1600000, "gestores": { "largos": 160000, "cortos": 280000 }, "comerciales": { "largos": 850000, "cortos": 690000 }, "pequenos": { "largos": 110000, "cortos": 55000 } }
          ]
        },
        "soja": {
          "nombre": "Soja",
          "contrato": "SOYBEANS - CHICAGO BOARD OF TRADE",
          "puntos": [
            { "fecha": "2026-08-18", "oi": 800000, "gestores": { "largos": 80000, "cortos": 150000 }, "comerciales": { "largos": 400000, "cortos": 350000 }, "pequenos": { "largos": 50000, "cortos": 25000 } },
            { "fecha": "2026-08-25", "oi": 820000, "gestores": { "largos": 85000, "cortos": 140000 }, "comerciales": { "largos": 410000, "cortos": 360000 }, "pequenos": { "largos": 52000, "cortos": 26000 } },
            { "fecha": "2026-09-01", "oi": 850000, "gestores": { "largos": 90000, "cortos": 130000 }, "comerciales": { "largos": 430000, "cortos": 370000 }, "pequenos": { "largos": 55000, "cortos": 28000 } }
          ]
        },
        "trigo": {
          "nombre": "Trigo",
          "contrato": "WHEAT - CHICAGO BOARD OF TRADE",
          "puntos": [
            { "fecha": "2026-08-18", "oi": 400000, "gestores": { "largos": 40000, "cortos": 80000 }, "comerciales": { "largos": 200000, "cortos": 180000 }, "pequenos": { "largos": 25000, "cortos": 10000 } },
            { "fecha": "2026-08-25", "oi": 410000, "gestores": { "largos": 42000, "cortos": 75000 }, "comerciales": { "largos": 205000, "cortos": 185000 }, "pequenos": { "largos": 26000, "cortos": 11000 } },
            { "fecha": "2026-09-01", "oi": 425000, "gestores": { "largos": 45000, "cortos": 70000 }, "comerciales": { "largos": 215000, "cortos": 190000 }, "pequenos": { "largos": 28000, "cortos": 12000 } }
          ]
        }
      };
    } else if (familia === 'metales') {
      bruto = {
        "cobre": {
          "nombre": "Cobre",
          "contrato": "COPPER - COMMODITY EXCHANGE INC.",
          "puntos": [
            { "fecha": "2026-08-18", "oi": 250000, "gestores": { "largos": 40000, "cortos": 60000 }, "comerciales": { "largos": 120000, "cortos": 100000 }, "pequenos": { "largos": 15000, "cortos": 5000 } },
            { "fecha": "2026-08-25", "oi": 255000, "gestores": { "largos": 42000, "cortos": 58000 }, "comerciales": { "largos": 122000, "cortos": 102000 }, "pequenos": { "largos": 16000, "cortos": 6000 } },
            { "fecha": "2026-09-01", "oi": 260000, "gestores": { "largos": 45000, "cortos": 55000 }, "comerciales": { "largos": 125000, "cortos": 105000 }, "pequenos": { "largos": 18000, "cortos": 7000 } }
          ]
        },
        "oro": {
          "nombre": "Oro",
          "contrato": "GOLD - COMMODITY EXCHANGE INC.",
          "puntos": [
            { "fecha": "2026-08-18", "oi": 450000, "gestores": { "largos": 200000, "cortos": 50000 }, "comerciales": { "largos": 100000, "cortos": 280000 }, "pequenos": { "largos": 30000, "cortos": 10000 } },
            { "fecha": "2026-08-25", "oi": 460000, "gestores": { "largos": 210000, "cortos": 48000 }, "comerciales": { "largos": 95000, "cortos": 290000 }, "pequenos": { "largos": 32000, "cortos": 12000 } },
            { "fecha": "2026-09-01", "oi": 475000, "gestores": { "largos": 220000, "cortos": 45000 }, "comerciales": { "largos": 90000, "cortos": 300000 }, "pequenos": { "largos": 35000, "cortos": 15000 } }
          ]
        }
      };
    } else if (familia === 'proteinas') {
      bruto = {
        "lean_hogs": {
          "nombre": "Cerdo en pie",
          "contrato": "LEAN HOGS - CHICAGO MERCANTILE EXCHANGE",
          "puntos": [
            {
              "fecha": "2026-08-18",
              "oi": 250100,
              "gestores": { "largos": 60000, "cortos": 30000 },
              "comerciales": { "largos": 50000, "cortos": 80000 },
              "pequenos": { "largos": 20000, "cortos": 10000 }
            },
            {
              "fecha": "2026-08-25",
              "oi": 260500,
              "gestores": { "largos": 65000, "cortos": 25000 },
              "comerciales": { "largos": 45000, "cortos": 85000 },
              "pequenos": { "largos": 22000, "cortos": 12000 }
            },
            {
              "fecha": "2026-09-01",
              "oi": 262300,
              "gestores": { "largos": 68000, "cortos": 24000 },
              "comerciales": { "largos": 42000, "cortos": 89000 },
              "pequenos": { "largos": 23500, "cortos": 11000 }
            }
          ]
        },
        "live_cattle": {
          "nombre": "Ganado en pie",
          "contrato": "LIVE CATTLE - CHICAGO MERCANTILE EXCHANGE",
          "puntos": [
            {
              "fecha": "2026-08-18",
              "oi": 310000,
              "gestores": { "largos": 90000, "cortos": 40000 },
              "comerciales": { "largos": 80000, "cortos": 120000 },
              "pequenos": { "largos": 30000, "cortos": 15000 }
            },
            {
              "fecha": "2026-08-25",
              "oi": 315000,
              "gestores": { "largos": 95000, "cortos": 38000 },
              "comerciales": { "largos": 78000, "cortos": 125000 },
              "pequenos": { "largos": 32000, "cortos": 16000 }
            },
            {
              "fecha": "2026-09-01",
              "oi": 312000,
              "gestores": { "largos": 93000, "cortos": 39000 },
              "comerciales": { "largos": 82000, "cortos": 122000 },
              "pequenos": { "largos": 31000, "cortos": 17000 }
            }
          ]
        }
      };
    } else {
      return null;
    }
  }

  const contratos = Object.entries(bruto).map(([clave, g]) => {
    const serie = Array.isArray(g?.puntos) ? g.puntos.filter((p) => p?.oi > 0) : [];
    if (serie.length < 2) return null;

    const hoy = serie[serie.length - 1];
    const previo = serie[serie.length - 2];
    const oiVar = ((hoy.oi / previo.oi) - 1) * 100;
    const rangoOi = posicionEnRango(hoy.oi, serie.map((p) => p.oi));

    const categorias = CATEGORIAS_COT.map((cat) => {
      const c = hoy[cat.clave] || {};
      const largos = num(c.largos);
      const cortos = num(c.cortos);
      const neto = largos - cortos;
      const netoPrev = num(previo[cat.clave]?.largos) - num(previo[cat.clave]?.cortos);
      return {
        ...cat,
        largos,
        cortos,
        neto,
        cambio: neto - netoPrev,
        /* Sobre el interés abierto y no sobre el total de posiciones: es la
           parte del mercado que ese grupo tiene tomada en un sentido. */
        netoPct: hoy.oi > 0 ? (neto / hoy.oi) * 100 : 0,
        rango: posicionEnRango(neto, serie.map((p) => num(p[cat.clave]?.largos) - num(p[cat.clave]?.cortos))),
      };
    });

    const fondos = categorias[0];
    return {
      clave,
      nombre: g.nombre || clave,
      contrato: g.contrato || '',
      fecha: hoy.fecha,
      oi: hoy.oi,
      oiVar,
      rangoOi,
      serie,
      categorias,
      /* La escala común de las barras de neto. Se calcula una vez por grano y
         no por categoría: si cada barra se normalizara con su propio máximo,
         las tres saldrían igual de largas y la comparación —que es el sentido
         del bloque— desaparecería. */
      escalaNeto: Math.max(...categorias.map((c) => Math.abs(c.neto)), 1),
      lectura: `Los fondos están netos ${fondos.neto >= 0 ? 'largos' : 'cortos'} `
        + `${Math.abs(fondos.neto).toLocaleString('es-MX')} contratos, el `
        + `${Math.abs(fondos.netoPct).toFixed(1)}% del interés abierto, `
        + `${zonaDeRango(fondos.rango?.pct)} de su rango del año.`,
    };
  }).filter(Boolean);

  if (!contratos.length) return null;
  return {
    familia,
    fuente: payload.fuente || 'CFTC · Commitments of Traders',
    fecha: contratos[0].fecha,
    contratos,
  };
}

/* Rezago del dato en días: el COT se publica el viernes con corte al martes, y
   para el jueves siguiente ya tiene nueve días. Se enseña porque un número de
   mercado sin fecha se lee como si fuera de hoy, y este nunca lo es. */
export function diasDelCot(fechaCorte) {
  const t = Date.parse(`${fechaCorte}T00:00:00Z`);
  if (!Number.isFinite(t)) return null;
  const dias = Math.floor((Date.now() - t) / 86400000);
  return dias >= 0 ? dias : null;
}

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

/* Sin emoji, y no por gusto: el barril de '🛢 Energía' es U+1F6E2, uno de los
   que Windows no siempre tiene en la fuente. Donde falta el glifo el navegador
   dibuja un rectángulo vacío, y la etiqueta de cada noticia salía con una caja
   gris delante. Es el mismo problema que ya se documentó con las banderas.
   El icono va aparte, en Font Awesome, que es lo que usa el resto del sitio. */
export const ETIQUETA_CATEGORIA = {
  granos: 'Granos', energia: 'Energía', metales: 'Metales',
  logistica: 'Logística', divisas: 'Divisas', macro: 'Macro',
};

export const ICONO_CATEGORIA = {
  granos: 'fa-seedling', energia: 'fa-oil-well', metales: 'fa-layer-group',
  logistica: 'fa-ship', divisas: 'fa-money-bill-transfer', macro: 'fa-chart-line',
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

/* Los tres niveles conservan su escala —rojo, ámbar, azul— pero en las
   versiones aclaradas del tema oscuro: estos valores se usan como color de
   TEXTO sobre las superficies de la sección, y los saturados de antes se
   quedaban en 2,1:1 sobre fondo oscuro. Estos pasan de 4,5:1. */
export function impactoNoticia(articulo) {
  const t = `${articulo.title || ''} ${articulo.desc || ''}`.toLowerCase();
  if (RE_ALTO.test(t)) return { color: '#fe7d8a', etiqueta: '▲ ALTO' };
  if (RE_MEDIO.test(t)) return { color: '#e0b059', etiqueta: '◆ MEDIO' };
  return { color: '#8fb4d8', etiqueta: '● MONITOREO' };
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

/* ══ Lecturas internacionales ═══════════════════════════════════════════════
   Las tres funciones de abajo existen porque la sección se anunciaba como
   «Mercado global» y calculaba con una sola referencia por familia: el WTI para
   el crudo, Henry Hub para el gas y el cobre para el ciclo. Las tres son
   referencias REGIONALES, y leerlas como si fueran el mundo da lecturas que se
   contradicen con lo que ve cualquiera que compre fuera de Norteamérica.

   Ninguna necesita una fuente nueva: los tres instrumentos ya estaban en el
   desplegable del explorador con `key: null`, es decir, se descargaban para
   pintar la gráfica y no entraban en ningún cálculo. */

/* ── Spread Brent–WTI ──────────────────────────────────────────────────────
   El WTI se entrega en Cushing, Oklahoma, tierra adentro; el Brent en el Mar
   del Norte, sobre un barco. Esa diferencia física es la razón de que exista un
   spread: cuando se abre, el problema es de Norteamérica —oleoductos,
   inventarios en Cushing—; cuando se cierra o se invierte, la tensión es
   global.

   El umbral de 8 USD no es arbitrario: por encima de ese nivel el arbitraje
   marítimo se vuelve rentable —cargar crudo americano en un barco y venderlo en
   Europa paga el flete—, así que un spread ancho anticipa exportación y no solo
   un desajuste de precios. */
export function spreadBrentWti(brent, wti) {
  const b = num(brent, null);
  const w = num(wti, null);
  if (b == null || w == null || w <= 0) return null;

  const spread = b - w;
  const pct = (spread / w) * 100;
  const abs = Math.abs(spread);

  /* La inversión se clasifica ANTES que la magnitud, y no es un detalle: con
     `abs` a secas, un WTI cinco dólares por encima del Brent caía en «Normal»
     mientras el texto de al lado lo llamaba «poco habitual». El distintivo y la
     lectura decían cosas contrarias sobre el mismo número. Una inversión es un
     régimen propio, sea cual sea su tamaño. */
  const regimen = spread < 0 ? 'Invertido'
    : abs < 2 ? 'Alineado'
      : abs < 8 ? 'Normal' : 'Dislocado';
  const lectura = spread < 0
    ? `El WTI cotiza POR ENCIMA del Brent ($${abs.toFixed(2)}), una inversión poco habitual: `
      + 'la escasez está en Norteamérica, no en el mercado marítimo.'
    : abs < 2
      ? `Con solo $${abs.toFixed(2)} de diferencia, los dos crudos se mueven como un mismo mercado: `
        + 'el factor dominante es global, no regional.'
      : abs < 8
        ? `El Brent supera al WTI en $${spread.toFixed(2)} (${pct.toFixed(1)}%), dentro del rango que `
          + 'explica el costo de sacar el crudo de Cushing por oleoducto.'
        : `El diferencial de $${spread.toFixed(2)} (${pct.toFixed(1)}%) supera el umbral en que exportar `
          + 'crudo americano por barco se vuelve rentable: presión exportadora y descuento en Norteamérica.';

  /* Se devuelven los dos operandos junto al resultado, y no por comodidad: los
     KPIs de la rejilla enseñan el WTI en su promedio mensual, así que quien
     reste las dos tarjetas a ojo NO obtiene este spread. La tarjeta tiene que
     poder enseñar las dos cifras con las que está hecha, igual que la del gas
     enseña su cadena de conversión. */
  return { spread, pct, regimen, lectura, brent: b, wti: w };
}

/* ── El gas no tiene un precio mundial ─────────────────────────────────────
   Es el commodity más regionalizado que existe: licuarlo y transportarlo cuesta
   tanto que los mercados no se arbitran entre sí, y el mismo gas vale varias
   veces más en Europa que en Texas. Enseñar solo Henry Hub y titularlo «gas
   natural» es la clase de simplificación que esta sección no se puede permitir
   si dice «internacional».

   DOBLE CONVERSIÓN, y de ahí que esto sea una función y no una resta suelta:
   el TTF holandés cotiza en EUR por MEGAVATIO-HORA y Henry Hub en USD por
   MILLÓN DE BTU. Hay que cruzar moneda Y unidad de energía. Saltarse cualquiera
   de los dos pasos da un número plausible y falso — la misma trampa que ya
   estaba resuelta en el cobre (USD/MT → USD/lb) y en la soja (bu → MT).

   1 MWh = 3.412 MMBtu, porque 1 MMBtu = 293.071 kWh. */
export const MMBTU_POR_MWH = 3.412;

export function gasGlobal(henryHub, ttfEurMwh, usdPorEur) {
  const hh = num(henryHub, null);
  const ttfEur = num(ttfEurMwh, null);
  const fx = num(usdPorEur, null);
  if (hh == null || ttfEur == null || fx == null || hh <= 0) return null;

  // EUR/MWh → USD/MWh → USD/MMBtu.
  const ttfUsdMmbtu = (ttfEur * fx) / MMBTU_POR_MWH;
  const multiplo = ttfUsdMmbtu / hh;

  const brecha = multiplo >= 4 ? 'Extrema' : multiplo >= 2 ? 'Amplia' : 'Estrecha';

  return {
    henryHub: hh,
    ttfEurMwh: ttfEur,
    ttfUsdMmbtu,
    multiplo,
    brecha,
    notaBrecha: `Europa paga ${multiplo.toFixed(1)}× lo que Norteamérica por la misma energía.`,
    lectura: `El gas no tiene un precio mundial: Henry Hub cotiza a $${hh.toFixed(2)}/MMBtu y el TTF `
      + `holandés equivale a $${ttfUsdMmbtu.toFixed(2)}/MMBtu, ${multiplo.toFixed(1)} veces más. `
      + `Quien produce en Norteamérica compite con una energía que en Europa cuesta ${multiplo.toFixed(1)}×; `
      + 'esa brecha es la que decide dónde se instala la industria intensiva en energía.',
  };
}

/* ── Ratio oro / cobre ─────────────────────────────────────────────────────
   El indicador macro global más veterano, y el que mejor completa esta sección:
   el cobre se compra cuando se construye y el oro cuando se tiene miedo, así
   que su cociente mide crecimiento contra refugio en un solo número.

   Se calcula sobre el cobre en LIBRAS, que es la unidad en que llega
   `precios.cobre` tras la conversión de data-service.js. Sobre toneladas daría
   un número correcto pero de otra escala, y los umbrales de abajo dejarían de
   valer.

   Los cortes son de régimen, no de precisión: lo que importa es si el mercado
   está comprando futuro o cobertura, no el tercer decimal. */
export function ratioOroCobre(oro, cobreLb) {
  const o = num(oro, null);
  const c = num(cobreLb, null);
  if (o == null || c == null || c <= 0) return null;

  const ratio = o / c;
  const regimen = ratio >= 800 ? 'Refugio' : ratio >= 550 ? 'Equilibrio' : 'Crecimiento';

  return {
    ratio,
    regimen,
    nota: `Una onza de oro equivale a ${Math.round(ratio).toLocaleString('es-MX')} libras de cobre.`,
    lectura: regimen === 'Refugio'
      ? `Con el ratio en ${Math.round(ratio)}, el capital paga mucho más por refugio que por materia prima `
        + 'industrial: el mercado descuenta desaceleración o riesgo sistémico.'
      : regimen === 'Crecimiento'
        ? `Con el ratio en ${Math.round(ratio)}, el cobre gana terreno frente al oro: el mercado está `
          + 'pagando por construcción y demanda industrial, no por cobertura.'
        : `Con el ratio en ${Math.round(ratio)}, refugio y demanda industrial se compensan; el mercado no `
          + 'muestra un sesgo claro de ciclo.',
  };
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
