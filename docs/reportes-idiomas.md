# Exportación en el idioma de la app

El selector admite español, inglés, francés, italiano, alemán y japonés. El
idioma elegido se conserva en `vn_lang` y en la sesión de la app. El atributo
HTML `lang` refleja esa elección: un reinicio visual de Google Translate a
español o un evento automático del motor no puede sobrescribirla. Los cambios
explícitos del selector y de otras pestañas sí la actualizan. Cada acción obtiene una copia
actual de esa selección y la envía explícitamente al servidor. Si el
navegador bloquea el almacenamiento, la elección se mantiene durante la sesión
de la página sin recargar y perderla.

## Flujo

- `frontend/src/lib/idioma.js` obtiene la elección actual.
- `useLocalizedReport` solicita `/api/report-localize` para la lectura nativa:
  títulos, resumen, secciones, indicadores, tablas, rótulos y notas de gráficas.
  `ReportLocaleContext` traduce rótulos fijos y adapta fechas. La lectura se
  marca `translate="no"` para evitar una segunda traducción visual.
  La API utiliza la misma normalización, proveedor y caché privada del PDF.
- La lectura muestra progreso o un error con reintento mientras se traduce;
  no presenta el original español como si fuera la traducción. Se descartan
  respuestas de otra edición, cuenta o idioma. Las traducciones abandonadas
  se cancelan y la admisión ocupada se reintenta con plazo total limitado.
- `reportPdf.js` solicita PDF o CSV e impide aceptar una respuesta en un idioma
  diferente. El visor y la identidad de la edición incorporan el idioma.
- Ver PDF, Guardar PDF y Descargar PDF reutilizan los mismos bytes para la
  misma edición e idioma. Descargar no sustituye la edición visible por otro
  corte bursátil. Los enlaces del visor incluyen el sufijo del idioma.
  Antes de abrir o entregar un archivo en memoria se vuelve a verificar la
  cuenta en el servidor; reutilizar el blob no omite el control de sesión.
- El idioma del cuerpo y la cabecera `X-VALL-Report-Language` deben coincidir;
  el correo confirma su idioma antes de mostrar el envío como exitoso.
- `/api/report-export` valida uno de los seis códigos y traduce una copia con
  `backend/services/report-translation.js`. El informe guardado permanece igual.
- Los clientes anteriores que omiten el código usan la cookie `googtrans` de
  su petición. Una elección explícita siempre prevalece; no se usa el idioma
  del navegador o del sistema operativo. Una cookie desconocida se ignora.
- `shared/report-languages.json` aporta los rótulos fijos. Gemini, el proveedor
  ya usado por el proyecto, traduce el texto libre sin investigación web.
- El renderizador conserva tablas, puntos de las gráficas, enlaces, marca de
  agua y estructura. Las fuentes japonesas originales se incluyen en Vercel.

PDF, CSV, Word, HTML, Markdown, texto y JSON usan la misma copia traducida.
Los textos de las gráficas estructuradas se traducen; una imagen adjunta
conserva cualquier texto que ya esté dibujado dentro de sus píxeles.

## Integridad y errores

La traducción sólo modifica campos de texto enumerados explícitamente. Los
números, fechas, unidades, monedas y URL se protegen con marcadores que deben
volver exactamente una vez. Los puntos numéricos, claves de colección, nombres
de empresa y destinatario, y referencias de las fuentes se conservan. Se
rechazan respuestas incompletas, códigos distintos y cifras o enlaces nuevos.
Estas validaciones no sustituyen una evaluación lingüística del proveedor real.

El español usa el recorrido original sin llamar a la IA. Para los otros idiomas,
un proveedor no disponible o una traducción inválida producen un error visible;
no se entrega silenciosamente el documento español. El trabajo está limitado a
90 segundos y la caché en memoria, separada por cuenta, idioma y contenido, a
cinco minutos y 16 entradas. No se guarda una copia adicional en la biblioteca.

## Correo y programación

