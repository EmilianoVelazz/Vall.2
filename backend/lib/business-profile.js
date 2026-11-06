'use strict';
function normalizeBusinessProfile(value = {}) {
    if (!value || typeof value !== 'object') value = {};
    return {
        products: [...new Set((Array.isArray(value.products) ? value.products : []).filter(id=>['pork','poultry','eggs','beef'].includes(id)))],
        markets: (Array.isArray(value.markets) ? value.markets : []).filter(s=>typeof s === 'string').map(s=>s.trim().slice(0,80)).filter(Boolean).slice(0,10),
        currency: /^(?:MXN|USD|EUR|CAD|BRL|GBP)$/.test(value.currency || '') ? value.currency : '',
        role: ['merchant','buyer','producer','investor'].includes(value.role) ? value.role : 'merchant',
    };
}
module.exports = { normalizeBusinessProfile };
