# Informes: mostrar únicamente campos con datos

La presentación de Finanzas, Mercados, México, sus ediciones semanales y la librería anual aplica una validación común en `shared/report-available-data.mjs`.

- Se omiten valores ausentes, no finitos y marcadores de indisponibilidad. Un cero observado sigue siendo un dato válido.
- Un precio vigente se conserva aunque no exista una base histórica: se muestran únicamente sus comparaciones disponibles. Las filas sin el precio principal se excluyen.
- Las tablas se agrupan por campos disponibles; las matrices con huecos enumeran las observaciones publicadas con su horizonte, fecha y unidad. No se rellenan huecos ni se calculan rendimientos sobre bases inexistentes.
- La producción agrícola se presenta por estado y cultivo con volumen publicado, sin inventar ceros para combinaciones no reportadas.
- Se conservan las identidades, estados, códigos de moneda y colores de costo al proyectar columnas o seleccionar filas.
- Las gráficas vacías se omiten; una observación aislada no se presenta como tendencia. Los paneles opcionales de dólar, riesgo y fondeo dependen de datos disponibles.
- Los informes sin datos no generan un PDF vacío: la exportación devuelve `422 / REPORT_DATA_UNAVAILABLE`. Panorama conserva sus capítulos con datos y ajusta su índice.

Esta es una transformación de presentación: las observaciones originales, tablas documentales, CSV y Excel completos permanecen intactos. Se mantienen las fechas reales, las unidades y la precisión del respaldo.

## PDF y espacio

Los informes individuales siguen limitados a tres páginas. El Panorama integrado de Finanzas continúa extenso. Las tablas de producción de México usan tableros paralelos; los valores mineros indican explícitamente la escala en miles de millones de MXN y su redondeo. Los importes pequeños conservan cifras significativas para evitar convertir una cifra positiva en un cero aparente.

Una variante con menos gráficas opcionales sólo sustituye a la original si reduce páginas conservando exactamente las mismas tablas y filas seleccionadas. Las gráficas completas permanecen en el lector. En la muestra comprobada, Panorama de México pasó de dos a una página y Producción de tres a dos.

## Verificación

`npm run test:reports:availability` comprueba los datos, los lectores React reales y los PDF diarios:

- 80 modelos diarios, semanales y anuales; celdas presentes, ceros válidos, inmutabilidad y metadatos alineados.
- 81 lectores, incluido un caso de divisas sin datos opcionales.
- 13 PDF diarios individuales, sin celdas de indisponibilidad, contenido recortado ni exceso de páginas.

`npm run test:reports:three-pages` verifica además las ediciones anuales y semanales y la excepción del Panorama integrado. La prueba de Panorama valida que no se publiquen capítulos sintéticos vacíos. Se simularon también las descargas PDF, CSV y Excel de México, con respuesta HTTP 200, y los filtros en escritorio y móvil.

Los envíos de correo programados permanecen desactivados.
