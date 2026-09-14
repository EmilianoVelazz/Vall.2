/*
 * Orígenes que mueven el precio de los granos, para el mapa de Mercados › Granos.
 *
 * ── Por qué este catálogo es tan corto ─────────────────────────────────────
 * El mapa de Finanzas › Bolsa puede listar cincuenta países porque cada uno
 * tiene su propia bolsa y su propio índice: hay un dato por país. Aquí no. El
 * maíz, la soja y el trigo cotizan en Chicago y el precio es uno solo, global.
 * No existe —ni en esta plataforma ni en las fuentes que consulta— una serie de
 * producción o exportación por país.
 *
 * Durante un tiempo el mapa NO dijo cuánto produce cada quien, porque con solo
 * los precios de Chicago habría obligado a inventar cifras y el catálogo de
 * bolsas fija la regla de la casa ("no se inventan precios para rellenar").
 * Eso cambió al conectar lib/produccion-granos.js, que trae la serie oficial
 * del USDA país a país: ahora sí hay fuente, y la cifra que se enseña está
 * publicada, no repartida a ojo desde un precio global.
 *
 * ── Los dos motivos por los que un país está en esta lista ─────────────────
 * 1. MOTOR DEL PRECIO. Aparece en un `driver` de perspectiva() en
 *    lib/mercados.js, o es el destino desde el que se lee esta plataforma:
 *
 *      'WASDE USDA · demanda China'          -> Estados Unidos, China
 *      'Exportaciones Brasil · crush margin' -> Brasil
 *      'Geopolítica Mar Negro · clima'       -> Ucrania, Rusia
 *      destino de la ración pecuaria         -> México
 *
 *    Si mañana cambian esos drivers, esta parte del archivo debe seguirlos.
 *
 * 2. GRAN PRODUCTOR. Con la producción ya en el mapa, dejar fuera a Argentina
 *    o a India convertía el mapa en una lista de seis países coloreados con
 *    medio mundo agrícola apagado al lado. Entran con papel 'productor', que
 *    los distingue de los motores del precio: pesan en la oferta mundial, pero
 *    no son de los que mueven la referencia de Chicago día a día.
 *
 * Lo que sigue prohibido es entrar "porque también es importante": un país
 * nuevo necesita, o un driver que lo nombre, o cifras en produccion-granos.js.
 *
 * Las CLAVES `ne` son nombres de país tal como los escribe Natural Earth, que es
 * la llave que los une con la geometría de assets/js/world-map-data.js. Si una
 * no coincide, el país queda inerte en el mapa.
 */

