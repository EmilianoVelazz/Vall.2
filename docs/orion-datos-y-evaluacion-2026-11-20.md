# Datos y evaluación de ORION

La base local de ORION separa el conocimiento compartido, las conversaciones privadas y las pruebas de evaluación. Esta etapa permite controlar qué información llega al asistente y medir cambios posteriores. El entrenamiento de los modelos numéricos usa históricos públicos; los pesos de Gemini no se han modificado.

## Conocimiento autorizado y trazable

`backend/ai/knowledge-policy.js` aplica la misma política antes de generar vectores y antes de construir contexto con resultados locales o de Supabase. Un documento necesita permiso explícito de publicación, un dominio reconocido y una puntuación de elegibilidad suficiente. Los informes y observaciones de mercado requieren una fecha válida que no esté en el futuro.

Los documentos con propietario, cuenta o ámbito privado quedan excluidos de esta memoria común. Sus permisos de acceso individuales siguen correspondiendo a las rutas privadas existentes. Una valoración positiva de una respuesta no autoriza a convertirla en un ejemplo para otras personas.

Las reglas aprendidas necesitan autorización de uso compartido mediante `public_retrieval: true`, además de superar la revisión metodológica aplicable. La recuperación antigua desde `ai_neural_rules` se retiró porque esa tabla no distingue permiso de publicación. Las reglas metodológicas base siguen disponibles.

Cada entrada indexada conserva una huella SHA256 de su contenido y procedencia. El índice se escribe de forma atómica y reutiliza su lectura mientras el archivo no cambie. Los vectores de documentos sin cambios se reutilizan al indexar; un cambio del modelo configurado invalida esa reutilización.

El índice local reconstruido contiene 21 entradas: 14 informes base y 7 reglas metodológicas. La reconstrucción fue sin conexión: no generó nuevos embeddings ni escribió en Supabase. La recuperación local dispone de búsqueda léxica y conceptual.

## Evaluación independiente del entrenamiento

`scripts/lib/orion-evaluation-v2.json` contiene 100 preguntas sintéticas en 18 categorías: las 12 preguntas originales y 88 variaciones controladas. Incluye fechas, unidades, monedas, discrepancias entre fuentes, privacidad, falta de observaciones e instrucciones maliciosas dentro de documentos. Su estado sigue siendo borrador pendiente de revisión experta.

Las respuestas de ese banco quedan fuera del índice compartido y de las exportaciones de entrenamiento. Las exportaciones excluyen conversaciones por defecto. Incluir feedback exige consentimiento para entrenamiento y constancia de revisión de publicación; eliminar correos o teléfonos por sí solo no otorga ese permiso.

La evaluación distingue tres resultados:

| Prueba | Resultado local | Interpretación |
| --- | --- | --- |
| Controles de recuperación, privacidad, cálculos y reutilización | 100 de 100 | Verifican componentes del sistema con datos controlados |
| Respuestas de referencia del banco | 100 de 100 | Comprueban que el evaluador acepta las referencias preparadas |
| Respuestas alteradas deliberadamente | 105 de 105 rechazadas | Comprueban que el evaluador detecta los errores preparados |

Estos resultados no equivalen a un 100% de precisión de Gemini. La muestra real selecciona una pregunta por categoría y registra modelo efectivo, llamadas al proveedor, entrega de evidencia, tiempos y respuestas. Sus resultados están en `output/analisis-inteligencia-orion/answer-evaluation-live-representative.json`; los textos exactos se guardan junto a ese archivo para revisar fallos y posibles falsos negativos de los patrones automáticos.

La muestra principal del 20 de noviembre completó las 18 consultas sin errores del proveedor, con 19 llamadas a Gemini 3.8 Flash. La mediana fue 6.964 segundos y el percentil 95, 11.513 segundos. Nueve respuestas cumplieron todos los patrones automáticos. Algunos rechazos corresponden a expresiones equivalentes que el patrón no contempla, como «moneda base común» frente a «misma moneda»; el resultado no permite atribuir una precisión semántica del 50% ni certificar una mejora general.

La revisión también encontró dos problemas de contenido. Se corrigió el filtro que descartaba la referencia estadounidense «Whole Broiler» al solicitar pollo entero en español; una prueba real adicional conservó ambas referencias originales y la conversión, y aprobó sus controles. Además, se reforzó la distinción entre falta de confirmación y ausencia de un hecho: en otra comprobación, el embarque pasó a describirse como «no confirmado», sin afirmar que no se entregó. Este último caso sigue rechazado por el patrón literal del banco y requiere revisión del evaluador. Ninguna revisión automática o del asistente se ha registrado como revisión humana.

La prueba conserva el texto original de cada pregunta, entrega los documentos sintéticos mediante el contexto del servidor y comprueba que llegan al prompt. Usa el límite de salida de ORION, desactiva las herramientas de búsqueda externa y sustituye las lecturas y escrituras de negocio por fixtures. No certifica la obtención de datos de proveedores reales.

Para comparar dos ejecuciones, `--baseline` exige el mismo banco completo, versión del evaluador, modo, plazo e identificadores de preguntas. Un aumento de controles aprobados en una sola muestra no demuestra por sí solo una mejora general de inteligencia.

Las consultas sobre «documentos ficticios proporcionados» o «informes financieros adjuntos» conservan su intención de consulta. Antes, los adjetivos podían hacer que el clasificador interpretase esas frases como una orden de crear un informe largo. Las solicitudes explícitas de generar un informe siguen activando ese formato.

## Pronósticos con validación temporal

El entrenamiento local evaluó 27 candidatos sobre nueve series públicas. Dos cumplieron los criterios de elegibilidad y 25 quedaron rechazados. Los candidatos elegibles fueron trigo y petróleo a seis pasos mensuales, con cortes históricos de septiembre y octubre de 2026 respectivamente.

Son resultados experimentales de validación histórica, con horizontes que pueden solaparse. No se activaron como pronósticos actuales ni se convirtieron en probabilidades de mercado. Los detalles y los errores frente a sus referencias están en `output/auditoria-codigo/entrenamiento-ml/resultados.json`.

## Repetir las comprobaciones

Desde la raíz del proyecto:

```powershell
npm run test:orion:knowledge
npm run test:smart-data
npm run test:orion:evaluation
npm run evaluate:orion:heldout
node scripts/test-ml-temporal-training.cjs
```

La muestra real consume llamadas a Gemini y sólo usa información ficticia:

```powershell
node --use-system-ca scripts/evaluate-orion-answers.cjs --dataset=scripts/lib/orion-evaluation-v2.json --representative --live --timeout-ms=60000
```

Para reconstruir el índice local sin llamadas externas:

```powershell
node scripts/index-vector-knowledge.cjs --offline
```

Los controles de conocimiento y las referencias del banco también forman parte de la integración continua. Las pruebas reales de Gemini quedan fuera de ella para evitar consumir cuota con cada cambio.

## Despliegue y base de datos

Los cambios están en el proyecto local. La migración `024_public_knowledge_policy.sql` prepara el filtro adicional de publicación en la función de búsqueda de PostgreSQL. No se ha aplicado a Supabase ni se ha desplegado en Dokploy.

El comando `node scripts/apply-vector-knowledge-migration.cjs --dry-run` comprueba que están los archivos 023 y 024 sin conectarse a la base. Una ejecución sin `--dry-run` aplica ambas migraciones a la conexión configurada y corresponde al despliegue, después de validar SQL y permisos en un entorno de prueba.

El servidor local mantiene deshabilitados los trabajos programados y el envío automático de correos.
