# Investigación comercial en ORION

## Problema corregido

La pregunta «dime que acuerdos se an informado en este alño en base al trato comercial de china y estados unidos» no activaba la investigación porque la detección exigía frases como «acuerdos comerciales». Sin contexto previo, el guardián también la rechazaba. «Este año» se resolvía como seis meses y el lector de documentos exigía productos agrícolas en todos sus extractos.

Ahora el guardián y el planificador comparten la detección de acuerdos, tratos y negociaciones con contexto comercial o bilateral China–EE. UU. Se reconocen los errores «alño»/«anio», el año en curso y el año pasado usando la fecha de México. Una pregunta explícita de comercio general amplía el alcance aunque el historial trate sobre proteínas.

## Evidencia y respuesta

- El conector conserva anuncios generales de aranceles, energía, inversión y cooperación económica. La lectura no requiere mencionar carnes.
- Añade comunicados de USTR y de la Cancillería china, manteniendo Casa Blanca y MOFCOM. Los enlaces se validan por host y ruta antes de descargar.
- Usa fecha publicada, incluyendo el día local del documento, y el cuerpo del artículo; excluye noticias relacionadas. No interpreta las premisas de preguntas de prensa como confirmación oficial.
- El periodo y el alcance se incorporan a las instrucciones del modelo. Las recomendaciones, compromisos, entrada en vigor y compras ejecutadas se distinguen.
- En selección automática se recomienda Pro para investigación comercial. Se respeta una selección explícita de Flash/Pro del usuario.
- Si el modelo abre negando acuerdos pese a documentos oficiales recuperados, se intenta una revisión antes de transmitir la respuesta. La revisión ocurre como máximo una vez; si falla, se conserva una lista de documentos verificados y se evita mostrar la negación contradictoria.
- La búsqueda web complementa los documentos. Un fallo de búsqueda no invalida las publicaciones ya leídas; la ausencia de resultados no se presenta como ausencia de acuerdos.

No hay una respuesta precargada sobre una cumbre concreta: los documentos se descargan, validan, filtran por periodo y se entregan como evidencia al modelo. Los enlaces semilla forman un catálogo de fuentes; no sustituyen la verificación.

## Comprobaciones

`node scripts/test-trade-research.cjs` cubre la pregunta original, el cambio de alcance, año local, documentos comerciales sin productos agrícolas, cuerpo de comunicados chinos, enlaces, fechas, caché, fuentes parciales y revisión de respuestas negativas en chat transmitido y estructurado.

La prueba real de la pregunta original está en `output/orion-acuerdos/respuesta-corregida.md`, con metadatos en `respuesta-evidencia.json`. Se ejecutó con Gemini Flash, historial previo de proteínas y sin guardar consultas de prueba en la base de usuarios.

Fuentes de contraste: [Casa Blanca, 25 de septiembre](https://www.whitehouse.gov/fact-sheets/2026/09/fact-sheet-president-donald-j-trump-advances-a-fair-and-reciprocal-relationship-with-china-while-hosting-historic-state-visit/), [USTR, 27 de septiembre](https://www.ustr.gov/about/policy-offices/press-office/press-releases/2026/september/ambassador-greer-issues-statement-announcement-recommendations-us-china-board-trade), [Cancillería china, 26 de septiembre](https://www.fmprc.gov.cn/eng./xw/zyxw/202609/t20260926_12031663.html).
