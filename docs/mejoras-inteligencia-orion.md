# Análisis de mejoras de inteligencia de ORION

Fecha: 8 de octubre de 2026, America/Mexico_City.
Alcance: revisión de código y 13 sondeos del planificador, además de un sondeo
del validador general de precios. No se llamó al modelo ni a proveedores en
estos sondeos. Este documento conserva el diagnóstico inicial; las prioridades
urgentes y altas se implementaron posteriormente con el alcance documentado en
[Mejoras implementadas](mejoras-urgentes-orion.md). La optimización general de
tiempos sigue siendo una propuesta posterior.

## Diagnóstico

ORION ya dispone de contexto conversacional, búsqueda de evidencia, conectores
de proteínas, cotizaciones mexicanas, tablas construidas por el servidor,
streaming, estadísticas, pronósticos y controles de presentación. También
guarda conversaciones y feedback. La mejora principal consiste en conectar
estas capacidades con una interpretación más precisa y un estado comercial
persistente, y verificar las afirmaciones numéricas contra los datos leídos.

## Hallazgos reproducidos

| Caso | Resultado observado en la lógica actual | Consecuencia potencial |
| --- | --- | --- |
| Precio del cerdo en Toluca | Producto reconocido; país y estado vacíos | La investigación puede perder el alcance mexicano |
| Precio del huevo en Mérida; pollo en Tijuana; res en León | Ciudad sin resolver | Debe resolver la localidad o pedir una aclaración material |
| Precio del cerdo en Guadalajara | México y Jalisco reconocidos | Es una base que debe extenderse con un catálogo geográfico |
| Importar pollo mañana de Brasil a México | `asksForecast: true` | Una fecha logística se interpreta como petición de pronóstico |
| Vender pollo mañana en Puebla y pedir documentos | `asksForecast: true` | La intención de operación queda mezclada con análisis del futuro |
| Seguimiento después de 30 turnos de refinamiento | Se pierde el producto; el guardián rechaza la consulta | El historial reciente no sustituye una memoria del encargo |
| Cotización deliberadamente falsa con fecha y enlace `.invalid` | El validador general conserva el texto sin registros ni citas recuperadas | Fecha y enlace no comprueban que el valor exista en una fuente |

El último caso es una prueba artificial de una función local: no demuestra
que un modelo haya emitido esa cotización. Las tablas mexicanas simples ya
tienen una ruta que utiliza registros del servidor; la brecha afecta al
validador general y a las afirmaciones que atraviesen esa ruta.

Evidencia: `output/analisis-inteligencia-orion/sondeos.json`.

## Prioridades propuestas

### 1. Validar cifras por afirmación — urgente

Toda cotización debe apuntar a un registro concreto. Comprobar producto,
presentación, plaza, etapa comercial, fecha, moneda, unidad y valor. Las
conversiones deben conservar dato original, equivalencia y operación aplicada.
Si hay contradicción entre fuentes, mostrar las referencias y su diferencia
de categoría o periodo; no fabricar un promedio ni escoger por conveniencia.

Código implicado: `backend/ai/protein-price-quality.js:24`,
`backend/ai/protein-price-table.js`, `backend/ai/response-quality.js`.
Criterio: una cifra de prueba con URL y fecha, pero sin evidencia, no supera
la validación. Los precios verificables conservan su registro y procedencia.

### 2. Entender ciudades e intención — urgente

Agregar un catálogo de localidades relacionado con estados y países, nombres
alternativos y ambigüedades. Córdoba, León o Guadalajara pueden requerir el
país; un país explícito tiene prioridad. Una referencia estatal debe seguir
rotulada como estatal cuando el usuario pregunte por una ciudad.

Separar fecha de entrega/reunión/venta de horizonte de pronóstico. Resolver
intenciones como cotización, comparación, margen, logística, documentación,
noticia, riesgo sanitario y previsión. Usar extracción con esquema y reglas
de negocio para validar el resultado. El esquema ordena la extracción; la
evidencia y los validadores siguen siendo necesarios.

Código implicado: `backend/services/mexico-price-scope.js:15`,
`backend/ai/answer-strategy.js:22`, `backend/ai/query-planner.js`.
Criterio: las ciudades mexicanas de la prueba se resuelven o generan una
aclaración; «vendo mañana» no activa un pronóstico sin una intención predictiva.

### 3. Memoria estructurada y perfil comercial — urgente

El backend recorta el historial a 24 mensajes. Mantener aparte un estado del
encargo: productos, presentación, origen/destino, plaza, moneda, unidad,
volumen, periodo, precio de compra/venta, merma, costos y restricciones.
Guardar por conversación y usuario, con procedencia y fecha por campo.
Una corrección explícita reemplaza el campo correspondiente, sin borrar el
resto. Actualizar el resumen al compactar el historial.

