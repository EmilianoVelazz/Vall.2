# Proteínas: comparativas desde 2020

El lector abre con una gráfica base 100 de cerdo magro, ganado vivo y ganado de engorda CME. Usa la primera y la última fecha observadas comunes de las series, con un máximo de tres líneas. Mantiene las observaciones originales y su calendario.

Las vistas adicionales permiten elegir un producto y consultar sus precios por año desde 2020 o el cambio del último precio respecto a cada año anterior. Las etiquetas muestran el año completo; la fecha exacta queda en la tabla, el respaldo y el dato de la barra. El precio anual comparable es la última observación hasta la fecha equivalente, dentro de la tolerancia de su frecuencia, y no un promedio anual.

Los precios físicos mantienen su historia propia. El código excluye de comparaciones por fecha los segmentos que el proveedor describe como promedios anuales repetidos en fechas concretas. La regla se aplica también después de recuperar metadatos de una copia anterior. Los archivos originales se conservan. Los cortes históricos no pueden recurrir a datos futuros del catálogo cuando todavía no existe una observación.

Se sustituyeron las cifras y las afirmaciones fijas del resumen por cambios calculados sobre las observaciones del corte. Los cuadros estáticos de conversión y márgenes no se insertan como resultados del informe diario. Las referencias recientes de USDA disponibles en el corte no se descartan por coexistir con el catálogo de lonjas.

## Exportación y presentación

- El PDF de proteínas conserva un máximo de tres páginas, con la gráfica histórica, barras comparativas, tabla anual, precios y evidencia de derivados disponible. El detalle completo sigue accesible en el lector y en los respaldos.
- Las tablas históricas pequeñas se conservan completas durante la selección del PDF. La selección de precios se distribuye por especie.
- Excel incluye datos numéricos de las gráficas; CSV y el anexo histórico conservan precios, fechas y cambios con su precisión original.
- El lector muestra una gráfica a la vez, con selector de producto y vistas de historia, años, cambio frente a años anteriores y tendencia reciente.
- La paleta conserva los colores sobrios compartidos por los informes.

## Comprobaciones

`npm run test:reports:protein-history` verifica porcentajes calculados a mano, fechas comunes, copias guardadas, años ausentes, separación de precios físicos y futuros, exclusión de promedios anuales, cortes sin datos futuros, filtros y archivos de respaldo. También renderiza el lector real en escritorio y móvil y comprueba PDF diario y semanal de hasta tres páginas, sin recortes ni celdas vacías.

Las descargas autenticadas PDF diario/semanal, Excel y CSV se simularon mediante la ruta real de exportación. Los PDF fueron renderizados a imágenes para revisar su legibilidad. Los envíos de correo programados permanecen desactivados.
