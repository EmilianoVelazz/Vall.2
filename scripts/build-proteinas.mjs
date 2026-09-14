/*
 * Genera frontend/src/lib/produccion-proteinas.js a partir de las hojas de
 * balance alimentario de la FAO.
 *
 * ── Por qué FAOSTAT y no el PSD del USDA ───────────────────────────────────
 * El mapa de Granos se alimenta del PSD (produccion-granos.js) y lo natural
 * habría sido seguir ahí. No sirve para esto, y conviene dejar dicho por qué:
 *
 *   1. El PSD no publica HUEVO. Ni en psd_livestock_csv.zip ni en el volcado
 *      completo psd_alldata_csv.zip — se comprobó buscando la cadena en los
 *      202 MB del archivo. El huevo es una de las cuatro proteínas que esta
 *      sección tiene que cubrir, así que la fuente quedaba corta de entrada.
 *   2. Para carne, el PSD solo informa de los países grandes: 37 para res, 31
 *      para cerdo, 42 para pollo en 2025. El resto entra en un «Others» que no
 *      se puede situar en un mapa. Un coroplético con 31 países pintados y 145
 *      grises no dice «aquí no hay cerdos», dice que la fuente no llega.
 *
 * Las hojas de balance de la FAO resuelven las dos cosas: cubren ~180 países
 * uno a uno, incluyen huevo, y traen producción y consumo MEDIDOS CON EL MISMO
 * CRITERIO, que es justo lo que el mapa compara. El precio se sigue tomando del
 * CME, como antes; esto es solo el volumen.
 *
 * A cambio, el último año cerrado es 2023 y no 2025: la FAO cierra sus balances
 * con dos años de retraso. Es el precio de tener consumo por país, y la ficha lo
 * dice.
 *
 * ── Por qué SERIE y no un año suelto ───────────────────────────────────────
 * El volcado trae una columna por año desde 2010, y antes se leía solo la de
 * 2023 y se tiraba el resto. Un mapa de un año contesta «quién produce», pero
 * no «quién está creciendo», que es la pregunta que de verdad mueve un mercado:
 * Brasil y China se leen igual en la foto de 2023 y son historias opuestas
 * desde 2010. Ahora se extraen los catorce años y el mapa los recorre.
 *
 * El coste de esto es el tamaño del archivo generado, y por eso las cifras
 * salen como ARRAYS alineados a `ANIOS` y no como un objeto por año: repetir
 * catorce veces las claves `cerdo`/`pollo`/`res`/`huevo` multiplicaba por tres
 * el peso del módulo sin añadir un solo dato.
 *
 * La DIETA (el bloque de proteínas alternativas) sigue siendo de un solo año:
 * su matriz no se filtra por año y llevarla a serie sería peso muerto.
 *
 * ── NO hay dato más nuevo que 2023, y está comprobado (25/08/2026) ──────────
 * Comprobado sobre los volcados, no de oídas. Los tres conjuntos de FAOSTAT que
 * podrían servir, con su última fecha de publicación y su cobertura real:
 *
 *   FoodBalanceSheets  (28/10/2025)  Y2010–Y2023  producción Y consumo  ← este
 *   SUA_Crops_Livestock(04/05/2026)  Y2010–Y2023  se revisó, no añadió año
 *   Production_Crops_Livestock (31/12/2025)  Y1961–Y2024  SOLO producción
 *
 * El SUA es el más reciente de los tres y engaña: la actualización de mayo de
 * 2026 revisó los años que ya había, no abrió 2024.
 *
 * El QCL sí llega a 2024 y viene poblado (189 países, 69.6 Mt de res, 127.9 de
 * pollo). Aun así NO se empalma, por dos motivos que se midieron:
 *
 *   1. No tiene consumo. Su lista de elementos es producción, rendimiento,
 *      existencias y cabezas de ganado: ni suministro interno ni per cápita.
 *      La mitad del mapa —«quién se la come»— se quedaría sin 2024.
 *   2. No mide la misma cesta. Contra el FBS del MISMO año (2023): pollo
 *      −11.6%, res −9.7%, huevo −6.4% mundial. No es ruido, es definición: el
 *      FBS agrega toda el ave (pavo, pato, ganso) y toda la carne de bovino
 *      (búfalo incluido), y el QCL son partidas primarias sueltas. País a país
 *      el desvío mediano es pequeño (1.4% cerdo, 3.4% pollo) pero hay 35-47
 *      países por encima del 10%.
 *
 * ── Y 2025 existe en el PSD del USDA ───────────────────────────────────────
 * `psd_livestock_csv.zip` (0.8 MB, actualizado el 09/04/2026) llega a MY2025 e
 * incluso a MY2026, y —a diferencia del QCL— trae `Production` Y `Domestic
 * Consumption`, que son las dos métricas del mapa. A cambio: no tiene HUEVO
 * (sus mercancías son Beef and Veal, Chicken, Swine, Broiler y cabezas de
 * ganado; comprobado con /egg/i sobre la lista) y cubre 37 países en res, 42 en
 * pollo y 30 en cerdo.
 *
 * ── CÓMO SE AÑADEN 2024 y 2025 SIN QUE MIENTAN: por ENCADENADO ──────────────
 * Pegar las cifras de otra fuente tal cual pintaría una caída falsa en 2024 en
 * casi todos los países —el salto entre metodologías, no un cambio del mundo—,
 * y en una línea de tiempo cuya premisa es que la escala no se mueve eso es el
 * peor artefacto posible. Así que NO se pegan cifras: se pegan MOVIMIENTOS.
 *
 *     valor[Y] = valor[Y-1]  ×  ( fuenteNueva[Y] / fuenteNueva[Y-1] )
 *
 * El NIVEL sigue siendo el de la FAO —el mismo con el que se calcularon los
 * cortes de color— y de la fuente nueva se toma solo la variación año contra
 * año. Es el encadenado de toda la vida de las series estadísticas, y funciona
 * justo porque el desvío entre fuentes es de DEFINICIÓN (una cesta más ancha o
 * más estrecha) y por tanto se cancela al dividir un año entre el anterior.
 *
 * Reglas que lo mantienen honesto:
 *   · Si la fuente nueva no tiene AMBOS años para ese país y esa proteína, el
 *     resultado es `null` y el país sale GRIS. Nunca se arrastra el valor del
 *     año anterior: un país repetido se lee como «no cambió», que es mentira.
 *   · El huevo no tiene fuente en 2025 → null. El consumo no existe en el QCL,
 *     así que 2024 toma su movimiento del PSD, no del QCL.
 *   · `kg` (consumo por habitante) no tiene fuente en ninguno de los dos → null
 *     en 2024 y 2025, y esa línea desaparece de la ficha en esos años.
 *   · `ANIOS_ESTIMADOS` marca cuáles son encadenados, y la interfaz LO DICE.
 *     El dato medido y el estimado no se pueden confundir en pantalla.
 *
 * Cuando la FAO publique el FBS de 2024 y 2025, esos años dejarán de ser
 * encadenados solos: se leen del propio CSV y el encadenado solo actúa a partir
 * del último año que traiga el volcado.
 *
 * ── Los países que la FAO no publica: NO es un fallo del cruce ─────────────
 * De los 177 países de la geometría, 152 acaban con dato y 25 no. Doce de esos
 * 25 no son islotes: Japón, Corea del Norte, Cuba, Sudán, Chad, Malí, Somalia,
 * Benín, Togo, Burundi, Rep. Centroafricana y Sudán del Sur.
 *
 * Es la fuente, no el cruce. Se comprobó a mano sobre el volcado completo: el
 * código de área 110 (Japón) no aparece en NINGUNA fila del CSV —cero de
 * 1.7 millones—, y tampoco está en FoodBalanceSheets_E_AreaCodes.csv, que la
 * propia FAO genera a partir de los datos. Antes de tocar el ALIAS buscando un
 * nombre que no casa, comprobar eso mismo: `grep '^"110",'` sobre el CSV.
 *
 * Lo que NO se hace es rellenar esos huecos con el PSD del USDA, que sí trae
 * Japón. Serían dos metodologías distintas en el mismo mapa y en la misma
 * escala de color, y una cifra dejaría de ser comparable con la de al lado. El
 * mapa los pinta en gris, la leyenda dice que la fuente no los publica y el pie
 * nombra a Japón, que es el hueco que se ve.
 *
 * ── Entradas ───────────────────────────────────────────────────────────────
 *   base (obligatoria)
 *     https://bulks-faostat.fao.org/production/FoodBalanceSheets_E_All_Data.zip
 *   --qcl  (opcional, añade 2024)
 *     https://bulks-faostat.fao.org/production/Production_Crops_Livestock_E_All_Data.zip
 *   --psd  (opcional, añade 2025 y el consumo de 2024)
 *     https://apps.fas.usda.gov/psdonline/downloads/psd_livestock_csv.zip
 *
 * Uso:
 *   node scripts/build-proteinas.mjs <FoodBalanceSheets_..._NOFLAG.csv> \
 *        [--qcl <Production_Crops_Livestock_..._NOFLAG.csv>] \
 *        [--psd <psd_livestock.csv>]
 *
 * Sin los opcionales la serie termina en el último año del FBS, que es el
 * comportamiento anterior y sigue siendo válido.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SALIDA = path.join(RAIZ, 'frontend/src/lib/produccion-proteinas.js');

const ARGS = process.argv.slice(2);
function opcion(nombre) {
  const i = ARGS.indexOf(nombre);
  return i >= 0 ? ARGS[i + 1] : null;
}
const CSV_QCL = opcion('--qcl');
const CSV_PSD = opcion('--psd');
/* El posicional es el primero que no sea una bandera NI el valor de una: sin
   descartar los valores, `--qcl x.csv` dejaba a x.csv haciendo de CSV base. */
