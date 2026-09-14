// Puppeteer es ESM desde sus versiones recientes. No debe cargarse al iniciar
// la API: Vercel evalúa todos los módulos de las rutas aunque solo se consulte
// /api/login, y un require() aquí impedía arrancar la función completa.
async function launchLocalBrowser() {
  const module = await import('puppeteer');
  const puppeteer = module.default || module;
  return puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
}

function useStaticReference(data, { fallback = false } = {}) {
  data.cerdo = fallback ? { norte: 48.00, centro: 46.00, sur: 47.50 } : { norte: 48.50, centro: 46.20, sur: 47.80 };
  data.res   = fallback ? { norte: 108.00, centro: 104.00, sur: 106.50 } : { norte: 110.00, centro: 105.50, sur: 108.00 };
  data.pollo = fallback ? { norte: 41.50, centro: 38.00, sur: 39.50 } : { norte: 42.00, centro: 38.50, sur: 40.00 };
  data.huevo = fallback ? { norte: 35.00, centro: 32.50, sur: 34.00 } : { norte: 35.50, centro: 32.00, sur: 34.50 };
}

/**
 * Scraper del SNIIM (Secretaría de Economía)
 * Extrae precios representativos físicos de Norte, Centro y Sur.
 *
 * ⚠️ NOTA DE VERACIDAD: El sitio del SNIIM usa ASP.NET WebForms legacy.
 * El parsing real de sus tablas dinámicas requiere interactuar con postbacks.
 * Cuando el scraping real falla (o no está implementado), se devuelven
 * valores de REFERENCIA ESTÁTICA claramente etiquetados como tales.
 * NUNCA se presentan como datos de mercado en tiempo real.
 */
async function scrapeSNIIM() {
  const data = {
    ts: Date.now(),
    cerdo: { norte: 0, centro: 0, sur: 0 },
    res: { norte: 0, centro: 0, sur: 0 },
    pollo: { norte: 0, centro: 0, sur: 0 },
    huevo: { norte: 0, centro: 0, sur: 0 },
    // Metadatos de veracidad
    _meta: {
      source: 'SNIIM',
      real_time: false,
      type: 'STATIC_REFERENCE',
      disclaimer: 'Valores de referencia estáticos. El scraping real del SNIIM no está operativo. Estos números NO reflejan precios actuales del mercado físico mexicano.',
      last_verified_date: '2025-06-15',
      methodology: 'Promedios históricos observados en centrales de abasto (2024-2025). No son cotizaciones en vivo.'
    }
  };

  let browser;
  try {
    // El scraper todavía solo entrega referencias etiquetadas; lanzar Chrome
    // dentro de una función serverless no aporta datos nuevos y puede hacer
    // fallar todas las rutas de la API por el coste y la incompatibilidad ESM.
    if (process.env.VERCEL) {
      useStaticReference(data);
      return data;
    }

    console.log('[SNIIM Scraper] Iniciando extracción de precios de México...');
    browser = await launchLocalBrowser();
    
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(30000);
    
    try {
        await page.goto('http://www.economia-sniim.gob.mx/Nuevo/', { waitUntil: 'domcontentloaded' });
        
        // TODO: Implementar parsing real de tablas ASP.NET WebForms.
        // El SNIIM requiere interactuar con __VIEWSTATE y postbacks para
        // navegar entre categorías (Pecuario → Cerdo en pie, etc.)
        // Por ahora se devuelven referencias estáticas ETIQUETADAS.
        
        useStaticReference(data);
        data._meta.real_time = false;
        data._meta.type = 'STATIC_REFERENCE';
        console.log('[SNIIM Scraper] ⚠️ Datos estáticos de referencia cargados (scraping real no implementado).');
    } catch (navError) {
        console.warn('[SNIIM Scraper] Timeout en SNIIM. Usando fallback de seguridad.');
        useStaticReference(data, { fallback: true });
        data._meta.real_time = false;
        data._meta.type = 'FALLBACK_STATIC';
        data._meta.disclaimer = 'Conexión al SNIIM fallida. Valores de respaldo estáticos, NO son precios reales.';
    }

  } catch (error) {
    console.error('[SNIIM Scraper] Error crítico:', error);
    data._meta.type = 'ERROR_FALLBACK';
  } finally {
    if (browser) await browser.close();
  }

  return data;
}

module.exports = { scrapeSNIIM };
