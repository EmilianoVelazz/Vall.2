# Verificación integral local — 5 de noviembre de 2026

Se revisaron sesiones y perfiles, protección de rutas, saldo del chat, informes de Finanzas, Mercados y México, librería anual, calendarios, guardado, traducción y exportación. Se conservaron los cambios anteriores del espacio de trabajo.

## Correcciones de esta revisión

- **México traducido:** los informes recuperan las etiquetas originales antes de seleccionar indicadores y calcular su presentación. Cambiar de idioma ya no elimina filas por dejar de reconocer el título de una tabla.
- **Mercados traducidos:** las comparaciones se componen con las identidades originales y se traducen al terminar. Esto evita duplicar precios de Granos o reincorporar tablas de seguimiento ya trasladadas a anexos. La recuperación contempla etiquetas con saltos de línea y avisos de frecuencia.
- **Noticias:** los titulares, descripciones, temas y explicaciones derivadas reciben la traducción del informe. La clasificación se realiza sobre el texto original; no cambia por el idioma de presentación.
- **Pruebas mantenidas:** el caso antiguo de Divisas utilizaba precios de pollo sin una serie cambiaria y consultaba perfiles reales. Ahora utiliza una serie USD/MXN sintética, perfiles y SMTP en memoria y conserva sus verificaciones de permisos, cantidades, idiomas y formatos. El recorrido de cambio de cuenta espera que termine la carga anterior antes de simular otra identidad.
- Se actualizó la versión de presentación para invalidar vistas previas anteriores.

No se alteraron precios ni observaciones guardadas para corregir estos fallos.

## Resultados

- **55 pruebas de regresión diferentes aprobadas**, consolidando la última ejecución de cada prueba. Incluyen sesiones, seguridad, aislamiento, créditos, carga, calendarios, informes, persistencia y exportaciones.
- **40 comparaciones de idioma**: cuatro informes de México y cuatro de Mercados en cinco idiomas adicionales. Se verifican filas, observaciones, fechas y ausencia de frases traducibles conservadas en español.
- Exportaciones en **seis idiomas**, incluyendo PDF y japonés, CSV, Word, HTML, texto y JSON. IA, SMTP y programación simulados.
- **19 recorridos de navegador aprobados**, incluidos cancelación, generación, doble clic, fallos de red, recuperación, guardado incompleto y cambio de cuenta. Las pruebas no generan cobros ni entregas reales.
- **36 exportaciones de México**: cuatro informes y tres escenarios de edición en PDF, CSV y Excel. Sin incidencias; rechazos esperados para solicitudes sin sesión, cambio de cuenta y ausencia de datos. Los PDF individuales conservan de una a tres páginas.
- Diez descargas PDF desde la aplicación compilada verificaron nombre, archivo completo y reutilización de la vista previa. Se repitieron las aperturas de México y la descarga de Granos después de las correcciones.
- Los tres panoramas conservaron sus capítulos y enlaces. La librería anual conserva sus 56 ediciones verificadas; se mantienen separados datos diarios, semanales y anuales.
- Compilación aprobada y **ESLint: 723 archivos, cero errores y cero advertencias**. Persisten avisos de tamaño de algunos paquetes del compilador; no son fallos de ejecución.
- Acceso local: las páginas públicas y la comprobación de salud responden HTTP 200. Perfil, sesión, saldo y bibliotecas de las tres familias responden HTTP 401 sin autenticación. Los campos y controles de la página de acceso responden a la interacción.

Evidencias: `output/verificacion-integral-20261105/`, especialmente `consolidated.json`, `post-fix.json`, los registros de navegador, `eslint-final.json` y `final-mexico-exports.log`.

## Pendiente externo y operación

El dominio configurado de Supabase, `zgzziypiigfsxvrlttth.supabase.co`, sigue devolviendo que el nombre DNS no existe. Por ello, las pruebas con datos guardados y servicios simulados **no certifican accesos, saldos ni guardado contra la base remota real**. No se cambiaron URL o claves ni se debilitó la autenticación para ocultar el fallo.

Los envíos automáticos permanecen desactivados. Se mantienen Finanzas a diario y Mercados los viernes a las 14:00, horario de Ciudad de México. No se aplicaron migraciones, no se enviaron correos y no se publicó ni subió esta revisión a Git.

Cierre operativo: el servicio quedó reiniciado con las correcciones. El 6 de noviembre a las 08:31, `/informes` y `/api/health` respondieron HTTP 200 y la biblioteca de México respondió HTTP 401 sin sesión. El arranque inicial necesitó más tiempo que la espera corta de la comprobación; se confirmó después su disponibilidad real. Evidencia: `local-health.json` y `browser-final.json`.
