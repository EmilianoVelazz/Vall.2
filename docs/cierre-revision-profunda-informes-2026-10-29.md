# Cierre de la revisión profunda de informes

Fecha: 29 de octubre de 2026.

## Resultado

La revisión termina con 23 pruebas específicas aprobadas, incluidos 19 recorridos de usuario y 12 recorridos adicionales de usabilidad en navegador real con servidor local. Los proveedores de IA, cuentas, exportaciones del recorrido y envíos son simulados; no se enviaron correos ni se modificaron cuentas remotas.

La matriz conserva 98 escenarios y 294 intentos: 285 archivos PDF/CSV/XLSX generados, nueve rechazos 422 esperados por ausencia de noticias y cero incidencias de exportación. Después de la última aclaración de unidades se repitieron los seis escenarios afectados de Divisas y Panorama, en sus tres formatos. Los 95 Excel volvieron a pasar la comparación independiente. Los 95 PDF suman 413 páginas; se actualizaron sus representaciones y se comprobaron las muestras afectadas.

## Hallazgos corregidos

1. **Vigencia engañosa.** El indicador podía llamar actualizado a un reporte con observaciones antiguas. Ahora evalúa la frecuencia diaria, semanal, mensual o anual, contempla fines de semana, distingue cobertura parcial, históricos y datos sin fecha, y excluye observaciones posteriores al corte. Los periodos mensuales `YYYY-MM` conservan su naturaleza mensual y sólo se aceptan como periodos cerrados; no se convierten en cotizaciones diarias. Los estados antiguos o sin fecha tienen una señal visual distinta del estado actualizado.
2. **Recuperación del historial.** Una promesa rechazada durante la carga inicial dejaba fallando las consultas hasta reiniciar el servidor. El intento fallido ya se libera y la siguiente consulta puede recuperarse. El listado utiliza metadatos ligeros en lugar de leer cada informe completo, repara índices corruptos o ausentes a partir del original y pagina sin perder empates, incluso con fechas equivalentes expresadas en distintas zonas horarias.
3. **Concurrencia en Windows.** Dos procesos archivando la misma edición podían entrar en conflicto al publicar su índice. Una colisión de reemplazo sólo se acepta cuando el índice existente coincide exactamente con los metadatos esperados. Los documentos originales permanecen inmutables. Se verificaron doce ediciones, escritura simultánea, reparación del índice y paginación completa sin duplicados.
4. **Evidencia anual inválida.** Las entradas nulas, estructuras incorrectas y fechas inexistentes como 30 de febrero podían romper la normalización o pasar como observaciones. Se descartan esos elementos sin fabricar valores. Se conservan ceros reales, periodos, fuentes y precisión.
5. **Español con texto inglés.** El traductor general devolvía el original sin actuar cuando el idioma elegido era español. Ahora traduce únicamente los campos de texto que requieren español y rechaza una respuesta que conserve el pasaje en inglés. Las comprobaciones de números, fechas, monedas y enlaces protegidos permanecen activas. El texto ya español no provoca una solicitud de traducción.
6. **Unidades de divisas.** Se aclaró que EUR/USD, GBP/USD, AUD/USD y NZD/USD expresan dólares por unidad de moneda. Los pares USD/moneda tienen la dirección contraria. Las cifras y los cálculos no cambiaron.

## Comprobación numérica independiente

La prueba `test-report-final-audit.mjs` contrastó 55,012 puntos de divisas con las series originales y recalculó 217 variaciones por horizonte. También comprobó 36 comparaciones anuales de divisas sobre 9,351 observaciones originales: promedio, mínimo, máximo y cambio anual. Las inversiones de pares se aplican a cada observación, antes de las estadísticas.

Los forwards teóricos de 30, 90 y 180 días se contrastaron con cálculos separados para México y Brasil, respetando la base de días y la capitalización declarada. Son escenarios indicativos con tasas proxy, no ofertas bancarias ni pronósticos del spot.

La conservación de tablas impresas pasó 22,252 celdas exactas de 75 modelos. Las pruebas de bonos cubren puntos base, tasas cero o negativas, bases comunes observadas y meses sin información. RUB y VES permanecen fuera de las escalas comerciales de divisas.

## Pruebas y presentación

La batería incluye confiabilidad, conservación de tablas, entradas inválidas, separación de cuentas, guardado, borradores, recorridos de usuario, usabilidad, bonos, divisas, historia bursátil, biblioteca anual, evidencia de exportación, disponibilidad de datos, edición impresa, México, noticias, derivados y densidad de gráficas. La última compilación de producción y ESLint de los archivos cambiados finalizaron correctamente.

Algunas pruebas antiguas necesitaban fixtures coherentes con el producto actual: cotizaciones sintéticas de Estados Unidos para la plantilla de proteínas; selecciones de IA que apunten a datos existentes; descarga CSV desde Anexos; diferenciación entre OI semanal CFTC y OI diario CME. La prueba de preservación de una respuesta vacía ahora compara el documento completo antes y después. La prueba de identidad habilita programación sólo dentro de su proceso, con almacenamiento y correo sustituidos por stubs. No se desactivaron controles del servidor real.

Los recorridos incluyen cancelaciones, respuestas tardías, pérdida de confirmación, doble clic, pérdida de conexión, cambio de cuenta, rechazo de borradores dañados, protección frente a HTML y fórmulas CSV, eliminación y conservación de foco. Se probaron anchos de 320, 360, 390 y 768 px y ampliación de texto al 200%.

## Límites que permanecen

- Esta revisión certifica cálculos y consistencia con las entradas preservadas. No es una actualización ni una confirmación externa de cada cotización al momento de la entrega. Los cortes de las fuentes y la limitación de nueve precios porcinos mexicanos del 26 de octubre se conservan según la auditoría anterior.
- La biblioteca anual revisada cubre 2022-2025. Las series actuales incluyen historia disponible desde 2020 en algunas referencias; no se afirma una cobertura uniforme de todas las series desde ese año.
- Los informes especializados ocupan como máximo tres páginas. Panorama integrado conserva los capítulos completos y ocupa 53-54 páginas, con finales de capítulo que todavía pueden compactarse. Las marcas de agua existentes se mantienen.
- Excel contiene las cifras y datos de gráficas; no contiene gráficas nativas. Se comprobó mediante ZIP/XML e importación/renderizado de muestras, no mediante Microsoft Excel de escritorio.
- Se ejecutó la batería específica indicada, no `test:all` de todo el proyecto ni una auditoría general de seguridad. La traducción con proveedor real no se invocó durante estas pruebas.

## Evidencia y repetición

Los registros de esta revisión están en `output/revision-final-profunda-20261029/`. Los archivos exportados, la comparación independiente y las láminas PDF están en `output/reportes-simulacion-ampliada-20261029/`. El paquete de cierre incluye los 285 archivos, ambas auditorías, los resultados finales y las láminas de revisión; excluye cuentas sintéticas, fixtures privados y entradas completas.

Comandos principales: `node scripts/test-report-final-audit.mjs`, `node scripts/test-report-reliability.mjs`, `node scripts/simulate-report-export-suite.mjs`, `python scripts/verify-report-export-suite.py` y `npm run build`. Las pruebas HTTP necesitan localhost; las operaciones atómicas de archivo requieren los permisos del sistema de archivos de Windows. Las comprobaciones no publican ni despliegan el proyecto.
