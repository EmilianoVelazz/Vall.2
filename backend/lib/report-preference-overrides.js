'use strict';
const fields=require('../../shared/report-creation-fields.json');

function normalizePreferenceOverrides(input) {
    if(input==null) return [];
    if(!Array.isArray(input) || input.length>fields.length || input.some(key=>typeof key!=='string' || !fields.includes(key))) {
        throw Object.assign(Error('Las preferencias elegidas del informe no son válidas.'),{status:400});
    }
    return fields.filter(key=>input.includes(key));
}

function applyPreferenceOverrides(inferred,settings,keys) {
    const result={...inferred,sections:{...inferred.sections}};
    for(const key of keys) {
        if(key.startsWith('sections.')) result.sections[key.slice(9)]=settings.sections[key.slice(9)];
        else result[key]=settings[key];
    }
    return result;
}

module.exports={normalizePreferenceOverrides,applyPreferenceOverrides};
