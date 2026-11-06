import policy from '../../../shared/report-number-format.json' with {type:'json'};
export function reportNumber(value,digits=policy.maximumFractionDigits) {
  return Number.isFinite(value) ? value.toLocaleString(policy.locale,{maximumFractionDigits:digits}) : 'Sin dato';
}
export function reportAxisDigits(minimum,maximum) {
  const step=Math.abs(maximum-minimum)/2;
  return Number.isFinite(step) && step>0
    ? Math.min(policy.maximumFractionDigits,Math.max(policy.minimumAxisFractionDigits,Math.ceil(-Math.log10(step))+1))
    : policy.minimumAxisFractionDigits;
}
