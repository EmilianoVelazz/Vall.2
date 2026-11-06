# Granos: México y comparativa mundial desde 2020

El corte local incorpora 43 referencias de 26 países y una referencia regional del mar Negro. Se añaden once series públicas de FAO FPMA a las 32 cotizaciones anteriores: dos plazas mexicanas y publicaciones de Colombia, Perú, Chile, Ecuador, Bolivia, Guatemala, El Salvador, India y Tanzania. Las series se seleccionan por producto, plaza, tipo mayorista, moneda, unidad y frecuencia. Un catálogo sin precios recientes no añade cobertura ficticia.

## México y fuentes

Se conectan las series semanales de maíz blanco de Sinaloa en Ciudad de México y Culiacán, publicadas por SNIIM y distribuidas por FAO FPMA. La base disponible es el 3 de enero de 2020: 6.50 y 6.00 MXN/kg, respectivamente. El último corte verificado del 30 de octubre de 2026 es 8.50 y 10.00 MXN/kg. Son dos mercados concretos; no un promedio nacional.

Las otras series conservan los organismos de origen que declara FAO. Los promedios mensuales representan el final de su mes; no reciben variaciones diarias. Se utiliza `price_value` en su unidad nominal original. El factor de conversión se valida como metadato y no se multiplica por el precio. No se usa `price_value_dollar` como si fuese la moneda original.

Fuentes consultadas: [FAO FPMA](https://www.fao.org/giews/food-prices/home/en/), [API pública de FAO](https://fpma.fao.org/giews/v4/global/price_module/api/v1/FpmaSerieDomestic/?iso3_country_codes=MEX&limit=100), [SNIIM: consulta de granos](https://www.economia-sniim.gob.mx/nuevo/Consultas/MercadosNacionales/PreciosDeMercado/Agricolas/ConsultaGranos.aspx). Se conservan UUID, enlace por serie, mercado, fuente, unidad y fecha de consulta en la evidencia.

## Tabla y gráfica

- Tabla maestra con todas las referencias: precio inicial, fecha base, precio actual, fecha actual y cambio desde esa base. La edición completa conserva también la variación de sesión cuando existe.
- Los códigos estables dentro del corte enlazan cada fila con el panel histórico. La base es la primera observación real desde 2020; las series que empiezan después conservan su fecha y no se prolongan hacia atrás.
- Un panel gráfico reúne las 43 trayectorias, en filas separadas, con un calendario común desde 2020. Cada fila tiene su propia escala vertical y base 100. No se mezclan niveles de precios, monedas o plazas ni se promedian países. El rango y último índice se identifican como índices.
- Dos gráficas recientes en MXN/kg muestran las plazas mexicanas sin equipararlas a un precio nacional. Se mantiene la paleta neutra.
- Excel incorpora `Maestra 2020-actual`, con cifras numéricas, fechas, frecuencias y fuentes, e `Historia global`, con todas las observaciones normalizadas del panel. Los datos de comparación siguen disponibles en las demás hojas.

## Verificación

Las exportaciones diaria y semanal conservan tres páginas, con las 43 referencias en tabla y gráfica, sin recortes ni campos vacíos. Las pruebas comprueban matemáticas de base 100, unidades, fechas, historias parciales, ceros, conflictos, series ajenas y precios obsoletos. Los filtros de México conservan ambas plazas. El libro Excel se vuelve a abrir para comprobar sus cifras y el contenido de las nuevas hojas.

Se verifican el lector React real (43 trazos y vista mundial inicial), la vista previa y las nueve descargas de Finanzas, Mercados y México. Se revisan visualmente las páginas renderizadas. Las pruebas de disponibilidad de 80 modelos, caché de granos y regresiones de Proteínas y Bolsa se completan.

Evidencia local en `output/granos-cobertura-20261105/` y `output/bolsa-tablas-granos-20261105/`. Catálogo 7 y presentación 87 invalidan la cobertura y los PDF anteriores. El servicio se reinicia con los envíos automáticos desactivados; no se publica en Git ni se modifica Supabase.
