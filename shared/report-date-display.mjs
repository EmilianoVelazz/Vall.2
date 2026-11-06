// Presentation only: preserve the original instant and identify its timezone.
export function displayReportDates(value,locale='es-MX'){
  if(typeof value!=='string')return value;
  return value.replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})\b/g,stamp=>{
    const date=new Date(stamp);return Number.isFinite(date.getTime()) ? date.toLocaleString(locale,{timeZone:'UTC',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})+' UTC' : stamp;
  });
}