const valores = new Set([CSV_QCL, CSV_PSD].filter(Boolean));
const CSV = ARGS.find((a) => !a.startsWith('--') && !valores.has(a));
if (!CSV) {
  console.error('Falta la ruta al CSV del FBS. Ver la cabecera de este archivo.');
  process.exit(1);
}

/* ── Qué se extrae ─────────────────────────────────────────────────────────
   Los cuatro productos de la sección, más los agregados que necesita el bloque
   de proteínas alternativas: la FAO publica la proteína de la dieta separada en
   origen animal y vegetal, y desglosada por familia. */
const PRODUCTOS = {
  2733: 'cerdo',
  2734: 'pollo',
  2731: 'res',
  2744: 'huevo',
};

/* ── Las partes del animal que SÍ se miden por país ────────────────────────
 * El FBS no desglosa la carne en cortes: no hay «pierna» ni «lomo» en ninguna
 * de sus partidas, ni en el PSD, ni en ninguna serie nacional comparable. El
 * reparto por cortes que enseña el tablero es el RENDIMIENTO TÉCNICO de la
 * canal, que es el mismo en todas partes (ver lib/cortes-canal.js).
 *
 * Lo que sí varía de un país a otro, y está medido, son estas dos partidas —y
 * varían muchísimo: son la diferencia entre una cocina que aprovecha el animal
 * entero y una que solo compra músculo. Van en kg por habitante y año
 * (elemento 645), del último año medido.
 */
