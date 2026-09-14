const fs = require('fs');
const path = require('path');
const { scrapeSNIIM } = require('./sniim-scraper');

const CACHE_FILE = path.join(__dirname, '..', 'sniim-cache.json');
const CACHE_TTL = 12 * 60 * 60 * 1000; // 12 horas

let inMemoryCache = null;

/**
 * Carga o actualiza los datos del SNIIM.
 */
async function getSNIIMData() {
    // 1. Revisar memoria
    if (inMemoryCache && (Date.now() - inMemoryCache.ts < CACHE_TTL)) {
        return inMemoryCache;
    }

    // 2. Revisar disco
    try {
        if (fs.existsSync(CACHE_FILE)) {
            const fileData = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
            if (Date.now() - fileData.ts < CACHE_TTL) {
                inMemoryCache = fileData;
                return inMemoryCache;
            }
        }
    } catch (err) {
        console.error('[SNIIM Service] Error leyendo caché de disco:', err.message);
    }

    // 3. Obtener frescos vía scraper
    console.log('[SNIIM Service] Caché expirada o vacía. Ejecutando scraper...');
    try {
        const freshData = await scrapeSNIIM();
        inMemoryCache = freshData;
        fs.writeFileSync(CACHE_FILE, JSON.stringify(freshData, null, 2));
        return freshData;
    } catch (err) {
        console.error('[SNIIM Service] Error haciendo scraping, intentando usar caché vieja:', err.message);
        if (inMemoryCache) return inMemoryCache;
        if (fs.existsSync(CACHE_FILE)) {
            return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        }
        throw new Error('No hay datos SNIIM disponibles ni en caché ni en línea.');
    }
}

/**
 * Expone un helper para iniciar la caché al arrancar el servidor
 */
function initSNIIMWarmer() {
    console.log('[SNIIM] Iniciando warmer local...');
    getSNIIMData().catch(e => console.error('[SNIIM] Warmer inicial falló:', e.message));
    setInterval(() => {
        console.log('[SNIIM] Ejecutando warmer programado...');
        getSNIIMData().catch(e => console.error('[SNIIM] Warmer falló:', e.message));
    }, CACHE_TTL);
}

module.exports = {
    getSNIIMData,
    initSNIIMWarmer
};
