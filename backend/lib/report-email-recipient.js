'use strict';

function normalizeRecipient(input,fallback) {
    const value=input===undefined || input===null ? fallback : input;
    if(typeof value!=='string' || /[\r\n\x00-\x1f\x7f]/.test(value)) throw Object.assign(Error('Introduce un solo correo de destino válido.'),{status:400});
    const email=value.trim().toLowerCase();
    const [local,domain,...extra]=email.split('@');
    if(email.length>254 || !local || local.length>64 || !domain || extra.length || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local) || local.startsWith('.') || local.endsWith('.') || local.includes('..') || !domain.includes('.') || !domain.split('.').every(label=>label.length<=63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label))) {
        throw Object.assign(Error('Introduce un solo correo de destino válido.'),{status:400});
    }
    return email;
}

module.exports={normalizeRecipient};