Enviar ahora utiliza el idioma elegido para el PDF, asunto, cuerpo y firma.
Guardar una programación conserva ese idioma para sus entregas posteriores.
Las programaciones anteriores sin este campo continúan en español hasta que
se vuelvan a guardar. La ventana de entrega explica el criterio.

## Verificación

La cabecera oculta tanto el banner antiguo de Google Translate como el iframe
actual `VIpgJd-ZVi9od-ORHb-OEVmcd`: el segundo se superponía a la navegación y
capturaba clics en la búsqueda y el menú. Se conserva el motor de traducción.
Los nombres nativos y códigos del selector no se traducen. La acción
**Cambiar idioma** de la búsqueda abre el mismo selector y le entrega el foco;
los términos `idioma`, `language` e `inglés`, entre otros, la encuentran.
El contador de resultados conserva su número aunque el traductor modifique
el texto cercano.

`npm run test:reports:languages` comprueba los seis idiomas, las 14 identidades
de reporte, integridad de cifras y enlaces, PDF seleccionable, marca de agua,
CSV, Word, HTML, texto, JSON, correo y programación, errores de traducción,
caché separada y autenticación. `--preview` genera muestras sintéticas en
`output/reportes-idiomas`. `--ui` recorre el selector y las descargas del
frontend compilado, incluido almacenamiento bloqueado.
También extrae el texto de las descargas y de los adjuntos de correo, y revisa
cambios de idioma sin recarga e invalidación de la vista previa anterior.

Las pruebas automatizadas utilizan servidores y almacenamiento temporales, IA y SMTP
simulados. No consultan Gemini real ni envían correos. La revisión visual de
las seis muestras verifica composición y fuentes, sin certificar la calidad
semántica de una traducción real. Los cambios requieren despliegue para verse
en Vercel.

Además, el 14 de octubre de 2026 se comprobó Gemini real con un informe
sintético breve en inglés, francés y japonés. Se extrajo el texto del PDF y
se verificó que coincidiera con el resumen traducido, que conservara
`38.50 MXN/kg` y que el cuerpo del correo usara el idioma solicitado. Las
muestras están en `output/reportes-idiomas/validacion-gemini-{en,fr,ja}.pdf`.
Se revisó su renderizado; no se enviaron correos reales. Esta comprobación
puntual no garantiza todas las traducciones futuras del proveedor.

La verificación posterior `node scripts/verify-report-language-live.cjs --run
--google` recorrió la interfaz compilada con Gemini real y Google Translate
activo, usando sólo un informe sintético. En inglés y francés comprobó la
lectura nativa, el texto del visor PDF, igualdad binaria entre su enlace y la
descarga, y coincidencia de texto con el adjunto y cuerpo de correo. SMTP fue
simulado. Las capturas y PDFs están en `output/reportes-idiomas/flujo-real-*`.
La ejecución es explícita para no consumir IA real en las pruebas rutinarias.

La cabecera y el centro de informes comparten ahora un almacén de idioma por
página, suscrito con `useSyncExternalStore`. La prueba
`scripts/test-language-singleton.mjs` reproduce dos revisiones del módulo:
antes una podía conservar español mientras otra seleccionaba inglés. También
comprueba la elección compartida cuando el almacenamiento está bloqueado.
Las tarjetas base, la búsqueda por su título traducido, los controles de lectura
y los botones de exportación usan el catálogo nativo y están protegidos de
reescrituras de Google Translate. Las pruebas de UI desactivan Google y verifican
el idioma tanto del documento como de esos controles.

`npm run test:reports:languages:dev` comprueba el Vite activo en el puerto
5273 con una cuenta y API simuladas. Importa revisiones nuevas del módulo y
verifica que la cabecera, tarjetas, búsqueda, lector y controles cambien juntos
sin recargar. No consulta la cuenta real ni envía correos.

La ejecución `node scripts/verify-report-language-live.cjs --run --cached-equities`
validó además el corte completo de Bolsa del 14 de octubre con Gemini real,
sin Google Translate. La lectura, visor, descarga y adjunto simulado usaron
inglés, conservaron las cifras y coincidieron en el contenido del documento.
El corte contiene datos de mercado públicos; la cuenta y el destinatario son
ficticios, y SMTP permanece simulado. La captura `flujo-real-en.png` y el PDF
`flujo-real-en.pdf` muestran esa comprobación.

