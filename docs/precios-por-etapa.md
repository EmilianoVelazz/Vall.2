# Precios de proteínas por etapa comercial

8 de octubre de 2026. Implementación local para ORION, sin despliegue a producción.

El chat conserva SNIIM y Porcicultura e incorpora dos fuentes primarias. PROFECO proporciona observaciones al público por establecimiento y presentación. El catálogo público de DSPC proporciona precios de lista de mayoreo de un proveedor de Puebla/Cholula. No se calcula mayoreo descontando un porcentaje del precio minorista.

La tabla identifica etapa, plaza/establecimiento, presentación, moneda/unidad, fecha y enlace. La fecha de PROFECO es el levantamiento; la de DSPC es la actualización de su catálogo. Los mínimos por volumen aparecen en filas separadas. El huevo en paquete conserva su número de piezas, sin convertirlo a kg. Los cortes no sustituyen canal o pollo entero.

## Lectura pública real

Consulta guardada el 8 de octubre a las 16:40, hora de México. Ejemplos recuperados para Puebla; son presentaciones distintas y no acreditan una comparación de margen entre productos equivalentes:

| Presentación | Etapa / fuente | Precio | Fecha del dato |
| --- | --- | --- | --- |
| Pechuga de pollo | Mayoreo, DSPC | 143.00 MXN/kg; desde 15 kg, 98.00 MXN/kg | 2026-10-08, catálogo |
| Pechuga filete, sin marca, granel | Al público, MEGA SORIANA Plaza San Pedro, PROFECO | 169.90 MXN/kg | 2026-10-06, levantamiento |
| Bistec norteño | Mayoreo, DSPC | 208.00 MXN/kg | 2026-10-08, catálogo |
| Bistec del 0, sin marca, granel | Al público, MEGA SORIANA Plaza San Pedro, PROFECO | 204.00 MXN/kg | 2026-10-06, levantamiento |
| Huevo blanco | Mayoreo, Central de Abasto de Puebla, SNIIM | 27.00 MXN/kg, precio frecuente | 2026-10-07 |
| Huevo blanco El Calvario, paquete de 12 | Al público, MEGA SORIANA Plaza San Pedro, PROFECO | 29.00 MXN/paquete de 12 huevos | 2026-10-06, levantamiento |

Fuentes reproducibles: [DSPC, pechuga](https://dspc.mx/productos/pechuga-de-pollo-64), [DSPC, catálogo](https://dspc.mx/productos), [PROFECO, pechuga en Puebla](https://qqp.profeco.gob.mx/results?city=2101&searchTerm=pechuga), [PROFECO, bistec en Puebla](https://qqp.profeco.gob.mx/results?city=2101&searchTerm=bistec), [PROFECO, huevo en Puebla](https://qqp.profeco.gob.mx/results?city=2101&searchTerm=huevo).

El identificador `qqpweb` que utiliza el conector es el mismo identificador público de lectura publicado en el cliente web oficial de QQP. No utiliza una cuenta privada del usuario. El conector sólo consulta el catálogo de ciudades y observaciones públicas; no crea cuentas ni efectúa compras.

La lectura adicional de PROFECO recuperó tres especies en Guadalajara (cerdo, pollo y huevo, 5 de octubre), cuatro en Monterrey y cuatro en CDMX (6 de octubre). No recuperó res para el municipio de Guadalajara en esa consulta. CDMX conserva la alcaldía del establecimiento; no convierte la observación en un promedio de toda la ciudad. Resultados y brechas en `output/proveedores-publicos/regiones-profeco-real.json`.

## Cobertura y límites

- PROFECO usa su catálogo público de ciudades. Cada observación verifica entidad y municipio; una ciudad sin catálogo queda pendiente. Se reconoce CDMX como Ciudad de México. Una observación de otro municipio no acredita un precio en el municipio pedido.
- Por consulta se leen hasta cuatro ciudades y cuatro especies. Las entidades que exceden la muestra llevan estado «no consultada», distinto de ausencia de registros o error de fuente. Pedir una entidad o ciudad permite enfocar la consulta. Esta mejora no implica cobertura comercial completa de los 32 estados ni de todos los cortes.
- DSPC sólo se incorpora para Puebla y no se extrapola a otros estados. SNIIM conserva sus categorías, fechas y brechas; el catálogo de cortes no llena una brecha de canal o pollo entero.
- La tabla presenta una muestra por especie, etapa y entidad, incluyendo la condición por volumen del producto elegido cuando exista. Para una presentación concreta, se filtran los registros antes de seleccionar la muestra. Se preserva la descripción publicada, incluidos marca y procesamiento.
- Se respetan las fuentes exclusivas «según SNIIM» o «según Porcicultura», y los pedidos de animales vivos, canal o productor. Los precios fuera de la ventana solicitada, unidades sin peso/cantidad, números ambiguos y duplicados contradictorios se excluyen.
- Caché pública de cinco minutos, peticiones concurrentes deduplicadas, límite de un MB y hasta 6.5 segundos por petición dentro de un presupuesto total de 8.5 segundos. El límite inicial de 4.5 segundos truncaba respuestas válidas de CDMX; se ajustó preservando el límite de diez segundos del agregador. Una caída de PROFECO no elimina los datos recuperados de otras fuentes.
- «Ambos, identificando cada etapa» conserva el producto y la ubicación del hilo y solicita los dos niveles. Cambiar de especie reinicia la presentación anterior. Una etapa ya indicada no vuelve a preguntarse cuando falla una validación de precios.

## Verificación reproducible

- `npm run test:prices:local`: nueve grupos de regresión con fuentes simuladas, incluyendo fechas, moneda/unidad, paquetes, volumen, procesamiento, municipios, códigos INEGI, contexto, caché, cobertura parcial, fallas y dos rutas reales del orquestador.
- `npm run test:prices:local:ui`: tabla de seis columnas, siete enlaces, escritorio y móvil con fuentes simuladas y renderer/orquestador reales.
- `node scripts/verify-local-commercial-live.cjs`: lectura real de las fuentes públicas, sin historial, pedidos ni llamadas al modelo. Guarda JSON y Markdown en `output/proveedores-publicos`.
- `node scripts/verify-local-commercial-live.cjs --regions`: también verifica Guadalajara, Monterrey y CDMX y guarda la cobertura real de esas consultas, incluidos registros faltantes.
- `node scripts/test-puebla-price-ui.cjs --commercial --live`: utiliza esa evidencia pública guardada en la interfaz real, con sesión y modelo simulados. La lectura del 8 de octubre produjo nueve filas/enlaces. Capturas en el mismo directorio.

La matriz general de 600 combinaciones sigue disponible en `npm run test:proteins:general`. Comprueba lógica con fuentes simuladas; no certifica disponibilidad real de precios para todas esas combinaciones.
