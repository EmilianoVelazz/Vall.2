'use strict';

function newsIsoDate(value) {
    const text=String(value || '').trim();
    const compact=text.match(/^(\d{4})(\d{2})(\d{2})T?(\d{2})(\d{2})(\d{2})Z?$/);
    const normalized=compact ? `${compact[1]}-${compact[2]}-${compact[3]}T${compact[4]}:${compact[5]}:${compact[6]}Z` : text;
    const date=new Date(normalized);
    if(!Number.isFinite(date.getTime()))return null;
    const iso=date.toISOString();
    return compact && iso.replace('.000','')!==normalized ? null : iso;
}

module.exports={newsIsoDate};
