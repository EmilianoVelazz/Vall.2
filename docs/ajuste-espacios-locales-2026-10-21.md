# Ajuste local de espacios en informes

La revisión utiliza los mismos datos de 14 informes diarios y 56 ediciones anuales de 2022–2025. No se actualizan cotizaciones para comparar el diseño. Las modificaciones quedan en el proyecto local.

## Cambios

- Las gráficas únicas ocupan el ancho de la fila. La prueba de pantalla detecta ahora una tarjeta única que deje media fila vacía.
- El PDF empieza el apartado de gráficas con una figura que quepa en el espacio disponible, en lugar de reservar siempre la altura de la pareja más alta.
- Las notas metodológicas repetidas se imprimen una vez. Las frases con cifras o fechas permanecen junto a cada gráfica; se conservan sus series, tablas y unidades.
- Los resúmenes de las gráficas de bonos evitan repetir todas las filas de la tabla. Si una edición excluye las tablas, las gráficas conservan el detalle completo.
- Las leyendas calculan su altura a partir del texto real. El ajuste del espacio interior no reduce la altura del área de trazado ni el tamaño de letra de sus etiquetas.
- En los anuales, las notas de metodología y revisión pueden aprovechar un hueco al lado de las gráficas. Las causas y consecuencias permanecen después de las gráficas.
- Antes de pintar las conclusiones se calcula su paginación sin dibujar contenido. Cuando un cierre necesita otra hoja y cabe completo en ella, se mantiene unido. Las notas comunes también evitan una continuación de una sola línea.
- La versión de presentación cambia para invalidar las vistas previas anteriores.

## Comprobaciones

`audit-report-spacing.mjs --check-layout --compare=tmp/pdfs/todos-informes/antes-espacios-locales.json` verifica los 70 PDF, los márgenes, la integridad de los modelos, la ausencia de hojas vacías, los cierres aislados y que no aumente la cantidad de páginas con los mismos datos.

Resultado final: 337 → 327 páginas en la muestra completa. Ningún informe aumenta sus páginas ni deja un cierre por debajo del umbral de ocupación de la auditoría. Bonos diario pasa de cinco a cuatro páginas; Proteínas de México pasa de once a diez páginas en cada uno de los cuatro años, y Divisas anual pasa de cuatro a tres. El servidor local responde correctamente después de cargar el código final.

La interfaz pasa los 14 informes en seis anchuras, de 320 a 1440 píxeles. Se verifican además las siete familias de Proteínas y sus filtros, Bonos con fechas y puntos base, las ediciones sin tablas y las exportaciones en seis idiomas. El control de texto largo exige que cada párrafo aparezca exactamente una vez, incluso durante el cálculo previo.

La antigua simulación de traducción de la prueba de Bonos anteponía «Translated» al texto español; se corrigió esa simulación para conservar los marcadores numéricos y producir texto de prueba en inglés. El rechazo de idiomas mezclados permanece activo.
