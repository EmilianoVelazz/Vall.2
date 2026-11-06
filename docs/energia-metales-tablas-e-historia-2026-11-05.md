# Energía y metales: precios y comparativas históricas

El informe presenta dos tablas numéricas, Energía y Metales, con las 14 referencias disponibles en el corte local del 5 de noviembre de 2026. Cada fila identifica el tipo de precio, moneda y unidad originales, precio anterior y su fecha, último precio publicado y su fecha y cambio de sesión. La edición semanal utiliza una base semanal identificada. La matriz adicional conserva variaciones mensual, trimestral, semestral, anual, acumulada del año y desde 2020 cuando existe una base observada en ese año.

Se distinguen tres referencias físicas de EIA y once series continuas de futuros. No se convierten monedas ni se equiparan los precios de futuros con compras entregadas a una empresa. Los contratos continuos son referencias de mercado, no rendimientos de una estrategia de inversión.

## Gráficas y evidencia

- Dos comparativas en precios originales muestran WTI y Brent desde 2020: una de futuros y otra de precios físicos EIA. Solo comparten gráfica referencias compatibles en unidad y tipo de precio.
- Un panel histórico reúne las 14 trayectorias en filas separadas y con calendario común desde 2020. Cada fila tiene escala vertical propia, base 100, rango e índice final. Los códigos coinciden con las tablas. Las historias parciales empiezan en su fecha real; no se completan años sin observaciones.
- La compresión de historia conserva bases exactas de comparación, contexto mensual, observaciones recientes y, para energía, los extremos y todos los precios cero o negativos. Se usa escala lineal: el WTI físico de -36.98 USD/barril del 20 de abril de 2020 no desaparece de las curvas. La base inicial observada de esa serie es 61.17 USD/barril, el 2 de enero de 2020.
- Se amplía la carga histórica EIA, antes limitada a 65 observaciones. La fuente pública se descargó y sus HTML originales se conservaron en la evidencia local. Fuentes: [WTI físico](https://www.eia.gov/dnav/pet/hist/rwtcD.htm), [Brent físico](https://www.eia.gov/dnav/pet/hist/rbrteD.htm), [Henry Hub físico](https://www.eia.gov/dnav/ng/hist/rngwhhdD.htm).
- El interés abierto CFTC se identifica como semanal y agregado de vencimientos; no se presenta como negociación diaria o interés abierto exclusivo del contrato frontal. No se inventan cotizaciones de opciones no disponibles.
- El resumen filtra noticias ajenas al sector y cuantifica el cambio de la referencia física antes de explicar su posible efecto contractual, sin atribuir causas no demostradas.

## Lectura, exportación y validación

La vista de lectura abre en el panel histórico; los filtros por país conservan las referencias y códigos. El PDF conserva todas las filas de precios y las tres gráficas dentro de tres páginas, tanto en edición diaria como semanal. Se amplían las curvas de la tercera página y se revisan las páginas renderizadas para comprobar legibilidad y distribución. Excel añade las hojas numéricas `Maestra energía` e `Historia energía`, además de observaciones, horizontes y anexos existentes.

Las pruebas verifican cifras y fechas, normalización matemática, precios negativos y cero, historias parciales, filtros, preferencias de tablas/gráficas, integridad de copias guardadas y exportadas, lectura del libro Excel y ausencia de recortes de texto en PDF. Se comprueban además disponibilidad de 80 modelos, preservación de 75 composiciones de tablas, fuentes públicas, modelos de mercados y las nueve descargas reales de Finanzas, Mercados y México desde el navegador compilado.

Evidencia local: `output/energia-metales-20261105/` y `output/download-button-20261030/`. Catálogo de materias primas 9 y presentación 89 invalidan las ediciones anteriores. Los envíos automáticos permanecen desactivados. No se publica en Git ni se modifica Supabase.
