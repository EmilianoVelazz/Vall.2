# Escaneo de espacios y distribución de informes

Revisión local del 22 de octubre de 2026. Se exportaron los 14 informes diarios y las 56 ediciones anuales de 2022–2025, de Finanzas, Mercados y México, con la muestra fija guardada en `output/escaneo-espacios-20261022/sources.json`.

## Resultado

- 70 PDF y 329 páginas A4 comprobados automáticamente, sin páginas vacías ni contenido fuera de los márgenes definidos por el auditor.
- Ningún hueco intermedio superior al límite de revisión de 100 puntos. El mayor fue de 84,0 puntos en la página 9 de Proteínas de México de 2024: una nota común queda debajo de dos gráficas de alturas distintas. La imagen renderizada conserva las gráficas completas y las leyendas legibles.
- El cierre menos ocupado entre los PDF de varias páginas utiliza el 32 % del cuerpo medido; ninguno quedó por debajo del umbral de revisión del 22 %.
- 28 comprobaciones posteriores al ajuste en la aplicación real: los 14 informes diarios a 1280 y 390 píxeles de ancho. Sin tarjetas superpuestas, tarjeta única a media fila, huecos superiores a la separación permitida ni desbordamiento horizontal del documento. Las separaciones medidas entre tarjetas llegaron a 16 píxeles, de acuerdo con el espacio y redondeo de la cuadrícula.
- También se comprobó una edición anual de Energía y metales de 2022 en móvil y una vista diaria a 820 píxeles antes del ajuste de inicialización; ambas quedaron bien distribuidas. No se presenta esa muestra como revisión de las 56 ediciones anuales en pantalla.

## Ajuste realizado

Al cambiar de informe se detectó una superposición transitoria: la cuadrícula activaba filas de cuatro píxeles y esperaba al siguiente fotograma para asignar a cada tarjeta su altura. `ReportVisualGrid.jsx` ahora calcula la distribución en `useLayoutEffect`, antes del primer pintado, y conserva la observación de cambios de tamaño. La comprobación posterior pasó en los 28 casos de escritorio y móvil sin esperar artificialmente a que desapareciera la superposición.

Se amplió `scripts/audit-report-spacing.mjs` para medir huecos interiores con la traza de los bloques dibujados y los límites del texto extraído del PDF. Las mediciones usan bandas por columna: una celda estrecha o el pasillo entre indicadores no se confunden con huecos. Márgenes, área interna de una gráfica y espacio libre al final de la columna se distinguen de una separación entre bloques. El parámetro `--max-interior-gap=100`, junto con `--check-layout`, hace fallar el escaneo cuando se supera el límite.

## Verificación y evidencia

Se inspeccionaron visualmente siete páginas renderizadas: Noticias de mercados anual de 2022 (página 2); Panorama nacional de México (1); Proteínas de México (19); Proteínas de México de 2024 (9); Mercado de proteínas (1); Bolsa (3); Bonos (3). La revisión visual es una muestra de las 329 páginas, complementada por el escaneo automático de todas ellas.

- `output/escaneo-espacios-20261022/after.json`: resultados por informe, página y columna.
- `output/escaneo-espacios-20261022/after-gaps.json`: páginas ordenadas por mayor hueco interior.
- `output/escaneo-espacios-20261022/scan.log`: ejecución completa con el límite de 100 puntos.
- `output/escaneo-espacios-20261022/`: PDF exportados y PNG de inspección.
- `output/escaneo-espacios-20261022/build.log`: compilación de producción aprobada, con el aviso conocido de paquetes grandes de Vite.

Comprobaciones aprobadas: `test-report-spacing-audit.mjs`, `test-report-pdf-column-flow.mjs`, `test-report-chart-layout.mjs` y ESLint de los archivos de código modificados. Las pruebas del escáner incluyen un hueco deliberado de 120 puntos y casos negativos con celdas estrechas, cuatro indicadores y límites de gráficas.

No se modificaron las cotizaciones, el contenido, la paleta ni la paginación del generador PDF durante este escaneo. No se comparó la cantidad de páginas con una versión anterior. Las conclusiones se refieren a esta muestra: los márgenes y el espacio normal al finalizar un contenido permanecen, y un informe personalizado futuro puede necesitar una revisión adicional. Los envíos programados locales siguen desactivados.
