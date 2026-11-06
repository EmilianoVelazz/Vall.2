# Mejoras urgentes y altas implementadas en ORION

Fecha: 8 de octubre de 2026. Cambios locales; no publicados en producción.

## Qué cambia

| Prioridad | Cambio | Comportamiento y límite |
| --- | --- | --- |
| Urgente | Validación de cotizaciones | Un enlace y una fecha ya no bastan. El precio debe coincidir con un registro del conector, producto, país, moneda, unidad, fecha y presentación solicitada. Se filtra el estado solicitado. Las tablas mexicanas siguen construyéndose con registros del servidor. |
| Urgente | Localidades | Catálogo ampliado de ciudades mexicanas. Toluca apunta al Estado de México y Tijuana a Baja California. Mérida, León y Córdoba sin país/contexto piden aclaración; un país explícito prevalece. Nuevo León no se confunde con la ciudad de León. La referencia estatal continúa rotulada como estatal. |
| Urgente | Intención y fechas | Vender, embarcar o importar mañana y pedir documentos no activa un pronóstico. Las peticiones predictivas explícitas y las preguntas de precio futuro sí conservan su ruta. Una perspectiva general de resultados no implica automáticamente un pronóstico. |
| Urgente | Memoria de negocio | Resumen estructurado por conversación: productos, países, estados, presentación, fuente solicitada, condiciones numéricas y restricción de consultas externas. Se guarda en los metadatos de las respuestas, aprovechando el historial existente. Una recarga conserva las condiciones y las correcciones numéricas. Las cifras se etiquetan como supuestos del usuario. |
| Alta | Perfil editable | Configuración → Mi negocio y ORION: proteínas, mercados habituales, moneda y actividad. Se guarda en preferencias del perfil autenticado. La consulta expresa tiene prioridad. Los mercados habituales no se convierten en ubicación de una cotización. |
| Alta | Calculadora comercial | Herramienta `commercial_margin` registrada y ejecutada por el orquestador, antes del modelo, para ejercicios identificados. Calcula kg vendibles, compra, gastos, costo por kg vendible, ingreso, utilidad y margen sobre venta. Admite gastos totales y por kg comprado. |
| Alta | Recuperación por conceptos | Ranking local que combina coincidencias de palabras, sinónimos comerciales en español/inglés, conceptos sanitarios, confianza, fecha y diversidad de fuentes. Añade una ventana de hasta 24 documentos activos sin exigir coincidencia literal. |
| Alta | Feedback y regresiones | Los errores observados se incorporaron a una colección revisada de casos. El contexto recuperado de feedback no reproduce la respuesta numérica vieja ni exige obedecer correcciones como instrucciones del sistema. Las reglas propuestas se tratan como observaciones que necesitan validación. |

## Ejemplo comercial reproducible

Compra: 1,000 kg a 80 MXN/kg. Venta: 110 MXN/kg. Merma: 8%.
Flete total: 5,000 MXN.

- Kg vendibles: 920.
- Costo total: 85,000 MXN.
- Ingreso: 101,200 MXN.
- Resultado: 16,200 MXN.
- Margen sobre venta: 16.01%.

Cambiar la venta a 120 MXN/kg mantiene compra, peso, merma y flete. Cambiar
posteriormente el flete a 2,000 MXN mantiene el precio de venta corregido,
incluso después de recargar la página.

La calculadora pide la primera condición indispensable que falte. Rechaza
monedas mezcladas, merma fuera de rango, gastos porcentuales sin base y la
posible duplicación de flete/seguro en CIF. Compra en pie y venta en canal o
cortes requiere datos de transformación; la merma comercial no los sustituye.
Los gastos no indicados no se incorporan y el resultado se marca provisional.
No calcula tasas arancelarias legales ni verifica por sí sola requisitos de
importación; conserva los importes que aporte el usuario.

## Verificación

- `npm run test:intelligence`: 88 comprobaciones locales de alcance, memoria,
  cálculo, validación de cifras, búsqueda conceptual y ambos caminos del chat.
- `npm run test:ai`: suites existentes de chat, conectores, estadísticas,
  informes, comercio, cotizaciones, acciones y pronósticos aprobadas.
- `npm run test:proteins`: 59 casos comerciales previos y pruebas de estados,
  SNIIM, Porcicultura, fuentes, fechas y presentaciones aprobadas.
- `npm run test:security`: controles de solicitudes HTTP y renderizadores XSS
  aprobados; no constituye una certificación de seguridad de todo el proyecto.
- `npm run test:resilience`, `npm run test:data`: aprobados.
- `npm run lint`, `npm run test:legacy`, `npm run build`: aprobados; no hay
  módulos nuevos huérfanos ni referencias rotas en la auditoría de código.
- `npm run test:intelligence:ui`: bundle de producción real, perfil guardado
  y recargado, tres cálculos y memoria después de recargar. Autenticación,
  preferencias y transporte SSE aislados; calculadora y componentes reales.
- `npm run test:legacy:ui`: 17 rutas verificadas con y sin sesión.
- Servidor independiente de cuenta: normaliza y conserva el perfil comercial
  sin borrar las preferencias de informes.

Evidencias: `output/analisis-inteligencia-orion/regresiones.json`,
`navegador-inteligencia.json`, `perfil-comercial.png`,
`perfil-comercial-movil.png` y `margen-con-memoria.png`.

## Datos reales y límites

Una consulta pública directa al conector de Porcicultura recuperó Jalisco:
34.17 MXN/kg vivo y Puebla: 38.00 MXN/kg vivo, ambas con fecha de observación
2026-10-07. Son referencias estatales de cerdo en pie; no precios municipales,
canal ni ofertas comerciales. Esta comprobación no certifica el resto de las
cotizaciones ni la calidad factual de todas las respuestas generadas.

El catálogo de localidades no es un nomenclátor mundial completo. Los estados
sin registros permanecen sin cotización; no se extrapolan por cercanía.
La búsqueda conceptual es local y acotada, no un índice vectorial global ni
embeddings aprendidos. La revisión automática rechazó habilitar embeddings
externos porque enviaban consultas y documentos potencialmente privados a
Google; esa integración no se habilitó. No hay una migración pendiente de base
de datos para estas mejoras: se reutilizan preferencias e historial existentes.

Los casos de feedback están revisados y versionados, no se promueve
automáticamente una corrección arbitraria a verdad ni se ajustan los pesos del
modelo base. Tampoco se garantiza el precio de mañana ni una probabilidad
exacta de ventas futuras.