const DESPOJOS = {
  2736: 'visceras', // Offals, Edible
  2737: 'grasa',    // Fats, Animals, Raw
};

/* ── Las familias de la dieta ──────────────────────────────────────────────
   Elemento 674 (proteína, g/hab/día). Los códigos NO están elegidos al azar:
   son la partición COMPLETA y sin solapes de «Vegetal Products» (2903) que usa
   la propia FAO. Comprobado sobre la fila World de 2023:

     cereal 33.38 + hortaliza 6.11 + legumbre 4.65 + oleaginosa 3.66
     + tuberculo 2.43 + fruta 1.46 + fruto 0.43            = 52.12
     + especias, estimulantes, azúcares, bebidas y misceláneos ≈ 53.59 = 2903

   Eso importa porque la matriz reparte el 100% de la proteína vegetal de cada
   país: si dos familias se solaparan, las columnas sumarían más que el total y
   los porcentajes mentirían. Dos trampas concretas que hay que respetar:

     · «Oilcrops» (2913) YA INCLUYE la soja (2555) y el cacahuate (2552). Por eso
       esos dos se extraen aparte pero como DETALLE de oleaginosa, no como
       columna propia: la matriz sumaría dos veces la misma proteína.
     · «Nuts and products» (2551) es un grupo distinto de Oilcrops, no una parte
       de él. Ahí sí no hay doble cuenta.

   Del lado animal se separa el pescado (2960) y las algas (2775) del resto,
   porque son proteína que NO sale de una granja ganadera: en la lectura de este
   bloque cuentan como alternativa, aunque la FAO las clasifique como animales o
   como producto acuático. */
const DIETA_ITEMS = {
  2901: 'total',      // Grand Total
  2941: 'animal',     // Animal Products
  2903: 'vegetal',    // Vegetal Products
  // Vegetales, partición sin solapes de 2903
  2905: 'cereal',     // Cereals - Excluding Beer
  2918: 'hortaliza',  // Vegetables
  2911: 'legumbre',   // Pulses
  2913: 'oleaginosa', // Oilcrops (incluye soja y cacahuate)
  2907: 'tuberculo',  // Starchy Roots
  2919: 'fruta',      // Fruits - Excluding Wine
  2551: 'fruto',      // Nuts and products
  // Detalle DENTRO de oleaginosa: no son columnas, son el desglose de la soja
  2555: 'soja',       // Soyabeans
  2552: 'cacahuate',  // Groundnuts
  // Animal no ganadero: la otra mitad de la pregunta
  2960: 'pescado',    // Fish, Seafood
  2775: 'alga',       // Aquatic Plants
  // Animal ganadero, para poder medir contra qué compite lo anterior
  2943: 'carne',      // Meat
  2948: 'leche',      // Milk - Excluding Butter
  2949: 'huevoD',     // Eggs
};

const ELEM = {
  5511: 'prod', // Production, 1000 t
  5301: 'cons', // Domestic supply quantity, 1000 t
  645: 'kg',    // Food supply quantity (kg/capita/yr)
  674: 'gp',    // Protein supply quantity (g/capita/day)
};

/* ── Nombres ───────────────────────────────────────────────────────────────
   La FAO escribe el nombre largo de la ONU y la geometría del mapa el corto de
   Natural Earth. Una clave que no case deja al país gris sin avisar, así que el
   script informa al final de lo que se quedó fuera. */
const ALIAS = {
  'China, mainland': 'China',
  'China, Taiwan Province of': 'Taiwan',
  'Russian Federation': 'Russia',
  'Viet Nam': 'Vietnam',
  'Netherlands (Kingdom of the)': 'Netherlands',
  'Republic of Korea': 'South Korea',
  "Democratic People's Republic of Korea": 'North Korea',
  'United Kingdom of Great Britain and Northern Ireland': 'United Kingdom',
  'Bolivia (Plurinational State of)': 'Bolivia',
  'Venezuela (Bolivarian Republic of)': 'Venezuela',
  "Lao People's Democratic Republic": 'Laos',
  'Iran (Islamic Republic of)': 'Iran',
  'Syrian Arab Republic': 'Syria',
  Türkiye: 'Turkey',
  'Republic of Moldova': 'Moldova',
  'United Republic of Tanzania': 'Tanzania',
  'Democratic Republic of the Congo': 'Dem. Rep. Congo',
  'Central African Republic': 'Central African Rep.',
  'Dominican Republic': 'Dominican Rep.',
  'Bosnia and Herzegovina': 'Bosnia and Herz.',
  Eswatini: 'eSwatini',
  // La geometría es de una edición anterior de Natural Earth y aún lo llama así.
  'North Macedonia': 'Macedonia',
  'Brunei Darussalam': 'Brunei',
  'South Sudan': 'S. Sudan',
  'Solomon Islands': 'Solomon Is.',
  'Equatorial Guinea': 'Eq. Guinea',
  'United Arab Emirates': 'United Arab Emirates',
  'Occupied Palestinian Territory': 'Palestine',
  'French Polynesia': 'Fr. Polynesia',
  'Trinidad and Tobago': 'Trinidad and Tobago',
  'Sao Tome and Principe': null,
  'Cabo Verde': null,
};

