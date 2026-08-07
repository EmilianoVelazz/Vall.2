/*
 * Genera assets/js/world-map-data.js: el mapa mundial en trazos SVG ya proyectados.
 *
 * Se ejecuta a mano cuando cambia el catálogo o el mapa base:
 *     node scripts/build-world-map.mjs
 *
 * Por qué existe: el navegador no debe cargar d3 ni pedir un GeoJSON en cada
 * visita. Aquí se hace una vez el trabajo caro (decodificar TopoJSON, proyectar,
 * redondear) y se emite un archivo estático que la página solo lee.
 *
 * Entrada: scripts/data/countries-110m.json — world-atlas 110m, derivado de
 * Natural Earth, DOMINIO PÚBLICO. Está vendorizado en el repo a propósito: la
 * red corporativa intercepta TLS y `fetch` falla desde Node con
 * UNABLE_TO_GET_ISSUER_CERT_LOCALLY. Para actualizarlo:
 *     Invoke-WebRequest -Uri 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json' `
 *         -OutFile scripts/data/countries-110m.json -UseBasicParsing
 *
 * El script además VALIDA que cada clave de world-exchanges.js corresponda a un
 * país real del mapa, y falla si alguna no coincide: es la única forma de saber
 * que catálogo y geometría siguen unidos.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/* d3-geo entró como dependencia transitiva de mermaid. Se importa por ruta
   absoluta porque este script puede ejecutarse desde cualquier directorio. */
const d3geo = await import(pathToFileURL(path.join(ROOT, 'node_modules', 'd3-geo', 'src', 'index.js')).href);
const { geoNaturalEarth1, geoPath } = d3geo;

const ANCHO = 1000;
const ALTO = 500;
const DECIMALES = 1;

/* Centro financiero de cada país del catálogo, en [lon, lat].
 *
 * Se marca la ciudad donde está la bolsa, no el centroide del país: a 1000 px
 * para 360° un grado son menos de 3 px, así que la ciudad cae donde debe, y el
 * centroide de países con territorios de ultramar (Francia con Guayana, Estados
 * Unidos con Alaska) caería en medio del océano.
 *
 * El marcador también resuelve el problema de escala: Catar, Israel o Países
 * Bajos son demasiado pequeños para clicarlos como polígono, y Hong Kong y
 * Singapur ni siquiera existen como polígono en el mapa de 110m.
 *
 * La clave es el nombre de Natural Earth, igual que en world-exchanges.js. */
const CENTROS = {
    'United States of America': [-74.0, 40.7],   // Nueva York
    'Canada': [-79.4, 43.7],                     // Toronto
    'Brazil': [-46.6, -23.5],                    // São Paulo
    'Argentina': [-58.4, -34.6],                 // Buenos Aires
    'Chile': [-70.7, -33.4],                     // Santiago
    'Colombia': [-74.1, 4.7],                    // Bogotá
    'Peru': [-77.0, -12.0],                      // Lima
    'United Kingdom': [-0.1, 51.5],              // Londres
    'Germany': [8.7, 50.1],                      // Fráncfort
    'France': [2.35, 48.85],                     // París
    'Spain': [-3.7, 40.4],                       // Madrid
    'Italy': [9.2, 45.5],                        // Milán
    'Netherlands': [4.9, 52.4],                  // Ámsterdam
    'Switzerland': [8.5, 47.4],                  // Zúrich
    'Sweden': [18.1, 59.3],                      // Estocolmo
    'Norway': [10.75, 59.9],                     // Oslo
    'Denmark': [12.6, 55.7],                     // Copenhague
    'Finland': [25.0, 60.2],                     // Helsinki
    'Belgium': [4.35, 50.85],                    // Bruselas
    'Portugal': [-9.1, 38.7],                    // Lisboa
    'Austria': [16.4, 48.2],                     // Viena
    'Ireland': [-6.3, 53.3],                     // Dublín
    'Poland': [21.0, 52.2],                      // Varsovia
    'Greece': [23.7, 38.0],                      // Atenas
    'Russia': [37.6, 55.75],                     // Moscú
    'Turkey': [29.0, 41.0],                      // Estambul
    'Japan': [139.7, 35.7],                      // Tokio
    'China': [121.5, 31.2],                      // Shanghái
    'Hong Kong': [114.17, 22.32],                // sin polígono a 110m
    'Singapore': [103.82, 1.35],                 // sin polígono a 110m
    'South Korea': [127.0, 37.55],               // Seúl
    'Taiwan': [121.5, 25.05],                    // Taipéi
    'India': [72.9, 19.1],                       // Bombay
    'Indonesia': [106.85, -6.2],                 // Yakarta
    'Malaysia': [101.7, 3.15],                   // Kuala Lumpur
    'Thailand': [100.5, 13.75],                  // Bangkok
    'Philippines': [121.0, 14.6],                // Manila
    'Vietnam': [106.7, 10.8],                    // Ciudad Ho Chi Minh
    'Australia': [151.2, -33.87],                // Sídney
    'New Zealand': [174.8, -41.3],               // Wellington
    'South Africa': [28.0, -26.2],               // Johannesburgo
    'Egypt': [31.25, 30.05],                     // El Cairo
    'Nigeria': [3.4, 6.45],                      // Lagos
    'Morocco': [-7.6, 33.6],                     // Casablanca
    'Saudi Arabia': [46.7, 24.7],                // Riad
    'United Arab Emirates': [55.3, 25.3],        // Dubái
    'Israel': [34.8, 32.1],                      // Tel Aviv
    'Qatar': [51.5, 25.3],                       // Doha
    'Kuwait': [47.98, 29.4],                     // Kuwait
};

