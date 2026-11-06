# Compactación adicional de informes

## Resultado sobre la misma muestra

Se compararon 75 exportaciones diarias, semanales y anuales con la versión de presentación 30. Dieciocho redujeron su extensión: el conjunto pasa de 330 a 307 páginas, 23 páginas menos. Ningún informe aumentó de páginas.

| Informe | Antes | Después |
| --- | ---: | ---: |
| Bolsa diaria | 8 | 6 |
| Energía y metales diarios | 5 | 4 |
| Producción de México diaria | 4 | 3 |
| Bolsa anual, cada año de 2022 a 2025 | 6 | 5 |
| Panorama de mercados anual, cada año de 2022 a 2025 | 7 | 6 |
| Proteínas de México anual, cada año de 2022 a 2025 | 10 | 8 |
| Proteínas globales anual 2025 | 5 | 4 |
| Bolsa semanal | 8 | 7 |
| Energía y metales semanales | 5 | 4 |

Las demás ediciones conservan su extensión. La información se mantiene completa; no se establece un máximo artificial de hojas.

## Cambios de composición

- Las columnas numéricas reservan el ancho real de sus cifras y del tipo de letra de las flechas. Esto evita partir un porcentaje en dos líneas mientras la columna de nombres ocupa espacio sobrante. Se mantienen los tamaños de letra y las áreas de trazado anteriores.
- Los nombres y países pueden compartir línea si la medición confirma que mejora la distribución.
- Los precios y las variaciones breves de la misma referencia se reúnen mediante una unión exacta y única. Si el nombre es ambiguo, se mantienen separados. Las comparaciones de horizontes largos conservan sus tablas.
- Los equivalentes USD y MXN pueden mostrarse apilados bajo sus dos encabezados, manteniendo ambas cantidades y el orden de sus monedas; sólo se elige esa variante cuando reduce el espacio medido.
- Los históricos interanuales pueden agruparse por su calendario real de observaciones. Las fechas comunes pasan a los encabezados, y las excepciones se mantienen en sus celdas. No se cambian fechas ni se interpolan valores.
- Las fechas de inicio y fin de las gráficas con base común se muestran junto a la unidad. La metodología general se imprime una sola vez; la serie, su base 100, sus puntos y sus escalas permanecen iguales.
- Las leyendas eligen entre varias distribuciones por su altura medida, conservando todas las etiquetas y su tamaño de letra.
- El cálculo de costos contempla las tablas anchas que deben dividirse en grupos. Las ediciones anuales de noticias mantienen la distribución conservadora que evita aumentar su extensión.
- Se reutilizan mediciones tipográficas dentro de cada PDF para comparar variantes sin repetir cálculos costosos. La caché está limitada y no persiste entre documentos.
- Versión de presentación 31 para invalidar vistas previas anteriores.

## Verificación

- `scripts/test-report-print-preservation.mjs`: 75 modelos, 20,299 celdas originales conservadas, precisión, fechas y excepciones, unidades, monedas, uniones sin ambigüedad, traducción e inmutabilidad.
- `scripts/test-report-pdf-column-flow.mjs`: 40 cotizaciones y sus dos fechas caben en una hoja; 30 filas de siete horizontes conservan sus 210 porcentajes completos, sin partirlos ni bajar de los 7.2 puntos originales.
- Pruebas de tablas impresas, enfoque de mercados, agrupación y exportación de gráficas, librería anual y eliminación de repeticiones; lint y compilación.
- Auditoría final: 75 PDF, sin hojas vacías, cierres aislados ni aumentos de páginas. Hueco interior máximo: 89.4 puntos, por debajo del límite de 100.
- Comparación: `output/report-fewer-pages-20261023/all/after.json` contra `output/report-page-compaction-20261023/all/after.json`. Resumen de cambios: `output/report-fewer-pages-20261023/summary.json`.

El lector, los anexos y los archivos de datos conservan la evidencia original. Los envíos automáticos continúan desactivados; esta revisión no solicita nuevas cotizaciones ni análisis de IA.
