// Detect sentences, not tickers, units or official provider names. The original
// evidence stays intact; only the report's displayed prose is localized.
const englishWords=new Set('the and with from that this their which while will could would have has are was were for its says say said tells into than of by in to on is as after before amid over under out off up down at'.split(' '));
const marketWords=new Set('market markets price prices rise rises fall falls bonds yields held exports imports shares stocks higher lower growth earnings economy oil'.split(' '));
export function needsSpanishText(value){
  const text=String(value || '').replace(/https?:\/\/\S+/g,'').replace(/__VNT_\w+__/g,'');
  // Unicode words matter: ASCII \b would read the ending of «días» as «as».
  const words=new Set((text.match(/\p{L}+/gu) || []).map(word=>word.toLowerCase()));
  const markers=[...words].filter(word=>englishWords.has(word)).length,markets=[...words].filter(word=>marketWords.has(word)).length;
  return text.length>=12 && (markers>=2 || markets>=3 || markers>=1 && markets>=2);
}
export function needsSpanishReport(report){
  if(!report)return false;
  const news=[...(report.sessionNews || []),...(report.equityNews || []),...(report.headlines || []),...(report.sourceSnapshot?.headlines || [])];
  return [report.title,report.summary,report.objective,report.closing,...(report.sections || []).flatMap(item=>[item.heading,item.text]),...news.flatMap(item=>[item.title,item.description])].some(needsSpanishText);
}