/* ── TopoJSON → GeoJSON ──────────────────────────────────────────────────────
   Se decodifica a mano en vez de instalar topojson-client: son treinta líneas y
   evita sumar una dependencia al proyecto. El formato guarda las coordenadas
   cuantizadas y en deltas; hay que acumularlas y deshacer la transformación. */
function decodificarArcos(topo) {
    const [sx, sy] = topo.transform.scale;
    const [tx, ty] = topo.transform.translate;
    return topo.arcs.map(arco => {
        let x = 0, y = 0;
        return arco.map(([dx, dy]) => {
            x += dx; y += dy;
            return [x * sx + tx, y * sy + ty];
        });
    });
}

/* Un índice negativo significa "este arco, recorrido al revés". ~i es su posición. */
function arco(indice, arcos) {
    return indice < 0 ? arcos[~indice].slice().reverse() : arcos[indice];
}

/* Un anillo encadena varios arcos; el primer punto de cada uno repite el último
   del anterior, así que se descarta salvo en el arco inicial. */
function anillo(indices, arcos) {
    const puntos = [];
    indices.forEach((indice, i) => {
        const tramo = arco(indice, arcos);
        puntos.push(...(i ? tramo.slice(1) : tramo));
    });
    return puntos;
}

function aGeometria(geom, arcos) {
    if (geom.type === 'Polygon') {
        return { type: 'Polygon', coordinates: geom.arcs.map(r => anillo(r, arcos)) };
    }
    if (geom.type === 'MultiPolygon') {
        return { type: 'MultiPolygon', coordinates: geom.arcs.map(p => p.map(r => anillo(r, arcos))) };
    }
    return null;
}

/* ── Catálogo ────────────────────────────────────────────────────────────────
   Se ejecuta world-exchanges.js con un `window` falso para leer las claves tal
   cual las usa el navegador, en vez de adivinarlas con una expresión regular. */
function leerCatalogo() {
    const src = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'world-exchanges.js'), 'utf8');
    const ventana = {};
    new Function('window', src)(ventana);
    if (!ventana.VN_WORLD_EXCHANGES) throw new Error('world-exchanges.js no definió window.VN_WORLD_EXCHANGES');
    return ventana.VN_WORLD_EXCHANGES;
}

/* ── Generación ──────────────────────────────────────────────────────────── */
const topo = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'data', 'countries-110m.json'), 'utf8'));
const arcos = decodificarArcos(topo);
const catalogo = leerCatalogo();

const proyeccion = geoNaturalEarth1();
const trazar = geoPath(proyeccion);

/* Países que no se dibujan. Se descartan ANTES de encuadrar, así que también
   dejan de influir en el centrado del mapa.
     Antarctica  no tiene bolsas y su masa empuja el resto del mundo hacia
                 arriba, dejando el mapa descentrado.
     Mexico      excluido por decisión de producto (2026-08-07), no por
                 geometría: se pidió retirarlo del mapa por completo. Para
                 devolverlo basta con quitarlo de esta lista, volver a añadir su
                 entrada en CENTROS y su bloque en world-exchanges.js. */
