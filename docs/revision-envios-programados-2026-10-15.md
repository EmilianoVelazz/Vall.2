# Revisión de entregas programadas

15 de octubre de 2026 · America/Mexico_City · instalación local.

## Horarios encontrados y corrección aplicada

| Informe | Frecuencia guardada | Próxima ejecución corregida, CDMX |
| --- | --- | --- |
| Bolsa · Finanzas | Diario a las 12:00 | Viernes 16 de octubre, 12:00 |
| Panorama general · Mercados | Semanal, lunes a las 10:00 | Lunes 19 de octubre, 10:00 |

Bolsa tenía una inconsistencia: la preferencia era 12:00 CDMX, pero la fecha
UTC guardada correspondía a 06:00 CDMX. Se corrigió de `2026-10-16T12:00:00Z`
a `2026-10-16T18:00:00Z`, conservando preferencias, destinatario e historial.
Una segunda inspección encontró cero inconsistencias. No se adelantó ningún envío.

## Cambios de fiabilidad

- Revisión inmediata de pendientes al arrancar y temporizador alineado al inicio
  de cada minuto. Después de suspensión/reinicio se recuperan pendientes.
- Cola ordenada por vencimiento y dos preparaciones simultáneas como máximo,
  para que un informe lento no bloquee a todos los demás.
- Reservas con identificador único. Una edición o cancelación invalida al
  proceso anterior incluso si la nueva hora coincide con el vencimiento de
  su reserva. Se comprueba de nuevo después de generar el PDF, antes de SMTP.
- Las entregas de cada corte esperan una edición generada para ese corte;
  no se adjunta la edición anterior durante la actualización de 06:00/14:00.
- Se exige confirmación SMTP del destinatario para registrar éxito. Se distingue
  una entrega aceptada de un fallo posterior al guardar el comprobante.
- Se guardan hora solicitada original, inicio del intento y aceptación SMTP;
  la recuperación de una reserva o un reintento no sustituye la hora original.
- Se rechazan horas, frecuencias y zonas no compatibles, en vez de cambiarlas
  silenciosamente a las 08:00. El diagnóstico de horarios respeta reintentos
  y reservas válidas; su reparación utiliza escritura condicional.
- Escritura local con sincronización a disco, reemplazo del archivo y bloqueo
  entre procesos. No se cambia de almacén por una recuperación temporal de red.
- El estado autenticado del correo incluye actividad del temporizador y fechas
  de última/próxima revisión. En serverless distingue secreto configurado de
  ejecución del cron verificada; no los presenta como equivalentes.
- El script de migración usa la conexión central con TLS verificado y aplica
  las tres migraciones necesarias: tabla, frecuencia diaria/semanal y México,
  dentro de una transacción. No se ejecutó ninguna migración remota en esta revisión.

## Validación

Gmail confirmó conexión y autenticación reales mediante `check:mail`, sin
enviar mensajes. Se preparó el PDF del informe de Bolsa con sus datos locales
reales: 194,271 bytes, cabecera PDF válida. SMTP estuvo bloqueado durante ese
ensayo y las programaciones no se modificaron.

La prueba real de generación con IA para Mercados quedó pendiente: la revisión
automática de permisos la rechazó porque enviaría el informe y sus ajustes
privados a Gemini y consumiría cuota. La ruta de IA sí se probó con un proveedor
simulado. No se afirma haber validado esa generación real ni recepción en bandeja.

Pruebas completadas:

```sh
npm run test:reports:email
node scripts/test-report-schedule.cjs
node scripts/test-report-session-binding.cjs
node scripts/test-report-schedule-migration.cjs
npm run test:security
npm run lint
npm run check:schedules
node scripts/audit-scheduled-report-preparation.cjs
```

Incluyen calendario CDMX, medianoche y fin de año, reparación de desfase,
reintentos, recuperación de reservas tras reinicio, concurrencia, cancelación
durante preparación, corte aún no listo, rechazo SMTP y error al registrar un
mensaje ya aceptado. Las pruebas de correo no enviaron mensajes reales.
El resumen del ensayo local está en
`output/revision-programaciones-2026-10-15.json`, sin destinatarios ni contenido.

## Límites operativos

La hora programada es el inicio del procesamiento; generación de IA, traducción,
PDF y aceptación SMTP pueden añadir segundos o minutos. La recepción en bandeja
depende también del proveedor. No se garantiza un minuto exacto de recepción.

La instalación local necesita que el backend siga ejecutándose y que la
computadora tenga conexión y esté despierta. Cerrar la página no detiene el
backend, pero apagar o suspender la computadora sí impide ejecutar a tiempo.
La recuperación al arrancar no sustituye un servidor disponible las 24 horas.

No se verificó un despliegue público. La configuración local no contiene
`CRON_SECRET`; los cron nativos de Vercel necesitan ese secreto en el despliegue
y un plan compatible con ejecución por minuto. Supabase sigue pendiente de
restablecerse para el almacenamiento remoto. No se publicaron cambios ni se
crearon servicios externos durante esta revisión.

SMTP no permite una transacción única con la base de datos: si acepta un mensaje
y el proceso muere antes de persistir el resultado, todavía puede existir un
reenvío posterior. Las reservas reducen duplicados concurrentes, pero no prueban
entrega exactamente una vez.

Diagnóstico sin modificar horarios:

```sh
npm run check:schedules
```

`npm run check:schedules -- --repair` corrige únicamente incoherencias futuras
del calendario; no cambia destinatarios ni envía correo. El modo `--live-ai`
del ensayo de preparación requiere autorización explícita para compartir el
contenido y ajustes con Gemini; no se utilizó después del rechazo.
