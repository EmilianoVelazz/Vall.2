import {reportHealth} from '../../../shared/report-health.mjs';

// Rendering a spinner or changing PDF pages must not rescan every historical
// observation. New report objects invalidate immediately; age is rechecked at
// least once per minute when the interface renders again.
export function createReportHealthReader({now=Date.now,ttlMs=60000,evaluate=reportHealth}={}) {
  const values=new WeakMap();
  return report=>{
    const instant=now();
    if(!report || typeof report!=='object')return evaluate(report,instant);
    const cached=values.get(report);
    if(cached && instant>=cached.at && instant-cached.at<ttlMs)return cached.value;
    const value=evaluate(report,instant);values.set(report,{at:instant,value});return value;
  };
}
export const readReportHealth=createReportHealthReader();
