# Reducción de páginas después de unificar gráficas

La revisión anterior redujo el número de paneles. En varios informes eso no cambió el número de hojas: las tablas, sus encabezados repetidos y las restricciones de paginación seguían ocupando casi todo el documento. En el corte revisado, Bolsa dedicaba aproximadamente siete páginas a texto y tablas, y dos a gráficas.

## Cambios

- Composición exclusiva del PDF: las tablas de cierres o de variaciones con un grupo explícito y la misma estructura se reúnen, conservando cada referencia, país, celda y nota. El lector, los anexos, CSV y Excel conservan sus datos y organización originales.
- Se evalúan varias distribuciones de cada tabla. Una fecha puede compartir celda con su precio y una unidad común puede declararse en el título. Se usa la variante de menor altura medida; reducir columnas por sí solo no garantiza reducir hojas.
- Las tablas largas de cotizaciones pueden continuar por dos columnas cuando las mediciones confirman que mejoran la distribución. Se repiten encabezados y la indicación de continuación; se conservan todas las filas en su orden.
- El área de trazado de las tendencias de materias primas es ligeramente más compacta. Se mantienen tamaño de letra, escalas, puntos, unidades y leyendas.
- La metodología de las gráficas puede aprovechar el espacio que dejan las tablas antes del salto de página. Se imprime una sola vez.
- Versión de presentación 30 para renovar las vistas previas.

## Comparación con los mismos datos

| Informe diario | Antes de esta revisión | Después |
| --- | ---: | ---: |
| Bolsa | 9 | 8 |
| Proteínas | 6 | 5 |
| Bonos | 3 | 3 |
| Energía y metales | 5 | 5 |

No todos los informes necesitan o permiten perder una hoja adicional. Se prioriza conservar observaciones y legibilidad; los precios físicos, futuros y monedas diferentes no se combinan en una nueva gráfica para forzar esa reducción.

## Verificación

- `scripts/test-report-print-tables.mjs`: conservación de todas las filas, valores, fechas, unidades, monedas, periodos, notas y marcas de tiempo en 75 modelos; traducción e inmutabilidad.
- `scripts/test-report-pdf-column-flow.mjs`: 40 cotizaciones con sus dos precios y fechas caben en una página con dos columnas; cada referencia y cada dato aparecen exactamente una vez.
- Pruebas de enfoque de mercados, agrupación y exportación de gráficas, librería anual y eliminación de repeticiones; lint y compilación.
- Auditoría de exportaciones y comparación de páginas: `output/report-page-compaction-20261023/all/`, contra `output/report-chart-unification-20261023/pdfs/after.json`.
- Resultado: 75 PDF verificados, sin aumentos de páginas sobre la misma muestra, hojas vacías o cierres aislados. Hueco interior máximo: 78.6 puntos. La edición semanal de Bolsa también pasa de nueve a ocho páginas y la semanal de Proteínas, de seis a cinco.

Los envíos automáticos continúan desactivados. No se actualizan cotizaciones ni se elimina evidencia para obtener la reducción de páginas.
