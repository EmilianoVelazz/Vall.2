# Análisis de informes — 19 de octubre de 2026

Se revisó el código actual del workspace, incluidos cambios locales existentes. El foco fue creación y lectura, evidencia diaria, CSV/PDF, almacenamiento por cuenta y entregas programadas. La revisión general del resto del proyecto fue de estructura y conexiones con estos módulos; no constituye una auditoría completa de toda la aplicación.

No se modificó la lógica de la aplicación. Se añadieron este diagnóstico y un script de reproducción con archivos temporales y proveedores simulados. No se verificó el despliegue público, la recepción de mensajes, las cotizaciones actuales ni Gemini real.

## Hallazgos por prioridad

### 1. Alta: los informes desde cero ocultan el contenido narrativo

Ubicaciones: `frontend/src/lib/reportLayout.js:7`, `backend/lib/report-layout.js:7`, `shared/report-layouts.json:2`, `frontend/src/lib/reportOutline.js:31` y `backend/lib/report-export-content.js:19`.

Las ediciones personales sin base heredan `composition: weekly-sheet`. La lectura sustituye el índice normal por los bloques diarios y la exportación textual recorre únicamente esos bloques. Un documento que contiene resumen, sección escrita y cierre termina mostrando referencias vacías y el anexo de causas; el cuerpo original permanece en el objeto, pero no se presenta. El PDF también selecciona esa composición en `backend/routes/export.js:1357`.

Reproducción: un informe `userEdition: true`, sin base, con los marcadores `RESUMEN_PRIVADO_PRUEBA`, `CONTENIDO_PROPIO_PRUEBA` y `CIERRE_PROPIO_PRUEBA` produce el índice `results, charts, comparisons, causes`; la exportación textual omite su contenido propio.

Acción propuesta: asignar explícitamente una composición narrativa a los informes manuales o permitir que el usuario seleccione el formato. Mantener la comparación diaria donde corresponda al catálogo. Añadir una comprobación que exija que el texto escrito sobreviva a lectura y exportación. La prueba actual `test-user-report-pdf.mjs` espera que el texto de una edición basada en México quede fuera del PDF; ese caso no comprueba la conservación del contenido de un documento desde cero.

### 2. Alta, si se usa Vercel: «Mis informes» carece de persistencia compartida

Ubicación: `backend/services/user-report-store.js:71`.

El directorio predeterminado en Vercel es `/tmp/vall-private-editions`. Guardar devuelve éxito después de escribir el JSON en esa ubicación, pero otra instancia puede no tener el archivo y la conservación depende de la vida del entorno. La propiedad `temporary_runtime` avisa del modo; no resuelve la persistencia. Este límite ya estaba documentado en `docs/revision-reportes-2026-10-14.md`.

Acción propuesta: persistir las ediciones en una base compartida con propietario, versión y `creationId` únicos, y operaciones condicionales. Un volumen local puede servir para una instalación de un solo proceso; no acredita funcionamiento entre instancias serverless.

### 3. Alta: los envíos diarios pueden entregar un corte anterior

Ubicaciones: `backend/services/report-scheduled-delivery.js:42` y `backend/routes/export.js:100`.

La comprobación del corte vigente sólo se aplica a `twice_daily` o cuando la hora solicitada coincide exactamente con un corte. Una programación diaria a las 08:00 CDMX acepta un snapshot del día anterior aunque ya corresponda el corte de hoy a las 06:00. En Finanzas y Mercados, la entrega carga directamente el almacén; no utiliza la recuperación del corte vencido que sí realiza la ruta de lectura.

Reproducción simulada: ejecución `2026-10-19T14:00:01Z`, programación diaria a las 08:00 CDMX, snapshot `2026-10-18T20:00:00Z`. El proveedor simulado recibe una entrega y el resultado registra `sent: 1`.

Acción propuesta: exigir el último corte esperado para todas las frecuencias o declarar expresamente una política de envío del último disponible. Cuando falte el corte, solicitar actualización o diferir la entrega con un estado verificable.

### 4. Alta en despliegues con varias instancias: REST permite retroceder el corte

Ubicación: `backend/services/executive-report-store.js:76`.

El `upsert` de Supabase REST reemplaza por `report_key` sin condición sobre `generated_at`. El control de antigüedad en memoria sólo protege una instancia. El respaldo SQL sí incluye una condición que evita sobrescribir un corte más reciente, por lo que los dos caminos tienen garantías distintas.

Reproducción: dos almacenes con REST simulado; se retrasa la escritura de las 06:00, se completa la de las 14:00 y luego se libera la primera. La fila remota termina con el corte de las 06:00.

