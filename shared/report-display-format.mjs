// Display rules never overwrite observations or change CSV precision.
export function displayReferenceLabel(value){
  return String(value ?? '').replace(/ · ref\. [a-f0-9]{10,}$/i,'');
}
export function displayDigits(value,unit=''){
  let digits=/por 1 USD|\bUSD\/[A-Z]{3}\b|\b(?:MXN|EUR|CAD|BRL|PEN)\s+por\b/.test(unit) ? 5 : /%|p\.\s?p\.|pb\b|bps\b/.test(unit) ? 3 : 2;
  if(Number.isFinite(value) && value!==0 && Math.abs(value)<10**-digits)digits=Math.min(8,Math.ceil(-Math.log10(Math.abs(value)))+1);
  return digits;
}
export function displayNumber(value,unit='',locale='es-MX'){
  if(Number.isFinite(value) && value!==0 && Math.abs(value)<1e-8)return value.toLocaleString(locale,{notation:'scientific',maximumSignificantDigits:3});
  return Number.isFinite(value) ? value.toLocaleString(locale,{maximumFractionDigits:displayDigits(value,unit)}) : 'Sin dato';
}
