# Revisión del apartado de informes · 22 de octubre de 2026

Revisión local del código y de la página `http://127.0.0.1:5273/informes`. Este documento registra hallazgos y propuestas; no aplica cambios funcionales ni publica un despliegue.

## Alcance comprobado

- Navegación real por Finanzas (5 informes), Mercados (5) y México (4). Lecturas detalladas de Bolsa, Mercado de proteínas y Panorama nacional de México.
- Apertura de la librería anual de 2025 y consulta del historial de proteínas. Revisión del código de Anexos, exportación, traducción, carga e indicadores de disponibilidad.
- Once scripts de comprobación, incluidos ejercicios de PDF con datos sintéticos.
- Dos sondeos aislados: clasificación de datos antiguos y recuperación del historial tras un fallo temporal.

No se realizó una nueva exportación visual de los 70 informes ni una verificación externa de cada cotización. Los resultados de auditorías anteriores no se presentan como pruebas ejecutadas en esta revisión.

## Prioridad 1 · Evitar estados engañosos y errores persistentes

### 1. «Actualizado» no garantiza vigencia

En `shared/report-health.mjs:2`, la presencia de observaciones válidas anteriores a la hora actual basta para reconocer datos disponibles; no se evalúa su antigüedad según la frecuencia original. La fecha de generación y la de observación se muestran por separado, pero la etiqueta puede contradecirlas.

Reproducción sintética: un informe generado el 22 de octubre de 2026 con observaciones diarias de enero de 2022 devuelve `state: updated`, `label: Actualizado`, `asOf: 2022-01-04`. Otro objeto con una métrica de cobertura igual a cero, sin observaciones fechadas, también puede quedar «Actualizado».

Mejora propuesta: distinguir disponibilidad, cobertura y vigencia. Aplicar calendarios de sesión para mercados diarios y frecuencias explícitas para referencias semanales, mensuales y anuales. Las noticias necesitan su propia evaluación por fecha de publicación. Conservar ambas fechas de la comparación y evitar interpretar una referencia semanal como precio diario.

### 2. El historial puede quedar bloqueado después de un fallo temporal

En `backend/routes/report-history.js:12`, `seeded ||= store.seedCurrent()` conserva también una promesa rechazada. Si esa primera operación falla, las siguientes solicitudes vuelven a esperar el mismo rechazo.

Sondeo con almacenamiento simulado que falla sólo la primera vez: tres solicitudes devolvieron `503, 503, 503`; la inicialización se intentó una sola vez. No es un fallo observado en el historial real durante esta sesión: es un defecto reproducido mediante inyección de una dependencia temporalmente fallida.

Mejora propuesta: liberar la promesa al fallar y permitir un nuevo intento; conservar la coordinación de solicitudes simultáneas. Añadir una comprobación que exija recuperación sin reiniciar el servidor.

## Prioridad 2 · Lectura y presentación

### 3. Completar la traducción al español

Bolsa muestra titulares y descripciones originales en inglés dentro de «Noticias del corte» y «Por qué pudo pasar». El código de `frontend/src/lib/useLocalizedReport.js:12` devuelve directamente la edición original cuando el idioma es español; presupone que ese contenido ya está traducido.

Mejora propuesta: traducir el contenido editorial incorporado al informe en español, manteniendo nombres, cifras, fechas y enlaces originales. Conservar el título original en Anexos cuando ayude a localizar la publicación. Evitar inventar una explicación cuando sólo se recuperó un titular.

### 4. Reducir decimales en la presentación, conservar precisión en los datos

Se observaron valores como `99.4577295` y variaciones de hasta ocho decimales en las tablas de las gráficas. `shared/report-number-format.json:3` establece ocho decimales como máximo general.

Mejora propuesta: reglas por unidad y uso: porcentajes e índices con una lectura breve; divisas y tasas con la precisión necesaria; valores originales disponibles en el detalle y la exportación de datos. No redondear la evidencia almacenada ni reducir indiscriminadamente la precisión de todas las unidades.

### 5. Explicaciones más concretas y menos repetidas

En Bolsa se repiten noticias entre «Noticias del corte» y «Por qué pudo pasar». También aparecen párrafos generales que no identifican un detonante particular de la sesión. `shared/report-equity-session.mjs:119` incorpora el contexto y después construye otra lectura causal a partir de las publicaciones.

