# Comparativas históricas y Latinoamérica

Se amplió Bolsa con una matriz visual 2020–año del corte, gráficos separados por país de Latinoamérica y referencias identificadas en el título, la leyenda y el texto. El PDF diario y semanal conserva la composición de dos páginas.

## Comparación entre años

Cada columna mide la variación desde el último cierre del año anterior hasta el mismo día y mes del corte de referencia del S&P 500. Se toma la última sesión observada anterior dentro de siete días, con validación de calendario y del año de ambas bases. Se conservan los valores y fechas exactos en anexos, Word/texto, CSV y Excel.

No se confronta el año actual parcial con años completos, no se sustituye un cierre ausente con el primer dato de enero y no se rellenan huecos con ceros. La consulta bursátil comienza en diciembre de 2019 para disponer de la base de 2020. La compactación mantiene cierres mensuales y observaciones cercanas a la fecha de comparación de cada año.

El lector muestra todos los índices con bases comparables y permite filtrar por país. El año actual queda destacado y visible al desplazar la tabla, también en móvil. La matriz del PDF se concentra en las Américas; la tabla maestra sigue incluyendo todas las plazas con cierres recientes. El resto de las comparativas históricas se conserva en el lector y los datos descargables.

Las ediciones guardadas conservan la serie mensual observada, las sesiones recientes y cada base exacta de variación y de conversión FX. Se eliminó la duplicación de las gráficas heredadas al crear una edición de Bolsa y se redujo su proyección diaria redundante; el histórico canónico tiene prioridad al reabrir. La prueba con el corte real compara todas las variaciones de índices, divisas y contexto antes y después del guardado, además de cada celda anual. Se mantiene el límite privado de 384 KiB por documento.

## Referencias de las gráficas

- México: S&P/BMV IPC frente al S&P 500 de precios.
- Brasil: Ibovespa frente al S&P 500 de retorno total, conservando dividendos en ambos índices.
- Los demás países latinoamericanos se incorporan automáticamente cuando tienen cierres recientes, una historia común y una referencia de la misma metodología.
- Cada panel mantiene una base observada común de 100 y ambas fechas. La referencia usa una línea azul discontinua, las bolsas comparadas una línea continua y los últimos niveles aparecen destacados.
- Se conservan monedas originales. Estas gráficas comparan trayectorias nominales; no representan rendimiento de una inversión en USD ni poder adquisitivo. La equivalencia USD diaria sigue exigiendo FX de las dos fechas exactas.
- Argentina utiliza una escala logarítmica declarada si hay una serie reciente y comparable, para evitar que magnitudes nominales muy distintas aplasten la referencia.

La metodología de [S&P/BYMA](https://www.spglobal.com/spdji/es/documents/methodologies/methodology-sp-byma-indices-spanish.pdf) identifica MERVAL/.MERV como retorno total. La clasificación se conserva junto a DAX e Ibovespa, sin compararlos con una referencia de precios. La fuente nueva de soporte `^SP500TR` se consulta con verificación de símbolo y cierre de sesión; no entra como otra bolsa en la tabla principal.

## Verificación

Pruebas de bases anuales, calendario, faltantes, retención de observaciones, comparaciones de dividendos, filtros, inmutabilidad, guardado y exportaciones. En el corte público utilizado para validar hay 41 índices recientes y 40 con comparaciones entre años; México y Brasil tienen paneles propios. Argentina no se presentó como dato actual porque el proveedor sólo entregó cierres hasta el 16 de octubre; el histórico consultado de Chile respondió 404. No se sustituyeron con ETF ni con cotizaciones inventadas.

Se generaron y renderizaron PDF diarios y semanales, se comprobaron filtros reales en un navegador de prueba y el diseño a 390 px. Los correos programados permanecen desactivados; esta actualización se deja local.
