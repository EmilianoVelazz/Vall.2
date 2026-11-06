'use strict';

/*
 * Contexto conversacional compartido por el guardián, el planificador, RAG y
 * el constructor del prompt. Tener una sola definición evita que una frase
 * como «ahora haz un informe» sea continuación para la interfaz, pero una
 * consulta aislada para la búsqueda de evidencia.
 */

const TYPO_ALIASES = Object.freeze({
    infrome: 'informe', infromes: 'informes', infromacion: 'informacion',
    informcaion: 'informacion', informaicon: 'informacion',
    repsuesta: 'respuesta', repsuestas: 'respuestas', respuersta: 'respuesta',
    respuerstas: 'respuestas', respuetsa: 'respuesta',
    fianzas: 'finanzas', fiananciero: 'financiero', fianancieros: 'financieros',
    emrcado: 'mercado', emrcados: 'mercados', meracdo: 'mercado',
    comparla: 'comparala', comparlo: 'comparalo',
    grafcia: 'grafica', garfica: 'grafica', graifca: 'grafica',
    dettalado: 'detallado', prodfundiza: 'profundiza',
    emexico: 'mexico', serdo: 'cerdo', serdos: 'cerdos', huebo: 'huevo', huebos: 'huevos', poyo: 'pollo', poyos: 'pollos', nesesito: 'necesito',
    alno: 'ano', anio: 'ano', acuredo: 'acuerdo', acuerods: 'acuerdos',
});

const EXPLICIT_REFERENCE_RE = /(?:^(?:[\s¿¡]*)(?:y|pero|entonces|ahora|tambien|ademas|despues|continua|sigue)\b|\b(?:eso|esa|ese|esto|aquello|anterior(?:es)?|lo mismo|los mismos|las mismas|sobre lo anterior|dicho activo|ese mercado|ese pais|esa cifra|esos datos|la respuesta|el analisis|hazlo|hazla|ponlo|ponla|muestralo|muestrala|comparalo|comparala)\b)/i;
const FOLLOW_UP_ACTION_RE = /\b(?:agrega|agregale|anade|anadele|incluye|incorpora|quita|elimina|cambia|sustituye|usa|conserva|manten|recalcula|aumenta|reduce|incrementa|disminuye|amplia|profundiza|detalla|continua|sigue|resume|resumelo|explicalo|corrige|ajusta|mejora|compara|comparalo|comparala|grafica|graficalo|graficala|tabla|informe|reporte|fuentes|escenarios|riesgos|recomendaciones)\b/i;
const IMPLICIT_FOLLOW_UP_RE = /^(?:[\s¿¡]*)(?:por que|como (?:afecta|impacta|cambia|funciona)|que (?:impacto|efecto|riesgo|riesgos|implicacion|implicaciones|sigue|pasaria|haria|recomiendas)|cuales (?:son|serian)|puedes (?:ampliar|explicar|mostrar)|dame (?:mas|el detalle|un ejemplo))\b/i;
const SHORT_ACK_RE = /^(?:si|no|ok|vale|correcto|exacto|de acuerdo|adelante|hazlo|por favor|claro|continua|sigamos|retomemos|perfecto)[.!\s]*$/i;
const EXPLICIT_NEW_SUBJECT_RE = /\b(?:sobre|acerca de|entre|respecto (?:de|a)|del mercado de|de la empresa)\s+(?!(?:eso|esto|aquello|lo anterior|dicho|ese|esa|esos|esas)\b)\S+/i;
const EXPLICIT_TOPIC_SWITCH_RE = /\b(?:(?:cambiando|cambia|cambiar|cambiemos) de tema|otro tema|otra pregunta|dejando (?:eso|lo anterior) de lado|por separado|ahora (?:quiero|quisiera|hablemos|hablame) (?:sobre|de|el|la|los|las)|ahora (?:analiza|revisa) (?!eso\b|esto\b|lo anterior\b|el mismo\b|la misma\b)\S+)\b/i;
const DOMAIN_SUBJECT_RE = /\b(?:inflacion|pib|empleo|cetes|tiie|banxico|fed|dolar|peso|usd|mxn|euro|divisas?|forex|bolsa|acciones?|bonos?|nasdaq|ipc|bitcoin|ethereum|maiz|trigo|soya|petroleo|wti|brent|gas|oro|plata|cobre|cerdo|ganado|pollo|mexico|estados unidos|china|europa|empresa|mercado)\b/i;
const PRIOR_OBJECT_RE = /\b(?:eso|esa|ese|esto|aquello|anterior(?:es)?|lo mismo|los mismos|las mismas|dicho activo|ese mercado|esa cifra|esos datos|hazlo|hazla|comparalo|comparala|muestralo|muestrala)\b/i;

