# Evaluación de ORION y del correo programado

Fecha: 15 de octubre de 2026. Cambios locales; no se ha publicado un despliegue.

## Resultado

Se reforzaron investigación, contexto comercial, modelos por mercado y seguimiento
de estimaciones. Se corrigieron fallos de carga del chat y de programación del
correo. Las pruebas de software no equivalen a una certificación de exactitud
financiera, entrega en bandeja de entrada o calidad factual del modelo.

| Área | Problema comprobado | Cambio realizado |
| --- | --- | --- |
| Investigación | Fechas relativas ambiguas; una indexación podía confundirse con publicación. | Calendario CDMX, meses/rangos explícitos, fechas por hallazgo, separación de antecedentes y datos sin fecha. Un año objetivo de un pronóstico de Rabobank no se interpreta como año de publicación. |
| Respaldo | La redacción podía introducir cifras sin respaldo o presentar medidas propuestas como vigentes. | Comprobación de documento leído, fecha y cifras por párrafo/fila; una revisión acotada y después extractos verificables. El recorte conserva frases de negación y vigencia. La comprobación de procedencia no certifica el significado completo de una afirmación. |
| Extensión y latencia | Mencionar documentos podía activar un informe largo; el texto de respaldo se ampliaba con hasta tres generaciones. | Consultar una publicación se distingue de pedir crear un documento. No se amplía un texto que tuvo que sustituirse por falta de respaldo. Las ampliaciones también se comprueban y respetan la cancelación. |
| Modelos | Un único conjunto de métodos no distingue comportamientos de mercados. | Motor 5.0.0: candidatos específicos de divisas, granos, futuros de proteínas y precios físicos diarios/semanales. Conserva validación temporal y rechazo cuando no supera la referencia. |
| Seguimiento | El seguimiento exclusivamente remoto no permite conservar ensayos cuando la base de datos falla en local. | Diario privado persistente local; Supabase en serverless. Conserva la estimación original, separa ensayos de cifras publicadas, evalúa contra observaciones posteriores y registra MAE, sesgo y cobertura. Revisión a las 06:00 y 14:00 CDMX mediante los trabajos existentes. |
| Conversación | Un seguimiento corto podía perder ubicación, presentación, horizonte o condiciones del lote. | Memoria acotada de producto, estado, ciudad, presentación, etapa y horizonte; reemplaza la ubicación anterior y separa cambios de tema. |
| Decisiones | Una cotización por sí sola no explica el efecto sobre margen. | Ficha con hechos fechados, efecto condicional y verificación. El cálculo de margen añade equilibrio y sensibilidad de compra/venta. Incluye precios físicos verificados cuando están disponibles. |
| Inicio del chat | Se podía enviar antes de que el script estuviera listo: se reprodujo un mensaje perdido sin petición al servidor. | Compositor deshabilitado durante la carga y error visible si no puede iniciarse. Prueba con carga del script detenida deliberadamente. |
| Disponibilidad del modelo | Un modelo bloqueado podía consumir todo el plazo sin dejar oportunidad al respaldo. | Reserva del 30% del plazo para intentar el respaldo antes de emitir texto. No concatena otra respuesta cuando el streaming ya empezó. |

## Pruebas realizadas

- `npm run test:ai`: MCP real dentro del proceso, evidencia, calidad, generación,
  cancelación HTTP/SSE, proteínas, precios locales, noticias, Mercolleida,
  Rabobank, acuerdos, exportación, persistencia y pronósticos.
- `npm run test:intelligence`: 88 comprobaciones de intención, ubicación,
  memoria, cálculos, preguntas mínimas y límites de dominio.
- `npm run test:intelligence:ui`: bundle real, cinco turnos, perfil guardado y
  recarga, tres cálculos sucesivos, pronóstico por MCP, fuentes y ficha de
  decisión; escritorio y móvil. Autenticación, datos y proveedor simulados.
- `npm run test:security`: límites HTTP, privacidad y renderizado XSS.
- `npm run test:reports:email`: correo y adjunto simulados, destinatario,
  límites, configuración, programación, personalización y fiabilidad.
- `npm run test:reports:dialogs:ui`: seis idiomas; estados de última entrega,
  fallo y reintento, cambio de idioma y recuperación tras fallo de vista previa.
- ESLint y compilación de producción completados. La compilación conserva avisos
  de recursos resueltos en tiempo de ejecución y de paquetes grandes.

Los escenarios sintéticos comprueban contratos y comportamiento; no se presentan
como resultados de un benchmark de exactitud factual o de rentabilidad.

## Evaluación con el proveedor real

Se usaron dos preguntas con un documento **sintético**, búsqueda externa
deshabilitada, sin conversaciones de usuarios y sin enviar correos.

| Consulta | Ejecución anterior | Después de corregir clasificación y recorte |
| --- | --- | --- |
| Estado de un acuerdo | 69.8 s | 13.0 s |
| Efecto condicionado sobre compras | 75.0 s | 17.3 s |

Son dos muestras de diagnóstico con generación no determinista; no representan
latencia media ni una mejora garantizada. El ensayo inicial con un límite de
30 s agotó ambos plazos. Las respuestas finales posteriores incluyen fecha,
enlace, etiqueta de simulación y la frase sobre la falta de vigencia.

**Ambas consultas todavía necesitaron el texto de respaldo.** Se bloquearon
párrafos que no llevaban su referencia correspondiente. Esto demuestra que
hay que mejorar el cumplimiento de citas y la extracción del modelo; no permite
afirmar que ya produce análisis completos y correctos de forma consistente.
El archivo `output/analisis-inteligencia-orion/evaluacion-proveedor-real.json`
conserva el último ensayo y sus limitaciones.