/* Áreas que NO son países. El código FAOSTAT >= 5000 marca los agregados
   regionales y los grupos económicos, pero «China» (351) es un caso aparte: es
   la suma de China continental, Taiwán, Hong Kong y Macao, que ya vienen por
   separado. Sin excluirla se contaría dos veces. */
const AGREGADO = (codigo) => codigo >= 5000 || codigo === 351;

// ── Lectura del CSV ────────────────────────────────────────────────────────
function partir(linea) {
  const campos = [];
  let cur = '';
  let dentro = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') { dentro = !dentro; continue; }
    if (c === ',' && !dentro) { campos.push(cur); cur = ''; continue; }
    cur += c;
  }
  campos.push(cur);
  return campos;
}

// ── Nombres de la geometría ────────────────────────────────────────────────
function nombresNaturalEarth() {
  const geo = fs.readFileSync(path.join(RAIZ, 'assets/js/world-map-data.js'), 'utf8');
  const s = new Set();
  for (const m of geo.matchAll(/\{\s*ne:\s*"([^"]+)"/g)) s.add(m[1]);
  const sup = geo.match(/suplementos:\s*\{([\s\S]*?)\n\s{8}\w+:/);
  if (sup) for (const m of sup[1].matchAll(/"([^"]+)":\s*\{/g)) s.add(m[1]);
  return s;
}
const NE = nombresNaturalEarth();

const texto = fs.readFileSync(CSV, 'utf8').replace(/^\uFEFF/, '');
const lineas = texto.split(/\r?\n/);
const cab = partir(lineas[0]);
const col = (n) => {
  const i = cab.indexOf(n);
  if (i < 0) throw new Error(`El CSV no trae la columna «${n}»`);
  return i;
};
const iCodigo = col('Area Code');
const iArea = col('Area');
const iItem = col('Item Code');
const iElem = col('Element Code');

/* Los años se DERIVAN de la cabecera y no se escriben a mano: cuando la FAO
   publique 2024 el generador lo recogerá solo. El último es el que rotulan los
   bloques que siguen enseñando una foto (la dieta, el balance de México). */
const ANIOS = cab
  .map((n, i) => [n, i])
  .filter(([n]) => /^Y\d{4}$/.test(n))
  .map(([n, i]) => [+n.slice(1), i])
  .sort((a, b) => a[0] - b[0]);
if (!ANIOS.length) throw new Error('El CSV no trae ninguna columna de año «Y####»');
const COLS = ANIOS.map(([, i]) => i);
/* `N` deja de ser constante: el encadenado añade años a ANIOS después de leer
   el CSV. `ULTIMO` sí es fijo — es el último año MEDIDO por la FAO, la frontera
   entre el dato y la estimación, y el año base de todo el encadenado. */
let N = ANIOS.length;
const ULTIMO = ANIOS[N - 1][0];
const iUltimo = COLS[N - 1];
const iMedido = N - 1;

// Serie vacía: un hueco por año. Nunca ceros — un 0 se leería como «aquí no hay».
const vacia = () => new Array(N).fill(null);

const paises = new Map();   // ne -> { prod, cons, kg } con series por proteína
const dieta = new Map();    // ne -> { animal, vegetal, … }  (solo el último año)
const despojos = new Map(); // ne -> { visceras, grasa }     (kg/hab/año, último año)
const despojosMundo = {};
const mundo = { prod: {}, cons: {}, kg: {} };
const dietaMundo = {};
const sinCasar = new Map();

/* Vuelca la fila entera de años sobre la serie del producto. `escala` lleva los
   volúmenes de miles a millones de toneladas; el per cápita no se toca. */
function volcar(destino, producto, campos, escala) {
  const s = destino[producto] || (destino[producto] = vacia());
  for (let k = 0; k < N; k++) {
    const v = parseFloat(campos[COLS[k]]);
    if (Number.isFinite(v)) s[k] = v * escala;
  }
}

for (let i = 1; i < lineas.length; i++) {
  const l = lineas[i];
  if (!l) continue;
  const f = partir(l);
  const producto = PRODUCTOS[f[iItem]];
  const familia = DIETA_ITEMS[f[iItem]];
  const despojo = DESPOJOS[f[iItem]];
  if (!producto && !familia && !despojo) continue;

  const campo = ELEM[f[iElem]];
  if (!campo) continue;

  const codigo = +f[iCodigo];
  const area = f[iArea];
  // Los volúmenes pasan de miles a millones de toneladas; el per cápita no.
  const escala = campo === 'kg' ? 1 : 1 / 1000;

  if (area === 'World') {
    if (producto && campo !== 'gp') volcar(mundo[campo], producto, f, escala);
    if (familia && campo === 'gp') {
      const v = parseFloat(f[iUltimo]);
      if (Number.isFinite(v)) dietaMundo[familia] = v;
    }
    if (despojo && campo === 'kg') {
      const v = parseFloat(f[iUltimo]);
      if (Number.isFinite(v)) despojosMundo[despojo] = v;
    }
    continue;
  }
  if (AGREGADO(codigo)) continue;

  const ne = area in ALIAS ? ALIAS[area] : area;
  if (ne === null) continue;
  if (!NE.has(ne)) {
    const previo = sinCasar.get(area) || 0;
    const v = parseFloat(f[iUltimo]);
    if (producto === 'cerdo' && campo === 'prod' && Number.isFinite(v)) sinCasar.set(area, previo + v);
    else if (!sinCasar.has(area)) sinCasar.set(area, 0);
    continue;
  }

  if (producto && campo !== 'gp') {
    if (!paises.has(ne)) paises.set(ne, { prod: {}, cons: {}, kg: {} });
    volcar(paises.get(ne)[campo], producto, f, escala);
  }
  if (familia && campo === 'gp') {
    const v = parseFloat(f[iUltimo]);
    if (!Number.isFinite(v)) continue;
    if (!dieta.has(ne)) dieta.set(ne, {});
    dieta.get(ne)[familia] = v;
  }
  if (despojo && campo === 'kg') {
    const v = parseFloat(f[iUltimo]);
    if (!Number.isFinite(v)) continue;
    if (!despojos.has(ne)) despojos.set(ne, {});
    despojos.get(ne)[despojo] = v;
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   ENCADENADO: 2024 con el QCL de la FAO, 2025 con el PSD del USDA.

   Lo que se toma de cada fuente es la RAZÓN entre dos años consecutivos, nunca
   su nivel. Ver la explicación larga en la cabecera del archivo.
   ══════════════════════════════════════════════════════════════════════════ */

// Los cuatro productos primarios del QCL equivalentes a las partidas del FBS.
const QCL_ITEMS = { 867: 'res', 1035: 'cerdo', 1058: 'pollo', 1062: 'huevo' };

/* El PSD nombra los países a la manera del USDA. Solo hacen falta los 58 que
   publica en carne, y la mayoría ya casan con Natural Earth: aquí van los que
   no. «European Union» se reparte a sus 27 socios, igual que hace el mapa de
   Granos con la fila del bloque. */
const PSD_ALIAS = {
  'United States': 'United States of America',
  'Korea, South': 'South Korea',
  'Bahamas, The': 'Bahamas',
  'Congo (Brazzaville)': 'Congo',
  'Congo (Kinshasa)': 'Dem. Rep. Congo',
  'Dominican Republic': 'Dominican Rep.',
  Macau: null,        // sin polígono propio en la geometría
  'Hong Kong': null,  // idem — ver el catálogo de bolsas
  Singapore: null,
};
const PSD_UE = ['Germany', 'France', 'Spain', 'Poland', 'Italy', 'Netherlands', 'Denmark',
  'Belgium', 'Ireland', 'Austria', 'Portugal', 'Czechia', 'Hungary', 'Romania', 'Sweden',
  'Greece', 'Finland', 'Bulgaria', 'Croatia', 'Slovakia', 'Lithuania', 'Slovenia', 'Latvia',
  'Estonia', 'Luxembourg', 'Cyprus', 'Malta'];

/** Lee un CSV ancho de FAOSTAT y devuelve ne → producto → { anio: valor }. */
function leerFaostatAncho(ruta, items, elemento, anios) {
  const lineas = fs.readFileSync(ruta, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
  const c = partir(lineas[0]);
  const iIt = c.indexOf('Item Code');
  const iEl = c.indexOf('Element Code');
  const iAr = c.indexOf('Area');
  const iCo = c.indexOf('Area Code');
  const cols = anios.map((a) => [a, c.indexOf(`Y${a}`)]).filter(([, k]) => k >= 0);
  const out = new Map();
  const mundo = {};
  for (let i = 1; i < lineas.length; i++) {
    if (!lineas[i]) continue;
    const f = partir(lineas[i]);
    const prod = items[f[iIt]];
    if (!prod || +f[iEl] !== elemento) continue;
    const area = f[iAr];
    const esMundo = area === 'World';
    if (!esMundo && AGREGADO(+f[iCo])) continue;
    const ne = esMundo ? null : (area in ALIAS ? ALIAS[area] : area);
    if (!esMundo && (ne === null || !NE.has(ne))) continue;
    const destino = esMundo ? (mundo[prod] ||= {}) : (() => {
      if (!out.has(ne)) out.set(ne, {});
      return (out.get(ne)[prod] ||= {});
    })();
    for (const [a, k] of cols) {
      const v = parseFloat(f[k]);
      if (Number.isFinite(v) && v > 0) destino[a] = v;
    }
  }
  return { paises: out, mundo };
}

/** Lee el PSD (formato largo) y devuelve ne → métrica → producto → { anio: valor }. */
function leerPsd(ruta, anios) {
  const lineas = fs.readFileSync(ruta, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
  const c = partir(lineas[0]);
  const i = Object.fromEntries(c.map((n, k) => [n, k]));
  const COM = { 'Meat, Beef and Veal': 'res', 'Meat, Swine': 'cerdo', 'Meat, Chicken': 'pollo' };
  const AT = { Production: 'prod', 'Domestic Consumption': 'cons' };
  const out = new Map();
  /* El PSD no publica fila «World». El mundo se suma de sus propias filas, y
     SIEMPRE antes de repartir la Unión Europea: sumando el mapa ya repartido,
     el bloque entraría veintisiete veces. Como solo se usa su razón entre dos
     años, basta con que la cesta sea la misma en los dos. */
  const mundo = { prod: {}, cons: {} };
  const anadir = (ne, met, prod, anio, v) => {
    if (!out.has(ne)) out.set(ne, { prod: {}, cons: {} });
    const d = out.get(ne)[met];
    (d[prod] ||= {})[anio] = ((d[prod][anio] || 0) + v);
  };
  for (let k = 1; k < lineas.length; k++) {
    if (!lineas[k]) continue;
    const f = partir(lineas[k]);
    const prod = COM[f[i.Commodity_Description]];
    const met = AT[f[i.Attribute_Description]];
    const anio = +f[i.Market_Year];
    if (!prod || !met || !anios.includes(anio)) continue;
    const v = parseFloat(f[i.Value]);
    if (!Number.isFinite(v) || v <= 0) continue;

    const nombre = f[i.Country_Name];
    // El mundo, antes de repartir el bloque: cada fila cuenta una sola vez.
    ((mundo[met][prod] ||= {})[anio] = (mundo[met][prod][anio] || 0) + v);

    if (nombre === 'European Union') {
      /* El bloque se replica a cada socio. No se reparte el volumen: solo
         interesa su RAZÓN entre años, y esa sí es común a los 27. */
      for (const s of PSD_UE) if (NE.has(s)) anadir(s, met, prod, anio, v);
      continue;
    }
    const ne = nombre in PSD_ALIAS ? PSD_ALIAS[nombre] : nombre;
    if (ne === null || !NE.has(ne)) continue;
    anadir(ne, met, prod, anio, v);
  }
  out.set('MUNDO', mundo);
  return out;
}

/**
 * Añade un año a todas las series encadenando la razón de `fuente`.
 * `fuente(ne, metrica, producto)` devuelve { [anioBase]: v, [anioNuevo]: v } o null.
 */
function encadenar({ anioNuevo, anioBase, razonDe, etiqueta }) {
  const iBase = ANIOS.findIndex(([a]) => a === anioBase);
  if (iBase < 0) throw new Error(`No hay año base ${anioBase} en la serie`);
  ANIOS.push([anioNuevo, -1]);
  N = ANIOS.length;

  const cuenta = { prod: 0, cons: 0 };
  const extender = (destino, ne) => {
    for (const met of ['prod', 'cons', 'kg']) {
      for (const prod of Object.keys(destino[met])) {
        const s = destino[met][prod];
        s.push(null); // por defecto, hueco: nunca se arrastra el año anterior
        if (met === 'kg') continue;
        const base = s[iBase];
        if (!(base > 0)) continue;
        const r = razonDe(ne, met, prod);
        if (!(r > 0)) continue;
        s[s.length - 1] = base * r;
        cuenta[met]++;
      }
    }
  };
  for (const [ne, d] of paises) extender(d, ne);
  extender(mundo, 'MUNDO');
  console.log(`  ${anioNuevo} encadenado con ${etiqueta}: ${cuenta.prod} series de producción, ${cuenta.cons} de consumo`);
}

const razon = (tabla, anioBase, anioNuevo) => {
  const a = tabla?.[anioBase];
  const b = tabla?.[anioNuevo];
  return a > 0 && b > 0 ? b / a : null;
};

if (CSV_QCL) {
  console.log('\nEncadenando 2024 con el QCL de la FAO…');
  const q = leerFaostatAncho(CSV_QCL, QCL_ITEMS, 5510, [ULTIMO, ULTIMO + 1]);
  /* El consumo no existe en el QCL: su movimiento sale del PSD, que sí lo tiene
     para los ~40 países que cubre. Sin PSD, 2024 se queda sin consumo. */
  const p = CSV_PSD ? leerPsd(CSV_PSD, [ULTIMO, ULTIMO + 1, ULTIMO + 2]) : new Map();
  encadenar({
    anioNuevo: ULTIMO + 1,
    anioBase: ULTIMO,
    etiqueta: 'QCL (producción) + PSD (consumo)',
    razonDe: (ne, met, prod) => (met === 'prod'
      ? razon(ne === 'MUNDO' ? q.mundo[prod] : q.paises.get(ne)?.[prod], ULTIMO, ULTIMO + 1)
      : razon(p.get(ne)?.cons?.[prod], ULTIMO, ULTIMO + 1)),
  });

  if (CSV_PSD) {
    console.log('Encadenando 2025 con el PSD del USDA…');
    encadenar({
      anioNuevo: ULTIMO + 2,
      anioBase: ULTIMO + 1,
      etiqueta: 'PSD (sin huevo)',
      razonDe: (ne, met, prod) => razon(p.get(ne)?.[met]?.[prod], ULTIMO + 1, ULTIMO + 2),
    });
  }
}

// Los años encadenados: todo lo que va más allá del último del FBS.
const ESTIMADOS = ANIOS.map(([a]) => a).filter((a) => a > ULTIMO);

// ── Salida ─────────────────────────────────────────────────────────────────
const r3 = (v) => Math.round(v * 1000) / 1000;
const r1 = (v) => Math.round(v * 10) / 10;
/* La dieta va a dos decimales y no a uno como los volúmenes. Con un decimal,
   familias pequeñas y reales —las algas de Corea, los frutos secos del Magreb—
   se redondean a 0.0 y el filtro de `bloque` las borra del archivo: la matriz
   enseñaría un hueco donde hay dato. La FAO publica dos decimales, así que esto
   no añade precisión inventada, solo deja de tirarla. */
const r2 = (v) => Math.round(v * 100) / 100;

const clave = (k) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k));
const bloque = (obj, red) => `{ ${Object.entries(obj)
  .filter(([, v]) => Number.isFinite(v) && v > 0)
  .map(([k, v]) => `${k}: ${red(v)}`)
  .join(', ')} }`;

/* Una serie por proteína, alineada a ANIOS. El `> 0` mantiene el criterio del
   resto de la casa: un cero de la FAO es «no procede» (cerdo en un país que no
   lo cría), y escrito como 0 se leería en la ficha como una cifra medida. Va a
   `null`, que es un hueco declarado.

   Se imprime sin espacios tras la coma a propósito: son ~1.800 series de
   catorce números y ese espacio solo son kilobytes en el paquete. */
const serie = (arr, red) => `[${arr.map((v) => (Number.isFinite(v) && v > 0 ? red(v) : 'null')).join(',')}]`;
const series = (obj, red) => `{ ${Object.entries(obj)
  .filter(([, arr]) => arr.some((v) => Number.isFinite(v) && v > 0))
  .map(([k, arr]) => `${k}: ${serie(arr, red)}`)
  .join(', ')} }`;

const hayDato = (obj) => Object.values(obj).some((arr) => arr.some((v) => Number.isFinite(v) && v > 0));
/* El orden lo fija el último año MEDIDO, no el último de la serie: los años
   encadenados son ralos, y ordenar por ellos mandaría al fondo de la lista a
   todo país sin dato en 2025 — que son la mitad. */
const ultimoTotal = (obj) => Object.values(obj).reduce((s, arr) => s + (arr[iMedido] || 0), 0);

const orden = [...paises.entries()]
  .map(([ne, d]) => [ne, d, ultimoTotal(d.prod)])
  .sort((a, b) => b[2] - a[2]);

const filasPais = orden
  .filter(([, d]) => hayDato(d.prod) || hayDato(d.cons))
  .map(([ne, d]) => `  ${clave(ne)}: {\n`
    + `    prod: ${series(d.prod, r3)},\n`
    + `    cons: ${series(d.cons, r3)},\n`
    + `    kg: ${series(d.kg, r1)},\n`
    + '  },')
  .join('\n');

const filasDieta = [...dieta.entries()]
  .filter(([, d]) => Number.isFinite(d.animal) && Number.isFinite(d.vegetal))
  .sort((a, b) => (b[1].animal + b[1].vegetal) - (a[1].animal + a[1].vegetal))
  .map(([ne, d]) => `  ${clave(ne)}: ${bloque(d, r2)},`)
  .join('\n');

const cabecera = `/*
 * ARCHIVO GENERADO — no editar a mano.
 * Lo produce scripts/build-proteinas.mjs, que documenta la fuente y el cruce.
 *
 * Producción y consumo de proteína animal por país, de ${ANIOS[0][0]} a ${ULTIMO}, en
 * millones de toneladas. Fuente: hojas de balance alimentario de la FAO
 * (FAOSTAT).
 *
 * Cada cifra es un ARRAY alineado posición a posición con \`ANIOS\`. Un \`null\`
 * significa que la FAO no publica ese año para ese país; nunca es un cero.
 *
 * «Consumo» es el suministro interno (domestic supply quantity): lo que queda en
 * el país tras sumar importaciones y restar exportaciones y variación de
 * existencias. No es lo que se come una persona —eso es \`kg\`, el suministro
 * alimentario por habitante y año—, sino todo lo que entra al mercado interno,
 * incluida la parte que acaba en industria o en pérdidas. Los dos se enseñan
 * porque responden a preguntas distintas: cuánto mercado hay, y cuánta proteína
 * come de verdad la gente.
 *
 * Las claves son nombres de Natural Earth, no de la FAO: es la llave que une
 * este archivo con la geometría del mapa (assets/js/world-map-data.js).
 */
`;

const cuerpo = `${cabecera}
/** Los años de la serie, en orden. Es el índice de todos los arrays de abajo. */
export const ANIOS = [${ANIOS.map(([a]) => a).join(', ')}];

/**
 * El último año MEDIDO por la FAO. Es la frontera entre el dato y la
 * estimación: abre el mapa, rotula la dieta y es la base del encadenado.
 */
export const ANIO = '${ULTIMO}';

/**
 * Años ENCADENADOS, no medidos por la FAO. Su nivel es el de ${ULTIMO} movido por
 * la variación año contra año de otra fuente (ver scripts/build-proteinas.mjs).
 * La interfaz tiene que decirlo: un estimado no puede pasar por un dato.
 *
 * Son más ralos que los medidos —la fuente nueva cubre menos países y el huevo
 * no llega a ${ULTIMO + 2}—, y lo que no se puede encadenar queda en \`null\`, nunca
 * arrastrando el valor del año anterior.
 */
export const ANIOS_ESTIMADOS = [${ESTIMADOS.join(', ')}];

/** De dónde sale el movimiento de cada año encadenado. */
export const FUENTE_ESTIMADA = ${JSON.stringify(Object.fromEntries(
    ESTIMADOS.map((a) => [a, a === ULTIMO + 1
      ? 'FAOSTAT · Producción de cultivos y ganado (consumo: USDA PSD)'
      : 'USDA · Production, Supply and Distribution']),
  ))};

/** Fuente citada en el pie del mapa. */
export const FUENTE = 'FAO · Hojas de balance alimentario (FAOSTAT)';

/** Nombre y orden de lectura de las cuatro proteínas. */
export const PROTEINAS = [
  ['cerdo', 'Cerdo'],
  ['pollo', 'Pollo'],
  ['res', 'Res'],
  ['huevo', 'Huevo'],
];

/**
 * Millones de toneladas por país, un valor por año de \`ANIOS\`.
 *   prod = producción · cons = suministro interno · kg = kg por habitante y año
 */
export const PROTEINAS_PAIS = {
${filasPais}
};

/** Totales mundiales, de la propia fila «World» de la FAO. Misma forma de serie. */
export const MUNDO = {
  prod: ${series(mundo.prod, r3)},
  cons: ${series(mundo.cons, r3)},
  kg: ${series(mundo.kg, r1)},
};

/**
 * Proteína de la dieta en gramos por habitante y día, familia a familia.
 * Es la serie que sostiene el bloque de proteínas alternativas y su matriz: dice
 * cuánta proteína NO ganadera come ya cada país, sin estimar nada.
 *
 * Campos:
 *   total ....... toda la proteína de la dieta
 *   animal ...... productos de origen animal (incluye pescado)
 *   vegetal ..... productos de origen vegetal
 *   Vegetales, partición sin solapes de \`vegetal\`:
 *   cereal, hortaliza, legumbre, oleaginosa, tuberculo, fruta, fruto
 *   soja, cacahuate ... detalle DENTRO de \`oleaginosa\`; NO sumar aparte
 *   pescado, alga .... animal y acuático, pero no ganadero
 *   carne, leche, huevoD ... el lado ganadero, para comparar
 *
 * Una familia ausente en un país significa que la FAO no publica esa cifra o que
 * es menor que 0.005 g; nunca se rellena con cero.
 */
export const DIETA_PAIS = {
${filasDieta}
};

export const DIETA_MUNDO = ${bloque(dietaMundo, r2)};

/**
 * Vísceras y grasa animal comestibles, en kg por habitante y año de ${ULTIMO}.
 *
 * Son las ÚNICAS «partes del animal» que la FAO mide país a país: no hay
 * ninguna serie comparable de cortes (pierna, lomo, costilla) en el FBS, en el
 * PSD ni en ningún volcado nacional. Y varían enormemente —de décimas de kilo a
 * más de diez—, porque son la diferencia entre una cocina que aprovecha el
 * animal entero y una que solo compra músculo.
 *
 * Un país ausente es un país que la FAO no publica, nunca un cero.
 */
export const DESPOJOS_PAIS = {
${[...despojos.entries()]
    .filter(([, d]) => Object.values(d).some((v) => v > 0))
    .sort((a, b) => (b[1].visceras || 0) - (a[1].visceras || 0))
    .map(([ne, d]) => `  ${clave(ne)}: ${bloque(d, r1)},`)
    .join('\n')}
};

export const DESPOJOS_MUNDO = ${bloque(despojosMundo, r1)};
`;

fs.writeFileSync(SALIDA, cuerpo, 'utf8');

// ── Informe ────────────────────────────────────────────────────────────────
console.log(`Escrito ${path.relative(RAIZ, SALIDA)}  (${(fs.statSync(SALIDA).size / 1024).toFixed(0)} KB)`);
console.log(`  años:               ${ANIOS[0][0]}–${ANIOS[N - 1][0]} (${N})`
  + (ESTIMADOS.length ? `  · medidos hasta ${ULTIMO}, encadenados ${ESTIMADOS.join(' y ')}` : ''));
console.log(`  países con volumen: ${orden.length}`);
console.log(`  países con dieta:   ${dieta.size}`);
/* El total mundial año a año en los puntos que importan: si la serie se hubiera
   desalineado por una columna, o si el encadenado se hubiera quedado sin la
   fila del mundo, aquí se ve al instante. */
for (const k of [0, iMedido, ...ESTIMADOS.map((a) => ANIOS.findIndex(([x]) => x === a))]) {
  const t = Object.entries(mundo.prod).map(([p, s]) => `${p} ${(s[k] ?? 0).toFixed(1)}`).join('  ');
  const marca = ANIOS[k][0] > ULTIMO ? ' (encadenado)' : '';
  console.log(`  mundo prod ${ANIOS[k][0]}:   ${t}${marca}`);
}
/* Cuántos países quedan pintados en cada año encadenado. Es la cifra que dice
   si el mapa de ese año se puede enseñar o es un planisferio gris. */
for (const a of ESTIMADOS) {
  const k = ANIOS.findIndex(([x]) => x === a);
  for (const met of ['prod', 'cons']) {
    const n = [...paises.values()].filter((d) => Object.values(d[met]).some((s) => s[k] > 0)).length;
    console.log(`  ${a} ${met}: ${n} países con dato`);
  }
}
const fuera = [...sinCasar.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
if (fuera.length) {
  console.log('\n  Áreas de la FAO sin polígono en la geometría (Mt de cerdo):');
  fuera.slice(0, 25).forEach(([a, v]) => console.log(`    ${(v / 1000).toFixed(3)}  ${a}`));
}
