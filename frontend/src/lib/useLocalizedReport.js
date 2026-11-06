import {useEffect,useRef,useState} from 'react';
import {reportJsonRequest} from './reportRequest.js';
import {isReportDocument} from './reportDataValidation.js';

export function useLocalizedReport(report,title,language,owner) {
  const source=report ? JSON.stringify(report) : '',key=JSON.stringify([owner,language,title,source]);
  const cache=useRef(new Map()),[retry,setRetry]=useState(0),[result,setResult]=useState(null);
  useEffect(()=>{
    cache.current.clear();setResult(null);
  },[owner]);
  useEffect(()=>{
    if(language==='es' || !source || !owner) return undefined;
    const controller=new AbortController();
    const cached=cache.current.get(key);
    if(cached) {setResult({key,report:cached});return undefined;}
    async function translate() {
      const deadline=Date.now()+110000;
      for(let attempt=0; ;attempt++) {
        controller.signal.throwIfAborted();
        try {
          return await reportJsonRequest('/api/report-localize',{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json','X-VALL-Report-Language':language},body:JSON.stringify({executiveReport:JSON.parse(source),title,language,expectedOwner:owner})},{expectedOwner:owner,timeoutMs:Math.max(1,deadline-Date.now()),errorMessage:'No se pudo traducir la vista previa.',timeoutMessage:'La traducción tardó demasiado. Puedes volver a intentarlo.'});
        } catch(error) {
          if(controller.signal.aborted || attempt>=2 || Date.now()+5000>=deadline || !(error.status===429 || error.status===503 && !error.code)) throw error;
          await new Promise(resolve=>setTimeout(resolve,5000));
        }
      }
    }
    const timer=setTimeout(()=>{
      translate()
        .then(payload=>{
          if(controller.signal.aborted) return;
          if(payload.language!==language || !isReportDocument(payload.report)) throw Error('La traducción no coincide con el idioma seleccionado.');
          if(cache.current.size>=6) cache.current.delete(cache.current.keys().next().value);
          cache.current.set(key,payload.report);setResult({key,report:payload.report});
        })
        .catch(error=>{if(!controller.signal.aborted) setResult({key,error:error.message});});
    },250);
    return ()=>{clearTimeout(timer);controller.abort();};
  },[source,title,language,owner,key,retry]);
  return {
    report:language==='es' ? report : result?.key===key ? result.report || null : null,
    pending:language!=='es' && Boolean(report) && (!owner || result?.key!==key),
    error:language!=='es' && result?.key===key ? result.error || '' : '',
    retry:()=>{cache.current.delete(key);setResult(null);setRetry(value=>value+1);},
  };
}
