/*
 * Catálogo de bolsas de valores por país, para el mapa mundial de Finanzas › Bolsa.
 *
 * Las CLAVES son los nombres de país tal como los escribe Natural Earth (el mapa
 * que genera scripts/build-world-map.mjs). No se traducen ni se corrigen aquí:
 * son la llave que une catálogo y geometría. Si una clave no coincide, el país
 * queda inerte en el mapa y el generador lo reporta al ejecutarse. El nombre que
 * ve el usuario es `pais`.
 *
 * "Hong Kong" y "Singapore" no son polígonos en el mapa de 110m: se dibujan como
 * marcadores de punto. El generador los proyecta en VN_WORLD_MAP.centros.
 *
 * `simbolo` es un ticker de Yahoo Finance. Debe existir en UNA de estas dos
 * listas o no traerá dato: exchangeConfig de finanzas-favro.js (los que refresca
 * el motor en vivo) o WORLD_INDEX_TICKERS de backend/routes/market.js (los que
 * sirve /api/world-indices). Una bolsa sin `simbolo` se muestra como ficha
 * informativa, sin números: NO se inventan precios para rellenar.
 *
 * Todo ticker aquí está verificado contra la API: devolvió al menos dos velas
 * diarias en un rango de 5 días. Si agregas uno, compruébalo antes con
 * /api/stock-history?ticker=XXX&interval=1d&range=5d.
 *
 * ── Por qué 19 bolsas siguen sin `simbolo` (revisado 2026-08-07) ─────────────
 * No es un olvido. Se probaron sus tickers contra la API y ninguno sirve:
 *
 *   Sin datos en Yahoo (0 velas, o HTTP 502):
 *     Chile ^IPSA · Colombia ^COLCAP · Perú ^SPBLPGPT · Rusia IMOEX.ME
 *     Marruecos ^MASI · Catar ^QSI · Kuwait ^BKP · Nigeria ^NGSEINDX
 *     EAU ^DFMGI y DFMGI.AE · Polonia WIG20.WA, ^WIG20 y WIG.WA
 *     Egipto ^CASE30 y ^EGX30 · Vietnam ^VNINDEX
 *
 *   Datos CONGELADOS: sus velas son consecutivas, pero la más reciente es de
 *   hace semanas. Pintar el país con eso diría algo falso sobre el mercado de
 *   hoy, así que se prefiere dejarlo gris:
 *     Tailandia ^SET.BK · Filipinas PSEI.PS · Arabia Saudita ^TASI.SR
 *
 *   Velas separadas por semanas: la "variación" sería un salto entre huecos y
 *   no un movimiento de sesión:
 *     Grecia GD.AT (21 días entre sus dos últimas velas) y ^ATG
 *
 *   Sin índice bursátil propio que cotizar:
 *     Alemania · Börse Stuttgart (renta fija y certificados)
 *     China · Beijing Stock Exchange · EAU · ADX
 *
 * Para Vietnam existe VNM, pero es un ETF estadounidense en dólares que sigue al
 * mercado vietnamita: NO es el VN-Index de la bolsa de Ho Chi Minh, así que
 * presentarlo como tal sería incorrecto.
 *
 * `tz` es un identificador IANA: el panel calcula la hora local con Intl, así que
 * el dato es correcto sin necesidad de registrar horarios de operación.
 */
