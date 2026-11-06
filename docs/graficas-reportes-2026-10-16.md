# Diseño de gráficas de informes

Las gráficas de los reportes usan tarjetas con jerarquía clara de título y unidad, colores consistentes y escalas compartidas por la lectura y el PDF. Se conservan los datos, fechas del corte, referencias y las dos gráficas agrupadas de Divisas.

- Ejes con marcas regulares y precisión suficiente para distinguir movimientos pequeños. El ruido de coma flotante no duplica la escala.
- Puntos huecos para la fecha anterior y llenos para la actual. No se suavizan ni interpolan observaciones.
- Las nueve monedas tienen colores estables, trazos diferenciados y etiquetas al final de sus líneas. Las etiquetas se distribuyen sin superponerse y se conectan con su punto real.
- La leyenda permite resaltar una referencia con clic o teclado, sin eliminar sus datos ni las demás series. Un segundo clic restablece la vista conjunta.
- Barras diarias agrupadas por referencia con las dos fechas identificadas. Todas las barras comparten ancho de pista y escala. Las variaciones de divisas usan cero centrado, signo y porcentaje.
- El cero se representa con un punto; un dato ausente conserva «Sin dato» y una pista visual distinta. Ordenar no convierte ausencias en ceros.
- El ancho observado del gráfico adapta las coordenadas SVG al espacio real y mantiene legibles las etiquetas. Los controles respetan movimiento reducido y foco de teclado.
- En PDF, leyenda compacta de nueve monedas, cifras legibles, marcadores, colores y escalas consistentes. El anexo se mantiene junto con su contexto y primeras filas.

Los campos `reference`, `date` y `comparisonDay` de las barras se derivan al componer el informe; no requieren modificar los informes almacenados. La versión de presentación invalida PDF anteriores en la vista previa.

Validación: `scripts/test-report-chart-design.mjs`, `scripts/test-report-fx.cjs`, reportes diarios, anexo, catorce formatos PDF, densidad y traducciones. La revisión visual usa datos de simulación claramente identificados; no se envían correos de prueba.