function fold(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/\uFFFD/g, '')
        .toLowerCase();
}

function normalizeForIntent(value) {
    return fold(value)
        .replace(/[\p{L}\p{N}_-]+/gu, token => TYPO_ALIASES[token] || token)
        .replace(/\s+/g, ' ')
        .trim();
}

function turnText(item) {
    return String(item?.content || item?.text || '').replace(/\s+/g, ' ').trim();
}

function visibleTurns(history = [], limit = 16) {
    if (!Array.isArray(history)) return [];
    return history
        .filter(item => item && !item._hidden && turnText(item))
        .slice(-limit)
        .map(item => ({
            role: item.role === 'assistant' || item.role === 'model' ? 'assistant' : 'user',
            text: turnText(item),
        }));
}

function balancedExcerpt(value, limit = 2600) {
    const text = turnText({ text: value });
    if (text.length <= limit) return text;
    const head = Math.ceil(limit * .62);
    const tail = limit - head;
    return `${text.slice(0, head).trim()} … [fragmento intermedio omitido] … ${text.slice(-tail).trim()}`;
}

function hasConversation(history = []) {
    return visibleTurns(history, 16).some(turn => turn.role === 'user');
}

function isLikelyFollowUp(message, history = []) {
    if (!hasConversation(history)) return false;
    const text = normalizeForIntent(message);
    if (!text) return false;
    if (EXPLICIT_TOPIC_SWITCH_RE.test(text)) return false;
    const place = text.replace(/[¿?¡!.,]/g,'').trim();
    const { STATES, CITY_STATES } = require('../services/mexico-price-scope');
    if (STATES.some(state=>state.normalized===place) || CITY_STATES.some(([city])=>city===place)) return true;
    if (SHORT_ACK_RE.test(text)) return true;
    // Respuestas a una pregunta sobre el lote también son seguimientos aunque
    // no empiecen por «ahora». No interpretar una corrección como un lote nuevo.
    if (text.length <= 180 && /\d/.test(text) && (
        /^(?:el |la |mi )?(?:precio (?:de )?(?:compra|venta)|costo (?:de )?compra|merma|flete|transporte|seguro|volumen|cantidad|otros (?:costos|gastos))\b/.test(text)
        || /^no[, ]+(?:son|eran?|quise decir)\b/.test(text)
    )) return true;
    if (/^(?:ambos|ambas|mayoreo|menudeo|(?:venta )?al publico|al detalle|minoristas?|retail|consumidor)\b/.test(text) && text.length<=100) return true;
    if (/^precios?(?:\s+estimad[oa]s?)?\s+(?:en|para)\s+.{1,100}$/i.test(text)) return true;
    // La referencia o el verbo de modificación pesan más que la aparición
    // de otro activo. «¿Y el peso mexicano?» y «agrega Brasil» son
    // seguimientos aunque nombren un país, mercado o instrumento.
    if (EXPLICIT_REFERENCE_RE.test(text)) return true;
    if (FOLLOW_UP_ACTION_RE.test(text) && text.length <= 260) return true;
    // Preguntas breves como «¿qué impacto tendría?» omiten el sujeto porque
    // la persona espera que el chat conserve el turno anterior.
    if (IMPLICIT_FOLLOW_UP_RE.test(text) && text.length <= 220) return true;
    // Modificadores sin sujeto: «en 2024», «para México», «con fuentes».
    if (/^(?:en|de|para|desde|hasta|con|sin)\s+.{1,120}$/i.test(text)) return true;
    if (/^(?:solo|solamente)\s+(?:(?:en|de|para)\s+)?[\p{L}\s]{1,80}$/iu.test(text)) return true;
    if (EXPLICIT_NEW_SUBJECT_RE.test(text)) return false;
    if (DOMAIN_SUBJECT_RE.test(text) && !PRIOR_OBJECT_RE.test(text)) return false;
    return false;
}

