// Currency conversion does not transform live-weight, carcass or cut prices into one another.
export function priceToMxnKg(value, unit = '', currency = '', usdMxn, fxRates = null) {
  if (!Number.isFinite(value) || value <= 0) return null;

  const u = String(unit).toLowerCase();
  const c = String(currency).toUpperCase();
  const eurMxn = Number(fxRates?.eurMxn);

  if (c && !['MXN', 'USD', 'US¢', 'EUR'].includes(c)) return null;

  const unitMxn = /mxn/.test(u);
  const unitUsd = /usd|us[¢c]/.test(u);
  const unitEur = /\beur\b|€/.test(u);

  const currencyHits = [unitMxn, unitUsd, unitEur].filter(Boolean).length;
  if (currencyHits > 1) return null;
  if (c === 'MXN' && (unitUsd || unitEur)) return null;
  if (['USD', 'US¢'].includes(c) && (unitMxn || unitEur)) return null;
  if (c === 'EUR' && (unitMxn || unitUsd)) return null;

  const isMxn = c === 'MXN' || unitMxn;
  const isUsd = ['USD', 'US¢'].includes(c) || unitUsd;
  const isEur = c === 'EUR' || unitEur;

  if (!isMxn && !isUsd && !isEur) return null;
  if (isUsd && !(Number.isFinite(usdMxn) && usdMxn > 0)) return null;
  if (isEur && !(Number.isFinite(eurMxn) && eurMxn > 0)) return null;

  const isCents = /us[¢c]/.test(u) || c === 'US¢';
  let kgPerUnit;
  if (/cwt|100\s*lb/.test(u)) kgPerUnit = 45.359237;
  else if (/\blb\b/.test(u)) kgPerUnit = 0.45359237;
  else if (/100\s*kg/.test(u)) kgPerUnit = 100;
  else if (/\/\s*(?:t\b|ton\b|tonelada)/.test(u)) kgPerUnit = 1000;
  else if (/\bkg\b/.test(u)) kgPerUnit = 1;
  else return null;

  const fx = isMxn ? 1 : isEur ? eurMxn : usdMxn;
  return (value / (isCents ? 100 : 1) / kgPerUnit) * fx;
}
