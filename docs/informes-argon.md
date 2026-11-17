# Argon en los informes

El análisis editorial de Finanzas y Mercados, la publicación de México y las
ediciones personalizadas usan el nivel interno `report`. Su modelo principal
es `gemini-4-argon`, configurable con `GEMINI_MODEL_REPORTS` en el servidor.
Los perfiles interactivos de ORION conservan sus rutas `flash` y `pro`.
Las traducciones y la edición general de noticias mantienen su configuración.

Argon utiliza razonamiento `medium`, sin parámetros de muestreo que Gemini 4
ignora. El límite de salida de los agentes es de 32 768 tokens, que incluye el
razonamiento. Es un máximo, no un consumo fijo. La lectura ejecutiva dispone de
45 segundos y la edición personalizada conserva su plazo total de 90 segundos.

La lectura ejecutiva valida cada campo completo antes de publicarlo. Si recibe
un texto demasiado largo, una frase sin cierre o cifras que no aparecen
literalmente en la evidencia, pide una única corrección dentro del mismo plazo
total. Las claves ya validadas se conservan. Si la corrección falla, sigue
disponible la síntesis de respaldo; el texto no se corta a mitad de una frase.

La lectura validada lleva una huella `evidenceHash` de los datos que recibió.
La proyección de Granos y Proteínas la conserva mientras la evidencia coincide
y la descarta cuando cambia. La huella comprueba vigencia, no autorización.
Las plantillas de lectura y PDF utilizan la tesis y la pregunta de comité en
sus paneles existentes, conservando el impacto cuantitativo calculado. El CSV
mantiene sus datos estructurados. La normalización de exportación conserva el
modelo y la huella de la lectura.

Si el modelo principal no responde, se prueban los modelos Pro y Flash
configurados dentro del mismo plazo total. La lectura ejecutiva conserva una
síntesis determinista cuando la generación falla. Las cifras, fechas y fuentes
siguen sujetas a las validaciones existentes; una respuesta con cifras nuevas
no sustituye el contenido verificado. Los documentos guardan el modelo que
realmente produjo la respuesta en `executiveBrief.model` o `aiEdition.model`.

La edición de México ocurre durante `refresh()`, antes de guardar el nuevo
corte. Una consulta a un corte ya guardado sigue devolviéndolo sin esperar a la
actualización de fuentes ni a Argon. Las ediciones anteriores se conservan.

Comprobaciones locales:

- `npm run test:reports:argon`: selección real de la ruta del proveedor mediante
  un cliente simulado, conservación de evidencia, aislamiento del chat,
  publicación de México, respaldos y cancelación.
- `node --use-system-ca scripts/check-report-argon-live.cjs`: genera dos
  informes ficticios con la clave que usa `backend/server.js`. Esta prueba
  consume la API de Google y exige que ambas respuestas procedan de Argon,
  sin contar un respaldo como éxito. No envía correos ni guarda datos de usuarios.

Referencia de migración:
<https://aistudio.google.com/docs/whats-new-gemini-4-argon>.
