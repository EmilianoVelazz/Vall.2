'use strict';

const { normalizeForIntent, isLikelyFollowUp, visibleTurns } = require('./conversation-context');

const FORECAST = /\b(?:pronostic\w*|predicci\w*|predecir|proyecci\w*|subira|bajara|que pasara|como (?:estara|se comportara)|a cuanto (?:llegara|estara))\b/;

function activeUserContext(message, history) {
    if (!isLikelyFollowUp(message, history)) return [];
    const turns = visibleTurns(history, 24);
    let start = 0;
    turns.forEach((turn, index) => {
        if (turn.role === 'user' && !isLikelyFollowUp(turn.text, turns.slice(0, index))) start = index;
    });
    return turns.slice(start).filter(turn => turn.role === 'user').map(turn => turn.text);
}

function forecastRequest(message, history = []) {
    const current = normalizeForIntent(message);
    const subject = normalizeForIntent([...activeUserContext(message, history), message].join(' '));
    // Una revisión de previsiones publicadas no pide un objetivo propio.
    const historical = /\b(?:que|cuando)\s+(?:pronostico|predijo|proyecto)\b|\b(?:pronosticos?|predicciones?|proyecciones?)\b.{0,70}\b(?:publicad[oa]s?|anunciad[oa]s?|del informe|del reporte)\b/.test(current);
    const operational = /\b(?:documentos?|permisos?|requisitos?|tramites?|entregar|entrega|embarcar|embarque|importar|exportar|reunion|cita|voy a vender|voy a comprar)\b/.test(current);
    const predictive = FORECAST.test(current) || /\b(?:escenarios?|a futuro|esperas?|preves?|se espera)\b|\bprobabilidad\b.{0,90}\b(?:suban?|bajen?|crezca\w*|caiga\w*)\b/.test(current);
    const futureMarket = /\b(?:precios?|cotizacion|margen|mercado|accion|acciones|tipo de cambio|demanda|oferta|ventas?|ingresos?|costos?)\b/.test(current)
        && /\b(?:manana|proxim[oa]|siguiente)\b/.test(current);
    const researchOnly = !predictive && !futureMarket && /\b(?:noticias?|titulares?|comunicados?|acuerdos? comerciales?|anuncios?)\b/.test(current);
    const observedOnly = !predictive && !futureMarket && /\b(?:precios?|cotizaciones?|cuanto cuesta|cuanto vale)\b/.test(current)
        && /\b(?:hoy|actual(?:es)?|ahora|ultimo|ultima)\b/.test(current);
    const requested = !historical && !researchOnly && !observedOnly && (predictive || (!operational && (FORECAST.test(subject) || futureMarket
        || /^(?:[¿\s]*)(?:y |para |en )?(?:manana|(?:el |la )?(?:proximo|proxima|siguiente)\s+(?:mes|semana|ano|sesion))[?\s]*$/.test(current))));
    const matches = [...subject.matchAll(/\b(?:proxim[oa]s?|siguientes?|en|a|para)\s+(?:(\d{1,3}|un|una|dos|tres|cuatro)\s*)?(sesion(?:es)?|dias?|semanas?|mes(?:es)?|anos?)\b|\bmanana\b/g)];
    const last = matches.at(-1);
    let horizon = null;
    let label = 'horizonte por definir';
    let assumption = false;
    if (last) {
        const count = ({ un: 1, una: 1, dos: 2, tres: 3, cuatro: 4 })[last[1]] || Number(last[1] || 1);
        const unit = last[2] || 'sesion';
        const multiplier = /^mes/.test(unit) ? 20 : /^semana/.test(unit) ? 5 : /^ano/.test(unit) ? 252 : 1;
        horizon = count * multiplier;
        label = last[0];
        assumption = !/^sesion/.test(unit) || last[0] === 'manana';
    }
    return { requested, horizon, label, assumption, supported: horizon !== null && horizon >= 1 && horizon <= 20 };
}

