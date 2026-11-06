# Revisión y mejoras de ORION

15 de octubre de 2026. Cambios locales, cargados mediante reinicio del servidor.

## Problemas reproducidos y corregidos

| Caso del usuario | Fallo anterior | Comportamiento actualizado |
| --- | --- | --- |
| «El precio de compra es 80» o «No, son 800 kilos» | Una corrección breve podía perder el producto y los demás datos del lote. | Conserva el lote y reemplaza la variable indicada, incluso al reconstruir el contexto desde el historial. |
| «Ahora pollo» después de calcular cerdo | Se trasladaban precios y merma de otra especie. | Deja pendientes los importes anteriores y conserva la ubicación. Usa los nuevos valores expresados. |
| «Ahora en pie» después de un ejercicio en canal | Se reutilizaban costos entre bases comerciales distintas. | Invalida los supuestos numéricos anteriores. El usuario puede pedir expresamente «usa los mismos supuestos» para un ejercicio comparativo. |
| Citar 200 toneladas cuando el documento dice 1200 | La comprobación por subcadenas aceptaba una cifra parcial. | Compara números completos, distingue porcentajes de cantidades y conserva el signo. |
| Añadir una fecha de aplicación inventada | Se eliminaban todas las fechas ISO antes de comprobar las cifras. | Contrasta también las fechas mencionadas con la publicación y su extracto. |
| Poner una afirmación sin respaldo en un título o cita Markdown | Esos bloques podían excluirse de la revisión. | Revisa las afirmaciones en títulos, bloques de cita, negritas y encabezados HTML. Los títulos puramente estructurales se conservan. |
| Redactar 210.0% cuando la fuente dice 210% | Podía rechazarse una equivalencia decimal válida. | Reconoce esa equivalencia sin aceptar una cifra parcial. Los separadores de tres decimales ambiguos se comparan conservadoramente. |

La instrucción enviada al generador identifica los supuestos vigentes del lote;
un importe ausente no debe reconstruirse desde otro producto del historial.
La revisión de investigación conserva una única corrección acotada y el respaldo
con documentos leídos cuando el borrador sigue fallando. Si excede el límite de
40 afirmaciones materiales, no acepta silenciosamente las restantes.

## Resultado de las pruebas

Se construyó un conjunto de 25 casos a partir de fallos reproducidos y controles
de comportamiento válido. Antes de modificar el código: **10/25 pasaban**.
Después: **25/25 pasan**. Son regresiones dirigidas; este porcentaje no mide la
exactitud general del modelo ni el rendimiento de sus pronósticos.

- Suite completa `npm run test:ai`: superada, incluidos MCP, investigación,
  proveedores simulados, cancelación, proteínas, precios, reportes y pronósticos.
- `npm run test:intelligence`: 88 comprobaciones superadas.
- `npm run test:intelligence:ui`: chat real con datos y proveedor simulados,
  memoria de tres cálculos, perfil y recarga, MCP y vistas de escritorio/móvil.
- `npm run test:orion:quality`: prioridades anteriores y las 25 nuevas regresiones.
- ESLint completo y comprobación específica de los archivos modificados.

Las nuevas regresiones se ejecutan automáticamente dentro de `test:orion:quality`
y, por tanto, de `test:ai`. Evidencia local:
`output/analisis-inteligencia-orion/regresiones-respuesta-antes.json` y
`regresiones-respuesta-despues.json`.

No se enviaron conversaciones privadas al proveedor ni correos de prueba para
esta evaluación. La prueba de navegador utiliza autenticación y fuentes simuladas.

## Qué conviene mejorar después

| Prioridad | Mejora | Cómo comprobarla |
| --- | --- | --- |
| 1 | Evaluación de investigación con casos revisados por personas, incluyendo compromiso, firma, vigencia y compras ejecutadas. | Medir respaldo de cada afirmación, cobertura del periodo, contradicciones y uso del texto de respaldo en consultas separadas del desarrollo. |
| 1 | Resolver la persistencia remota y aplicar las migraciones pendientes de series y seguimiento. | Comprobar lectura/escritura, aislamiento y continuidad entre reinicios en el entorno de despliegue. En la revisión previa quedaron errores de DNS/JWT; no se reconfiguraron credenciales en este trabajo. |
| 2 | Histórico físico continuo por producto, plaza, presentación, moneda y unidad. | Validación temporal independiente por horizonte; publicar cifras sólo cuando superen sus referencias simples. Más instrucciones al chat no sustituyen el histórico. |
| 2 | Medir duración por recuperación, generación, corrección y respuesta final. | Obtener p50/p95, fallos y costo por consulta sobre una muestra suficiente; evitar registrar datos privados innecesarios. |
| 3 | Ampliar conversaciones de varios turnos y correcciones de unidades, rutas y monedas. | Probar cambios de tema y comparaciones sin trasladar supuestos entre lotes incompatibles. |

El control numérico verifica procedencia y formato; todavía no comprueba por sí
solo que un extracto sostenga el significado completo de una frase. No se afirma
una mejora de precisión predictiva ni una eliminación total de errores factuales.
