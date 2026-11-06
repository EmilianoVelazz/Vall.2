# Verificación de los datos de Granos y forrajes

Revisión del 5 de noviembre de 2026. Se congeló una copia del informe para contrastar las cifras sin confundir el corte con los movimientos posteriores. Las respuestas públicas originales se conservaron en `output/auditoria-granos-20261105/`.

## Resultado y límites

Se contrastaron 41 de las 43 cotizaciones actuales con respuestas recuperadas de sus proveedores; los precios coinciden después de actualizar Rouen. Se revisaron 4,539 observaciones conservadas contra las series originales del informe y se recalcularon 281 comparaciones. La auditoría no encontró diferencias aritméticas, fechas ajenas a las series ni bases históricas omitidas. La comprobación de todas las observaciones conservadas es interna; no significa que todas esas fechas pudieran descargarse nuevamente de cada proveedor.

Dos cotizaciones no pudieron revalidarse con una descarga nueva: trigo grado 1 FOB de Rouen y cebada forrajera FOB del mar Negro. El archivo mundial de cereales de la Comisión Europea respondió HTTP 307 hacia su página de mantenimiento. Se conservan los valores anteriores con sus fechas, dentro de la tolerancia semanal, y se identifican como respaldo fechado en anexos. No se califican como nuevas publicaciones ni como cotizaciones confirmadas en esta auditoría.

El maíz de China agotó el primer tiempo de espera; el reintento confirmó 2,233 CNY/t al 5 de noviembre. Las series de FAO conservaron producto, plaza, moneda, unidad, UUID y frecuencia. No se multiplicó el precio original por el factor de conversión a kilogramos.

## Correcciones

1. **Rouen, Francia:** la API de DG AGRI devuelve la etapa comercial `Rendu Port - Delivered`. El importador sólo reconocía su denominación larga en inglés y conservaba el dato de 228.79 EUR/t del 18 de octubre. Se añadió esa equivalencia explícita únicamente para cebada forrajera francesa de Rouen, sin aceptar FOB ni otras etapas. Se incorporó la observación de 208.29 EUR/t de la semana terminada el 1 de noviembre, publicada el 5 de noviembre. Se recalculan sus comparativas desde los valores observados.
2. **Historias parciales:** trece comparaciones internas llevaban la clave `since2020` aunque comenzaban en 2021 o 2026. La tabla maestra ya mostraba sus fechas reales, pero la hoja de horizontes y el anexo podían usar un nombre incorrecto. Ahora `since2020` requiere una observación real de 2020; `history` conserva el inicio disponible con la etiqueta «Desde inicio disponible». No se añaden observaciones ni se modifica un precio para completar años.
3. **Trazabilidad de respaldos:** los anexos de Granos identifican las referencias conservadas cuando la consulta actual no recupera una publicación válida. La fecha del informe no sustituye a la fecha de observación.

## Ejemplo de México

FAO/SNIIM mantiene las dos plazas semanales de maíz blanco de Sinaloa. Ciudad de México: 6.50 MXN/kg el 3 de enero de 2020 y 8.50 MXN/kg el 30 de octubre de 2026, cambio de 30.769 %. Culiacán: 6.00 y 10.00 MXN/kg en esas mismas fechas, cambio de 66.667 %. Son mercados concretos, no precios nacionales ni cotizaciones diarias nuevas.

## Interés abierto y verificaciones

Los cuatro totales y cambios semanales coinciden con la CFTC para el 27 de octubre contra el 20 de octubre: maíz 1,859,085 contratos, trigo 525,558, soya 979,414 y harina de soya 609,960. El informe conserva la identificación de COT semanal, todos los vencimientos; no lo presenta como volumen ni como interés abierto diario del contrato frontal.

Se añadieron regresiones para la etapa francesa, la fecha de publicación, el rechazo de FOB y las bases parciales. Se ejecutan las pruebas de cobertura internacional, caché, matemáticas, disponibilidad y exportación diaria/semanal. Se mantienen las 43 referencias en PDFs de tres páginas y se comprueban las hojas numéricas del Excel. Presentación 88 y catálogo 8 invalidan las ediciones anteriores.

Fuentes públicas:

- [Comisión Europea, API de precios de cereales](https://api.tech.ec.europa.eu/agrifood/api/cereal/prices?memberStateCodes=FR).
- [FAO FPMA, descripción de precios y factores de conversión](https://fpma-documentation.web.app/docs/api-docs/series-price/).
- [CFTC, Legacy Futures Only](https://publicreporting.cftc.gov/resource/6dca-aqww.json).
- [Archivo europeo de precios mundiales](https://circabc.europa.eu/sd/a/bc2f8af9-c12b-41ee-b3a6-231457a0e52d/cereals-world-prices.xlsx), temporalmente inaccesible durante la revisión.

La actualización se realiza localmente, sin cambios en Supabase, publicación en Git ni envíos automáticos.
