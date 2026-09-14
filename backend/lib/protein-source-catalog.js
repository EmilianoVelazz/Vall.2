'use strict';

/*
 * Catálogo explícito de fuentes para inteligencia de proteínas.
 *
 * El catálogo NO convierte una fuente en dato vivo por sí solo. `integration`
 * declara el estado técnico real para que la UI y VALL-AI nunca atribuyan a una
 * fuente información que aún no se ha descargado. Las fuentes se mantienen por
 * separado porque precio de productor, mayoreo, consumidor, producción y
 * sanidad miden fenómenos distintos.
 */

const SOURCES = Object.freeze([
    { id: 'mx_sniim', country: 'México', name: 'SNIIM', coverage: 'Primera comercialización pecuaria', cadence: 'Diaria/semanal', access: 'Scraper público', integration: 'connected', url: 'https://www.economia-sniim.gob.mx/' },
    { id: 'mx_inegi', country: 'México', name: 'INEGI · BIE', coverage: 'Precios al consumidor de carne y huevo', cadence: 'Mensual', access: 'API con token', integration: 'requires_config', env: 'INEGI_TOKEN', url: 'https://www.inegi.org.mx/servicios/api_indicadores.html' },
    { id: 'mx_siap', country: 'México', name: 'SIAP', coverage: 'Producción, sacrificio y balanza agroalimentaria', cadence: 'Mensual/anual', access: 'Datos abiertos/ingesta', integration: 'scheduled_ingestion', url: 'https://www.gob.mx/siap' },
    { id: 'us_ams_lmpr', country: 'Estados Unidos', name: 'USDA AMS · LMPR', coverage: 'Cutouts y ventas negociadas de cerdo y res', cadence: 'Diaria', access: 'API pública', integration: 'scheduled_ingestion', url: 'https://mpr.datamart.ams.usda.gov/' },
    { id: 'us_nass', country: 'Estados Unidos', name: 'USDA NASS · Quick Stats', coverage: 'Inventario porcino y ganado en corral de engorda nacional; extensible a sacrificio y producción', cadence: 'Mensual/trimestral', access: 'API con clave', integration: 'requires_config', env: 'USDA_NASS_KEY', url: 'https://data.nass.usda.gov/developer/' },
    { id: 'us_fas_psd', country: 'Estados Unidos', name: 'USDA FAS · PSD', coverage: 'Producción, consumo, comercio y existencias globales', cadence: 'Mensual/semestral', access: 'Descarga/API', integration: 'connected', url: 'https://apps.fas.usda.gov/psdonline/' },
    { id: 'us_bls', country: 'Estados Unidos', name: 'BLS · Average Price Data', coverage: 'Precios minoristas de res, cerdo, pollo y huevo', cadence: 'Mensual', access: 'API pública', integration: 'connected', url: 'https://www.bls.gov/data/' },
    { id: 'us_cftc', country: 'Estados Unidos', name: 'CFTC · Commitments of Traders', coverage: 'Posiciones abiertas de futuros agropecuarios', cadence: 'Semanal', access: 'API pública', integration: 'connected', url: 'https://publicreporting.cftc.gov/' },
    { id: 'ca_statcan', country: 'Canadá', name: 'Statistics Canada', coverage: 'Inventario porcino, sacrificio y producción', cadence: 'Mensual/semestral', access: 'API pública', integration: 'connected', url: 'https://www.statcan.gc.ca/en/microdata/api' },
    { id: 'global_faostat', country: 'Global', name: 'FAOSTAT', coverage: 'Producción, consumo, comercio y balance alimentario', cadence: 'Anual', access: 'API/descarga pública', integration: 'connected', url: 'https://www.fao.org/faostat/' },
    { id: 'global_worldbank', country: 'Global', name: 'Banco Mundial', coverage: 'Índices de producción pecuaria y macroeconomía', cadence: 'Anual/mensual según serie', access: 'API pública', integration: 'connected', url: 'https://data.worldbank.org/' },
    { id: 'global_woah', country: 'Global', name: 'WOAH · WAHIS', coverage: 'Alertas oficiales de sanidad animal', cadence: 'Semanal', access: 'Extracción pública validada', integration: 'scheduled_ingestion', url: 'https://wahis.woah.org/' },
    { id: 'eu_agri_portal', country: 'Unión Europea', name: 'Comisión Europea · Agri-food Data Portal', coverage: 'Precios, producción y comercio de cerdo, res, aves y huevo', cadence: 'Semanal/mensual', access: 'API/descarga pública', integration: 'scheduled_ingestion', url: 'https://agridata.ec.europa.eu/extensions/dataportal/agricultural_markets.html' },
    { id: 'eu_eurostat', country: 'Unión Europea', name: 'Eurostat', coverage: 'Censo ganadero, producción y comercio por país', cadence: 'Mensual/anual', access: 'API pública SDMX', integration: 'scheduled_ingestion', url: 'https://ec.europa.eu/eurostat/web/user-guides/data-browser/api-data-access/api-getting-started' },
    { id: 'es_mercolleida', country: 'España', name: 'Mercolleida', coverage: 'Cerdo, lechón, alimento, sacrificio y márgenes', cadence: 'Semanal/mensual', access: 'Supabase tras ingesta autorizada', integration: 'requires_config', env: 'SUPABASE_URL', url: 'https://www.mercolleida.com/' },
    { id: 'br_ibge', country: 'Brasil', name: 'IBGE · SIDRA', coverage: 'Sacrificio, canales, inventario y producción pecuaria', cadence: 'Trimestral/anual', access: 'API pública', integration: 'scheduled_ingestion', url: 'https://sidra.ibge.gov.br/' },
    { id: 'br_abpa', country: 'Brasil', name: 'ABPA', coverage: 'Producción y exportaciones brasileñas de cerdo y aves', cadence: 'Anual', access: 'Informe público', integration: 'connected', url: 'https://abpa-br.org/' },
    { id: 'cl_odepa', country: 'Chile', name: 'ODEPA', coverage: 'Ganado vivo, precios mayoristas, consumidor y comercio', cadence: 'Semanal/mensual', access: 'Datos abiertos', integration: 'scheduled_ingestion', url: 'https://datos.odepa.gob.cl/' },
    { id: 'au_mla', country: 'Australia', name: 'Meat & Livestock Australia', coverage: 'Precios, sacrificio, producción y exportaciones', cadence: 'Diaria/mensual', access: 'API pública con términos de uso', integration: 'scheduled_ingestion', url: 'https://www.mla.com.au/prices-markets/statistics/api/' },
    { id: 'kr_mafra', country: 'Corea del Sur', name: 'MAFRA · Open Data', coverage: 'Precios de subastas y cortes pecuarios', cadence: 'Diaria', access: 'OpenAPI con registro', integration: 'requires_config', env: 'MAFRA_API_KEY', url: 'https://data.mafra.go.kr/main.do' },
    { id: 'uk_ahdb', country: 'Reino Unido', name: 'AHDB', coverage: 'Indicadores de cerdo, aves y comercio británico', cadence: 'Semanal/mensual', access: 'Dashboard/descarga', integration: 'scheduled_ingestion', url: 'https://ahdb.org.uk/' },
    { id: 'cn_maf', country: 'China', name: 'Ministerio de Agricultura y Asuntos Rurales', coverage: 'Producción, inventario y precios mayoristas pecuarios', cadence: 'Semanal/mensual', access: 'Portal oficial; integración por definir', integration: 'research_required', url: 'https://www.moa.gov.cn/' },
    // Fuentes verificadas en septiembre de 2026. Todas son organismos públicos,
    // organismos multilaterales o registros administrativos publicados por ellos.
    // Se incorporan al inventario, no al cálculo, hasta disponer de un conector y
    // una prueba de consistencia para cada serie.
    { id: 'mx_senasica', country: 'México', name: 'SENASICA', coverage: 'Vigilancia epidemiológica y alertas de sanidad animal', cadence: 'Continua', access: 'Portal y boletines oficiales', integration: 'scheduled_ingestion', authority: 'Autoridad sanitaria oficial', url: 'https://www.gob.mx/senasica' },
    { id: 'ar_agro_datos', country: 'Argentina', name: 'Secretaría de Agricultura · Datos Abiertos', coverage: 'Faena, producción, consumo, comercio y precios de carnes', cadence: 'Mensual/anual', access: 'Datos abiertos y tableros públicos', integration: 'scheduled_ingestion', authority: 'Estadística oficial', url: 'https://www.argentina.gob.ar/economia/agricultura/datos-abiertos' },
    { id: 'uy_inac', country: 'Uruguay', name: 'INAC', coverage: 'Faena, precios de hacienda, exportaciones y mercado cárnico', cadence: 'Semanal/mensual', access: 'Estadísticas interactivas y descargas', integration: 'scheduled_ingestion', authority: 'Instituto público sectorial', url: 'https://www.inac.uy/innovaportal/v/29296/37/innova.bs/faena' },
    { id: 'co_dane_esag', country: 'Colombia', name: 'DANE · ESAG', coverage: 'Sacrificio bovino, bufalino, porcino, ovino y caprino; cabezas y peso', cadence: 'Mensual/trimestral', access: 'Datos abiertos, microdatos y boletines', integration: 'scheduled_ingestion', authority: 'Estadística oficial', url: 'https://www.dane.gov.co/index.php/estadisticas-por-tema/agropecuario/encuesta-de-sacrificio-de-ganado' },
    { id: 'ca_aafc_slaughter', country: 'Canadá', name: 'Agriculture and Agri-Food Canada · Red Meat Slaughter', coverage: 'Sacrificio inspeccionado de bovino, porcino, ovino y cordero', cadence: 'Mensual', access: 'Datos abiertos y documentación', integration: 'scheduled_ingestion', authority: 'Estadística administrativa oficial', url: 'https://od-do.agr.gc.ca/MonthlyRedMeatSlaughterDictionaryEn.html' },
    { id: 'us_ers_livestock', country: 'Estados Unidos', name: 'USDA ERS · Livestock & Meat Data', coverage: 'Oferta, uso, consumo y comercio de carne y ganado', cadence: 'Mensual/anual', access: 'Descarga pública', integration: 'scheduled_ingestion', authority: 'Estadística oficial', url: 'https://www.ers.usda.gov/data-products/livestock-meat-domestic-data/' },
    { id: 'nz_stats_agriculture', country: 'Nueva Zelanda', name: 'Stats NZ · Agricultural Production', coverage: 'Inventario bovino, ovino, lechero y producción agropecuaria', cadence: 'Anual', access: 'DataInfo+ y descargas públicas', integration: 'scheduled_ingestion', authority: 'Estadística oficial', url: 'https://www.stats.govt.nz/topics/agriculture/' },
    { id: 'jp_maff_livestock', country: 'Japón', name: 'MAFF · Estadísticas Pecuarias', coverage: 'Sacrificio, producción de canal, precios mayoristas e inventario', cadence: 'Mensual/anual', access: 'Tablas oficiales y e-Stat', integration: 'scheduled_ingestion', authority: 'Estadística oficial', url: 'https://www.maff.go.jp/j/chikusan/shokuniku/lin/' },
    { id: 'ph_psa_livestock', country: 'Filipinas', name: 'Philippine Statistics Authority · Livestock & Poultry', coverage: 'Inventario, producción, sacrificio y precios de granja de cerdo, aves y huevo', cadence: 'Trimestral/anual', access: 'OpenSTAT PX-Web y boletines', integration: 'scheduled_ingestion', authority: 'Estadística oficial', url: 'https://psa.gov.ph/statistics/lp' },
    { id: 'in_dahd_stats', country: 'India', name: 'Department of Animal Husbandry & Dairying', coverage: 'Censo pecuario y producción de carne, huevo, leche y lana', cadence: 'Anual/quinquenal', access: 'Publicaciones oficiales', integration: 'scheduled_ingestion', authority: 'Estadística oficial', url: 'https://www.dahd.gov.in/schemes/programmes/animal-husbandry-statistics' },
    { id: 'id_bps_livestock', country: 'Indonesia', name: 'BPS-Statistics Indonesia · Livestock in Figures', coverage: 'Población, producción, consumo, comercio y precios pecuarios', cadence: 'Anual', access: 'Publicación y tablas públicas', integration: 'scheduled_ingestion', authority: 'Estadística oficial', url: 'https://www.bps.go.id/en/publication/2026/01/09/50771bc6f5761886458558ba/livestock-in-figures-2025.html' },
    { id: 'vn_nso_livestock', country: 'Vietnam', name: 'National Statistics Office · Agricultura', coverage: 'Inventario y producción de cerdo, bovino y aves por provincia', cadence: 'Anual', access: 'Tablas y anuario público', integration: 'scheduled_ingestion', authority: 'Estadística oficial', url: 'https://www.gso.gov.vn/en/agriculture-forestry-and-fishery/' },
    { id: 'tr_turkstat_livestock', country: 'Türkiye', name: 'TÜİK · Estadísticas Pecuarias', coverage: 'Inventario, carne de ave, huevos y producción animal', cadence: 'Mensual/anual', access: 'Portal de datos y microdatos', integration: 'scheduled_ingestion', authority: 'Estadística oficial', url: 'https://veriportali.tuik.gov.tr/en/press-releases' },
    { id: 'br_mapa_sif', country: 'Brasil', name: 'MAPA · SIF', coverage: 'Sacrificio mensual inspeccionado por especie y estado', cadence: 'Mensual', access: 'Consulta pública', integration: 'scheduled_ingestion', authority: 'Registro administrativo oficial', url: 'https://sistemas.agricultura.gov.br/pga_sigsif/pages/view/sigsif/abatesexouf/indexAbateSexoPorUf.xhtml' },
    { id: 'global_uncomtrade', country: 'Global', name: 'UN Comtrade', coverage: 'Importaciones y exportaciones declaradas de carne, animales y alimentos para ganado', cadence: 'Mensual/anual', access: 'API con registro gratuito', integration: 'requires_config', env: 'UN_COMTRADE_API_KEY', authority: 'Naciones Unidas · estadísticas reportadas', url: 'https://comtradeplus.un.org/' },
    { id: 'global_oecd_fao_outlook', country: 'Global', name: 'OECD-FAO Agricultural Outlook', coverage: 'Series históricas y proyecciones de producción, consumo, comercio y precios de carne', cadence: 'Anual', access: 'API SDMX pública', integration: 'scheduled_ingestion', authority: 'Organismos multilaterales', url: 'https://data-explorer.oecd.org/vis?df[ds]=DisseminateFinalDMZ&df[id]=DSD_AGR@DF_OUTLOOK_2025_2034&df[ag]=OECD.TAD.ATM' },
    { id: 'global_amis', country: 'Global', name: 'AMIS · Agricultural Market Information System', coverage: 'Oferta, existencias, comercio y precios de maíz y soya para costo de alimentación', cadence: 'Mensual', access: 'Portal multilateral y boletines', integration: 'scheduled_ingestion', authority: 'Plataforma interagencial G20', url: 'https://www.amis-outlook.org/' },
]);

