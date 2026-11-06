# Revisión ampliada de exportaciones - 29 de octubre de 2026

## Alcance

La matriz comprende 14 familias de Finanzas, Mercados y México. Cada familia se prueba en edición diaria, semanal y semanal guardada/reabierta; además se revisan sus informes anuales de 2022, 2023, 2024 y 2025. Son 98 escenarios y 294 intentos de descarga en PDF, CSV y XLSX.

Se utiliza el cliente real `requestReportFile`, la ruta real `/api/report-export` y el almacén privado de informes en un servidor local. La identidad y la traducción española son fixtures. No hay correos, escrituras remotas ni llamadas a IA. Cada corrida utiliza una cuenta sintética distinta para no acumular el límite de guardados de pruebas anteriores.

## Correcciones

- Bolsa: conservar los 124 enlaces de fuentes al exportar y guardar. Se comparte un límite acotado entre ambos flujos; el máximo es 192 para familias con muchas referencias. El tamaño permitido de Bolsa contempla el informe completo. Guardar y reabrir mantiene exactamente los puntos de las gráficas y sus índices de referencia.
- Divisas: conservar la historia completa disponible en las exportaciones directas. El recorte anterior de observaciones podía producir diferencias entre lector y archivo. Las ediciones guardadas conservan su historia canónica y las bases utilizadas para calcular variaciones.
- Divisas anuales: invertir cada observación original de EUR, GBP, AUD y NZD antes de calcular promedios, extremos y rendimientos. Se usan EUR/USD, GBP/USD, AUD/USD y NZD/USD con sus unidades correctas. No se invierte un promedio ni se cambia solamente el signo del rendimiento.
- RUB y VES: mantener evidencia numérica y tablas separadas en los anuales; excluirlos de las escalas comerciales comparativas.
- Anuales: guardar las observaciones mensuales originales, bases, cierre e indicadores anuales con precisión numérica, incluido el detalle estatal de producción. Conservar el análisis anual, metodología y riesgos en PDF. Antes un arreglo vacío de paneles impedía mostrar ese análisis.
- Excel y CSV: recuperar cotizaciones publicadas de frecuencia semanal/mensual cuando no existe serie diaria, también dentro del Panorama integrado. Las ausencias reales siguen siendo ausencias; no se convierten en ceros.
- Excel: mostrar los años sin separador de miles; conservar unidades, periodos, fuentes, notas y datos de gráficas.
- PDF: evitar encabezados de noticias sin artículo en la misma página. Los anuales de Divisas y las ediciones actuales de Proteínas de EE. UU. se equilibran en dos páginas conservando las tablas; se seleccionan menos gráficas para esa edición compacta, mientras los datos de respaldo permanecen disponibles.

## Verificación y evidencia

Los resultados definitivos se registran en `output/reportes-simulacion-ampliada-20261029/suite-results.json` y `workbook-validation.json`: 98 escenarios completos, 285 archivos generados, nueve respuestas 422 esperadas y cero incidencias pendientes en la matriz. Los rechazos corresponden a falta de noticias publicadas en las tres ediciones actuales de Noticias de Mercados. No se genera un informe vacío para esos casos. La comparación independiente de los 95 libros termina sin discrepancias.

El verificador independiente de Python abre ZIP/XML y CSV, compara tablas y observaciones numéricas, comprueba precisión de producción anual, fuentes, periodos y contenido de noticias, y detecta fórmulas o errores de celdas. La comprobación HTTP revisa tamaño, tipo de contenido, privacidad y lenguaje de la respuesta. Las referencias, tablas y curvas se contrastan con entradas congeladas, que no deben mutar durante la prueba.

Se renderizaron las 413 páginas de los 95 PDF con Poppler y se revisaron en 35 láminas de contacto, con ampliación de muestras. Los PDF especializados se mantienen en un máximo de tres páginas. Panorama integrado conserva todos los capítulos: 53 páginas en diario y 54 en semanal y guardado. Tiene oportunidades pendientes de compactación, incluidos algunos finales de capítulo con poca ocupación; esta revisión no lo presenta como un resumen ejecutivo breve.

Se importan y renderizan muestras XLSX con el motor de hojas de cálculo disponible. Esta comprobación y el análisis OOXML no equivalen a una prueba dentro de Microsoft Excel de escritorio. Los libros contienen datos de gráficas, pero todavía no gráficas nativas de Excel.

## Vigencia y límites

Esta auditoría verifica consistencia y exportación de los datos preservados, no una revalidación de cada precio contra el mercado al momento de la entrega. Las capturas actuales conservan sus cortes del 27 y 29 de octubre según la familia. Los 56 anuales se reconstruyeron con el historial local fechado el 20 de octubre, sin solicitudes externas y sin modificar el archivo histórico original; su hash se incluye en `annual-rebuild.json`.

El alcance histórico anual simulado es 2022-2025. La prueba no certifica una biblioteca anual completa desde 2020, ni rellena periodos ausentes. Las series actuales conservan el historial disponible, con algunas referencias desde 2020.

Persiste la limitación ya documentada para nueve precios porcinos mexicanos del 26 de octubre cuya fuente dejó de devolver esa fecha. No se atribuyen causas de mercado ni se sustituyen cotizaciones ausentes con valores inventados. Los espacios reservados por diseño y las marcas de agua se mantienen en plantillas existentes.

## Pruebas de regresión

Se ejecutaron las pruebas específicas de exportación, conservación de evidencia, agrupación de gráficas, tesorería de divisas, bonos internacionales, edición/tablas impresas, biblioteca anual, historia de Bolsa, disponibilidad de datos, noticias financieras y auditoría PDF de México. También se ejecutaron ESLint sobre los archivos cambiados y la compilación de producción. No se declara ejecutada toda la batería `test:all`.

Las dos fallas generales consignadas en la revisión anterior de México quedaron resueltas: se corrigió la fecha del fixture de Bolsa y se actualizó la comprobación metodológica obsoleta de Energía. No se eliminaron comprobaciones de conservación de datos.

## Repetición

1. `node scripts/simulate-report-export-suite.mjs` para toda la matriz; necesita conexiones a localhost.
2. `python scripts/verify-report-export-suite.py` para verificación independiente de todos los XLSX y sus CSV.
3. `node scripts/test-report-export-evidence.mjs` para historia FX, fuentes, guardado y estadísticas anuales.
4. `node scripts/test-report-annual-library.mjs` para la biblioteca anual.
5. `npm run build` para la compilación de producción.

`--inventory` muestra el alcance sin exportar. `--only <identificadores separados por coma>` repite casos concretos y exige el mismo hash de entradas. `--xlsx` repite los Excel conservando las comprobaciones anteriores de PDF/CSV. Los fixtures privados y las entradas completas no se incluyen en el paquete de entrega.
