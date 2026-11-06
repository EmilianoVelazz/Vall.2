# Panoramas de Finanzas, Mercados y México

Los tres panoramas comparten una apertura con señales cuantitativas y tendencias por referencia, implicaciones condicionales para el negocio e índice de capítulos. Se retiran los cuatro recuadros que contaban capítulos, fuentes y gráficas. Los indicadores se seleccionan por su función, no por el mayor movimiento de una referencia aislada. Se conservan fechas, unidades, frecuencias y el alcance de cada informe especializado.

## Alcance

- **Finanzas / Panorama general:** mantiene la integración de Finanzas, Mercados y México, con once capítulos, incluyendo noticias consolidadas. La apertura muestra S&P 500, Treasury 10 años, SOFR, USD/MXN, VIX, WTI físico, maíz y cutout porcino cuando existen referencias recientes. Las implicaciones relacionan exposición cambiaria, energía y fondeo con condiciones explícitas.
- **Mercados:** reúne Granos, Energía y metales, Proteínas y Noticias de mercados en cuatro capítulos. Sustituye la selección plana del antiguo resumen por los modelos especializados, con sus precios y comparativas históricas. Se evita repetir la misma evidencia en tres campos de almacenamiento; el contenido serializado del corte local baja de aproximadamente 1.9 MB a 0.94 MB.
- **México:** conserva Economía nacional y añade Bolsa y tipo de cambio, Proteínas por estado y Producción regional como capítulos del panorama nacional. El informe macroeconómico original queda como capítulo, sin incluir el panorama dentro de sí mismo. La composición se calcula al consultar la API; no reemplaza los insumos ni los cortes especializados almacenados.

La apertura no combina precios de unidades distintas. Cada mini gráfica conserva su propia escala, el rango observado y su primera fecha real. Se conserva el precio negativo de WTI de 2020. Una historia parcial no se prolonga hacia 2020. Los precios sin vigencia suficiente no entran en las señales principales; los periodos anuales mexicanos se muestran como contexto anual, con cambios en puntos porcentuales o porcentajes según corresponda.

Los escenarios de USD 100,000 y de 1,000 barriles ligados al WTI se calculan con las dos referencias fechadas. Son ejemplos condicionales, antes de comisiones, coberturas y condiciones de entrega; no se presentan como ofertas bancarias o de proveedores. Las cantidades monetarias se muestran con dos decimales. Las etiquetas breves de proteínas de México evitan mostrar identificadores técnicos; la identidad completa permanece en el capítulo y en los datos.

## Lectura y exportación

El lector permite ir de cada señal al capítulo correspondiente, expandir o contraer secciones y consultar las tablas y gráficas completas. Se ocultan capítulos sin datos y no se presentan campos vacíos. Noticias repetidas por título o enlace se consolidan.

El PDF mantiene el panorama extenso: no se limita a tres páginas. Cada capítulo utiliza la edición ejecutiva del informe especializado, evitando imprimir todas las alternativas gráficas del explorador. Los índices contienen enlaces internos y una numeración continua. El índice corto de México y Mercados comparte la página de apertura, evitando una página casi vacía. En el corte probado, Finanzas pasa de 75 a 39 páginas, Mercados de 48 a 14 y México de 16 a 12. Se mantienen todos los capítulos; el lector y los datos conservan el detalle completo.

Excel incorpora `Señales del panorama` con números originales, unidades, fechas, variaciones y bases. CSV y texto usan las mismas señales. Se corrige además el contexto de materias primas en Bolsa: una base que empieza en 2024 ya no se etiqueta como variación desde 2020.

## Validación

`scripts/test-report-panoramas-executive.mjs` verifica las tres composiciones, alcance por colección, modelos especializados, fechas, aritmética de porcentajes/puntos base/puntos porcentuales, señales obsoletas, copias privadas y exportadas, preferencias, Excel numérico y los seis PDF diarios/semanales. Se comprueban los enlaces del índice, límites del texto y ausencia de valores inválidos. Se revisan visualmente las páginas iniciales renderizadas.

También se ejecutan las pruebas de Panorama, Mercados, México, Bolsa y disponibilidad de datos, más compilación y análisis estático. La prueba del navegador cubre diez descargas e incluye las tres aperturas, gráficas, navegación al detalle y vista previa PDF. La presentación 90 invalida los PDF anteriores. Evidencia en `output/panoramas-20261105/` y `output/download-button-20261030/`.

El servicio local se reinicia con los envíos automáticos desactivados. No se publica en Git ni se aplican cambios en Supabase.
