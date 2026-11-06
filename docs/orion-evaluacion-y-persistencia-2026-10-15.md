# ORION: evaluación de respuestas y diagnóstico de persistencia

15 de octubre de 2026. Trabajo local; no se publicó un despliegue.

## Cambios realizados

- Diagnóstico de Supabase y PostgreSQL sin descargar conversaciones ni filas
  privadas. Identifica acceso denegado, tablas ausentes y fallos de DNS; sus
  resultados no contienen claves, contraseñas, URL privada de conexión ni datos
  de cuentas. Una consulta de diagnóstico no certifica permisos de escritura.
- Soporte explícito de los puertos 5432 y 6543 para el pooler configurado. La
  conexión conserva la verificación TLS. No se adivinan hosts o regiones.
- Evaluación versionada con seis preguntas y documentos ficticios, controles de
  periodo, vigencia, ejecución, cantidades/unidades e impacto condicional.
- Ocho respuestas alteradas comprueban que el evaluador rechace errores conocidos.
  Esto valida controles dirigidos; no equivale a medir exactitud factual general.
- Revisión humana con cinco dimensiones. Sólo cuenta si identifica persona,
  fecha, puntajes válidos y el hash de la respuesta exacta. Al cambiar el texto,
  la revisión queda pendiente de actualización. El conjunto sigue marcado como
  borrador pendiente de revisión humana; no se inventaron evaluaciones humanas.
- Informes con cobertura de casos, uso de respaldo y latencia p50/p95 cuando hay
  mediciones. Las respuestas de referencia no generan latencias ficticias.

## Errores encontrados con el proveedor real

La evaluación utiliza exclusivamente material sintético y el proveedor ya
configurado. No realiza búsquedas externas, no usa conversaciones de usuarios,
no guarda datos en sus perfiles y no envía correos.

1. Preguntar por una «medida comercial» o «anuncios comerciales» podía omitir la
   investigación. Se corrigió la clasificación.
2. Preguntar cómo afecta un acuerdo al margen podía activar la calculadora local
   y pedir el peso del lote. Se prioriza la investigación comercial en ese caso.
3. El extracto de respaldo podía conservar una recomendación y omitir «no entró
   en vigor», o conservar una advertencia y perder el volumen. Ahora combina el
   hallazgo y una aclaración pertinente dentro del límite de veinte palabras.
4. Las fuentes añadidas al final no identificaban los antecedentes, aunque la
   tabla sí lo hacía. La bibliografía también indica antecedente o fuera de periodo.
5. La nota automática de verificación podía añadir una referencia sin enlace y
   hacer fallar la comprobación de la propia respuesta. Ahora enlaza documentos
   válidos y codifica los caracteres especiales de sus URL.

En la primera muestra pasaron 1/6 casos automáticos. Tras las primeras correcciones
pasaron 5/6; el restante detectó el problema de etiqueta en la bibliografía.
Después de corregirlo se repitió únicamente ese caso y pasó 1/1. No se presenta
esta secuencia como un nuevo ensayo simultáneo de seis casos ni como un benchmark.

Las seis respuestas del segundo ensayo utilizaron respaldo. Sigue pendiente
mejorar el cumplimiento de citas del generador y revisar por personas el significado
de las respuestas. No se afirma mejora de latencia: una consulta tardó unos 28 s
y requirió recuperación del proveedor.

Los resultados locales están en `output/analisis-inteligencia-orion/`:

- `answer-evaluation-live-before.json`: primera muestra.
- `answer-evaluation-live.json`: segundo ensayo de seis casos.
- `answer-evaluation-live-background-not-current.json`: repetición del caso restante.
- `human-review-live.json`: plantilla para revisar las seis respuestas.
- `storage-health.json`: estado actual de las conexiones, sin secretos.

## Persistencia remota: estado real

La revisión vuelve a recibir `PGRST303` / `JWT issued at future` por REST y
`ENOTFOUND` por PostgreSQL. La cabecera HTTP de fecha coincide aproximadamente
con el reloj local; no demuestra el estado del reloj interno del validador.
Se comprobó también el acceso con la clave opaca sólo en `apikey`; el rechazo
continuó. No se cambiaron credenciales, reloj del sistema, TLS ni políticas RLS.

El usuario confirmó acceso al panel de Supabase. Se solicitaron únicamente el
**host y puerto de Connect → Session pooler**, sin contraseña ni URI completa.
Con esos datos se podrá configurar la conexión y comprobar las migraciones.
No se han marcado como aplicadas las migraciones remotas pendientes.

Supabase documenta el pooler de sesión para conexiones IPv4 en su
[guía de conexión](https://supabase.com/docs/guides/database/connecting-to-postgres).
Su documentación distingue claves opacas y JWT en la
[guía de migración de claves](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys).

## Cómo repetir la evaluación

```sh
npm run evaluate:orion
npm run test:orion:evaluation
npm run check:orion:storage
```

El primer comando comprueba referencias y errores alterados sin llamar al modelo.
Para ejecutar el ensayo sintético con el proveedor real y consumir cuota:

```sh
npm run evaluate:orion -- --live
npm run evaluate:orion -- --live --case=proposal-not-enacted
```

También se pueden evaluar respuestas capturadas localmente:

```sh
npm run evaluate:orion -- --answers=ruta/respuestas.json --reviews=ruta/revisiones.json
```

Las respuestas son una lista de objetos `{id,text,latencyMs?,fallbackUsed?}` con los
identificadores de `scripts/lib/orion-evaluation-cases.json`. El comando no envía
ese archivo al proveedor. Rechaza identificadores desconocidos o duplicados y
considera fallida una pregunta sin respuesta.

La plantilla de revisión contiene `reviewer`, `reviewedAt`, `answerHash` y
`scores`. Puntúa de 0 a 2 cada dimensión: corrección factual, cobertura temporal,
respaldo por fuentes, utilidad para decidir y calidad conversacional. Cero indica
fallo; uno, cobertura parcial; dos, cumplimiento. Una coincidencia automática de
palabras no sustituye esa revisión. Las notas quedan en el archivo del revisor;
el informe agregado sólo incorpora puntajes, sin nombres ni comentarios privados.

## Verificación de software

Pasaron las suites de IA y seguridad, las 88 comprobaciones de conversación,
los controles de diagnóstico y evaluación, y ESLint. La integración adicional
comprueba que una pregunta sobre acuerdos no se desvíe a la calculadora y que
el respaldo conserve procedencia al añadirse la bibliografía.
