# Tablas de Granos y distribución de Bolsa

## Bolsa

Los encabezados se miden con su tamaño y peso tipográfico reales; los que ocupan dos líneas reservan altura antes del primer precio. Las filas también se miden con la tipografía usada al dibujarlas. Si sólo existe una de las tablas de sectores o materias primas, utiliza el ancho completo.

Cuando las dos tablas tienen distinta altura, la nota de compras y márgenes ocupa el espacio disponible de la columna más corta, únicamente si cabe completa. Esa nota deja de repetirse al final. La gráfica de la primera página conserva su tamaño y aprovecha el espacio reservado para trasladar más filas desde la segunda página.

## Granos y forrajes

El corte conserva 32 precios actuales. La compresión anterior seleccionaba sólo doce precios y convertía matrices con horizontes incompletos en largos párrafos de «Datos publicados». Ahora las matrices conservan columnas numéricas y se agrupan según los horizontes publicados, sin rellenar celdas ausentes. Se conserva una variación anual aunque falten otros horizontes.

El PDF prioriza todos los precios actuales antes de las gráficas. Presenta unidad original, último precio, fecha y variación de sesión cuando existe. Los precios semanales y mensuales mantienen su frecuencia; no reciben una variación diaria artificial. Para evitar duplicar fechas en cada fila, el cierre anterior y su fecha quedan en las tablas completas del lector, anexos y Excel.

Las comparativas históricas del PDF seleccionan hasta dos grupos de columnas compatibles por matriz y distribuyen las filas dentro del presupuesto; las matrices completas permanecen en el lector y las descargas de datos. El PDF no recorta los precios actuales, incluso en los presupuestos pequeños. La tipografía de las cifras no se reduce: las flechas se dibujan por separado, con colores neutros, para evitar que un carácter cambie la altura de toda la fila. El resumen incorpora el cambio por unidad de una referencia física cuando tiene bases publicadas, sin equipararlo al costo entregado.

## Verificación

- `test-report-grain-numeric-pdf.mjs`: PDF diario y semanal de tres páginas, todos los precios del corte, columnas numéricas sin celdas vacías, ceros conservados, fechas y unidades originales, sin modificar la evidencia.
- `test-report-equity-context-layout.mjs`: PDF diario y semanal de hasta tres páginas, nota reubicada sin duplicación y separación entre encabezados y primer precio.
- Pruebas de históricos de Bolsa, disponibilidad (80 modelos), composición de proteínas (cinco páginas), tablas impresas (75 modelos), granos globales y enfoque de Mercados completadas.
- Revisión visual de las páginas generadas y compilación de producción completadas. La prueba general antigua de presupuestos (`test-report-print-edition.mjs`) mantiene una discrepancia de conteo en Panorama/Proteínas: no considera todas sus filas protegidas actuales; no se utiliza como prueba aprobada de este ajuste.
- Las nueve simulaciones de vista previa y descarga en Chromium finalizaron correctamente (Finanzas, Mercados y México), con respuesta HTTP 200 y nombres de archivo correspondientes al informe. Servicio local reiniciado manteniendo los envíos automáticos desactivados.

Evidencia en `output/bolsa-tablas-granos-20261105/`. La versión de presentación 86 invalida los PDF guardados en caché. Los envíos automáticos siguen desactivados; no se publica en Git ni se despliega.
