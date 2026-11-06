# Revisión general del chat de proteínas

Fecha: 8 de octubre de 2026. Cambios locales para res, cerdo, pollo y huevo.

## Problemas corregidos

- La tabla estructurada se recortaba silenciosamente a 50 filas. Una comparación de 32 entidades y cuatro especies necesita al menos 128. Ahora las conserva, con un límite de 600 filas por tabla para controlar recursos.
- SNIIM consultaba únicamente el mes final de la ventana. Ahora consulta los meses necesarios, hasta tres dentro de una ventana de 42 días, también al cambiar de año. Cada registro conserva su fecha original; los reportes mensuales se consultan en paralelo.
- Una consulta nacional podía descartar una plaza de ayer porque otra plaza tenía dato de hoy. Ahora conserva la última fecha por entidad; la consulta nacional sigue siendo una muestra identificada, no un promedio.
- Los encabezados de plaza con nombres completos o abreviaturas sin dos puntos podían perderse. Se reconocen las 32 entidades; una plaza desconocida no hereda el estado anterior.
- Duplicados contradictorios de un mismo producto, categoría, mercado y fecha dejan de validarse según el orden de las filas. El control alcanza SNIIM, USDA y Comisión Europea; Porcicultura ya tenía control de conflictos.
- Porcicultura informa cobertura por estado y distingue ausencia de registros utilizables de caída de la fuente. SNIIM informa fallas mensuales parciales y conserva los precios de los reportes que sí respondieron.
- Las brechas de una comparación de 32 entidades se agrupan por producto y fuente, sin quitar las filas pendientes. Las observaciones con más de 14 días desde la consulta llevan una marca de rezago.
- Se reforzó la coincidencia entre evidencia y respuesta: país, estado, moneda, unidad, fecha, valor, vivo/canal/entero y clase porcina. Una misma fila no puede acreditar un precio para dos países o estados con una sola observación. El control de cifras también reconoce monedas como CNY, JPY, CAD, AUD, INR, ARS, COP y AED, símbolos monetarios y precios escritos en pesos; antes podían escapar del filtro por usar otra moneda.
- Se reconocen presentaciones antes omitidas: plurales de pechuga/muslo/costilla, tocino, animales vivos, cartón/charola de huevo, huevo rojo y productos congelados, refrigerados o deshuesados. Esos pedidos no reciben automáticamente una referencia de canal, pollo entero o huevo blanco por kg.
- Las fuentes se muestran como enlaces pulsables en las celdas. La tabla puede desplazarse en móvil sin desbordar la página ni cortar las palabras por letra.

## Pruebas reproducibles

`npm run test:proteins:general` ejecuta 11 grupos de regresión con código real y fuentes simuladas:

- 128 combinaciones de entidad y especie: 32 × 4.
- 212 combinaciones de ciudad y especie: 53 × 4.
- 260 combinaciones de país reconocido y especie: 65 × 4.
- Cambios de país y estado durante la conversación, por generación completa y streaming.
- Fechas imposibles y futuras, cruce de mes/año, caché, fallas parciales, números inválidos y duplicados contradictorios.
- Presentaciones, monedas, unidades, categorías, datos rezagados y países sin conector.
- Conservación de las 128 filas y límite de recursos del formato estructurado.

`npm run test:proteins:ui` prueba el bundle compilado, el orquestador y el renderer reales con sesión y fuentes simuladas: 128 filas, 128 enlaces, cobertura parcial visible, escritorio y móvil. Hay 63 filas pendientes en este escenario deliberadamente incompleto.

También se comprobaron las suites anteriores de inteligencia, proteínas, IA, seguridad, código antiguo, lint y compilación. Las pruebas de fuentes simuladas comprueban comportamiento, no la exactitud de una cotización comercial real.

## Cobertura pública observada

`node scripts/verify-protein-coverage-live.cjs` consulta exclusivamente reportes públicos SNIIM y Porcicultura; no envía historial del usuario ni llama a un modelo. La lectura del 8 de octubre de 2026 a las 15:52, hora de México, usó la ventana del 27 de agosto al 8 de octubre:

| Producto | Entidades con registros recuperados | Registros seleccionados | Fechas observadas |
| --- | --- | --- | --- |
| Cerdo | 17 | 24 | 5, 7 y 8 de octubre |
| Pollo | 4 | 7 | 8 de octubre |
| Huevo | 31 | 40 | 7 de octubre |
| Res | 14 | 17 | 5, 7 y 8 de octubre |

Estos conteos describen los registros recuperados en esa consulta. Cerdo reúne referencias de canal y de peso vivo, diferenciadas por fila; contar entidades no significa que compartan presentación ni que haya una oferta vigente. Los reportes no aportaron pollo ni res para Puebla. Buscar meses previos tampoco produjo un registro utilizable de esas especies para Puebla en esa ventana.

Fuentes: [SNIIM, cerdo en canal](https://www.economia-sniim.gob.mx/SNIIM-Pecuarios-Nacionales/e_Can.asp?RegPag=1000&Var=Por&anio=2026&mes=10&del=01&al=08&destino=0&origen=0), [SNIIM, res en canal](https://www.economia-sniim.gob.mx/SNIIM-Pecuarios-Nacionales/e_Can.asp?RegPag=1000&Var=Bov&anio=2026&mes=10&del=01&al=08&destino=0&origen=0), [SNIIM, pollo entero](https://www.economia-sniim.gob.mx/SNIIM-Pecuarios-Nacionales/e_Ent.asp?RegPag=1000&prod=P01&anio=2026&mes=10&del=01&al=08&destino=0&origen=0), [SNIIM, huevo blanco](https://www.economia-sniim.gob.mx/SNIIM-Pecuarios-Nacionales/e_Hue.asp?RegPag=1000&prod=H01&sem=0&anio=2026&mes=10&del=01&al=08&destino=0&origen=0), [Porcicultura, cerdo en pie](https://www.porcicultura.com/economia/precios-del-cerdo-en-pie-en-mexico).

Resultados, URLs de cada mes y registros originales seleccionados: `output/revision-proteinas-general/cobertura-publica-real.json`. Regresiones: `regresiones.json`; navegador: `navegador.json`; capturas: `tabla-corregida.png` y `tabla-movil.png` en ese mismo directorio.

## Límites que siguen presentes

Reconocer 65 países no equivale a disponer de precios para todos. Los conectores físicos actuales cubren categorías de México, miembros de la UE y cutout de cerdo/res de EE. UU.; otros mercados y presentaciones requieren una fuente específica recuperada. No hay un conector físico completo mundial.

Las referencias estatales no acreditan un precio municipal. Vivo, canal, cortes, mayorista, minorista, docena y caja siguen siendo bases distintas. Tampoco se garantiza una respuesta a toda combinación posible: esta matriz verifica casos representativos y los fallos detectados. Un dato faltante permanece pendiente, con una explicación; no se rellena con otra entidad o una cifra estimada.

Los cambios están en el proyecto local. No se publicó ni desplegó una versión de producción.

## Ampliación: mayoreo y venta al público

Se incorporaron observaciones oficiales de PROFECO por establecimiento y el catálogo público de DSPC para cortes al mayoreo en Puebla/Cholula. La tabla distingue etapas, presentaciones, fecha de levantamiento frente a actualización de catálogo, paquetes de huevo y mínimos de volumen. Conserva los límites de SNIIM y Porcicultura. Las muestras minoristas se limitan a cuatro ciudades por consulta y se identifican las entidades no consultadas. Detalles, ejemplos reales y pruebas: [Precios por etapa](precios-por-etapa.md).
