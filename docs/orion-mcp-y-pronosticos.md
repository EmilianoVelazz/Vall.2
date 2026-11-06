# ORION: MCP, evidencia y evaluación de pronósticos

Implementado el 15 de octubre de 2026.

## Conexión que utiliza el chat

El backend incorpora el SDK oficial estable MCP v2 (`@modelcontextprotocol/client`
y `@modelcontextprotocol/server`, 2.3.1). Cada turno crea un servidor limitado a
las herramientas necesarias y un cliente que negocia el protocolo 2026-07-28,
descubre las herramientas y ejecuta llamadas MCP reales. Se utiliza Streamable
HTTP con `handler.fetch` dentro del proceso: no abre puertos ni realiza conexiones
de red a `orion.internal`. No requiere una clave MCP adicional.

La investigación de mercado, recuperación autorizada del repositorio, estadística,
pronósticos y cálculo de margen pasan por MCP. La selección de herramientas
sigue siendo determinista a partir del plan de la consulta; no añade una llamada
de pago al modelo sólo para seleccionar herramientas. Gemini sigue generando el
texto y utilizando su búsqueda fundamentada cuando corresponde. MCP complementa
esas APIs. Los conectores propios consultan las fuentes públicas de Mercolleida,
Rabobank, documentos oficiales y proveedores financieros; no se afirma que esos
proveedores ofrezcan servidores MCP propios ni acceso a publicaciones privadas.

El alcance y la identidad se vinculan al turno en el servidor. Los argumentos MCP
son objetos vacíos con esquema estricto: no aceptan otra identidad, URLs,
instrucciones, consultas SQL ni rutas del sistema. Los documentos recuperados son
evidencia, no autorización para ejecutar herramientas. No se habilitan comandos,
escrituras de archivos ni acciones externas. El pronosticador declara la escritura
idempotente de sus registros internos de seguimiento; las demás herramientas son
de lectura/cálculo. No se publica un endpoint MCP externo. Para conectar clientes
ajenos al backend se deberá añadir autenticación y autorización por herramienta.

Los resultados tienen un límite de 2 MiB y las ejecuciones concurrentes están
acotadas a 20 por proceso. Una herramienta que falla no invalida los resultados
recuperados de las demás y no se presenta como una fuente consultada con éxito.
La cancelación es cooperativa: el protocolo y la descarga del pronóstico admiten
AbortSignal; otros proveedores conservan sus propios límites de red. Un proveedor
que ignore la cancelación conserva su plaza hasta finalizar, para evitar acumular
trabajo ilimitado. Las sesiones se cierran después del turno. Los errores de los
proveedores no se envían al modelo o al cliente con sus URLs y datos internos.

`response.meta.toolExecution` permite inspeccionar protocolo, estado y latencia
por herramienta sin incluir identidad, argumentos privados o credenciales.

## Investigación con periodo verificable

El contexto de investigación incluye un inventario de referencias con fecha,
referencias dentro del periodo, antecedentes, fechas futuras y fechas ausentes.
La indexación no se considera fecha de publicación. Se mantiene la distinción
entre anuncio, firma, vigencia, autorización sanitaria y compra ejecutada.
Las fuentes fuera del periodo pueden aportar antecedentes, pero no acreditar
novedades del periodo. La cobertura parcial nunca demuestra ausencia de acuerdos.

El panel desplegable de fuentes muestra esa cobertura. Sus conteos corresponden
a referencias únicas por URL y fecha; una URL puede contener varios cortes.
El control comprueba fechas y procedencia, no prueba automáticamente la veracidad
de cada afirmación del modelo. Los enlaces de búsqueda sin publicación confirmada
se identifican como tales. El texto debe citar el documento específico junto al
hecho que respalda.

Se corrigió también el cambio explícito de tema: expresiones como «ahora cambia
de tema» y «cambiemos de tema» no arrastran el activo, horizonte ni la ficha de un
pronóstico anterior a una consulta de noticias. Los seguimientos que modifican
el horizonte, como «ahora para una sesión», conservan el contexto.
«Dame noticias de eso» conserva el activo, pero no solicita otra estimación de
precio; sí lo hace «actualiza el pronóstico con las noticias de hoy».