function conversationAnchor(history = []) {
    const turns = visibleTurns(history, 80);
    let anchor = '';
    for (let index = 0; index < turns.length; index++) {
        const turn = turns[index];
        if (turn.role !== 'user') continue;
        if (!anchor || !isLikelyFollowUp(turn.text, turns.slice(0, index))) {
            anchor = turn.text;
        }
    }
    return balancedExcerpt(anchor, 1800);
}

function conversationFocus(message, history = []) {
    const followUp = isLikelyFollowUp(message, history);
    const anchor = followUp ? conversationAnchor(history) : '';
    const turns = visibleTurns(history, 16);
    const recent = turns.map(turn => ({ ...turn, text: balancedExcerpt(turn.text, turn.role === 'assistant' ? 1500 : 1800) }));
    return { followUp, anchor, recent };
}

function conversationInstruction(message, history = []) {
    const focus = conversationFocus(message, history);
    if (!focus.followUp) return '';
    const recentUserRefinements = focus.recent
        .filter(turn => turn.role === 'user' && turn.text !== focus.anchor)
        .slice(-5)
        .map((turn, index) => `${index + 1}. ${balancedExcerpt(turn.text, 700)}`);
    const lastAssistant = [...focus.recent].reverse().find(turn => turn.role === 'assistant');
    const lines = [
        '[INTENCION CONVERSACIONAL RESUELTA]',
        '[MEMORIA ACTIVA DE LA CONVERSACION]',
        focus.anchor ? `Encargo o tema base: ${focus.anchor}` : 'Encargo base: usa el historial reciente.',
        recentUserRefinements.length ? `Ajustes posteriores del usuario, en orden:\n${recentUserRefinements.join('\n')}` : '',
        lastAssistant ? `Ultima respuesta entregada, para resolver referencias y correcciones: ${balancedExcerpt(lastAssistant.text, 1400)}` : '',
        `Peticion actual: ${String(message || '').trim()}`,
        'Resuelve la peticion actual como continuacion del mismo encargo. Conserva activo, pais, periodo, unidad, formato, comparadores y objetivo ya acordados; cambia solamente los elementos que el usuario modifique de forma expresa.',
        'La instruccion actual tiene prioridad si sustituye un dato anterior. Una palabra nueva no borra el resto del encargo: por ejemplo, "agrega Brasil" suma Brasil a la comparacion y "ahora en tabla" conserva los mismos datos y cambia el formato.',
        'No respondas la frase actual como una consulta aislada. Entrega el resultado actualizado o la ampliacion solicitada, no una explicacion de lo que vas a hacer.',
        'No vuelvas a pedir datos que ya aparecen en el historial. Si corriges la respuesta anterior, reemplaza el punto incorrecto en vez de defenderlo.',
    ].filter(Boolean);
    return lines.join('\n');
}

module.exports = {
    normalizeForIntent,
    visibleTurns,
    balancedExcerpt,
    isLikelyFollowUp,
    conversationAnchor,
    conversationFocus,
    conversationInstruction,
};