export const ORIGENES_GRANOS = [
  {
    ne: 'United States of America',
    pais: 'Estados Unidos',
    papel: 'origen',
    cultivo: 'maiz',
    etiquetaCultivo: 'Maíz',
    factor: 'WASDE USDA',
    nota: 'El informe mensual del USDA reajusta oferta y demanda; es el dato que más mueve la referencia de Chicago.',
  },
  {
    ne: 'Brazil',
    pais: 'Brasil',
    papel: 'origen',
    cultivo: 'soja',
    etiquetaCultivo: 'Soja',
    factor: 'Exportaciones · crush margin',
    nota: 'El ritmo exportador y el margen de molienda marcan la disponibilidad de pasta de soja.',
  },
  {
    ne: 'Ukraine',
    pais: 'Ucrania',
    papel: 'origen',
    cultivo: 'trigo',
    etiquetaCultivo: 'Trigo',
    factor: 'Corredor del Mar Negro',
    nota: 'La salida de grano por el Mar Negro condiciona la oferta y añade prima de riesgo.',
  },
  {
    ne: 'Russia',
    pais: 'Rusia',
    papel: 'origen',
    cultivo: 'trigo',
    etiquetaCultivo: 'Trigo',
    factor: 'Corredor del Mar Negro',
    nota: 'Mayor exportador de trigo; su cosecha y sus restricciones marcan el piso del precio.',
  },
  {
    ne: 'China',
    pais: 'China',
    papel: 'demanda',
    cultivo: 'maiz',
    etiquetaCultivo: 'Maíz',
    factor: 'Demanda de importación',
    nota: 'Su ritmo de compras sostiene o afloja la demanda del complejo entero.',
  },
  {
    ne: 'Mexico',
    pais: 'México',
    papel: 'destino',
    cultivo: 'maiz',
    etiquetaCultivo: 'Maíz',
    factor: 'Ración pecuaria',
    nota: 'Destino de la referencia: el precio de Chicago más flete y tipo de cambio es el costo del alimento aquí.',
  },

  /* ── Grandes productores (motivo 2 de la cabecera) ─────────────────────────
     El `cultivo` de cada uno es aquel en el que pesa de verdad, para que el
     precio que enseña la ficha sea el que le corresponde: Argentina se lee por
     su soja, India y Canadá y Australia por su trigo. */
  {
    ne: 'Argentina',
    pais: 'Argentina',
    papel: 'productor',
    cultivo: 'soja',
    etiquetaCultivo: 'Soja',
    factor: 'Tercer exportador de soja',
    nota: 'Compite con Brasil en la ventana exportadora; su cosecha y sus retenciones mueven el margen de molienda.',
  },
  {
    ne: 'India',
    pais: 'India',
    papel: 'productor',
    cultivo: 'trigo',
    etiquetaCultivo: 'Trigo',
    factor: 'Segundo productor de trigo',
    nota: 'Produce casi tanto trigo como China, pero lo consume casi entero: pesa en la oferta mundial solo cuando abre o cierra la exportación.',
  },
  {
    ne: 'Canada',
    pais: 'Canadá',
    papel: 'productor',
    cultivo: 'trigo',
    etiquetaCultivo: 'Trigo',
    factor: 'Trigo de fuerza',
    nota: 'Referencia del trigo de alta proteína; su calidad marca la prima sobre el SRW de Chicago.',
  },
  {
    ne: 'Australia',
    pais: 'Australia',
    papel: 'productor',
    cultivo: 'trigo',
    etiquetaCultivo: 'Trigo',
    factor: 'Abastecedor de Asia',
    nota: 'Cosecha en contraestación: llega al mercado cuando el hemisferio norte ya vendió, y su clima decide la oferta de fin de año.',
  },
];

/*
 * El papel de cada país. Ya NO se pinta: hubo un tiempo en que decidía el color
 * del relleno (cuatro hues categóricos) y luego el de un chip en la ficha, y las
 * dos cosas se retiraron — el relleno porque codifica producción, que es
 * magnitud y no identidad; el chip porque el `factor` de cada país ya lo cuenta
 * con palabras propias («Corredor del Mar Negro» dice más que «Origen
 * exportador») y sin obligar a aprenderse una taxonomía.
 *
 * Lo que sigue haciendo es decidir a QUIÉN marca el mapa con contorno, vía
 * `marca`. Solo los tres papeles que mueven el precio: si lo llevaran también
 * los grandes productores, diez de los países más visibles quedarían remarcados
 * y la marca dejaría de distinguir nada. Ellos ya destacan por lo que el mapa
 * mide —su cosecha—, que es justamente el motivo por el que están en la lista.
 *
 * `etiqueta` sobrevive para el aria-label de esos países marcados: el contorno
 * es puramente visual y sin ese texto un lector de pantalla no sabría ni que
 * están señalados ni por qué. Ya no existe `clase`, que solo servía al color
 * del chip.
 */
export const PAPELES = {
  origen: { etiqueta: 'Origen exportador', marca: true },
  demanda: { etiqueta: 'Demanda', marca: true },
  destino: { etiqueta: 'Destino', marca: true },
  productor: { etiqueta: 'Gran productor', marca: false },
};