## Evaluación con series públicas reales

Tres consultas pasaron por MCP y descargaron datos de Yahoo Finance, sin LLM y
sin guardar ensayos de pronóstico. Horizonte: cinco observaciones de mercado.

| Mercado | Corte | MAE del modelo, 16 ventanas | MAE del último precio | Resultado |
| --- | --- | ---: | ---: | --- |
| USD/MXN | 2026-10-13 | 0.1573 | 0.1550 | No publicar |
| Maíz, referencia continua ZC=F | 2026-10-14 | 19.5629 | 17.8906 | No publicar |
| Cerdo, referencia continua HE=F | 2026-10-14 | 3.0270 | 2.9500 | No publicar |

Los errores corresponden a las unidades originales de cada serie; no se
comparan entre productos. Los tres modelos fallaron el requisito de mejora
en las dos validaciones temporales. Se mantuvo la abstención; no se relajaron
los criterios para producir cifras. No se afirma que el modelo 5.0.0 mejore
la precisión real con esta muestra. Futuros continuos no equivalen a contratos
de un vencimiento concreto ni a precios físicos de Puebla u otra plaza.

Los precios físicos requieren histórico homogéneo suficiente, no revisado,
con ubicación, etapa, presentación, moneda, unidad y frecuencia compatibles.
El archivo incorpora observaciones públicas recibidas por el chat; la revisión
programada no sustituye una ingesta histórica continua de todas las plazas.

## Correo automático: diagnóstico y correcciones

La verificación SMTP real confirmó conexión y autenticación con Gmail. No se
envió ningún correo real de prueba y no se asegura recepción en bandeja de entrada.
Una programación local mostraba un error de base de datos; eso no permite
atribuir con certeza el correo concreto que el usuario no recibió.

Se corrigieron problemas comprobados:

1. El cron de correo estaba fijado a las 09:00 CDMX, además de los trabajos
   generales de las 06:00 y 14:00. No atendía puntualmente otras horas elegidas.
   El cron dedicado se configura cada minuto. En local sigue revisando cada
   minuto mientras el backend permanece activo.
2. Un fallo se posponía hasta el siguiente día o semana. Ahora se reintenta
   tras 5, 15 y 30 minutos; después se retoma el siguiente periodo. Un destino
   inválido no entra en esos reintentos.
3. Una reclamación condicional de diez minutos evita que dos workers procesen
   el mismo pendiente simultáneamente. Si el proceso termina, la reserva vence.
4. El registro de un intento anterior no sobrescribe una programación que se
   editó mientras se generaba el informe. Los cambios de hora sí se conservan.
5. Una entrega correcta limpia el error anterior y conserva las preferencias.
6. Las mutaciones locales se serializan y usan bloqueo entre procesos y escritura
   por reemplazo. Un archivo dañado produce un error; no se sustituye por vacío.
7. En serverless una base caída devuelve error; no se confirma un guardado
   temporal en `/tmp` que podría desaparecer entre instancias. En local se
   conserva la fuente de almacenamiento elegida durante la ejecución.
8. La pantalla muestra última entrega e intento fallido/reintento en seis idiomas.
   La API no confirma nuevas programaciones si falta correo o está pausado.

SMTP no ofrece entrega exactamente una vez: si acepta un mensaje y el proceso
muere antes de guardar el resultado, una ejecución posterior puede repetirlo.
La reserva reduce concurrencia duplicada; no elimina esa ventana de fallo.

## Pendientes para producción y prioridades siguientes

| Prioridad | Trabajo pendiente | Criterio de aceptación |
| --- | --- | --- |
| 1 | Restablecer Supabase y ejecutar migraciones 014/015. | Leer/escribir ensayos y series con credenciales válidas y reinicios, conservando aislamiento. La migración 015 no pudo aplicarse: DNS del host PostgreSQL devuelve ENOTFOUND; REST rechazó el JWT como emitido en el futuro. |
| 1 | Publicar y activar el programador de correo con `CRON_SECRET`. | Comprobar una entrega autorizada a la hora elegida y su registro. El código local no activa crons de un despliegue ya publicado. |
| 2 | Mejorar extracción y citas del modelo con un conjunto revisado por personas. | Menos uso de respaldo sin aumentar afirmaciones incorrectas; evaluar anuncio, firma, vigencia y ejecución por separado. |
| 2 | Construir ingesta histórica física continua y variables de oferta/demanda. | Validación temporal fuera de muestra por producto, plaza y horizonte; superar de forma sostenida referencias simples. |
| 3 | Ampliar evaluación real de conversación, latencia y costo. | Casos separados de entrenamiento, consultas adversarias y métricas de p50/p95; no extrapolar dos pruebas. |
| 3 | Registrar estados del proveedor de correo. | Distinguir aceptación SMTP de entrega, rebote y rechazo, con avisos al propietario. |

La ejecución por minuto del cron nativo requiere un plan de hosting que lo
permita, o un programador externo autenticado. Vercel Hobby limita los cron a
una ejecución diaria; ver [documentación oficial de Vercel](https://vercel.com/docs/cron-jobs/manage-cron-jobs).
No se compró un plan, no se creó un servicio externo y no se publicó el proyecto.

Comandos optativos con acceso a proveedores:

```sh
node scripts/evaluate-orion-live.cjs --live
node scripts/evaluate-orion-market-data.cjs --live
npm run check:mail
npm run db:migrate:orion-market-series
```

El primer comando consume cuota del modelo. `check:mail` comprueba SMTP sin
enviar. Los resultados y capturas están en `output/analisis-inteligencia-orion/`.