Acción propuesta: aplicar la comparación de fecha en una operación atómica dentro de la base, para todos los caminos de escritura. Si la publicación del conjunto debe ser indivisible, guardar también la identidad del corte y publicar el conjunto mediante una transacción.

### 5. Media: CSV pierde precisión y referencias

Ubicaciones: `frontend/src/lib/reportCsv.js:13` y `shared/report-weekly.mjs:5`.

La rama diaria retorna después de las tablas calculadas. Omite las observaciones originales, el detalle y las fuentes que sí exporta la rama general. Además, usa cadenas de presentación con hasta cinco decimales, en vez de conservar los números originales.

Reproducción: valores `0.000001` y `0.000002` se exportan como `0`, `0`, cambio absoluto `0` y variación `100 %`. Una fuente incluida en el documento tampoco aparece en ese CSV. La prueba existente `test-report-observations.mjs:41` falla al buscar una observación que dejó de exportarse. Parte del cambio de alcance puede ser deliberada para la composición diaria; la pérdida de precisión se reproduce independientemente de esa decisión.

Acción propuesta: construir el CSV desde los valores numéricos originales y reservar el redondeo para la presentación. Definir si «Descargar datos» incluye toda la evidencia o sólo la comparación diaria y ajustar el contrato y las pruebas de forma coherente. Conservar referencias cuando se requiera trazabilidad.

### 6. Media, con varios escritores: la versión de una edición no evita sobrescrituras

Ubicaciones: `backend/services/user-report-store.js:72`, `backend/services/user-report-store.js:100` y `backend/services/user-report-store.js:106`.

La cola `pending` pertenece a cada instancia del almacén. Dos instancias que comparten el directorio pueden leer versión 1, aceptar ambas actualizaciones y devolver versión 2; el último reemplazo del archivo elimina el otro cambio. El reemplazo atómico del archivo impide un JSON parcial, pero no convierte la comprobación de versión y la escritura en una sola operación.

Reproducción: dos objetos `createUserReportStore` con el mismo directorio, dos actualizaciones simultáneas de versión 1 y contenido distinto; ambas responden correctamente con versión 2. La interfaz actual de lectura limita la exposición habitual de esta ruta, pero el endpoint de actualización sigue disponible.

Acción propuesta: actualización condicional transaccional por propietario, identificador y versión. Para mantener disco con varios procesos, usar un bloqueo compartido que abarque lectura, comprobación y escritura; incluir eliminación y creación en la misma garantía.

## Verificación ejecutada

El análisis estático con ESLint de los módulos de informes revisados terminó con código 0, sin incidencias.

De 13 scripts distintos de comprobación, 12 pasaron y 1 falló:

| Script | Resultado |
| --- | --- |
| `test-report-daily.mjs` | Correcto |
| `test-report-observations.mjs` | Fallo en línea 41: observación ausente del CSV |
| `test-report-saving.cjs` | Correcto; diez escenarios de guardado y reintento |
| `test-report-session-binding.cjs` | Correcto |
| `test-report-scheduling-edge-cases.cjs` | Correcto |
| `test-report-delivery-reliability.cjs` | Correcto |
| `test-report-request.mjs` | Correcto |
| `test-user-report-pdf.mjs` | Correcto |
| `test-report-quality.mjs` | Correcto |
| `test-report-fx.cjs` | Correcto |
| `test-report-causes.mjs` | Correcto |
| `test-report-editions.mjs` | Correcto |
| `test-report-draft-session.mjs` | Correcto |

Las pruebas correctas aportan evidencia de aislamiento por cuenta, recuperación de borradores, reintentos idempotentes, tratamiento de datos ausentes, calendario y generación de PDF en sus casos cubiertos. No cubren por sí solas los escenarios adicionales encontrados.

El script `tmp/audit-reports-2026-10-19.cjs` reproduce cinco escenarios adicionales: contenido manual omitido; CSV redondeado y sin fuentes; corte anterior aceptado en envío diario; actualizaciones simultáneas aceptadas con la misma versión; y retroceso del corte por REST. Usa remitentes ficticios, un proveedor de entrega simulado y un proveedor REST simulado, sin conexiones a esos servicios.

```powershell
$env:NODE_ENV='test'
node tmp/audit-reports-2026-10-19.cjs
```

## Orden sugerido de corrección

1. Resolver la presentación de documentos desde cero y la vigencia de los envíos.
2. Corregir precisión y contrato del CSV; recuperar la comprobación de observaciones.
3. Consolidar persistencia, versiones y publicación de cortes en operaciones de base de datos compartidas.
4. Hacer que el arranque del programador sea explícito desde el servidor. Actualmente importar `backend/routes/export.js` puede activar el trabajador si `NODE_ENV` no es `test`; las comprobaciones aisladas deben establecer ese entorno antes de cargar el módulo.