function buildAnswerStrategy({ message, history = [], plan = {} } = {}) {
    const current = normalizeForIntent(message);
    const audienceText = normalizeForIntent([...activeUserContext(message, history), message].join(' '));
    const roleMatches = [...audienceText.matchAll(/\b(inversor|inversionista|inversiones|portafolio|cartera|productor|porcicultor|avicultor|comprador|abastecimiento|distribuidor|importador|exportador|comercializador|mayorista|distributor)\b/g)];
    const role = roleMatches.at(-1)?.[1];
    const commercial = /^(?:distribuidor|importador|exportador|comercializador|mayorista|distributor)$/.test(role || '') || !role && /\bvendo\b/.test(audienceText);
    const audience = commercial ? 'merchant' : /productor|porcicultor|avicultor/.test(role || '') ? 'producer'
        : /comprador|abastecimiento/.test(role || '') ? 'buyer' : role ? 'investor' : 'general';
    const forecast = plan.forecast || forecastRequest(message, history);
    const intent = forecast.requested ? 'forecast' : plan.asksNews ? 'news'
        : plan.asksComparison ? 'comparison' : plan.asksDecision ? 'decision'
            : plan.needsProteinPrices || plan.needsLiveQuote ? 'price' : 'analysis';
    const short = /\b(?:breve|resum\w*|rapido|en una frase|solo dime)\b/.test(current);
    const guidance = [
        '[RESPUESTA ADAPTADA A LA PERSONA]',
        `Objetivo: ${intent}. Perfil expresado: ${audience}. No supongas capital, tolerancia al riesgo ni posiciones que no se hayan indicado.`,
        audience === 'merchant' ? 'Prioriza compra y venta de producto físico: disponibilidad, costo puesto en destino, margen, inventario, merma, crédito, cadena de frío y flujo de caja por producto y ruta. No conviertas su objetivo comercial en una recomendación bursátil.'
            : audience === 'investor' ? 'Relaciona cada hallazgo con ventas, costos, márgenes, deuda, valoración y catalizadores del emisor pertinente. Un precio de proteína no acredita por sí solo una tesis bursátil.'
            : audience === 'producer' ? 'Relaciona demanda, alimento, bioseguridad, productividad, margen por unidad y flujo de caja. Distingue precio de granja de mayoreo y futuros.'
                : audience === 'buyer' ? 'Prioriza disponibilidad, costo puesto en destino, moneda, logística, plazos y riesgos sanitarios.' : 'Explica los términos necesarios en lenguaje sencillo y aterriza su consecuencia práctica.',
        'Responde primero lo que sí puede sostenerse. Si falta un dato que cambiaría la decisión, formula una sola pregunta concreta sobre la variable más decisiva al final, sin acumular varias variables en esa pregunta; conserva lo ya indicado en el hilo.',
        'No preguntes otra vez el horizonte o activo ya expresados. Un plazo corto no acredita que la persona opere intradía: no presupongas estilo de ejecución ni des órdenes de compra o venta sin su contexto.',
        'Ofrece una lectura propia respaldada y qué la haría cambiar. Si el usuario corrige algo, compruébalo y actualiza la conclusión; no confirmes automáticamente su premisa.',
        short ? 'Usa entre 120 y 180 palabras de análisis, conservando el dato decisivo, el corte y el principal límite. No repitas las tablas de la ficha del servidor.' : 'Evita repetir antecedentes. Usa tablas sólo para comparar y prioriza el mecanismo que explica el resultado.',
    ];
    if (audience === 'merchant') guidance.push(
        '[COMERCIO DE PROTEÍNAS]',
        'Escribe cálculos y fórmulas comerciales en texto plano legible (por ejemplo, 85 / 0.96 = 88.54 MXN/kg). No uses LaTeX, delimitadores $, ni comandos como frac o text, porque el chat no renderiza ecuaciones LaTeX.',
        'En consultas normales entrega de 200 a 350 palabras, salvo que se pida otro formato o detalle. Escribe «distribuidor» o «comercializador», nunca el identificador interno merchant. Una pregunta al final debe pedir sólo una variable, no una lista disimulada.',
        'No inventes límites de crédito, porcentajes de merma, márgenes objetivo, horarios de reparto, umbrales de días ni temperaturas como si fueran reglas verificadas o datos del negocio. Los ejemplos numéricos se permiten únicamente bajo el rótulo «Ejemplo hipotético, no es una cotización ni un dato de tu empresa», con todos los supuestos explícitos. No declares rechazo automático de lotes ni autorices recongelación o reventa sin procedimiento validado.',
        'Prioriza datos actuales para esta semana. Cada hecho externo lleva fecha y enlace específico junto a la afirmación. Si sólo recuperaste análisis antiguos, abre diciendo que no se confirmó la situación de esta semana; etiquétalos como antecedentes y ofrece señales a verificar. No traslades porcentajes de 2025 a 2026 ni extrapoles una cifra regional al mercado mundial.',
          'Conserva país de origen y destino, especie, corte, presentación, fresco/congelado, volumen, moneda, unidad e Incoterm ya indicados. Identifica qué falta; no extrapoles precio de canal a un corte ni peso de huevo a docenas sin equivalencia documentada.',
          'No sustituyas costo de carne por precio de animal vivo al calcular margen. Vivo, canal y cortes tienen rendimientos y costos distintos: la merma comercial de un ejercicio no es rendimiento de sacrificio. No presentes el precio de otra entidad como estimación local sólo por proximidad.',
        'Costo vendible por kg = costos totales del lote / kg realmente vendibles. Si la merma es una proporción m del peso comprado, divide costo por kg comprado entre (1-m). Margen bruto/kg = venta neta/kg menos costo vendible/kg; margen sobre venta = margen/venta; recargo sobre costo = margen/costo. Explicita base de merma, impuestos, comisiones y supuestos. Una reducción del precio de venta no reduce automáticamente costos.',
        'Para FOB/CIF comprueba puerto nombrado y conceptos incluidos. No sumes otra vez seguro o flete incluidos en CIF; diferencia transferencia de riesgo, propiedad, obligaciones documentales y pago. No trates Incoterms como garantía de inocuidad o acceso sanitario.',
        'Para requisitos sanitarios, halal, aranceles y retiros, verifica autoridad oficial, vigencia, especie, origen, destino, establecimiento y lote afectado. No supongas un veto a todo un país ni un arancel universal. En un retiro explica trazabilidad, bloqueo de lote y contacto con proveedor/autoridad; no recomiendes tratamientos humanos.',
        'No asignes probabilidades exactas de ventas o margen sin datos y modelo validado. Usa escenarios condicionales, catalizador, señal y acción reversible; no inventes proveedores certificados ni acceso a bases privadas.'
    );
    if (!forecast.requested) guidance.push('Responde a la consulta actual. No añadas «Estado del pronóstico», precios objetivo ni preguntas sobre horizonte si no se pidió una previsión.');
    if (forecast.requested) guidance.push(
        '[ANÁLISIS DEL FUTURO]',
        `Horizonte pedido: ${forecast.label}. Si no está definido, entrega una lectura provisional y pide el horizonte; no inventes una fecha objetivo.`,
        'Separa dato observado, pronóstico numérico del servidor y escenarios condicionales. R², un puntaje de confianza y el rendimiento pasado no son probabilidades de acierto.',
        'El servidor añade la ficha cuantitativa evaluada al terminar. No inventes ni repitas precios objetivo, rentabilidades futuras o probabilidades propias. Si el modelo no supera su referencia al horizonte pedido, explica la brecha y conserva un análisis cualitativo útil.',
        'Para cada escenario pertinente indica catalizador, mecanismo, señal observable y condición que lo invalidaría. Un supuesto no es un hecho; una noticia favorable no garantiza una subida bursátil.',
        'No inventes soportes, resistencias, umbrales de ruptura, rangos técnicos ni porcentajes que activarían una decisión. Si no se calcularon con una serie verificada, describe la señal cualitativamente. No concluyas que una serie es un paseo aleatorio ni que no existen catalizadores sólo porque este modelo no superó su referencia.',
        'Describe un resultado desfavorable como «este motor no encontró ventaja frente a su referencia en la muestra evaluada», sin afirmar que ningún método puede predecir ni que el mercado carece de una oportunidad.',
        'Si se pronostica margen de granja, falta calcular precio neto de venta menos costo completo por kg, con datos de esa granja. No supongas conversión alimenticia, peso objetivo, costo ya devengado ni margen positivo. Explica la relación y pide el dato material; no calcules el margen usando una cotización de futuros.',
    );
    if (audience === 'producer' && /\b(?:pronostic\w*|proyect\w*|predic\w*|estimar)\b.{0,32}\bmargen\b/.test(current)) guidance.push(
        '[FORMATO PARA MARGEN SIN DATOS DE LA GRANJA]',
        'Abre con una conclusión provisional: no se puede calcular el margen de esta granja sin su precio neto de venta y costo completo por kg. Muestra la fórmula margen/kg = ingreso neto/kg - costo completo/kg, sin insertar números de otra granja.',
        'No sabemos si el lote está terminado, sigue engordando o requiere alimento adicional. Formula ambas posibilidades con «si»; nunca afirma que todo su costo de alimento ya está devengado o que las variaciones de esta semana no afectan su margen.',
        'Explica dos o tres señales de mercado como influencias condicionales, sin recomendar retener o embarcar animales. Cierra con una sola pregunta sobre una variable, preferentemente su costo completo por kg; no pidas región y precio en la misma pregunta.',
    );
    const item = (label, prompt, icon) => ({ label, prompt, icon });
    const followUps = intent === 'forecast' ? [
        item('Qué cambiaría el escenario', 'Sobre el análisis anterior, conserva el activo y horizonte e identifica qué datos o eventos invalidarían el escenario base y cómo vigilarlos.', 'fa-sliders'),
        item('Revisar el pronóstico', 'Revisa el pronóstico anterior: muestra horizonte, corte, error fuera de muestra y comparación con la referencia de último precio. Explica qué no está validado.', 'fa-chart-line'),
        item('Riesgos y señales', 'Sobre el análisis anterior, prioriza tres riesgos y una señal verificable para cada uno. Conserva mi objetivo y perfil expresados.', 'fa-triangle-exclamation'),
    ] : intent === 'news' ? [
        item('Impacto en el sector', 'Para las noticias anteriores, explica su mecanismo de impacto en demanda, costos y márgenes. Separa hechos e inferencias y conserva las fechas.', 'fa-diagram-project'),
        item('Qué vigilar', 'Sobre estas noticias, qué señal o próximo evento debería vigilar y qué cambiaría la conclusión; no inventes fechas sin fuente.', 'fa-eye'),
        item('Fuentes y fechas', 'Muéstrame los enlaces y fechas de publicación o corte que sostienen la respuesta anterior y qué cobertura quedó pendiente.', 'fa-link'),
    ] : [
        item(audience === 'investor' ? 'Tesis y catalizadores' : 'Profundizar', 'Profundiza en el mismo tema: evidencia decisiva, mecanismo, catalizadores y condición que cambiaría la conclusión. Conserva país, activo y periodo.', 'fa-magnifying-glass-plus'),
        item('Riesgos', 'Resume los riesgos materiales del análisis anterior y el indicador concreto que permitiría vigilarlos.', 'fa-triangle-exclamation'),
        item('Fuentes y fechas', 'Muéstrame fuentes, fechas de corte y limitaciones de la respuesta anterior.', 'fa-link'),
    ];
    return { intent, audience, forecast, guidance: guidance.join('\n'), followUps };
}

function attachAnswerStrategy(response, input) {
    const strategy = buildAnswerStrategy(input);
    response.meta = response.meta || {};
    response.meta.answerStrategy = { intent: strategy.intent, audience: strategy.audience, horizon: strategy.forecast.label };
    response.meta.followUps = strategy.followUps;
    return response;
}

module.exports = { activeUserContext, forecastRequest, buildAnswerStrategy, attachAnswerStrategy };
