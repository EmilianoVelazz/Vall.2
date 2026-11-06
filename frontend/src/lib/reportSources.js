const labelKey=value=>value.replace(/\s+/g,' ').trim().toLocaleLowerCase('es');

// A publisher can provide several documents. Only identical references are
// duplicates; sharing a publisher name must never hide another source URL.
export function sourceEntries(report) {
  const entries=[],seen=new Set(),linkedLabels=new Set(),declarations=new Set();
  for(const source of report?.sourceLinks || []) {
    let url='',domain='';
    try {
      const parsed=new URL(source?.url);
      if(['https:','http:'].includes(parsed.protocol) && !parsed.username && !parsed.password) {
        url=parsed.href;domain=parsed.hostname.replace(/^www\./,'');
      }
    } catch { /* An unusable link remains a plain reference if it has a label. */ }
    const label=String(source?.label || domain).trim();
    if(!label) continue;
    const key=labelKey(label)+'\n'+url;
    if(seen.has(key)) continue;
    seen.add(key);entries.push({label,url,domain});
    if(url) {
      linkedLabels.add(labelKey(label));
      for(const address of [url,String(source.url).trim()]) declarations.add(labelKey(label+': '+address));
    }
  }
  // Suppress plain repetitions only after collecting every valid link, so a
  // broken duplicate can never displace a traceable document.
  const result=entries.filter(entry=>entry.url || !linkedLabels.has(labelKey(entry.label)));
  const plainLabels=new Set(result.filter(entry=>!entry.url).map(entry=>labelKey(entry.label)));
  for(const source of report?.sources || []) {
    const label=String(source || '').trim(),key=labelKey(label);
    if(!key || linkedLabels.has(key) || declarations.has(key) || plainLabels.has(key)) continue;
    plainLabels.add(key);result.push({label,url:'',domain:''});
  }
  return result;
}