function available(source) {
    if (source.integration === 'connected') return true;
    if (source.integration !== 'requires_config') return false;
    return Boolean(source.env && process.env[source.env]);
}

function integrationState(source) {
    // Una clave no es suficiente por sí sola: este cambio a "connected" sólo
    // se aplica a adaptadores que ya existen y normalizan datos reales.
    if (['us_nass', 'mx_inegi'].includes(source.id) && available(source)) return 'connected';
    if (['eu_eurostat', 'br_ibge'].includes(source.id)) return 'connected';
    return source.integration;
}

function sourceCatalog() {
    const sources = SOURCES.map((source) => ({ ...source, integration: integrationState(source), available: available(source) }));
    const summary = sources.reduce((acc, source) => {
        acc.total += 1;
        acc[source.integration] = (acc[source.integration] || 0) + 1;
        if (source.available) acc.available += 1;
        return acc;
    }, { total: 0, available: 0 });
    const countries = new Set(sources.map((source) => source.country)).size;
    const officialOrMultilateral = sources.filter((source) =>
        /oficial|públic|multilateral|naciones unidas|interagencial|administrativ/i.test(source.authority || '')
        || ['SNIIM', 'INEGI · BIE', 'SIAP', 'USDA AMS · LMPR', 'USDA NASS · Quick Stats', 'USDA FAS · PSD', 'BLS · Average Price Data', 'CFTC · Commitments of Traders', 'Statistics Canada', 'FAOSTAT', 'Banco Mundial', 'WOAH · WAHIS', 'Comisión Europea · Agri-food Data Portal', 'Eurostat', 'IBGE · SIDRA', 'ODEPA'].includes(source.name)
    ).length;
    summary.countries = countries;
    summary.officialOrMultilateral = officialOrMultilateral;
    return { generatedAt: new Date().toISOString(), summary, sources };
}

module.exports = { sourceCatalog };
