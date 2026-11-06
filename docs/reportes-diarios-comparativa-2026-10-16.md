# Informes diarios: comparación de dos fechas

La lectura y las exportaciones de los informes de Finanzas, Mercados y México usan el día civil del corte y el día calendario anterior, en `America/Mexico_City`. Daily News y Noticias conservan su composición editorial.

- La tabla presenta referencia, unidad, valor anterior, valor actual, cambio absoluto y variación porcentual. Los rendimientos en porcentaje se comparan en puntos porcentuales.
- Las gráficas incluyen evolución de las observaciones disponibles y dos barras por referencia, con colores constantes para cada fecha. Una sola observación se dibuja como un punto, manteniendo ambas fechas en el eje. Una observación ausente conserva la etiqueta «Sin dato» y no dibuja una barra de cero.
- Las gráficas se colocan antes de las tablas comparativas extensas. Cuando una fuente no tiene observaciones en la ventana, conserva un panel con ambas fechas y valores ausentes; el bloque no desaparece.
- Divisas reúne sus nueve pares frente a USD en dos gráficas: evolución conjunta con base 100 en el día anterior y comparación de variaciones porcentuales. Las cotizaciones exactas permanecen en la tabla.
- Una proyección diaria antigua que quedó vacía puede recuperarse desde las observaciones originales del mismo informe, respetando referencia, unidad, fecha y los valores editados ya presentes.
- Se selecciona la última observación de cada día que no sea posterior a la hora del corte. Las fechas sin hora conservan la fecha civil declarada por la fuente. Las marcas con hora requieren zona explícita.
- No se usan el viernes como sustituto de un domingo ni cifras mensuales, semanales o anuales como si fueran datos diarios. Los informes históricos conservan la ventana correspondiente a su corte original.
- Se conservan observaciones del corte anterior sólo cuando coinciden referencia, unidad y fecha. En proteínas mexicanas la identidad incluye especie, estado, presentación, plazas y fuente.
- Las series originales de los proveedores se conservan para uso interno. La vista utiliza precios originales, sin depender del muestreo de las antiguas gráficas de largo plazo. Las nueve divisas mantienen la base USD y su unidad propia.
- Las ediciones guardadas conservan la evidencia diaria validada. Las ediciones antiguas pueden recuperar observaciones con fecha desde sus gráficas o tablas; los valores sin fecha no se presentan como actuales.
- La misma política se aplica a lectura, PDF, adjuntos de correo, Word, HTML, texto, Markdown, JSON y CSV. Los datos originales guardados no se borran.
- Si se perdió un corte de las 06:00 o 14:00 porque el servidor estuvo apagado, la apertura del catálogo intenta recuperar el corte pendiente mediante la actualización compartida de cada colección.

Validación: `npm run test:reports:daily`, pruebas de 14 apartados y sus vistas móviles, nueve divisas, seis idiomas con IA/SMTP simulados, ediciones guardadas, PDF, calendarios y compilación. No se envían correos reales durante estas pruebas.

Las fuentes estructurales de producción mexicana actualmente son anuales. Sus cifras quedan fuera del informe diario: se muestran las referencias sin dato diario hasta contar con una fuente con esa frecuencia.
