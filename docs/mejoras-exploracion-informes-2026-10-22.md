# Mejoras de lectura, cobertura y Excel · 22 de octubre de 2026

Se aplicaron las seis mejoras propuestas en `siguiente-etapa-informes-2026-10-22.md`.

- Pantalla y PDF comparten la separación de segmentos mensuales cuando faltan meses. Los puntos aislados siguen visibles. La comparación diaria conserva sus dos sesiones.
- Los destacados de Causas y consecuencias priorizan magnitud dentro de medidas compatibles y alternan grupos, favoreciendo mercados todavía no representados. No se mezclan puntos base con porcentajes para decidir un único ranking.
- Los 56 anuales abren con hallazgos calculados del año y sus fuentes. Las repercusiones identifican una referencia, su cambio y las condiciones para interpretar su efecto. Se evita repetir los mismos destacados en todos los apartados.
- Los anuales ofrecen filtros por país, región, producto, entidad y referencia, y selección de hasta cuatro series mensuales. La muestra predeterminada se conserva. Los filtros afectan la lectura y se advierte que las descargas mantienen el informe completo.
- El panel de cobertura muestra disponibilidad, comparabilidad, meses ausentes, fuente y frecuencia traducida. El detalle se pagina de veinte en veinte. Los indicadores anuales y los volúmenes agrícolas no se convierten en observaciones diarias ficticias.
- Hay descarga XLSX para los informes diarios, históricos y anuales. Las hojas separan resumen, observaciones, comparaciones, cobertura, fuentes y tablas documentales. Los datos estructurados conservan números y fechas; el texto de tablas publicadas no se convierte en supuestos valores originales. Se explica la diferencia entre muestra mensual y estadísticas calculadas con la frecuencia original.

La evidencia anual estructurada se valida al entregar, guardar y exportar. La versión del catálogo anual pasó a 2 y la de presentación a `2026-10-22-exploracion-informes-26`. Se reconstruyeron las ediciones desde el archivo histórico local ya existente, sin volver a consultar proveedores ni cambiar sus fechas de preparación.

Comparación contra la muestra anterior: tablas, gráficas predeterminadas y recuentos de cobertura se conservaron exactamente en las 56 ediciones. Se incorporaron datos numéricos estructurados y texto específico. La paleta neutra azul/gris permanece.

Validación:

- `npm run test:reports:exploration`: selección estable ante reordenación, separación mensual sin interpolación, filtros, referencias fuera de la muestra inicial, validez de evidencia, 56 XLSX, protección frente a fórmulas implícitas, MIME y exportación HTTP con sesión y dueño de cuenta.
- Pruebas previas de carga, cancelación y recuperación anual, contenido, periodos, exportación y distribución PDF.
- Generación adicional de los 14 libros diarios. Lectura independiente con `openpyxl` confirmó fechas y números tipados; se usa únicamente como lector de validación.
- Auditoría de los 70 PDF: sin páginas vacías, fuera de márgenes o cierres aislados. Hueco interior máximo de 81.6 puntos; ninguno mayor de 100. Una segunda revisión enfocada cubrió los panoramas tras el último ajuste de texto.
- Navegador local: filtros Nayarit/Pollo muestran siete meses de datos y cinco ausentes; el SVG contiene dos segmentos. La descarga real del Excel de México 2025 contiene las 128 referencias de la edición completa.

Evidencia en `output/report-next-stage-20261022/` y en los registros `output/report-next-stage-*.log`. No se desplegó ni se activaron envíos programados.