Mejora propuesta: una secuencia breve por movimiento relevante: dato observado → hecho publicado y fecha → mecanismo posible → repercusión concreta → qué falta confirmar. Mostrar cada noticia una vez. Conservar la distinción actual entre hipótesis y causa demostrada, y situar las explicaciones después de las gráficas.

### 6. Fechas y navegación más claras en pantallas estrechas

En México aparecen fechas completas como `2026-10-21T19:39:58.000Z` dentro de tablas y párrafos. La cabecera, los controles y la biblioteca ocupan una parte considerable de la pantalla antes del documento; además se combinan desplazamientos de página, documento y tablas.

Mejora propuesta: fechas legibles con zona horaria indicada; cabecera compacta durante la lectura; biblioteca plegable; acceso claro a lectura ampliada. Mantener la paleta azul pastel compartida y usar etiquetas o patrones para distinguir series próximas en color. No eliminar márgenes útiles ni reducir la letra para llenar cada hoja.

## Prioridad 3 · Rendimiento y crecimiento

### 7. Consultar el historial con índice y paginación

`backend/services/report-history-store.js:29` recorre y lee los archivos completos del historial antes de filtrar y devolver hasta 100 resultados por defecto. El límite de respuesta no limita el trabajo de lectura. La API actual no expone un cursor para continuar.

Mejora propuesta: un índice de metadatos o una tabla con índices por familia, informe y fecha; paginación por cursor; lectura del documento completo sólo al abrirlo. Verificar también la persistencia del directorio histórico en cada despliegue.

### 8. Pausar consultas en secciones ocultas

`frontend/src/pages/Informes.jsx:63` conserva montadas las secciones visitadas mediante `display: none`. El actualizador diario de `ExecutiveReportsHub.jsx:753` comprueba si la pestaña del navegador está visible, pero no si el usuario está leyendo Librería, Anexos o Historial.

Mejora propuesta: pasar el estado activo a cada sección y pausar sus consultas mientras está oculta, conservando el borrador y la posición de lectura. No desmontar el editor si eso hace perder trabajo.

### 9. Permitir enlaces que recuperen la selección

La librería lee `anio` al iniciar, pero cambiar de año no actualiza ese parámetro (`AnnualReportsLibrary.jsx:29`). Los filtros del historial tampoco se guardan en la dirección.

Mejora propuesta: conservar sección, familia, informe, año y fecha en la URL; sincronizar la navegación del navegador con esos estados. Facilitar que un enlace vuelva a abrir exactamente la edición consultada.

## Resultados de las once comprobaciones

| Script | Resultado |
| --- | --- |
| `test-report-request.mjs` | Pasa: cancelación, plazos, sesiones y respuestas incompletas |
| `test-report-chart-design.mjs` | Pasa: escalas, signos, ceros y etiquetas |
| `test-report-chart-layout.mjs` | Pasa: distribución y conservación de datos |
| `test-report-bond-session.mjs` | Pasa: referencias, unidades, fechas, CSV y PDF |
| `test-report-protein-bulletin.mjs` | Pasa: 7 familias, 57 referencias sintéticas, frecuencias y PDF |
| `test-report-pdf-column-flow.mjs` | Pasa: flujo de columnas, márgenes y textos largos |
| `test-report-quality.mjs` | Pasa: contenido, México y conservación de tablas |
| `test-report-presentation.mjs` | Falla: espera omitir un resumen que actualmente aparece en el PDF |
| `test-report-daily.mjs` | Falla: espera 2 observaciones internas y obtiene 3 |
| `test-report-sector-session.mjs` | Falla: espera un encabezado que contenga «repercusiones» |
| `test-report-review.mjs` | Falla: no encuentra `12:00 UTC` en el PDF de su muestra |

Los cuatro fallos no equivalen automáticamente a cuatro defectos de la aplicación. Hay expectativas ligadas a formatos anteriores. Se debe contrastar cada una con el comportamiento deseado: comparación de última sesión contra sesión anterior, conservación de la evidencia interna y explicaciones completas. No eliminar contenido útil ni cambiar aserciones únicamente para hacer pasar las pruebas.

Evidencia de los sondeos: `output/revision-informes-sondeos-20261022.json`. El proceso de sondeo guardó sus respuestas antes de terminar con una aserción nativa de libuv al cerrar Node 26 en Windows; se registra como diagnóstico, no como una prueba automatizada aprobada.

Orden recomendado de implementación: recuperación del historial y estados de vigencia; traducción, precisión y explicaciones; navegación y compactación; finalmente índice histórico y pausa de consultas ocultas.