## Pronósticos: cambios del motor 5.0.0

La evaluación y los pendientes de producción se detallan en
[evaluación de ORION y correo](evaluacion-orion-y-correo-2026-10-15.md).
El motor incorpora perfiles específicos de divisas, granos y proteínas;
los candidatos adicionales deben superar los mismos controles temporales.
Los precios físicos se separan por producto, ubicación, presentación, etapa,
moneda, unidad, proveedor y frecuencia. No se mezclan para completar históricos.

- Descarga hasta dos años de cierres diarios; conserva como máximo 740
  observaciones positivas, ordenadas y fechadas. Mantiene la exclusión de velas
  abiertas y exige ajustes en acciones. La disponibilidad depende del proveedor.
- Conserva métodos de persistencia, autoregresión completa/reciente/cambios y
  tendencia amortiguada. Los ajustes usan sólo errores conocidos en cada origen.
- Amplía la evaluación histórica para horizontes largos. Para publicar exige una
  mejora de MAE de al menos 2% frente al último precio tanto en las últimas 24
  evaluaciones como en al menos ocho ventanas sin solapamiento (máximo 16).
  Si no cumple, conserva escenarios cualitativos y explica el rechazo.
- La ficha añade MAE de esas ventanas, sesgo reciente y cobertura histórica del
  rango. La cobertura usa el rango construido con errores conocidos **antes** de
  cada estimación, en hasta 64 evaluaciones; no usa el resultado que intenta cubrir.
- El seguimiento persistente distingue resultados de estimaciones publicadas y
  ensayos no publicados. Informa cobertura y sesgo de hasta 32 resultados recientes.
  Conserva la primera estimación de cada corte y versión, sin reemplazarla por una
  calculada después de conocer el resultado.

Las ventanas sin solapamiento no garantizan independencia estadística. La
cobertura histórica no es una probabilidad futura, y no se publica una supuesta
precisión de 95%. Las pruebas sintéticas comprueban el comportamiento del sistema,
no demuestran mejoras de rentabilidad en producción. El registro persistente
usa archivos privados persistentes en local y Supabase con tablas/RPC privadas
en serverless; el chat indica cuando no puede confirmar el guardado. No se cambia
de almacén silenciosamente entre consultas. Este cambio no corrige credenciales
o relojes del servicio de base de datos. Se revisan pendientes en los trabajos
existentes de las 06:00 y 14:00 CDMX; no se añade un servicio externo ni se asegura
aprendizaje diario si no llegan observaciones físicas comparables. La migración
015 de series físicas está preparada, pero su aplicación remota quedó pendiente.

## Comprobación

```sh
npm run test:orion:mcp
npm run test:forecast
npm run test:intelligence
npm run test:ai
npm run test:intelligence:ui
npm run lint
npm run build
```

Las pruebas MCP incluyen negociación real, descubrimiento, esquemas, aislamiento,
límites de tamaño y tiempo, cancelación y continuidad ante fallos parciales. Las
de pronóstico incluyen ventanas separadas, histórico acotado, abstención, ausencia
de fuga temporal, cambios abruptos, revisión de datos e inmutabilidad del registro.
Las pruebas de interfaz usan autenticación y fuentes aisladas, sin modificar chats
de usuarios ni consumir llamadas del modelo.

Se actualizaron también `compression` y `proxy-addr` a versiones compatibles que
resuelven las alertas alta y crítica detectadas en la revisión de dependencias.
La auditoría sigue señalando dos avisos bajos asociados a Mermaid/KaTeX cuya
corrección propuesta por npm implica un cambio mayor de Mermaid; no se aplicó
una actualización mayor automática ni se declara la auditoría libre de avisos.

Referencias del protocolo: [SDK oficial](https://ts.sdk.modelcontextprotocol.io/v2/)
y [cliente/servidor dentro del proceso](https://ts.sdk.modelcontextprotocol.io/v2/testing).
