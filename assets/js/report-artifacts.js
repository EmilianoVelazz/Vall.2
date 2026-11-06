/* Enlaces privados conservados en el historial. Recuperar un PDF no consulta
   de nuevo al modelo: reutiliza el contenido guardado de esa respuesta. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.VNReportArtifacts = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';
    function validUrl(value) { return /^\/api\/report-download\/[a-f0-9]{48}$/.test(String(value || '')); }
    function selectedLanguage() {
        if(typeof document!=='undefined' && ['es','en','fr','it','de','ja'].includes(document.documentElement.lang)) return document.documentElement.lang;
        let value;try {const stored=JSON.parse(localStorage.getItem('vn_lang'));value=typeof stored==='string' ? stored : stored?.lang;} catch { /* blocked storage */ }
        if(!value && typeof document!=='undefined') value=document.documentElement.lang;
        return ['es','en','fr','it','de','ja'].includes(value) ? value : 'es';
    }
    async function ensure({ artifact, rebuild, language=selectedLanguage(),fetchFile = (...args) => fetch(...args) }) {
        if (validUrl(artifact?.downloadUrl) && (artifact.language || 'es')===language) {
            const response = await fetchFile(artifact.downloadUrl, { method: 'HEAD', credentials: 'include', cache: 'no-store', signal: AbortSignal.timeout(10000) });
            if (response.ok) return artifact;
            if (response.status === 401 || response.status === 403) throw new Error('Vuelve a iniciar sesión para abrir tu PDF guardado.');
            if (![404, 410].includes(response.status)) throw new Error('No se pudo comprobar el PDF guardado. Intenta de nuevo.');
        }
        const restored = await rebuild();
        if (!validUrl(restored?.downloadUrl)) throw new Error('No se pudo guardar el PDF.');
        if((restored.language || 'es')!==language) throw new Error('El PDF no coincide con el idioma elegido. Vuelve a generarlo.');
        return restored;
    }
    return { validUrl, ensure,selectedLanguage };
});
