# Programar reportes: selección y revisión de horarios

15 de octubre de 2026. Cambios locales; no se publicó un despliegue.

## Qué puede hacer ahora el usuario

- Seleccionar Finanzas, Mercados o México y marcar los informes que desea recibir.
- Combinar informes de varias categorías, con un mismo destinatario, idioma,
  frecuencia y horario. Cada informe se envía en un correo separado con su PDF.
- Elegir horas con minutos, por ejemplo 17:23, en Ciudad de México.
- Elegir expresamente si necesita personalizar cada envío con IA. Un informe
  estándar nuevo usa el corte vigente sin otra generación de IA. Las programaciones
  existentes conservan su configuración hasta que el usuario las cambie.
- Consultar hora solicitada y aceptación del servidor de correo, con segundos.
- Ver estados actualizados cada treinta segundos o al volver a la ventana.
  Actualizar una aceptación no borra una hora que se está editando.

El selector es independiente del informe abierto: cambiar de categoría en la
programación no cambia la vista previa ni modifica un borrador. Guardar la
selección actualiza sólo las programaciones marcadas; conserva las demás.
La desactivación individual continúa disponible en cada programación.

## Diagnóstico del envío

La revisión local encontró tres programaciones activas. El calendario de sus
próximas ejecuciones coincide con sus horarios guardados: no se detectó un nuevo
desfase UTC/CDMX en esa comprobación. No se modificaron esas programaciones.

Un registro de Bolsa solicitado para las **17:00 del 15 de octubre** indica:

- Inicio de preparación: 17:00:26, hora CDMX.
- Aceptación por SMTP: 17:00:45, hora CDMX.

Ese registro confirma aceptación por el servidor de correo. No confirma la llegada
a la bandeja de entrada ni permite atribuir con certeza el caso reportado por el
usuario sin contrastar destinatario y recepción. No se accedió a su buzón.

La comprobación real de Gmail confirmó conexión y autenticación, sin enviar un
mensaje. Otra programación anterior conserva un error de base de datos; no se
atribuyó ese error a la entrega reciente ni se borró para aparentar éxito.

Se corrigieron problemas comprobados en el código y las pruebas:

1. Guardar una programación activaba IA incluso para un informe estándar.
   Ahora es una opción explícita y se conserva el pedido de una edición propia.
2. El estado de las programaciones quedaba desactualizado hasta recargar.
   Ahora se consulta mientras la ventana está abierta, protegiendo los cambios
   pendientes y descartando respuestas anteriores a una operación de guardado.
3. La interfaz y el validador sólo aceptaban horas completas. Ahora aceptan minutos;
   el diagnóstico de calendario respeta esos minutos y los reintentos existentes.
4. Una prueba reprodujo `EPERM` de Windows al reemplazar el archivo de programación.
   Se añadieron reintentos acotados para bloqueos `EPERM`, `EACCES` y `EBUSY`, sin
   eliminar el archivo válido. Un disco lleno u otro error no entra en ese bucle.

No se afirma que el bloqueo de archivos o la IA hayan causado específicamente la
falta de recepción descrita por el usuario; son riesgos comprobados y corregidos.

## Guardado de varios informes

La nueva ruta autenticada `/api/report-email-schedules/batch` valida todos los
informes antes de guardar. Rechaza categorías, claves, duplicados o selecciones
vacías; el destinatario y la cuenta se validan en el servidor.

En local escribe el conjunto mediante un único reemplazo atómico. En PostgreSQL
usa una sentencia parametrizada; en REST hace una única operación de upsert.
La identidad existente por cuenta, categoría e informe se conserva. No se necesita
una migración de tablas para esta selección ni para los minutos.

## Pruebas

- Tres categorías, destinatario, idioma, horario 17:23 y persistencia tras reiniciar.
- Guardado conjunto, rechazo sin cambios parciales, aislamiento de cuentas y
  tres envíos simulados sin IA ni duplicados.
- Contratos REST y SQL, autenticación previa a JSON y cambio de sesión.
- Recuperación ante bloqueo temporal de archivos y límite de reintentos.
- Interfaz real compilada en escritorio y móvil; actualización de una aceptación
  sin borrar la hora en edición.
- Entrega inmediata, edición propia con pedido y tono, cancelación y borrador.
- Diálogos en los seis idiomas del proyecto.
- Suite de correo simulado, seguridad, ESLint y compilación.

Los ensayos de entrega usan SMTP simulado. El ensayo real de conexión no envía
correos. Las capturas están en `output/programar-reportes/`.

Comandos útiles:

```sh
npm run test:reports:email
npm run test:reports:delivery:ui
npm run test:reports:dialogs:ui
npm run check:schedules
npm run check:mail
```

## Límite operativo

En esta ejecución local, el backend debe permanecer activo y conectado; la pestaña
puede cerrarse. La preparación de PDF, traducción o IA ocurre desde la hora elegida
y puede tardar. La aceptación SMTP y la recepción final son estados distintos.

El código contiene un cron por minuto para el despliegue, pero no se publicó ni se
verificó un programador remoto en este trabajo. La configuración local aún no tiene
`CRON_SECRET`. No se promete recepción exacta al minuto ni ejecución con el equipo
apagado.
