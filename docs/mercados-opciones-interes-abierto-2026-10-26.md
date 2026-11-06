# Mercados: opciones e interés abierto

Se incorporó una sección de derivados en panorama, granos, energía/metales y proteínas. Se muestran únicamente productos presentes en el informe y observaciones verificables. Las tablas de derivados aparecen después de las comparaciones de precios y antes de las tendencias; conservan la paleta compartida y el límite de cinco páginas del PDF.

## Alcance y datos iniciales

Los boletines públicos de CME del **23 de octubre de 2026**, consultados el **26 de octubre**, aportan cinco pares de opciones call/put: maíz (diciembre), cerdo magro, ganado vivo, petróleo WTI **LO2** y oro **OG** (noviembre). El mes de serie no sustituye la fecha exacta de vencimiento. Son totales de contratos abiertos por serie y sus precios de ejercicio, sin primas ni recomendaciones de compra o venta.

Hay además totales de interés abierto de futuros de maíz, soya, harina de soya, cerdo y ganado vivo. Agregan los vencimientos del producto; no representan un contrato frontal ni volumen negociado. Las observaciones de ganado y cerdo están marcadas como preliminares; las demás, como finales.

El cociente put/call sólo se calcula para el mismo producto, serie, fecha y estado de publicación. No se mezclan estos contratos con precios, porcentajes o equivalentes delta del COT. El COT existente mantiene su frecuencia semanal independiente.

Fuentes: [Daily Bulletin de CME](https://www.cmegroup.com/market-data/daily-bulletin.html), secciones 15, 16, 19, 20, 56, 57, 63 y 64; [notas del COT de CFTC](https://www.cftc.gov/MarketReports/CommitmentsofTraders/ExplanatoryNotes/index.htm). Cada observación conserva enlace al PDF, página, fecha, consulta y estado en el respaldo de datos. Los enlaces `current` cambian cuando CME publica otra sesión; el archivo inicial conserva los valores y la fecha de la lectura realizada.

## Actualización y límites

La descarga directa de CME devuelve HTTP 403 desde el servidor de este entorno. Se mantiene la lectura pública fechada autorizada por el usuario; no se afirma que la descarga automática esté resuelta. El actualizador intenta los documentos públicos con dos solicitudes concurrentes, límite de tiempo/tamaño/páginas y caché de una hora. Un fallo conserva observaciones válidas con su fecha original, sin fabricar una actualización. Se excluyen datos con más de siete días de antigüedad, fechas futuras, series vencidas por mes, cantidades inválidas y conflictos de observación.

El lector puede abrir un corte guardado aunque la consulta externa esté pendiente. Las copias guardadas conservan la evidencia del corte. El Excel incluye una hoja «Derivados» con cantidades numéricas, cambios, estado, enlace, fecha de consulta y página. Los anexos ofrecen las observaciones de respaldo.

## Validación

- Pruebas de extracción: totales de opciones/futuros, páginas continuadas, productos desconocidos, ejercicios excluidos y fechas incompatibles.
- Validación de pares, denominador cero, antigüedad, conflictos, preservación durante traducción y exportación, datos numéricos en Excel y anexos.
- Ocho exportaciones diarias/semanales: panorama y energía/metales, cinco páginas; proteínas, cuatro; granos, tres. Cifras de derivados en tamaño 7,2 puntos, sin desbordamientos horizontales ni texto bajo el pie.
- Renderización de 23 lectores React; compilación de producción; revisión visual de las páginas con derivados y gráficas; pruebas de acceso HTTP con un proveedor pendiente y de conservación de 20 201 celdas de evidencia en 75 modelos.

Los envíos automáticos de informes permanecen desactivados. No se realizó despliegue ni publicación al repositorio.

## Ampliación de Granos y Proteínas

Se completó la cobertura pública del mismo boletín del 23 de octubre, verificada nuevamente el 26 de octubre a las 17:28 UTC: Granos incluye maíz, soya, trigo y harina de soya; Proteínas incluye cerdo magro, ganado vivo y ganado de engorda. Cada producto tiene un par call/put comparable y su total separado de interés abierto de futuros. Energía/metales mantiene las dos series documentadas previamente.

Se corrigió el reconocimiento de «FDR CATTLE» y de un total de futuros que continúa en la página siguiente al encabezado «WHEAT FUT». Las filas de ejercicios siguen excluidas. Las nuevas lecturas públicas complementan una caché previa y el corte no cambia de hora en cada lectura repetida. Los nuevos cortes generados guardan los derivados antes de persistirlos y archivarlos.

El índice de los informes ahora dice «Call, put e interés abierto». La incorporación de nuevos productos actualiza la vista base; los borradores del usuario conservan su contenido. Los exportables narrativos colocan esas tablas una sola vez dentro de su apartado, en lugar de dejarlas dentro de las comparaciones generales.

Pruebas específicas comprueban los cuatro productos de granos y los tres de proteínas en la respuesta HTTP autenticada, incluso con los proveedores de precios pendientes; en el lector React; y en PDF/Excel, conservando las cantidades, fechas y estados.
