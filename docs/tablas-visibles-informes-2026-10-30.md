# Tablas visibles en los informes

La revisión encontró que las tablas seguían en los modelos y lectores: 81 variantes diarias, semanales y anuales renderizan 26,417 celdas publicadas. El problema de presentación era que Bonos, Mercados y varias plantillas de México situaban las tablas después de exploradores largos de gráficas. Además, una preferencia `sections.tables=false` podía ocultarlas sin un control inmediato para recuperarlas.

Se añadió una ordenación exclusiva de lectura que coloca las tablas antes de los bloques de gráficas. El índice y el contenido usan el mismo orden. Se conservan las cifras, fechas, fuentes, filtros y modelos de exportación. Divisas mantiene sus tablas al inicio de su tablero; los informes de noticias no reciben tablas de cotizaciones inventadas.

Cuando una edición base o guardada tiene las tablas desactivadas, el centro muestra el aviso y el botón «Mostrar tablas de datos». Al pulsarlo se activa la preferencia general y la de la vista actual; no se necesita generar otra edición con IA ni sobrescribir el informe guardado. Las descargas de esa vista reciben la preferencia activa. Durante una creación, los controles originales de contenido del editor siguen gestionando la edición.

Se verificaron los 81 lectores con tablas anteriores a los SVG, celdas válidas e inmutabilidad de las entradas. En navegador se comprobaron doce informes de Finanzas, Mercados y México, incluyendo la recuperación de una preferencia guardada en falso, su persistencia al recargar, orden de tablas y gráficas y ancho móvil sin desbordamiento de la página. Las tablas anchas conservan desplazamiento horizontal propio. Evidencia: `output/report-tables-restored-20261030/results.json` y capturas de escritorio y móvil.

Pruebas: `node scripts/test-report-availability-reader.cjs`, `node scripts/test-report-table-visibility.cjs`, `node scripts/test-report-bond-session.mjs`, ESLint específico y `npm run build`. La prueba de navegador usa una cuenta y un servidor locales de prueba, sin escrituras en cuentas remotas. Los cambios están aplicados y compilados en el proyecto local; esta tarea no publica el despliegue de Vercel.
