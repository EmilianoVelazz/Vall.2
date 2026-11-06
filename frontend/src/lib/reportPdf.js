// La respuesta binaria evita enlaces temporales y permite mostrar errores de
// sesión o generación antes de abrir el visor integrado del navegador.
import { withReportRequest } from './reportRequest.js';
import {leerIdioma} from './idioma.js';

export function requestReportPdf(report, title, content, fetchPdf = fetch, options = {}) {
  return requestReportFile(report,title,content,'pdf',fetchPdf,options);
}

export function requestReportFile(report,title,content,format='pdf',fetchPdf=fetch,options={}) {
  const language=options.language ?? leerIdioma();
  const fileLabel=format==='xlsx' ? 'Excel' : format==='csv' ? 'CSV' : 'PDF';
  return withReportRequest(async signal => {
    const response = await fetchPdf('/api/report-export', {
      method: 'POST', credentials: 'include', cache: 'no-store',
      headers: { 'Content-Type': 'application/json','X-VALL-Report-Language':language }, signal,
      body: JSON.stringify({ title, content, executiveReport: report, format,language,response: 'file',...(options.expectedOwner ? {expectedOwner:options.expectedOwner} : {}) }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => { signal.throwIfAborted(); return {}; });
      throw Object.assign(new Error(response.status === 401 ? 'Tu sesión venció. Inicia sesión de nuevo para exportar el informe.'
        : response.status===429 ? 'Alcanzaste el límite de exportaciones. Espera unos minutos y vuelve a intentarlo.'
        : payload.error || `No se pudo generar el ${fileLabel}. Inténtalo de nuevo.`),{status:response.status,code:payload.code});
    }
    if (!(format==='xlsx' ? /^application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet(?:;|$)/i : format==='csv' ? /^text\/csv(?:;|$)/i : /^application\/pdf(?:;|$)/i).test(response.headers.get('content-type') || '')) {
      throw new Error(`El servidor no devolvió un ${fileLabel} válido. Inténtalo de nuevo.`);
    }
    const blob = await response.blob();
    if(format==='pdf' && await blob.slice(0, 5).text() !== '%PDF-') throw new Error('El PDF está incompleto. Inténtalo de nuevo.');
    if(!blob.size) throw Error('El archivo está incompleto. Inténtalo de nuevo.');
    if(language!=='es' && response.headers.get('content-language')!==language) throw Object.assign(Error('El archivo no coincide con el idioma elegido. Vuelve a generarlo.'),{code:'REPORT_LANGUAGE_MISMATCH'});
    return blob;
  }, { timeoutMs: language==='es' ? 45000 : 120000, timeoutMessage: 'La exportación tardó demasiado. Tu informe sigue disponible; puedes volver a intentarlo.', ...options });
}
