# Revisión de espacios de los informes

La revisión se realiza en el proyecto local, con una muestra fija de 70 informes: 14 diarios y sus 56 ediciones anuales de 2022 a 2025. Se comparan los mismos cortes para que un cambio en los datos no se confunda con un cambio de diseño.

## Cobertura

| Área | Informes revisados | PDF |
| --- | --- | ---: |
| Finanzas | Bolsa, Bonos, Divisas, Noticias financieras y Panorama financiero | 25 |
| Mercados | Panorama de mercados, Granos, Energía y metales, Proteínas y Noticias de mercados | 25 |
| México | Panorama de México, Bolsa, Proteínas y Producción | 20 |

## Ajustes

- Las comparaciones largas reparten sus barras según la altura real de las etiquetas. Las referencias que ocupan varias líneas cuentan más en el reparto. Se conserva el orden y cada dato aparece una vez.
- La última gráfica puede ocupar el ancho completo cuando así reduce el espacio desperdiciado y cabe dentro de la hoja.
- Las notas metodológicas aprovechan el espacio disponible junto a las gráficas, antes de añadir otro bloque a lo ancho. Se imprimen una sola vez.
- Las explicaciones utilizan la columna disponible antes de colocar su último bloque a lo ancho.
- El cierre calcula la distribución de sus dos últimas hojas antes de dibujarlas. Compara una continuación equilibrada con un cierre completo en una hoja nueva, conservando un fragmento legible bajo cada encabezado.
- En pantalla, las tablas y las tarjetas de causas usan la misma distribución por alturas que las gráficas. Se corrige además el doble espacio entre las tablas del boletín de Proteínas.
- La nueva versión de presentación invalida las vistas previas anteriores. Se conserva la paleta pastel.

## Validación

1. `node scripts/test-all-report-spacing-ui.mjs --annual`: 70 informes en seis anchuras, de 320 a 1440 píxeles; 420 revisiones de pantalla. Se comprueban gráficas, tablas y explicaciones, incluidos bloques que ocupan ambas columnas.
2. `node scripts/audit-report-spacing.mjs --check-layout --compare=tmp/pdfs/revision-espacios-2/baseline.json`: 70 exportaciones con sus márgenes, continuidad, modelos originales y número de páginas verificados.
3. `node scripts/test-report-pdf-column-flow.mjs`: simulación de 25 referencias, columnas independientes y explicaciones largas; comprueba que cada párrafo y referencia se conserve exactamente una vez.
4. `node scripts/test-report-chart-layout.mjs`: reparto óptimo de filas de alturas distintas, sin pérdidas ni cambios de orden; conservación de cifras, fechas y series.
5. Comparación de las cifras decimales de los 70 PDF contra los PDF originales. Se reconoce por separado la reparación de etiquetas de ejes que antes se dividían entre líneas.
6. Compilación, revisión estática y renderizado visual de ejemplos de las tres áreas.

Resultado final: 70 PDF verificados, 327 páginas en total, sin aumentos de páginas respecto de la misma muestra, sin hojas vacías ni cierres aislados bajo el umbral de la auditoría. La comparación de cifras arroja cero diferencias pendientes. Las 420 revisiones de pantalla pasan para gráficas, tablas y explicaciones.

La medición adicional de espacios dentro del área con contenido detectaba tres huecos de columna mayores de 100 puntos. Después de los ajustes no queda ninguno de ese tamaño. El mayor hueco medido pasa de 193,4 a 85,5 puntos. Esta medición considera las tarjetas y las figuras como bloques, y analiza las dos columnas por separado; excluye los márgenes y el espacio que queda después del último bloque de la página.

Los márgenes de impresión y el espacio posterior al último bloque siguen formando parte del formato A4. El contenido disponible determina el cierre de cada informe; los ajustes se centran en los huecos evitables entre bloques y columnas.

## Evidencia local

- `output/espacios-revision-integral.log`: resultados de las exportaciones.
- `output/espacios-integral-pantallas.log`: resultados de los 70 informes en pantalla.
- `output/espacios-integral-cifras.json`: comparación de cifras, informe por informe.
- `output/pdf/finanzas-bolsa-espacios-revisados.pdf`: ejemplo de Finanzas.
- `output/pdf/mercados-espacios-revisados.pdf`: ejemplo de Mercados.
- `output/pdf/mexico-produccion-espacios-revisados.pdf`: ejemplo de México.
