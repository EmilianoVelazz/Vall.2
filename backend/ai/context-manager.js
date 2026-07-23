'use strict';

const { cleanString } = require('./response-schema');

function createContext({ pageContext, marketSnapshot, userProfile, toolResults } = {}) {
    const sections = [];
    const add = (label, value, max) => {
        const cleaned = cleanString(value, max);
        if (cleaned) sections.push(`[${label}]\n${cleaned}`);
    };
    add('PÁGINA ACTUAL', pageContext, 7000);
    add('DATOS DE MERCADO', marketSnapshot, 5000);
    add('PREFERENCIAS DEL USUARIO', userProfile, 2500);
    if (Array.isArray(toolResults)) {
        toolResults.slice(0, 8).forEach((result, index) => add(`RESULTADO DE HERRAMIENTA ${index + 1}`, result?.content || result, 4000));
    }
    return sections.join('\n\n');
}

module.exports = { createContext };
