# Diagnóstico del correo de informes

La API devuelve `REPORT_EMAIL_NOT_CONFIGURED` únicamente cuando su proceso no
recibe `GMAIL_USER` o `GMAIL_PASS` con contenido. Son datos del **remitente**;
cambiar el correo del destinatario en la ventana no configura el envío.

En local, el arranque de `backend/server.js` carga `backend/.env` mediante una
ruta absoluta. Las variables ya definidas en el proceso tienen prioridad.
Modificar el archivo no actualiza una instancia que ya está ejecutándose:
reinicia `npm run dev`. El ejemplo de configuración incluye ambos nombres.

`npm run check:mail` carga el mismo archivo y verifica conexión y autenticación
con Gmail. No llama a `sendMail`, no genera informes ni muestra credenciales.
`npm run check:mail -- --config-only` comprueba sólo la presencia de variables;
eso no acredita que Gmail las acepte. En Vercel las variables deben estar en el
entorno del despliegue y requieren un nuevo despliegue para aplicarse.

`npm run dev:mail-check` levanta la aplicación con las credenciales actuales y
`VALL_REPORT_EMAIL_AUTOMATION_ENABLED=false` sólo en ese proceso. El trabajador,
los cortes automáticos y la ruta de ejecución programada no procesan la cola;
no se consulta ni genera una entrega. El envío manual sigue requiriendo que el
usuario pulse el botón. Este modo no cambia las programaciones guardadas ni el
archivo `.env`. Un arranque normal conserva el comportamiento habitual.

La API distingue ahora variables faltantes, autenticación rechazada y problemas
de conexión. Las respuestas no reproducen mensajes privados de SMTP. Los
envíos usan límites de conexión, saludo y socket para evitar quedar pendientes
sin plazo. La misma configuración se utiliza en entrega inmediata, programación
y diagnóstico.

La ventana consulta `GET /api/report-email/status` al abrir y mediante
**Comprobar correo**. La respuesta autenticada informa de las variables cargadas,
el entorno local o Vercel y la pausa de automatizaciones; nunca incluye sus
valores ni abre conexiones SMTP. Una respuesta positiva retira un aviso anterior
de configuración faltante, sin repetir el envío ni ocultar errores de entrega
distintos. Si faltan variables se bloquea Enviar ahora; la falta de conexión o un
servidor anterior se muestran como estado sin confirmar. El contrato SMTP real
se comprueba con `npm run check:mail`; configuración presente no equivale a un
correo entregado.

`npm run test:reports:mail-config` prueba esas diferencias con un servidor
aislado y SMTP simulado. No utiliza una cuenta ni destinatarios reales.