(function () {
    window.VN_WORLD_EXCHANGES = {
        /* ── América ────────────────────────────────────────────────────────── */
        'United States of America': {
            pais: 'Estados Unidos', bandera: '🇺🇸', tz: 'America/New_York',
            bolsas: [
                { nombre: 'New York Stock Exchange', sigla: 'NYSE', ciudad: 'Nueva York', mic: 'XNYS', indice: 'S&P 500', simbolo: '^GSPC' },
                { nombre: 'Nasdaq Stock Market', sigla: 'Nasdaq', ciudad: 'Nueva York', mic: 'XNAS', indice: 'Nasdaq 100', simbolo: '^NDX' },
                { nombre: 'Cboe Global Markets', sigla: 'Cboe', ciudad: 'Chicago', mic: 'XCBO', indice: 'VIX · volatilidad', simbolo: '^VIX' },
            ],
        },
        'Canada': {
            pais: 'Canadá', bandera: '🇨🇦', tz: 'America/Toronto',
            bolsas: [
                { nombre: 'Toronto Stock Exchange', sigla: 'TSX', ciudad: 'Toronto', mic: 'XTSE', indice: 'S&P/TSX Composite', simbolo: '^GSPTSE' },
                { nombre: 'TSX Venture Exchange', sigla: 'TSXV', ciudad: 'Calgary', mic: 'XTSX', indice: 'S&P/TSX Venture', simbolo: '^SPCDNX' },
            ],
        },
        /* México se retiró del mapa el 2026-08-07 por decisión de producto: no
           se dibuja su polígono ni su marcador. La exclusión del polígono está
           en EXCLUIDOS, dentro de scripts/build-world-map.mjs. Para devolverlo
           hay que revertir las tres cosas: este bloque, su entrada en CENTROS y
           su nombre en EXCLUIDOS. */
        'Brazil': {
            pais: 'Brasil', bandera: '🇧🇷', tz: 'America/Sao_Paulo',
            bolsas: [
                { nombre: 'B3 — Brasil, Bolsa, Balcão', sigla: 'B3', ciudad: 'São Paulo', mic: 'BVMF', indice: 'Ibovespa', simbolo: '^BVSP' },
            ],
        },
        'Argentina': {
            pais: 'Argentina', bandera: '🇦🇷', tz: 'America/Argentina/Buenos_Aires',
            bolsas: [
                { nombre: 'Bolsas y Mercados Argentinos', sigla: 'BYMA', ciudad: 'Buenos Aires', mic: 'XBUE', indice: 'S&P Merval', simbolo: '^MERV' },
            ],
        },
        'Chile': {
            pais: 'Chile', bandera: '🇨🇱', tz: 'America/Santiago',
            bolsas: [
                { nombre: 'Bolsa de Santiago', sigla: 'BCS', ciudad: 'Santiago', mic: 'XSGO', indice: 'S&P IPSA' },
            ],
        },
        'Colombia': {
            pais: 'Colombia', bandera: '🇨🇴', tz: 'America/Bogota',
            bolsas: [
                { nombre: 'Bolsa de Valores de Colombia', sigla: 'bvc', ciudad: 'Bogotá', mic: 'XBOG', indice: 'MSCI COLCAP' },
            ],
        },
        'Peru': {
            pais: 'Perú', bandera: '🇵🇪', tz: 'America/Lima',
            bolsas: [
                { nombre: 'Bolsa de Valores de Lima', sigla: 'BVL', ciudad: 'Lima', mic: 'XLIM', indice: 'S&P/BVL Perú General' },
            ],
        },

        /* ── Europa ─────────────────────────────────────────────────────────── */
        'United Kingdom': {
            pais: 'Reino Unido', bandera: '🇬🇧', tz: 'Europe/London',
            bolsas: [
                { nombre: 'London Stock Exchange', sigla: 'LSE', ciudad: 'Londres', mic: 'XLON', indice: 'FTSE 100', simbolo: '^FTSE' },
            ],
        },
        'Germany': {
            pais: 'Alemania', bandera: '🇩🇪', tz: 'Europe/Berlin',
            bolsas: [
                { nombre: 'Deutsche Börse — Xetra', sigla: 'Xetra', ciudad: 'Fráncfort', mic: 'XETR', indice: 'DAX 40', simbolo: '^GDAXI' },
                { nombre: 'Börse Stuttgart', sigla: 'Stuttgart', ciudad: 'Stuttgart', mic: 'XSTU', indice: 'Renta fija y certificados' },
            ],
        },
        'France': {
            pais: 'Francia', bandera: '🇫🇷', tz: 'Europe/Paris',
            bolsas: [
                { nombre: 'Euronext Paris', sigla: 'Euronext', ciudad: 'París', mic: 'XPAR', indice: 'CAC 40', simbolo: '^FCHI' },
            ],
        },
        'Spain': {
            pais: 'España', bandera: '🇪🇸', tz: 'Europe/Madrid',
            bolsas: [
                { nombre: 'Bolsas y Mercados Españoles', sigla: 'BME', ciudad: 'Madrid', mic: 'XMAD', indice: 'IBEX 35', simbolo: '^IBEX' },
            ],
        },
        'Italy': {
            pais: 'Italia', bandera: '🇮🇹', tz: 'Europe/Rome',
            bolsas: [
                { nombre: 'Euronext Milan (Borsa Italiana)', sigla: 'Borsa Italiana', ciudad: 'Milán', mic: 'XMIL', indice: 'FTSE MIB', simbolo: 'FTSEMIB.MI' },
            ],
        },
        'Netherlands': {
            pais: 'Países Bajos', bandera: '🇳🇱', tz: 'Europe/Amsterdam',
            bolsas: [
                { nombre: 'Euronext Amsterdam', sigla: 'Euronext', ciudad: 'Ámsterdam', mic: 'XAMS', indice: 'AEX', simbolo: '^AEX' },
            ],
        },
        'Switzerland': {
            pais: 'Suiza', bandera: '🇨🇭', tz: 'Europe/Zurich',
            bolsas: [
                { nombre: 'SIX Swiss Exchange', sigla: 'SIX', ciudad: 'Zúrich', mic: 'XSWX', indice: 'SMI', simbolo: '^SSMI' },
            ],
        },
        'Sweden': {
            pais: 'Suecia', bandera: '🇸🇪', tz: 'Europe/Stockholm',
            bolsas: [
                { nombre: 'Nasdaq Stockholm', sigla: 'Nasdaq Nordic', ciudad: 'Estocolmo', mic: 'XSTO', indice: 'OMX Stockholm 30', simbolo: '^OMX' },
            ],
        },
        'Norway': {
            pais: 'Noruega', bandera: '🇳🇴', tz: 'Europe/Oslo',
            bolsas: [
                { nombre: 'Euronext Oslo Børs', sigla: 'Oslo Børs', ciudad: 'Oslo', mic: 'XOSL', indice: 'OSEBX', simbolo: 'OSEBX.OL' },
            ],
        },
        'Denmark': {
            pais: 'Dinamarca', bandera: '🇩🇰', tz: 'Europe/Copenhagen',
            bolsas: [
                { nombre: 'Nasdaq Copenhagen', sigla: 'Nasdaq Nordic', ciudad: 'Copenhague', mic: 'XCSE', indice: 'OMX Copenhagen 25', simbolo: '^OMXC25' },
            ],
        },
        'Finland': {
            pais: 'Finlandia', bandera: '🇫🇮', tz: 'Europe/Helsinki',
            bolsas: [
                { nombre: 'Nasdaq Helsinki', sigla: 'Nasdaq Nordic', ciudad: 'Helsinki', mic: 'XHEL', indice: 'OMX Helsinki 25', simbolo: '^OMXH25' },
            ],
        },
        'Belgium': {
            pais: 'Bélgica', bandera: '🇧🇪', tz: 'Europe/Brussels',
            bolsas: [
                { nombre: 'Euronext Brussels', sigla: 'Euronext', ciudad: 'Bruselas', mic: 'XBRU', indice: 'BEL 20', simbolo: '^BFX' },
            ],
        },
        'Portugal': {
            pais: 'Portugal', bandera: '🇵🇹', tz: 'Europe/Lisbon',
            bolsas: [
                { nombre: 'Euronext Lisbon', sigla: 'Euronext', ciudad: 'Lisboa', mic: 'XLIS', indice: 'PSI', simbolo: 'PSI20.LS' },
            ],
        },
        'Austria': {
            pais: 'Austria', bandera: '🇦🇹', tz: 'Europe/Vienna',
            bolsas: [
                { nombre: 'Wiener Börse', sigla: 'WBAG', ciudad: 'Viena', mic: 'XWBO', indice: 'ATX', simbolo: '^ATX' },
            ],
        },
        'Ireland': {
            pais: 'Irlanda', bandera: '🇮🇪', tz: 'Europe/Dublin',
            bolsas: [
                { nombre: 'Euronext Dublin', sigla: 'Euronext', ciudad: 'Dublín', mic: 'XDUB', indice: 'ISEQ Overall', simbolo: '^ISEQ' },
            ],
        },
        'Poland': {
            pais: 'Polonia', bandera: '🇵🇱', tz: 'Europe/Warsaw',
            bolsas: [
                { nombre: 'Giełda Papierów Wartościowych', sigla: 'GPW', ciudad: 'Varsovia', mic: 'XWAR', indice: 'WIG20' },
            ],
        },
        'Greece': {
            pais: 'Grecia', bandera: '🇬🇷', tz: 'Europe/Athens',
            bolsas: [
                { nombre: 'Athens Stock Exchange', sigla: 'ATHEX', ciudad: 'Atenas', mic: 'XATH', indice: 'ATHEX Composite' },
            ],
        },
        'Russia': {
            pais: 'Rusia', bandera: '🇷🇺', tz: 'Europe/Moscow',
            bolsas: [
                { nombre: 'Moscow Exchange', sigla: 'MOEX', ciudad: 'Moscú', mic: 'MISX', indice: 'Índice MOEX' },
            ],
        },
        'Turkey': {
            pais: 'Turquía', bandera: '🇹🇷', tz: 'Europe/Istanbul',
            bolsas: [
                { nombre: 'Borsa İstanbul', sigla: 'BIST', ciudad: 'Estambul', mic: 'XIST', indice: 'BIST 100', simbolo: 'XU100.IS' },
            ],
        },

        /* ── Asia-Pacífico ──────────────────────────────────────────────────── */
        'Japan': {
            pais: 'Japón', bandera: '🇯🇵', tz: 'Asia/Tokyo',
            bolsas: [
                { nombre: 'Tokyo Stock Exchange (JPX)', sigla: 'TSE', ciudad: 'Tokio', mic: 'XTKS', indice: 'Nikkei 225', simbolo: '^N225' },
            ],
        },
        'China': {
            pais: 'China', bandera: '🇨🇳', tz: 'Asia/Shanghai',
            bolsas: [
                { nombre: 'Shanghai Stock Exchange', sigla: 'SSE', ciudad: 'Shanghái', mic: 'XSHG', indice: 'SSE Composite', simbolo: '000001.SS' },
                { nombre: 'Shenzhen Stock Exchange', sigla: 'SZSE', ciudad: 'Shenzhen', mic: 'XSHE', indice: 'SZSE Component', simbolo: '399001.SZ' },
                { nombre: 'Beijing Stock Exchange', sigla: 'BSE', ciudad: 'Pekín', mic: 'BJSE', indice: 'BSE 50' },
            ],
        },
        'Hong Kong': {
            pais: 'Hong Kong', bandera: '🇭🇰', tz: 'Asia/Hong_Kong', esPunto: true,
            bolsas: [
                { nombre: 'Hong Kong Exchanges and Clearing', sigla: 'HKEX', ciudad: 'Hong Kong', mic: 'XHKG', indice: 'Hang Seng', simbolo: '^HSI' },
            ],
        },
        'Singapore': {
            pais: 'Singapur', bandera: '🇸🇬', tz: 'Asia/Singapore', esPunto: true,
            bolsas: [
                { nombre: 'Singapore Exchange', sigla: 'SGX', ciudad: 'Singapur', mic: 'XSES', indice: 'Straits Times Index', simbolo: '^STI' },
            ],
        },
        'South Korea': {
            pais: 'Corea del Sur', bandera: '🇰🇷', tz: 'Asia/Seoul',
            bolsas: [
                { nombre: 'Korea Exchange', sigla: 'KRX', ciudad: 'Seúl', mic: 'XKRX', indice: 'KOSPI', simbolo: '^KS11' },
            ],
        },
        'Taiwan': {
            pais: 'Taiwán', bandera: '🇹🇼', tz: 'Asia/Taipei',
            bolsas: [
                { nombre: 'Taiwan Stock Exchange', sigla: 'TWSE', ciudad: 'Taipéi', mic: 'XTAI', indice: 'TAIEX', simbolo: '^TWII' },
            ],
        },
        'India': {
            pais: 'India', bandera: '🇮🇳', tz: 'Asia/Kolkata',
            bolsas: [
                { nombre: 'National Stock Exchange of India', sigla: 'NSE', ciudad: 'Bombay', mic: 'XNSE', indice: 'NIFTY 50', simbolo: '^NSEI' },
                { nombre: 'BSE Limited', sigla: 'BSE', ciudad: 'Bombay', mic: 'XBOM', indice: 'S&P BSE SENSEX', simbolo: '^BSESN' },
            ],
        },
        'Indonesia': {
            pais: 'Indonesia', bandera: '🇮🇩', tz: 'Asia/Jakarta',
            bolsas: [
                { nombre: 'Indonesia Stock Exchange', sigla: 'IDX', ciudad: 'Yakarta', mic: 'XIDX', indice: 'IDX Composite', simbolo: '^JKSE' },
            ],
        },
        'Malaysia': {
            pais: 'Malasia', bandera: '🇲🇾', tz: 'Asia/Kuala_Lumpur',
            bolsas: [
                { nombre: 'Bursa Malaysia', sigla: 'Bursa', ciudad: 'Kuala Lumpur', mic: 'XKLS', indice: 'FTSE Bursa Malaysia KLCI', simbolo: '^KLSE' },
            ],
        },
        'Thailand': {
            pais: 'Tailandia', bandera: '🇹🇭', tz: 'Asia/Bangkok',
            bolsas: [
                { nombre: 'Stock Exchange of Thailand', sigla: 'SET', ciudad: 'Bangkok', mic: 'XBKK', indice: 'SET Index' },
            ],
        },
        'Philippines': {
            pais: 'Filipinas', bandera: '🇵🇭', tz: 'Asia/Manila',
            bolsas: [
                { nombre: 'Philippine Stock Exchange', sigla: 'PSE', ciudad: 'Manila', mic: 'XPHS', indice: 'PSEi' },
            ],
        },
        'Vietnam': {
            pais: 'Vietnam', bandera: '🇻🇳', tz: 'Asia/Ho_Chi_Minh',
            bolsas: [
                { nombre: 'Ho Chi Minh Stock Exchange', sigla: 'HOSE', ciudad: 'Ciudad Ho Chi Minh', mic: 'XSTC', indice: 'VN-Index' },
            ],
        },
        'Australia': {
            pais: 'Australia', bandera: '🇦🇺', tz: 'Australia/Sydney',
            bolsas: [
                { nombre: 'Australian Securities Exchange', sigla: 'ASX', ciudad: 'Sídney', mic: 'XASX', indice: 'S&P/ASX 200', simbolo: '^AXJO' },
            ],
        },
        'New Zealand': {
            pais: 'Nueva Zelanda', bandera: '🇳🇿', tz: 'Pacific/Auckland',
            bolsas: [
                { nombre: 'New Zealand Exchange', sigla: 'NZX', ciudad: 'Wellington', mic: 'XNZE', indice: 'S&P/NZX 50', simbolo: '^NZ50' },
            ],
        },

        /* ── África y Medio Oriente ─────────────────────────────────────────── */
        'South Africa': {
            pais: 'Sudáfrica', bandera: '🇿🇦', tz: 'Africa/Johannesburg',
            bolsas: [
                { nombre: 'Johannesburg Stock Exchange', sigla: 'JSE', ciudad: 'Johannesburgo', mic: 'XJSE', indice: 'FTSE/JSE All Share', simbolo: '^J203.JO' },
            ],
        },
        'Egypt': {
            pais: 'Egipto', bandera: '🇪🇬', tz: 'Africa/Cairo',
            bolsas: [
                { nombre: 'The Egyptian Exchange', sigla: 'EGX', ciudad: 'El Cairo', mic: 'XCAI', indice: 'EGX 30' },
            ],
        },
        'Nigeria': {
            pais: 'Nigeria', bandera: '🇳🇬', tz: 'Africa/Lagos',
            bolsas: [
                { nombre: 'Nigerian Exchange Group', sigla: 'NGX', ciudad: 'Lagos', mic: 'XNSA', indice: 'NGX All-Share' },
            ],
        },
        'Morocco': {
            pais: 'Marruecos', bandera: '🇲🇦', tz: 'Africa/Casablanca',
            bolsas: [
                { nombre: 'Bourse de Casablanca', sigla: 'CSE', ciudad: 'Casablanca', mic: 'XCAS', indice: 'MASI' },
            ],
        },
        'Saudi Arabia': {
            pais: 'Arabia Saudita', bandera: '🇸🇦', tz: 'Asia/Riyadh',
            bolsas: [
                { nombre: 'Saudi Exchange (Tadawul)', sigla: 'Tadawul', ciudad: 'Riad', mic: 'XSAU', indice: 'TASI' },
            ],
        },
        'United Arab Emirates': {
            pais: 'Emiratos Árabes Unidos', bandera: '🇦🇪', tz: 'Asia/Dubai',
            bolsas: [
                { nombre: 'Dubai Financial Market', sigla: 'DFM', ciudad: 'Dubái', mic: 'XDFM', indice: 'DFM General' },
                { nombre: 'Abu Dhabi Securities Exchange', sigla: 'ADX', ciudad: 'Abu Dabi', mic: 'XADS', indice: 'FTSE ADX General' },
            ],
        },
        'Israel': {
            pais: 'Israel', bandera: '🇮🇱', tz: 'Asia/Jerusalem',
            bolsas: [
                { nombre: 'Tel Aviv Stock Exchange', sigla: 'TASE', ciudad: 'Tel Aviv', mic: 'XTAE', indice: 'TA-125', simbolo: '^TA125.TA' },
            ],
        },
        'Qatar': {
            pais: 'Catar', bandera: '🇶🇦', tz: 'Asia/Qatar',
            bolsas: [
                { nombre: 'Qatar Stock Exchange', sigla: 'QSE', ciudad: 'Doha', mic: 'DSMD', indice: 'QE Index' },
            ],
        },
        'Kuwait': {
            pais: 'Kuwait', bandera: '🇰🇼', tz: 'Asia/Kuwait',
            bolsas: [
                { nombre: 'Boursa Kuwait', sigla: 'Boursa', ciudad: 'Kuwait', mic: 'XKUW', indice: 'Premier Market Index' },
            ],
        },
    };
})();
