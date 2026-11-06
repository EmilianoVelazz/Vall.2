# Revisión de procesos de informes — 5 de noviembre de 2026

Se revisaron generación, consulta, actualización, personalización, guardado, recuperación, librería anual y exportación de Finanzas, Mercados y México. Se conservaron los cambios previos del proyecto y los calendarios vigentes. Los envíos automáticos de correo permanecen desactivados.

## Fallos corregidos

1. **Cortes remotos incompletos.** El respaldo REST guardaba una fila por solicitud. Ahora envía el conjunto en un único `upsert`; PostgreSQL usa una transacción con `COMMIT` o `ROLLBACK`.
2. **Actualizaciones simultáneas y tardías.** Las escrituras de cada almacén se coordinan en orden; un corte sustituido mientras espera no se persiste. Una respuesta anterior no devuelve un corte viejo a la memoria del proceso. Una lectura lenta de disco tampoco sustituye una generación más reciente.
3. **Plazos de persistencia.** Las solicitudes REST reciben la señal de cancelación. PostgreSQL comprueba la cancelación al adquirir la conexión, entre escrituras y antes de confirmar. Una consulta que termina después del plazo revierte su transacción y libera la conexión; se conserva el respaldo local.
4. **Apertura de Finanzas bloqueada por fuentes lentas.** Cuando hay un corte anterior disponible, la biblioteca permite leerlo y comparte una actualización en segundo plano. Conserva su fecha y señala `stale`, `refreshing` y `updatePending`; no presenta ese contenido como un corte nuevo.
5. **Cambios de Divisas que podían deshacer otros cambios.** La ampliación de cobertura de Divisas se combina con la instantánea más reciente, preservando las actualizaciones de los demás informes del mismo corte.
6. **Notas duplicadas o perdidas al filtrar.** La limpieza de notas se aplica también a las ediciones especializadas y anuales. Conserva la metodología completa para recuperarla cuando se filtra por país, producto o estado, sin repetirla en todas las tablas visibles.
7. **Gráficas de Proteínas que ignoraban la preferencia del usuario.** La comparación de cerdo y alimento respetará ahora «sin gráficas», tanto en la edición diaria como semanal. Las tablas de precios continúan disponibles.

## Comprobaciones

- **57 pruebas aprobadas**, con resultados consolidados en `output/revision-informes-20261105/consolidated.json`.
- **19 recorridos de navegador**: cancelación, generación, guardado, respuesta perdida, doble clic, recarga, borradores, dos pestañas, cambio de cuenta y vista móvil. IA y persistencia remota simuladas.
- **10 descargas PDF desde la aplicación compilada**, con archivo íntegro, nombre correspondiente al informe, respuesta HTTP correcta y reutilización de los mismos bytes de la vista previa. Sin errores de JavaScript en esa prueba.
- Revisión PDF de **12 cortes con datos** de las tres familias, comprobando texto, márgenes, celdas y límites del compositor. El corte almacenado de Daily News no contiene publicaciones utilizables: se comprobó su rechazo HTTP 422, en lugar de fabricar un documento vacío.
- Comprobación de los **tres panoramas**, sus capítulos, indicadores, enlaces PDF, Excel y ediciones semanales.
- Librería anual: **56 ediciones de 2022–2025**, verificando periodos, identidad, datos conservados, exportación y persistencia en los escenarios de prueba.
- Inspección visual de páginas renderizadas, además de las comprobaciones de texto y coordenadas.
- Se actualizaron pruebas antiguas que exigían gráficas de dos días, ubicaciones anteriores de los bloques o cantidades de referencias previas a la ampliación de cobertura. Se conservaron las comprobaciones de valores, fechas, exclusiones y ausencia de datos inventados.

Las pruebas usan servicios simulados y archivos temporales. No se enviaron correos ni se modificó Supabase. La compilación de producción y el análisis estático se ejecutaron al finalizar; los registros están en la misma carpeta de evidencias.

Resultado final: compilación aprobada; ESLint revisó 718 archivos, sin errores ni advertencias. Vite conserva avisos de tamaño de algunos paquetes. El servicio local se reinició con los cambios.

Después del arranque, `/informes` y `/api/health` respondieron HTTP 200. Las bibliotecas de Finanzas, Mercados y México respondieron HTTP 401 sin sesión, como corresponde a rutas privadas.

## Límite de la validación real

La conexión real con Supabase sigue pendiente por el error DNS `ENOTFOUND` de la API configurada, confirmado en la revisión anterior. Por ello, estas pruebas no certifican accesos ni persistencia contra ese proyecto remoto. No se cambiaron claves, URL ni migraciones para ocultar el problema.

No se realizó publicación ni envío a Git.
