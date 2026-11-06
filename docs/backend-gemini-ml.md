# Backend de ORION: respuestas Gemini y entrenamiento ML

Revisión local del 14 de octubre de 2026. Los cambios mejoran el adaptador de Gemini, las instrucciones de análisis y el entrenamiento numérico; no hacen fine tuning de los pesos de Gemini ni activan propuestas de aprendizaje editorial sin revisión.

## Respuestas de Gemini

- Un plazo compartido cubre todos los modelos de respaldo de una generación. La espera de cada fragmento también está acotada, incluso cuando un cliente defectuoso no atiende la cancelación. El SDK recibe la señal de aborto y el timeout restante. El timeout HTTP de Google se define por intento: por eso se añade el límite del flujo en la aplicación. Referencias: [cliente oficial de Google](https://github.com/googleapis/js-genai/blob/main/src/_api_client.ts) y [opciones HTTP del SDK](https://googleapis.github.io/js-genai/release_docs/interfaces/types.HttpOptions.html).
- Las respuestas vacías y las cortadas por `MAX_TOKENS` se detectan antes de considerarlas completas. Un bloqueo del proveedor o un error de autorización no dispara intentos para eludirlo. Si el streaming ya entregó texto, se conserva con el error correspondiente y no se mezcla con otra respuesta. [Contrato de respuesta de Gemini](https://ai.google.dev/api/generate-content).
- Cerrar la conexión del chat propaga la cancelación al adaptador. Las pruebas cubren el cierre mediante HTTP/SSE reales; no basta con ocultar la ventana.
- Se eliminaron el borrador oculto de las respuestas estructuradas y la instrucción que lo trataba como respaldo de reglas aprendidas autónomamente. La respuesta trabaja con evidencia; un texto generado previamente no es una fuente adicional.
- Un respaldo Pro mantiene el nivel Pro. Se evita repetir desde el orquestador los intentos que el adaptador Gemini ya agotó.
- Las instrucciones diferencian precios históricos, referencias globales y costos reales de la empresa. El impacto sobre alimento y margen se expresa como condicional mientras no existan datos de fórmula, contratos, inventario, moneda, transporte y venta. No se recomienda sustituir ingredientes solo por su precio nominal.

## ML numérico

`backend/ml/temporal-training.js` compara 13 configuraciones: último valor y modelos ridge sobre niveles/cambios, historia completa/60 observaciones y tres regularizaciones. Los parámetros se seleccionan exclusivamente antes del tramo de validación. Ese tramo usa walk-forward: cada predicción solo ve observaciones anteriores a su objetivo.

Un modelo nuevo se acepta cuando reduce el MAE al menos 2% frente a conservar el último valor **y no empeora el modelo anterior**. Si no cumple, no publica un nuevo objetivo. MAE y RMSE se expresan en la unidad de la fuente; aciertos de dirección y comparación con el baseline quedan registrados. Los rangos describen errores históricos, no probabilidades calibradas.

El motor adaptativo de ORION incorpora un quinto candidato sobre cambios recientes. Continúa aprendiendo de errores históricos y de resultados reales ya conocidos, diferenciando ambas categorías. La versión del modelo pasa a `3.0.0`, conservando la identidad de cada pronóstico registrado.

La carga de históricos rechaza nulos, booleanos, valores no positivos, fechas futuras y duplicados contradictorios. No entrena con velas abiertas; para acciones exige cierres ajustados. La integridad de mercados y el entrenador local leen la caché activa `backend/cache/commodity-cache.json`, no la copia anterior `backend/commodity-cache.json`. No se borraron esas copias ni documentos existentes.

## Entrenamiento realizado con datos disponibles

Ejecutado `npm run train:forecast:local`, sin escribir en Supabase ni llamar a Gemini durante el entrenamiento. Evalúa nueve activos y tres horizontes mensuales: 27 combinaciones. El resultado final fue **3 aceptadas y 24 rechazadas** por falta de historia o por los criterios de validación.

| Activo | Horizonte | Mejora MAE frente al último valor | Comparación con modelo anterior |
| --- | --- | ---: | --- |
| Trigo | 3 meses | 3,59% | MAE 15,766 frente a 15,794 |
| Trigo | 6 meses | 8,39% | MAE 22,837 frente a 22,892 |
| WTI | 6 meses | 12,79% | MAE 10,463 frente a 10,586 |

Las dos series de trigo terminan en julio de 2026 y WTI en septiembre de 2026. Son resultados históricos del tramo evaluado, no garantías de mejora futura. No se comparan MAEs absolutos entre activos con unidades distintas. Los objetivos de horizontes largos pueden solaparse y no constituyen muestras independientes.

Soya y futuros de cerdo/res tienen solo seis meses consecutivos válidos en la caché actual después de excluir el mes abierto y respetar huecos. Se rechazaron; no se juntaron estados, especies o etapas comerciales para aparentar una historia mayor. Los futuros tampoco validan precios físicos mexicanos.

Los artefactos y coeficientes se guardan en `output/auditoria-codigo/entrenamiento-ml/resultados.json`, con hash de la fuente, corte, unidad, parámetros y errores. El informe legible es `ENTRENAMIENTO.md`. El entrenamiento histórico local no activa esas cifras como precios actuales. El comando existente `train:forecast -- --symbol=...` utiliza el nuevo entrenador al registrar modelos en Supabase; esta revisión no ejecutó escrituras reales en esa base.

## Pruebas

- Gemini: plazos compartidos, SDK que no responde, autorización, cuota, bloqueos, texto cortado, cancelación, streaming parcial, nivel Pro y ausencia de borrador oculto.
- ML: selección/validación separadas, etiquetas futuras que no cambian la selección, series constantes, fechas imposibles, nulos, huecos, ajustes, cierres abiertos y persistencia simulada. Un modelo rechazado no inserta un pronóstico.
- ORION: 88 controles de inteligencia; 128 combinaciones estado/especie, 212 ciudad/especie y 260 país/especie con fuentes simuladas.
- Regresión: seguridad HTTP y XSS, informes con IA, exportaciones en seis idiomas, traducción japonesa, auditoría de referencias, build y ESLint.
- Prueba real del prompt y adaptador con `gemini-3.8-flash`: terminó con `STOP` en 5,23 segundos usando solo seis observaciones públicas históricas de maíz/trigo. Conservó la tabla, fechas y unidades y distinguió implicaciones condicionales. El texto queda en `gemini-respuesta-real.md`. Es un caso comprobado, no una certificación de todas las respuestas posibles.

Para repetir: `npm run test:forecast`, `node scripts/test-gemini-reliability.cjs`, `node scripts/test-chat-disconnect.cjs` y `npm run train:forecast:local`. La prueba real exige `node scripts/verify-gemini-quality-live.cjs --run` y usa cuota de Gemini. Los tests automatizados no envían correos.