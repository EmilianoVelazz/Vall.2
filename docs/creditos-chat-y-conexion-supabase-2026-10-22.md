# Créditos del chat y conexión privada a Supabase

Cada usuario dispone de **200 MXN de créditos por mes calendario**. Únicamente la cuenta autenticada con rol `admin` y correo `admin@vall.com` queda exenta. Otros administradores no reciben esa exención.

La semana dispone de `200 × 7 / días_del_mes` y el periodo de cinco horas de `200 × 5 / (días_del_mes × 24)`. En octubre (31 días) corresponden aproximadamente a 45.16 MXN por semana y 1.34 MXN por cinco horas. Los tres límites se comprueban conjuntamente. Mes nuevo: día 1 a las 00:00 de Ciudad de México. Semana y cinco horas: comienzan con la primera reserva de cada periodo, duran siete días y cinco horas, respectivamente, y se cierran como máximo al finalizar el mes. Los cupos no se acumulan; la recarga es perezosa y no requiere un cron.

## Qué consume

Las rutas `/chat`, `/ai-rich`, `/ai-insight` y `/ai-insight-stream` abren un contexto de contabilidad en el servidor. Todas las llamadas de Gemini dentro de ese contexto, incluidos respaldos, revisiones y recuperación generativa auxiliar, deben reservar crédito. Se contabilizan tokens de entrada, caché, audio de entrada, salida, herramientas y razonamiento cuando el proveedor entrega su metadato. Las respuestas deterministas que no llaman al modelo no descuentan tokens.

Los endpoints de generación de la sección **Informes**, sus traducciones y exportaciones trabajan fuera de este contexto y no consultan ni consumen saldo del chat. Un análisis solicitado dentro del chat sí forma parte de su uso, aunque se exporte después como documento.

Para cuentas limitadas, la voz usa reconocimiento del navegador, el chat contabilizado del servidor y síntesis de voz del navegador. Se bloquea la emisión de tokens efímeros de Gemini Live a estas cuentas porque una conexión directa desde el navegador no permite imponer con fiabilidad el saldo en el servidor. La cuenta exenta conserva Gemini Live.

## Conversión y tarifas

Es una asignación de créditos para tokens, no un cobro al usuario ni una garantía del importe total de la factura del proveedor. La conversión contable inicial es **20 MXN/USD**, configurable por cuenta privada; no pretende ser una cotización cambiaria actual. Las tarifas de tokens por modelo, caché y contexto largo están versionadas en `shared/chat-credit-pricing.json` y verificadas el 22 de octubre de 2026 contra [Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing). Se contempla el cambio anunciado de Gemini 3.8 Flash para enero de 2027. Los modelos sin tarifa registrada se omiten en cuentas limitadas; no se ejecutan gratuitamente.

Este saldo no incluye cargos adicionales de herramientas o búsquedas, impuestos ni otros gastos operativos. No todos los modelos consumen la misma cantidad de créditos por token, por lo que el número de tokens disponibles no es fijo.

## Integridad del saldo

La migración 018 crea `chat_credit_accounts`, `chat_credit_windows` y `chat_credit_reservations`. Todas tienen RLS y carecen de permisos para `anon` y `authenticated`. Las tres funciones RPC sólo se ejecutan con `service_role`; son `SECURITY INVOKER`. Nunca se envía la clave privada al navegador.

Cada operación usa un UUID generado por el servidor, un bloqueo transaccional por perfil y reservas atómicas en los tres periodos. Repetir una reserva o liquidación no cobra dos veces. Se limita la salida del proveedor al saldo reservable y se desactivan sus reintentos automáticos ocultos durante llamadas contabilizadas. Al terminar se cobra el consumo comunicado y se libera la diferencia.

Si el proveedor no entrega consumo tras una interrupción o el proceso termina, se registra conservadoramente el importe reservado como estimación; las reservas pendientes expiran en diez minutos. No se devuelve automáticamente un saldo posiblemente gastado. El cargo de créditos nunca supera la reserva; un coste real superior, si el proveedor informa más tokens de herramientas de los previstos, queda registrado separadamente. No se almacenan mensajes ni archivos en este registro contable.

`GET /api/chat-usage` exige la sesión válida y calcula el saldo exclusivamente de su `sub`. El cliente no puede elegir otro perfil, una exención ni un coste. Una caída del almacén devuelve 503 y no abre acceso gratuito al modelo. El agotamiento devuelve 429 con la causa, el saldo y la fecha necesaria para recuperar todos los cupos bloqueados. Las reservas de una consulta aún activa se distinguen del saldo ya gastado.

## Conexión y acceso

La fábrica privada de Supabase se comparte entre perfiles, importaciones y créditos. Reutiliza el cliente, exige HTTPS y clave privada, no persiste sesiones del servidor y aplica plazos de conexión. Los créditos prefieren el pool PostgreSQL existente, con máximo de cinco conexiones y consultas parametrizadas; si falla usan las mismas RPC por REST. Las operaciones son idempotentes para que un fallo ambiguo seguido de un reintento no duplique el consumo. Los perfiles mantienen comprobación de cuenta activa y versión de contraseña y pueden pasar a PostgreSQL cuando REST falla. Los diagnósticos no imprimen claves ni errores completos que puedan contenerlas.

La migración 018 se aplicó y verificó en el Supabase configurado. Las cuentas se inicializan al consultar su saldo o iniciar el chat. El código requiere publicarse posteriormente para que estos límites se apliquen también a los despliegues remotos.

## Comprobaciones

- `npm run test:chat:credits`: tarifas, caché/audio/razonamiento, reservas, metadatos acumulativos del streaming, respaldo, errores, aislamiento de informes, autenticación y límites HTTP.
- Incluye el SDK real contra un servidor HTTP local, con serialización de generación y streaming. El conteo usa el endpoint oficial Developer API con `generateContentRequest`, para incluir instrucciones y herramientas sin depender de la opción exclusiva de Enterprise del SDK. `npm run check:chat:tokens` comprueba ese endpoint con texto público de prueba, sin generar respuestas ni descontar saldo.
- `npm run test:chat:credits:database`: PostgreSQL y REST reales, privilegios/RLS, concurrencia de tres conexiones, reintentos idempotentes y recargas de los tres periodos. Crea un perfil temporal sin contraseña, sin cargos a usuarios reales, y elimina sólo sus registros por UUID al finalizar.
- `npm run db:migrate:chat-credits`: aplicación idempotente de la migración 018, sin reiniciar saldos existentes.
- Pruebas de fiabilidad del proveedor, cancelación del chat, seguridad de sesión y acceso a perfiles; compilación y lint.

También se comprobó una respuesta real de Gemini 2.5 Flash, limitada a 128 tokens, con un perfil temporal sin contraseña: conteo, reserva, generación y liquidación terminaron correctamente. Se registraron 0.000184 MXN en su saldo de prueba; no se descontó saldo de ninguna cuenta existente y el perfil temporal y su registro se eliminaron al finalizar. Esta comprobación manual no forma parte de las pruebas automáticas sin red. Resultado en `output/chat-credits-live-20261022.log`.

La interfaz se verificó en escritorio y a 390 píxeles de ancho, con saldo disponible, saldo agotado y un rechazo ocurrido después de enviar. La consulta escrita se conserva para reintentar; los datos de las capturas son simulados. Evidencia en `output/chat-credits-20261022/`.

Los envíos automáticos de informes permanecen desactivados por instrucción del usuario.
