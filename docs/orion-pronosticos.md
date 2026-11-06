# Respuestas y pronósticos de ORION

ORION adapta la lectura al objetivo expresado en el chat: inversión, producción o compra. Los seguimientos conservan el tema y permiten cambiar el plazo sin pedir nuevamente el activo. Los botones proponen acciones según la respuesta: revisar un pronóstico, examinar qué lo invalidaría, seguir catalizadores o consultar fuentes y fechas.

## Pronóstico numérico

El chat obtiene hasta cuatro series diarias públicas de Yahoo Finance. Conserva el corte real del último dato válido y la unidad del instrumento. No transforma valores nulos en cero. Para acciones exige cierres ajustados; excluye datos futuros y velas del día sin cierre confirmado. Una serie cuyo último cierre supera cinco días de antigüedad se declara insuficiente.

El motor calcula entre una y veinte observaciones hacia adelante con una autoregresión regularizada. A cada origen de evaluación, entrena solamente con observaciones anteriores y pronostica el mismo número de pasos que pidió el usuario. Compara el error absoluto medio (MAE) con mantener el último precio conocido. Publica una estimación propia sólo cuando mejora ese MAE al menos 2%; ese umbral es una regla del producto, no una prueba de significancia ni una garantía de rendimiento.

El rango utiliza el percentil empírico 90 de los errores absolutos fuera de muestra, alrededor de la estimación. No representa cobertura futura calibrada, un intervalo de 95% ni una probabilidad de subida. Hay de ocho a veinticuatro orígenes de evaluación y las ventanas pueden solaparse. Una evaluación favorable en ese histórico puede fallar ante cambios de régimen, noticias nuevas o eventos sanitarios.

La evaluación temporal y la diferencia entre errores de ajuste y errores de pronóstico siguen los criterios descritos en [Forecasting: Principles and Practice — Time series cross-validation](https://otexts.com/fpp3/tscv.html). La interpretación de incertidumbre puede consultarse en [Prediction intervals](https://otexts.com/fpp3/prediction-intervals.html).

## Fechas y precios físicos

Los pasos se cuentan desde el corte histórico mostrado. Los días, semanas y meses se aproximan a observaciones del mercado (cinco por semana y veinte por mes para mercados con sesiones; siete y treinta para criptomonedas). El chat no afirma una fecha exacta sin calendario de sesiones y festivos. Los horizontes que superan veinte observaciones reciben escenarios cualitativos.

Los futuros de cerdo o alimento no sustituyen una serie de precio físico en granja, canal, mayoreo o destino. Si falta esa serie del país y etapa pedidos, ORION explica qué falta y conserva una lectura cualitativa. Un pronóstico del precio de una acción tampoco estima automáticamente el margen de un productor.

## Verificación y operación

La ficha numérica, los enlaces históricos y las sugerencias se añaden desde el servidor. La respuesta sobre pronósticos se valida antes de emitir el texto, retirando promesas de rentabilidad y probabilidades propias sin calibración. El resto de las respuestas mantiene su transmisión habitual. Si falla la auditoría en base de datos, una respuesta terminada sigue disponible.

La caché de series tiene límites de memoria y diez minutos de reutilización. Las solicitudes simultáneas de la misma serie comparten trabajo; las fuentes externas tienen un plazo máximo y su fallo deja un aviso concreto.

Validación local: `npm run test:forecast`, `npm run test:all`, `npm run lint` y `npm run build`. La auditoría real de conversación usa `node scripts/audit-orion-investor.cjs --phase=chat-pronosticos --only=pronostico,seguimiento-pronostico,productor`. Guarda resultados en `output/orion-auditoria-inversor/`, excluidos de Git, y no escribe conversaciones en la base de datos.