Las ventanas de entrega, creación y eliminación también consumen el contexto
nativo de idioma. Incluyen títulos, instrucciones, campos, opciones, validaciones,
frecuencias, días, confirmaciones y fechas en la zona de Ciudad de México.
Las claves enviadas a la API (`weekly`, `weekday`, etc.) se conservan, al igual
que los títulos escritos por el usuario y las direcciones de correo.
El selector de una base reutiliza la lectura traducida disponible; para otra
base traduce sólo los metadatos y el resumen que necesita mostrar. Los formatos
sectoriales utilizan el catálogo, sin pedir traducción al abrir sus detalles.
Los errores con código tienen mensajes traducidos; los errores desconocidos
muestran una explicación de la operación en el idioma seleccionado.

`npm run test:reports:dialogs:ui` recorre las tres ventanas en los seis idiomas
sin Google Translate. Comprueba destinatarios inválidos, envío simulado, errores
de correo y borrado, reintento de colecciones, programación semanal, fechas,
claves estables, cambio de idioma con la ventana abierta y distribución móvil.
Usa una cuenta ficticia, una API simulada y ningún transporte de correo real.
Las capturas `output/reportes-idiomas/ventana-*.png` documentan la revisión.

El envío ya no queda bloqueado por un fallo previo de traducción de la lectura.
La ventana permite reintentarlo: `/report-email` vuelve a validar el informe,
traduce al idioma solicitado y genera el PDF antes de contactar SMTP. Si esa
traducción falla, la API devuelve un error y no envía un adjunto en español.
Mientras una preparación está en curso, falta un destinatario válido o la
configuración de correo está incompleta, el botón muestra la causa junto a él.
La UI y su manejador comparten `reportEmailState` para no discrepar sobre la
disponibilidad. La prueba de ventanas incluye preparación pendiente, fallo,
reintento de envío y recuperación de la lectura en italiano, sin correo real.
La verificación explícita con `--run --cached-equities --language=it` también
comprobó el corte completo de Bolsa con Gemini real y SMTP simulado.

En la comprobación del corte completo de Bolsa en japonés se reprodujo un
`REPORT_TRANSLATION_INVALID`: una traducción de «último mes» introducía un dígito
que no figuraba en el original. La validación se conserva. Las instrucciones
exigen mantener esas cantidades implícitas como palabras y el traductor permite
una reparación de los campos rechazados, sin volver a traducir los ya validados.
El segundo resultado pasa las mismas verificaciones de cifras, unidades, tokens
y URLs; si falla, no se produce el documento ni se contacta SMTP. El plazo total
de traducción sigue acotado a 90 segundos. Los diagnósticos opcionales incluyen
sólo idioma, causa, id del campo, tamaño del lote y motivo de finalización.

`node scripts/verify-report-language-live.cjs --run --cached-equities
--language=ja --diagnostics` pasó con Gemini real y SMTP simulado: lectura, PDF
descargado y adjunto coincidieron en japonés y conservaron las cifras. Se revisó
el renderizado de `output/reportes-idiomas/flujo-real-ja.pdf`.
`scripts/test-report-translation-repair.cjs` cubre la reparación y el rechazo de
valores o enlaces nuevos, el plazo y la separación de caché por cuenta.

Las entregas por correo conservan su límite de seis por cuenta y hora; los
fallos no consumen ese cupo. Hay otro límite de treinta intentos por hora y los
cambios de programación tienen su propio cupo. Un bloqueo devuelve JSON con
`REPORT_EMAIL_RATE_LIMIT`, `Retry-After` y el tiempo de espera. El cliente reconoce
también respuestas 429 antiguas en texto para no confundirlas con un fallo de
traducción o un envío genérico. `scripts/test-report-email-limits.cjs` comprueba
las cuotas, su separación entre cuentas y los errores sin enviar correos reales.
