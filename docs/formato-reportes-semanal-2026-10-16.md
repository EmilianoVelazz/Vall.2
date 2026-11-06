# Formato de informes basado en «Reporte semanal»

Se revisó la estructura de la hoja `Reporte semanal` del archivo aportado por el usuario. Se tomó como referencia la organización de A1:N16 (cabecera, indicadores y comparaciones), las gráficas en dos columnas, el histórico comercial de A71:N112 y el bloque estadístico de A340:N356. El archivo original no se modificó. Sus cifras de empresa no se copiaron al producto ni se enviaron a servicios externos.

## Aplicación

Los 12 informes de Finanzas, Mercados y México distintos de `daily_news` y `market_news` usan la nueva composición. Las ediciones guardadas conservan la composición de su reporte base, aunque cambie el título. Los informes manuales usan el formato general de empresa. Daily News, Noticias de mercados y sus copias conservan su composición anterior. El módulo independiente de Noticias no se modificó.

La lectura y los PDF de vista previa, descarga y correo comparten el modelo `shared/report-weekly.mjs`. No se requiere migrar los informes guardados. La versión de presentación cambió para invalidar la vista anterior.

## Estructura

Actualización solicitada por el usuario: la presentación muestra únicamente datos y gráficas. Se omiten resumen, objetivo, análisis, conclusiones, recomendaciones, guías de validación y párrafos de metodología. Se conservan títulos, fecha de corte, unidades y periodos. El contenido original guardado permanece intacto para su edición.

1. Cabecera institucional y fecha de corte.
2. Indicadores principales.
3. Resultado actual y comparación disponible.
4. Gráficas de evolución y comparación en dos columnas, adaptables a móvil.
5. Histórico de los puntos mostrados y tablas originales.
6. Estadísticas descriptivas cuando hay series temporales suficientes.

Las comparaciones usan el último punto y su observación anterior de la misma serie. No se presentan como semanales cuando la frecuencia no lo permite. En tasas expresadas en %, la diferencia se presenta en puntos porcentuales. Una base cero o negativa no produce un porcentaje engañoso. Se conservan fechas, horas, unidades, ceros y ausencias. No se interpolan datos. Las observaciones posteriores al corte, fechas inválidas y valores contradictorios en la misma fecha no entran en los cálculos nuevos. Los precios entre estados o las barras de categorías no se tratan como series temporales.

La estadística muestra N, media, desviación estándar muestral, mínimo y máximo, con el periodo de cada serie. Describe los puntos disponibles, que pueden estar muestreados; no se presenta como pronóstico ni como volatilidad de toda la historia. Los históricos extensos ocupan más páginas en A4, sin recortar sus registros para mantener la extensión anterior.

## Verificación

- Importación y revisión visual de la hoja de referencia mediante la herramienta de hojas de cálculo.
- Prueba de cálculos contra resultados conocidos, corte temporal, fechas inválidas, duplicados contradictorios, ceros, tasas, exclusiones y formatos de ediciones propias.
- Generación de PDF para los 14 apartados y sus variantes con bloques excluidos: contenido, valores, columnas, márgenes, pies, marca y excepciones.
- Navegador local con API simulada: 14 apartados, escritorio y anchuras de 360, 390 y 768 píxeles, sin desbordamiento ni errores de JavaScript.
- Seis idiomas, incluido japonés: lectura de PDF, correo y programación con IA y SMTP simulados. No se envió correo real de prueba.
- Informes personalizados con textos extensos, 30 indicadores y tablas de 12 columnas: conservación del contenido e identidad de las filas al dividir columnas.
- Regresión de un informe archivado: se mantienen las celdas originales, el análisis personalizado y la metodología; el histórico y las estadísticas se incorporan sin grandes páginas vacías.
- Compilación, ESLint de los archivos afectados y revisión de espacios del diff.

Muestras y capturas de verificación quedan bajo `output/weekly-template-review` y `output/tableros-informes`. Se usaron datos sintéticos o fixtures de pruebas. El diseño de lectura y PDF se actualizó localmente; no se realizó despliegue remoto.
