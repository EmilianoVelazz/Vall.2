# Proteínas: formato de boletín

Se adaptó el informe diario de Mercados / Proteínas tomando como referencia editorial la disposición pública del [boletín 2.917 de Mercolleida](https://www.mercolleida.com/sites/default/files/2026-01/Bolet%C3%ADn%20Mercolleida%20n%C2%BA%202.917_0.pdf): cabeceras por especie, lectura breve junto a las cotizaciones, columnas de precio anterior/actual/diferencia y condiciones al pie. Los textos, datos y marca del resultado son de VALLNews; la referencia de formato no se presenta como proveedora de estas cotizaciones.

El modelo compartido `report-protein-bulletin.mjs` organiza pollo, huevo, porcino, vacuno, pescado/acuicultura, procesados/alternativas y alimentación animal. La harina de soya se identifica como insumo para alimento animal. Los futuros y precios físicos tienen tablillas y gráficas independientes; las publicaciones semanales o mensuales muestran su último precio con frecuencia explícita, sin cambio diario calculado.

La comparación sigue siendo de las dos últimas publicaciones comparables, con ambas fechas. No se importaron comparaciones semanales ni curvas de años anteriores del boletín de referencia. Las causas y consecuencias por familia permanecen después de las gráficas. Los indicadores anuales de oferta continúan identificados como contexto.

La lectura usa dos columnas cuando hay espacio y una en pantallas pequeñas; las tablillas se desplazan horizontalmente y conservan sus columnas completas. El PDF repite las cabeceras en las continuaciones y aprovecha el espacio restante cuando una tablilla puede continuar en otra hoja.

La muestra verificada contiene 19 referencias, 7 familias y 7 gráficas en 5 páginas A4. No se modificaron los precios para realizar la adaptación. Las ediciones anuales y los demás informes mantienen su composición.

Validación:

- `node scripts/test-report-protein-bulletin.mjs`: familias, fechas, frecuencias, físico/futuros, guardado, CSV y modelo del PDF.
- `node scripts/test-report-protein-prices.cjs`: precios y presentación, rangos, fallas parciales, actualización y persistencia.
- `node scripts/test-report-protein-bulletin-ui.mjs`: 320–1440 px, todas las tablillas y referencias, causas después de gráficas.
- `node scripts/test-report-layout-ui.mjs`: 56 anuales y 14 diarios conservan su distribución.
- `node scripts/test-report-annual-library.mjs`: anuales y exportaciones sin cambios de periodo.
- Compilación, ESLint y comprobación de espacios del diff.
- Revisión visual de las 5 páginas del PDF y comprobación de que aparecen las 19 referencias completas.