El perfil de empresa puede guardar especies, mercados habituales y moneda
preferida. Debe ser editable y solo completar datos no contradichos por la
pregunta actual. No debe reducir una pregunta mundial a México por defecto.
Las cotizaciones tienen vigencia; recordar una no la convierte en precio actual.

Código implicado: `backend/routes/chat.js:139`,
`backend/ai/conversation-context.js:98`, `backend/services/user-profile-store.js`.
Criterio: después de 30 turnos se conservan producto y condiciones; cambiar
de país o producto actualiza únicamente los campos pedidos.

### 4. Herramientas comerciales verificables — alta

El registro `orchestrator.tools.describe()` está vacío. Los conectores y
algunos cálculos sí funcionan mediante rutas específicas, pero ese registro
todavía no coordina herramientas comerciales mediante llamadas del modelo.

Conectar funciones limitadas para consultar precios, comparar proveedores,
calcular margen y costo de importación, y recuperar requisitos oficiales.
Los números se calculan en el servidor. El modelo interpreta y explica.
Validar entradas, limitar llamadas y tiempo total, y conservar los supuestos.
Los requisitos de importación necesitan especie, presentación, origen,
destino, clasificación aplicable y fecha; un titular no sustituye una norma.

Ejercicio reproducible: 1.000 kg comprados a 80 MXN/kg, venta a 110 MXN/kg,
merma del 8% y flete de 4.000 MXN. Quedan 920 kg vendibles; costo total
84.000 MXN; costo vendible 91,30 MXN/kg; resultado 17.200 MXN; margen sobre
venta 17,00%. Se excluyen costos e impuestos no indicados. Modificar un costo
debe recalcular el ejercicio completo y mostrar qué supuesto cambió.

### 5. Recuperación por significado y evidencia fresca — alta

La recuperación documental usa búsqueda textual `MATCH/LIKE` y reglas de
relevancia. Proponer búsqueda híbrida: palabras exactas para códigos/productos,
similitud semántica para preguntas y filtros de especie, país, etapa y fecha.
Reordenar por pertinencia, autoridad y vigencia. Mostrar qué fuente respalda
cada afirmación material, no solo un contador de enlaces.

Priorizar cobertura realmente disponible por proteína y mercado. Si falta
una cotización local, explicar la brecha concreta y entregar el análisis que
sí esté respaldado. Una referencia internacional no debe sustituirla.

### 6. Feedback convertido en regresiones — alta

Guardar feedback ya existe. El ciclo de proteínas produce propuestas de
investigación; no modifica los pesos del modelo base. Una corrección debe
convertirse en un caso verificable, revisar su evidencia y comprobar que no
rompa otras consultas. Una respuesta antigua bien calificada tampoco debe
reutilizar su precio o una obligación legal como si siguieran vigentes.

Ampliar el conjunto de evaluación con conversaciones largas, errores de
escritura, localidades ambiguas, cifras contradictorias, fallos de fuentes,
cambios de presentación, divisas, mermas y preguntas comerciales múltiples.
Medir intención, conservación del contexto, exactitud de cálculos, respaldo
de cifras y utilidad de la respuesta, además de disponibilidad del servicio.

### 7. Respuesta breve y tiempos acotados — posterior

Abrir con resultado, evidencia decisiva e implicación para la empresa. Pedir
una sola variable indispensable cuando falte; no repetir información dada.
Separar dato, inferencia y escenario con etiquetas comprensibles.

Una auditoría local previa registró una mediana de aproximadamente 29 segundos
en un grupo de 14 respuestas; no es una medición general de producción.
Mantener caché y consultas paralelas existentes, medir primer fragmento útil
y tiempo total, y aplicar un plazo global que incluya los modelos de respaldo.
El timeout de 120 segundos por intento del proveedor no es un plazo global.

## Orden recomendado para las pruebas con el jefe

Primero: validación numérica, localidades, fechas operativas y memoria del
encargo. Después: calculadora comercial y perfil de empresa. Finalmente:
recuperación semántica, evaluación continua y optimización de tiempos.
La publicación debería condicionarse a pasar los casos reproducidos y los
casos que ya funcionan, con ejemplos reales de compra, venta e importación.

## Referencias técnicas verificadas

Gemini permite extraer y clasificar datos con un esquema definido:
[salidas estructuradas](https://ai.google.dev/gemini-api/docs/structured-output).
También permite conectar el modelo con funciones externas para consultar
datos o realizar cálculos:
[llamadas a funciones](https://ai.google.dev/gemini-api/docs/function-calling).
La implementación debe adaptarse al SDK y a la API que utiliza el proyecto;
estos son mecanismos disponibles, no funcionalidades ya conectadas en ORION.
