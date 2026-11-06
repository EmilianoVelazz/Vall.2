'use strict';

/*
 * Catálogo explícito de fuentes para inteligencia de proteínas.
 *
 * El catálogo NO convierte una fuente en dato vivo por sí solo. `integration`
 * declara el estado técnico real del canal. Una conexión de portal sólo prueba
 * disponibilidad y trazabilidad; VALL-AI no puede atribuirle una cifra hasta
 * que un adaptador descargue y normalice unidad, periodo y serie. Las fuentes
 * se mantienen por separado porque precio de productor, mayoreo, consumidor,
 * producción y sanidad miden fenómenos distintos.
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
    { id: 'ca_statcan_hog_production', country: 'Canadá', name: 'Statistics Canada · Producción porcina', coverage: 'Producción anual de carne de cerdo, inventario y variables pecuarias relacionadas', cadence: 'Anual', access: 'API pública WDS y tabla 32-10-0126-01', integration: 'connected', authority: 'Estadística oficial', url: 'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3210012601' },
    { id: 'global_faostat', country: 'Global', name: 'FAOSTAT', coverage: 'Producción, consumo, comercio y balance alimentario', cadence: 'Anual', access: 'API/descarga pública', integration: 'connected', url: 'https://www.fao.org/faostat/' },
    { id: 'global_worldbank', country: 'Global', name: 'Banco Mundial', coverage: 'Índices de producción pecuaria y macroeconomía', cadence: 'Anual/mensual según serie', access: 'API pública', integration: 'connected', url: 'https://data.worldbank.org/' },
    { id: 'us_ers_livestock_trade', country: 'Estados Unidos', name: 'USDA ERS · Comercio pecuario', coverage: 'Importación y exportación de ganado, carne, aves y huevo por producto y socio comercial', cadence: 'Mensual/anual', access: 'CSV público estructurado', integration: 'scheduled_ingestion', authority: 'Estadística oficial', url: 'https://www.ers.usda.gov/data-products/livestock-and-meat-international-trade-data/' },
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
    { id: 'vn_nso_livestock', country: 'Vietnam', name: 'National Statistics Office · Agricultura', coverage: 'Inventario y producción de cerdo, bovino y aves por provincia', cadence: 'Anual', access: 'Tablas y anuario público', integration: 'scheduled_ingestion', authority: 'Estadística oficial', url: 'https://www.nso.gov.vn/en/agriculture-forestry-and-fishery/' },
    { id: 'tr_turkstat_livestock', country: 'Türkiye', name: 'TÜİK · Estadísticas Pecuarias', coverage: 'Inventario, carne de ave, huevos y producción animal', cadence: 'Mensual/anual', access: 'Portal de datos y microdatos', integration: 'scheduled_ingestion', authority: 'Estadística oficial', url: 'https://veriportali.tuik.gov.tr/en/press-releases' },
    { id: 'br_mapa_sif', country: 'Brasil', name: 'MAPA · SIF', coverage: 'Sacrificio mensual inspeccionado por especie y estado', cadence: 'Mensual', access: 'Consulta pública', integration: 'scheduled_ingestion', authority: 'Registro administrativo oficial', url: 'https://sistemas.agricultura.gov.br/pga_sigsif/pages/view/sigsif/abatesexouf/indexAbateSexoPorUf.xhtml' },
    { id: 'global_uncomtrade', country: 'Global', name: 'UN Comtrade', coverage: 'Importaciones y exportaciones declaradas de carne, animales y alimentos para ganado', cadence: 'Mensual/anual', access: 'API con registro gratuito', integration: 'requires_config', env: 'UN_COMTRADE_API_KEY', authority: 'Naciones Unidas · estadísticas reportadas', url: 'https://comtradeplus.un.org/' },
    { id: 'global_oecd_fao_outlook', country: 'Global', name: 'OECD-FAO Agricultural Outlook', coverage: 'Series históricas y proyecciones de producción, consumo, comercio y precios de carne', cadence: 'Anual', access: 'API SDMX pública', integration: 'scheduled_ingestion', authority: 'Organismos multilaterales', url: 'https://data-explorer.oecd.org/vis?df[ds]=DisseminateFinalDMZ&df[id]=DSD_AGR@DF_OUTLOOK_2025_2034&df[ag]=OECD.TAD.ATM' },
    { id: 'global_oecd_sdmx', country: 'Global', name: 'OECD · SDMX API', coverage: 'Series agrícolas y de perspectiva comparables entre países; proyecciones separadas del dato observado', cadence: 'Anual', access: 'API SDMX pública', integration: 'scheduled_ingestion', authority: 'Organismo multilateral', url: 'https://sdmx.oecd.org/public/rest' },
    { id: 'global_amis', country: 'Global', name: 'AMIS · Agricultural Market Information System', coverage: 'Oferta, existencias, comercio y precios de maíz y soya para costo de alimentación', cadence: 'Mensual', access: 'Portal multilateral y boletines', integration: 'scheduled_ingestion', authority: 'Plataforma interagencial G20', url: 'https://www.amis-outlook.org/' },
    // Cobertura ampliada: se registran primero los organismos que publican
    // estadísticas o registros administrativos. Permanecen fuera de los cálculos
    // hasta que cada conector normalice unidad, periodicidad y fecha de corte.
    { id: 'us_census_trade', country: 'Estados Unidos', name: 'U.S. Census Bureau · Foreign Trade', coverage: 'Comercio exterior declarado por producto, país y periodo; contraste de flujos pecuarios', cadence: 'Mensual/anual', access: 'API y descargas públicas', integration: 'scheduled_ingestion', authority: 'Estadística oficial', url: 'https://www.census.gov/foreign-trade/data/index.html' },
    { id: 'eu_adis', country: 'Unión Europea', name: 'Comisión Europea · ADIS', coverage: 'Notificaciones y situación de enfermedades animales en la Unión Europea', cadence: 'Continua', access: 'Portal público', integration: 'scheduled_ingestion', authority: 'Autoridad sanitaria oficial', url: 'https://food.ec.europa.eu/animals/animal-diseases/animal-disease-information-system-adis_en' },
    { id: 'uk_defra_livestock', country: 'Reino Unido', name: 'DEFRA · Estadísticas ganaderas', coverage: 'Inventarios, sacrificio, producción y estructura pecuaria británica', cadence: 'Mensual/anual', access: 'Open data y publicaciones oficiales', integration: 'scheduled_ingestion', authority: 'Estadística oficial', url: 'https://www.gov.uk/government/collections/agricultural-statistics-and-climate-change' },
    { id: 'fr_agreste', country: 'Francia', name: 'Agreste · Estadística Agrícola', coverage: 'Inventarios, producción animal, sacrificio y series agrícolas francesas', cadence: 'Mensual/anual', access: 'Tablas, visualizaciones y datos abiertos', integration: 'scheduled_ingestion', authority: 'Estadística oficial', url: 'https://www.agreste.agriculture.gouv.fr/agreste-web/' },
    { id: 'nl_cbs_livestock', country: 'Países Bajos', name: 'CBS · Agricultura y Ganadería', coverage: 'Censo agrícola, ganado, uso de tierra y producción por región', cadence: 'Anual', access: 'API StatLine y descargas', integration: 'scheduled_ingestion', authority: 'Estadística oficial', url: 'https://www.cbs.nl/en-gb/figures/detail/80783eng' },
    { id: 'dk_statbank_livestock', country: 'Dinamarca', name: 'Statistics Denmark · StatBank', coverage: 'Inventario, sacrificio, producción y comercio pecuario danés', cadence: 'Mensual/anual', access: 'API StatBank pública', integration: 'scheduled_ingestion', authority: 'Estadística oficial', url: 'https://www.statbank.dk/' },
    { id: 'ie_cso_livestock', country: 'Irlanda', name: 'Central Statistics Office · Agricultura', coverage: 'Ganado, sacrificio, producción y precios agropecuarios irlandeses', cadence: 'Mensual/anual', access: 'PxStat y descargas públicas', integration: 'scheduled_ingestion', authority: 'Estadística oficial', url: 'https://www.cso.ie/en/statistics/agriculture/' },
    { id: 'pl_gus_agriculture', country: 'Polonia', name: 'Statistics Poland · Agricultura', coverage: 'Población animal, producción, sacrificio y estadísticas rurales polacas', cadence: 'Anual', access: 'Banco de datos local y publicaciones', integration: 'scheduled_ingestion', authority: 'Estadística oficial', url: 'https://stat.gov.pl/en/topics/agriculture-forestry/' },
    { id: 'au_abs_livestock', country: 'Australia', name: 'Australian Bureau of Statistics · Livestock', coverage: 'Inventario y producción ganadera australiana por especie', cadence: 'Anual', access: 'Tablas y descargas públicas', integration: 'scheduled_ingestion', authority: 'Estadística oficial', url: 'https://www.abs.gov.au/statistics/industry/agriculture/australian-agriculture-livestock' },
    { id: 'au_abares_farm', country: 'Australia', name: 'ABARES · Farm Data Portal', coverage: 'Costos, desempeño, producción y estructura de explotaciones agropecuarias', cadence: 'Anual', access: 'CSV y panel público', integration: 'scheduled_ingestion', authority: 'Estadística oficial', url: 'https://www.agriculture.gov.au/abares/data/farm-data-portal' },
    { id: 'th_oae_agriculture', country: 'Tailandia', name: 'Office of Agricultural Economics', coverage: 'Producción, precios y comercio agropecuario tailandés, incluido ganado y alimento', cadence: 'Mensual/anual', access: 'Portal y publicaciones oficiales', integration: 'scheduled_ingestion', authority: 'Estadística oficial', url: 'https://www.oae.go.th/' },
    { id: 'tw_moa_open_data', country: 'Taiwán', name: 'Ministry of Agriculture · Open Data', coverage: 'Producción, precios mayoristas, inventario y comercio agropecuario taiwanés', cadence: 'Diaria/mensual', access: 'Portal de datos abiertos', integration: 'scheduled_ingestion', authority: 'Autoridad agrícola oficial', url: 'https://www.moa.gov.tw/' },
    { id: 'za_dalrrd_livestock', country: 'Sudáfrica', name: 'DALRRD · Estadísticas Pecuarias', coverage: 'Inventario, sacrificio, precios y comercio agropecuario sudafricano', cadence: 'Mensual/anual', access: 'Informes y estadísticas públicas', integration: 'scheduled_ingestion', authority: 'Autoridad agrícola oficial', url: 'https://www.nda.gov.za/' },
    { id: 'ke_knbs_agriculture', country: 'Kenia', name: 'Kenya National Bureau of Statistics · Agricultura', coverage: 'Inventario, producción y precios agropecuarios de Kenia', cadence: 'Anual', access: 'Anuarios y portal estadístico', integration: 'scheduled_ingestion', authority: 'Estadística oficial', url: 'https://www.knbs.or.ke/' },
    { id: 'global_fao_giews', country: 'Global', name: 'FAO · GIEWS', coverage: 'Precios alimentarios, balances de cereales, riesgos de producción y alertas de seguridad alimentaria', cadence: 'Continua/mensual', access: 'Portal y datos públicos', integration: 'scheduled_ingestion', authority: 'Organismo multilateral', url: 'https://www.fao.org/giews' },
    { id: 'global_fao_fpma', country: 'Global', name: 'FAO · FPMA', coverage: 'Precios domésticos e internacionales de alimentos para contexto de granos y alimentación animal', cadence: 'Continua/mensual', access: 'Portal público de monitoreo de precios', integration: 'scheduled_ingestion', authority: 'Organismo multilateral', url: 'https://www.fao.org/giews/food-prices/' },
]);

// La ingesta de fuentes de portal no se ejecuta dentro de la petición HTTP: un
// recorrido completo puede tardar varios segundos y no debe hacer lenta la
// navegación. El conector persiste aquí su último resultado y el catálogo lo
// usa para distinguir una fuente sólo registrada de una conexión comprobada.
const fs = require('fs');
const path = require('path');
const CONNECTIONS_FILE = path.join(__dirname, '../cache/protein-source-connections.json');
const CONNECTION_MAX_AGE_MS = 30 * 60 * 60 * 1000;

function getSourceConnectionStatuses() {
    try {
        const saved = JSON.parse(fs.readFileSync(CONNECTIONS_FILE, 'utf8'));
        return saved && typeof saved.connections === 'object' ? saved.connections : {};
    } catch {
        return {};
    }
}

function activeConnection(source) {
    const connection = getSourceConnectionStatuses()[source.id];
    const checkedAt = Date.parse(connection?.checked_at || '');
    if (connection?.status !== 'connected' || !Number.isFinite(checkedAt)) return null;
    return Date.now() - checkedAt <= CONNECTION_MAX_AGE_MS ? connection : null;
}

function recentConnection(source) {
    const connection = getSourceConnectionStatuses()[source.id];
    const checkedAt = Date.parse(connection?.checked_at || '');
    return Number.isFinite(checkedAt) && Date.now() - checkedAt <= CONNECTION_MAX_AGE_MS ? connection : null;
}

function available(source) {
    if (source.integration === 'connected') return true;
    if (activeConnection(source)) return true;
    // No basta con que exista una variable: sólo los adaptadores que ya
    // normalizan una serie pueden presentarse como disponibles.
    return ['us_nass', 'mx_inegi'].includes(source.id)
        && source.integration === 'requires_config'
        && Boolean(source.env && process.env[source.env]);
}

function integrationState(source) {
    // Una clave no es suficiente por sí sola: este cambio a "connected" sólo
    // se aplica a adaptadores que ya existen y normalizan datos reales.
    if (['us_nass', 'mx_inegi'].includes(source.id) && available(source)) return 'connected';
    if (['eu_eurostat', 'br_ibge'].includes(source.id)) return 'connected';
    if (source.integration === 'scheduled_ingestion' && activeConnection(source)) return 'connected';
    return source.integration;
}

function sourceCatalog() {
    const sources = SOURCES.map((source) => {
        const connection = recentConnection(source);
        return {
            ...source,
            integration: integrationState(source),
            available: available(source),
            // El detalle permite auditar la conexión en UI/API sin exponer
            // credenciales ni el cuerpo completo del proveedor.
            connection: connection ? {
                status: connection.status,
                checked_at: connection.checked_at,
                content_type: connection.content_type || null,
                title: connection.title || null,
                mode: connection.mode || 'official_portal',
                error: connection.error || null,
                next_action: connection.next_action || null,
            } : null,
        };
    });
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
    summary.verifiedChannels = sources.filter(source => source.connection?.status === 'connected').length;
    summary.unavailableChannels = sources.filter(source => source.connection?.status === 'unavailable').length;
    return { generatedAt: new Date().toISOString(), summary, sources };
}

module.exports = { SOURCES, sourceCatalog, getSourceConnectionStatuses };
