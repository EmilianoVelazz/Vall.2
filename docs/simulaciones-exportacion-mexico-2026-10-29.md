# Simulaciones de exportación de México

Se comprobaron 36 descargas por HTTP mediante el cliente real `requestReportFile` y la ruta real `/api/report-export`: cuatro informes, tres escenarios (diario, semanal y semanal guardado/reabierto) y tres formatos (PDF, CSV y XLSX). Se utilizan identidad y localización españolas de prueba en un servidor local; no se envían correos ni se escriben cuentas o bases remotas. El corte sigue siendo el 27 de octubre de 2026.

## Correcciones encontradas por las simulaciones

- CSV: conservar las notas metodológicas de las tablas y declarar la frecuencia original en las observaciones de México.
- CSV y Excel: recuperar 35 referencias sin serie diaria (31 semanales y cuatro mensuales) en las observaciones estructuradas de proteínas. Los precios ya existían en las tablas documentales; ahora también se pueden analizar como observaciones numéricas. No se inventa una historia diaria.
- Excel: conservar esos precios en Comparaciones y Cobertura, sin publicar un cambio cuando falta una base comparable.
- Excel y CSV: conservar 119 observaciones anuales de producción como números, con año, unidad, estado y fuente; las ausencias no se vuelven cero. Se omite la hoja de Comparaciones de producción porque no contiene bases comparables.
- Suprimir el sufijo técnico de identidad en los nombres visibles de las observaciones de México, manteniendo las identidades y presentaciones originales en el modelo.
- Declarar 2025 en los datos de la gráfica de concentración agrícola.

## Evidencia y límites

Los 12 PDF se abren, suman 27 páginas y se mantienen en 1/2/3/3 páginas por informe. Se revisaron visualmente las 27 páginas y se comprobaron márgenes, pies, valores publicados y escalas. Los 12 Excel pasan CRC/OOXML y comparación de celdas con las tablas y observaciones esperadas; se importaron y renderizaron muestras de los cuatro informes con el motor de hojas de cálculo disponible. No se afirma una revisión dentro de Microsoft Excel de escritorio.

Los 12 CSV conservan UTF-8, notas, periodos, fuentes y todas las filas documentales. El guardado/reapertura conserva resultados y gráficas. También se comprobaron cinco rechazos: sin sesión (401), cambio de cuenta (409) y ausencia de datos publicados en cada formato (422).

El PDF contiene gráficas; Excel conserva sus datos numéricos en Datos de gráficas y aún no contiene gráficas nativas. Las pruebas específicas de México pasan. Dos pruebas generales fuera de México continúan fallando: `test-report-export.cjs` no obtiene evidencia publicada de su fixture de Bolsa; `test-report-chart-grouping-export.mjs` no encuentra la frase metodológica esperada en Energía. No se declara aprobada toda la batería general.

## Repetición

1. `node scripts/test-mexico-export-simulation.mjs`
2. `python scripts/verify-mexico-export-workbooks.py` (Python estándar, sin librerías externas).
3. `node scripts/test-report-mexico-export-data.mjs`

La primera prueba necesita conexiones a localhost y escribe únicamente en su directorio de simulación. Usa el corte guardado de `backend/cache/mexico-executive-reports.json`. Los resultados, archivos descargados y paquete de revisión están en `output/mexico-export-simulaciones-20261029/`.
