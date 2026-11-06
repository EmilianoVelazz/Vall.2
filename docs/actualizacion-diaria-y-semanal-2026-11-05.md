# Actualización de informes por colección

- Finanzas mantiene sus actualizaciones todos los días a las 06:00 y 14:00, en `America/Mexico_City`.
- Mercados publica una actualización semanal los viernes a las 14:00, en la misma zona horaria. Incluye Granos, Energía y metales, Proteínas, Noticias y Panorama de Mercados.
- México conserva su calendario diario. El cambio de frecuencia de Mercados no altera la frecuencia de los proveedores ni los periodos de comparación elegidos en el informe.

La política está centralizada en `shared/report-refresh-policy.json`. Se calcula el viernes con el calendario de Ciudad de México, sin sumar ciegamente siete días a la última consulta ni modificar las fechas de observación. El servidor persistente utiliza un temporizador semanal. El cron existente de Vercel conserva sus cortes diarios para Finanzas y México; la función de Mercados omite el trabajo hasta que vence su corte del viernes. No se añade un segundo cron concurrente para la misma edición.

Abrir o recargar Mercados conserva la edición publicada: no ejecuta los anteriores refrescos intradía de proteínas, noticias, reparaciones de cobertura o derivados. La carga de derivados se incluye dentro de la generación del corte, sin modificar la edición al leerla. Los informes actuales permanecen disponibles durante una actualización lenta. Si se pierde el viernes por una interrupción, el servidor recupera el corte pendiente al iniciar o al consultar, sin regenerarlo otra vez mientras siga vigente.

`next_refresh_at` se calcula por colección al guardar en Supabase o PostgreSQL. La API devuelve la fecha semanal y el lector la presenta como «Corte semanal», con viernes, hora y zona de referencia. El texto y el nombre del día respetan el idioma del lector. Los operadores conservan un modo explícito de actualización extraordinaria: script `generate-market-reports.cjs --force` o endpoint protegido con `force=1`; una consulta normal no fuerza la generación.

La comprobación de vigencia de entregas programadas usa el corte semanal para Mercados. Los envíos automáticos siguen desactivados; el cambio de frecuencia no los reactiva.

## Validación

Las pruebas nuevas cubren viernes antes y después de las 14:00, semana siguiente, cambio de año, año bisiesto, recuperación de un corte perdido, continuidad tras fallos y cancelación de temporizadores. La prueba HTTP comprueba que abrir Mercados o ejecutar el cron diario antes del viernes no consulta proveedores ni escribe datos, incluso cuando noticias o versiones anteriores activarían el antiguo refresco. Se verifican las fechas que recibiría Supabase mediante un cliente simulado, sin conexión externa, y el rótulo del lector en español e inglés.

Se ejecutan además pruebas del calendario diario, persistencia de informes, acceso con fuentes lentas, entrega personalizada y horarios de correo, así como compilación y análisis estático. Una prueba antigua de fiabilidad de correos mantiene una expectativa de cron cada minuto, incompatible con el cron diario a las 15:00 UTC que ya existía en `vercel.json`; ese archivo y los envíos no se modifican para ocultar dicha discrepancia.

La configuración queda aplicada al servicio local reiniciado. No se publica en Git ni se despliega una nueva versión remota en esta tarea.
