'use strict';

const PROGRAMMING_RE = /\b(?:programaci[oó]n|programar|programa(?:r|do|dor)?|c[oó]digo|script|javascript|typescript|python|java|php|react|angular|vue|node\.?js|backend|frontend|base de datos|sql|html|css|desarrolla(?:r)?\s+(?:una\s+)?(?:app|aplicaci[oó]n|web)|crear?\s+(?:una\s+)?api|endpoint|debug|bug)\b/i;
const DOMAIN_RE = /\b(?:econom[ií]a|econ[oó]mic[oa]s?|finanzas?|financier[oa]s?|mercados?|inversi[oó]n|inversiones|acci[oó]n|acciones|bolsa|bmv|ipc|bonos?|deuda|cr[eé]dito|tasas?|inter[eé]s|inflaci[oó]n|banxico|banco central|fed|cetes|tiie|udibonos?|divisas?|forex|tipo de cambio|d[oó]lar|usd|mxn|peso mexicano|euro|commodit(?:y|ies)|materias primas|ma[ií]z|trigo|soya|soja|petr[oó]leo|wti|gas natural|cobre|aluminio|prote[ií]nas?|ganado|porcino|pollo|cerdo|agropecuari[oa]|agricultura|geopol[ií]tica|conflicto|guerra|sanciones?|aranceles?|comercio internacional|m[eé]xico|inegi|hacienda|shcp|pemex|cripto|bitcoin|ethereum|noticias?|riesgo|escenarios?|empresa|empresarial|cadena de suministro)\b/i;
const PLATFORM_RE = /\b(?:vall(?:\s|-)?ai|vallnews|plataforma|p[aá]gina|secci[oó]n|chatbox|chat|reporte|exportar|descargar|configuraci[oó]n|contrase[nñ]a|iniciar sesi[oó]n|suscripci[oó]n)\b/i;
const SOCIAL_RE = /^(?:hola|buenos d[ií]as|buenas tardes|buenas noches|gracias|muchas gracias|adi[oó]s|ok|vale|entendido)[!,.?\s]*$/i;
const FOLLOW_UP_RE = /^[¿¡\s]*(?:y\b|pero\b|entonces\b|adem[aá]s\b|tambi[eé]n\b|eso\b|esa\b|ese\b|estos?\b|estas?\b|por qu[eé]\b|c[oó]mo\b|cu[aá]l\b|cu[aá]nto\b|comp[aá]ral[oa]\b|graf[ií]cal[oa]\b|expl[ií]cal[oa]\b)/i;

function previousUserMessage(history = []) {
    if (!Array.isArray(history)) return '';
    for (let index = history.length - 1; index >= 0; index--) {
        const item = history[index];
        if (item?.role === 'user') return String(item.content || item.text || '');
    }
    return '';
}

function domainDecision({ message = '', history = [], attachments = [] } = {}) {
    const text = String(message || '').trim();
    if (!text) return { allowed: false, reason: 'empty' };
    if (PROGRAMMING_RE.test(text)) return { allowed: false, reason: 'programming' };
    if (DOMAIN_RE.test(text) || PLATFORM_RE.test(text) || SOCIAL_RE.test(text)) return { allowed: true, reason: 'domain' };
    if (Array.isArray(attachments) && attachments.length) return { allowed: true, reason: 'attachment' };

    const previous = previousUserMessage(history);
    if (FOLLOW_UP_RE.test(text) && DOMAIN_RE.test(previous) && !PROGRAMMING_RE.test(previous)) {
        return { allowed: true, reason: 'follow_up' };
    }
    return { allowed: false, reason: 'off_topic' };
}

function domainRedirectText(reason = 'off_topic') {
    if (reason === 'programming') {
        return 'VALL-AI está especializado exclusivamente en información económica y empresarial. No puedo crear código, programas, aplicaciones ni soluciones de desarrollo. Puedo ayudarte a analizar mercados, finanzas, divisas, commodities, geopolítica, México o información agropecuaria.';
    }
    return 'VALL-AI está especializado exclusivamente en economía, finanzas, mercados, divisas, commodities, geopolítica, México e información agropecuaria y empresarial. Reformula tu consulta dentro de alguno de esos temas y con gusto la analizo.';
}

module.exports = { PROGRAMMING_RE, DOMAIN_RE, PLATFORM_RE, domainDecision, domainRedirectText };