const EXCLUIDOS = new Set(['Antarctica', 'Mexico']);
const geometrias = topo.objects.countries.geometries.filter(g => !EXCLUIDOS.has(g.properties?.name));

const coleccion = {
    type: 'FeatureCollection',
    features: geometrias.map(g => ({ type: 'Feature', properties: g.properties, geometry: aGeometria(g, arcos) })),
};
proyeccion.fitSize([ANCHO, ALTO], coleccion);

/* geoPath escribe coordenadas con toda la precisión del double. A esta escala
   basta un decimal y el archivo baja a menos de la mitad. */
const redondear = d => d.replace(/-?\d+\.\d+/g, n => Number(n).toFixed(DECIMALES));

const paises = [];
for (const feature of coleccion.features) {
    const nombre = feature.properties?.name;
    const d = trazar(feature);
    if (!nombre || !d) continue;
    paises.push({ ne: nombre, d: redondear(d) });
}

/* Marcadores del centro financiero, proyectados al mismo lienzo. */
const centros = {};
for (const [nombre, lonLat] of Object.entries(CENTROS)) {
    const xy = proyeccion(lonLat);
    if (!xy) throw new Error(`No se pudo proyectar el centro de ${nombre}`);
    centros[nombre] = { x: +xy[0].toFixed(DECIMALES), y: +xy[1].toFixed(DECIMALES) };
}

/* ── Validación: catálogo, geometría y centros deben coincidir ───────────── */
const nombresMapa = new Set(paises.map(p => p.ne));
const problemas = [];
for (const clave of Object.keys(catalogo)) {
    if (!nombresMapa.has(clave) && !centros[clave]) {
        problemas.push(`"${clave}" no existe en el mapa ni tiene centro financiero`);
    } else if (!centros[clave]) {
        problemas.push(`"${clave}" no tiene entrada en CENTROS: quedaría sin marcador`);
    }
}
for (const clave of Object.keys(CENTROS)) {
    if (!catalogo[clave]) problemas.push(`CENTROS tiene "${clave}", pero el catálogo no lo incluye`);
}
if (problemas.length) {
    console.error('\n  El catálogo y el mapa no cuadran:\n');
    problemas.forEach(p => console.error(`      ${p}`));
    console.error('\n  Las claves deben ser el nombre del país en Natural Earth.\n');
    process.exit(1);
}

const salida = `/*
 * ARCHIVO GENERADO — no editar a mano.
 * Lo produce scripts/build-world-map.mjs a partir de scripts/data/countries-110m.json
 * (world-atlas 110m, derivado de Natural Earth, dominio público).
 *
 * Trazos ya proyectados con d3-geo (Natural Earth I) sobre un lienzo de ${ANCHO}x${ALTO}.
 * El navegador no necesita d3 ni pedir nada por red: solo lee estos datos.
 *
 * \`ne\` es el nombre del país en Natural Earth y es la llave que une este archivo
 * con world-exchanges.js.
 */
(function () {
    window.VN_WORLD_MAP = {
        ancho: ${ANCHO},
        alto: ${ALTO},
        generado: ${JSON.stringify(new Date().toISOString().slice(0, 10))},
        centros: ${JSON.stringify(centros)},
        paises: [
${paises.map(p => `            { ne: ${JSON.stringify(p.ne)}, d: ${JSON.stringify(p.d)} },`).join('\n')}
        ],
    };
})();
`;

const destino = path.join(ROOT, 'assets', 'js', 'world-map-data.js');
fs.writeFileSync(destino, salida, 'utf8');

const kb = (Buffer.byteLength(salida, 'utf8') / 1024).toFixed(1);
const conBolsas = Object.keys(catalogo).length;
const totalBolsas = Object.values(catalogo).reduce((n, p) => n + p.bolsas.length, 0);
console.log(`  world-map-data.js  ${paises.length} países  ${Object.keys(centros).length} marcadores  ${kb} KB`);
console.log(`  catálogo           ${conBolsas} países con bolsa  ${totalBolsas} bolsas  — todas las claves coinciden`);
