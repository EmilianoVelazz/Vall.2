# Divisas globales y comparativas regionales

La cobertura comercial pasa de 7 a 29 monedas verificadas. Se añaden CHF, SEK, NOK, DKK, PLN, CZK, HUF, RON, TRY, ISK, AUD, NZD, INR, KRW, SGD, HKD, THB, IDR, MYR, PHP, ILS y ZAR. RUB y VES conservan su tratamiento separado y no se incorporan a las comparaciones comerciales.

## Fuentes y convenciones

Las nuevas series proceden de los tipos de cambio diarios oficiales del BCE. CAD conserva la prioridad del Banco de Canadá. Las consultas BCE se dividen en lotes de seis monedas más USD; una respuesta conjunta supera el límite de 8 MB del cliente HTTP. Cada lote respeta el mismo corte, validación de unidades, fecha y hora de publicación, sin desactivar TLS. Fallos parciales no impiden recuperar otros lotes.

EUR/USD, GBP/USD, AUD/USD y NZD/USD se muestran en su convención de mercado. Las tablas conservan nivel anterior, fecha, unidades, fuente y variaciones. En las comparativas regionales se expresa la fuerza del USD: una subida significa que gana valor frente a la moneda indicada. Las cotizaciones inversas se invierten exclusivamente para construir este índice relativo.

## Gráficas

Nueve paneles, como máximo cuatro líneas sólidas con etiquetas directas por panel: América y DXY; tres bloques europeos; tres asiáticos; Oceanía; Sudáfrica. Cada panel se normaliza a 100 en una fecha observada común a todas sus series y termina en su última fecha común. No se añaden días ni se presentan niveles nominales incompatibles en una misma escala.

El lector permite seleccionar región y ventanas de 1, 3 y 6 meses. Las ventanas cortas recalculan la base 100 en la primera fecha común del intervalo. Los filtros por país identifican también las series regionales por su par original.

PDF diario/semanal de tres páginas: tablero y tesorería, tabla de las 22 monedas adicionales con dos gráficas, y seis comparativas regionales. Todas las monedas y las nueve gráficas se conservan. Se mantiene el tamaño de texto de los datos.

## Guardado y verificación

Una sola evidencia canónica en `marketHistory` conserva 140 observaciones diarias recientes (suficientes para seis meses), observaciones mensuales desde 2020 y bases exactas de cada horizonte. Las proyecciones duplicadas `dailyReferences`, `sessionObservations`, métricas, tablas y gráficas se reconstruyen y no se duplican en las nuevas ediciones guardadas de FX. La muestra real ocupa aproximadamente 358 KB, dentro de los 384 KiB existentes, y reconstruye exactamente tablas y comparativas.

Comprobaciones: consulta pública de las 29 monedas; pares inversos y variaciones; índice regional y ventanas con base común; cuatro líneas máximas; filtros por país y región; ausencia de valores futuros; reconstrucción tras guardar; PDF con las 29 monedas en tres páginas; descarga HTTP 200 diaria/semanal; vista móvil sin desbordamiento ni etiquetas fuera del SVG. PDF renderizado e inspeccionado. Compilación y lint completados.

La versión de datos FX sube a 4 para actualizar el informe base existente mediante la ruta normal de recuperación de cobertura, conservando su fecha de corte y los otros informes. Los envíos programados permanecen desactivados.

Fuentes: [BCE, tipos de cambio de referencia](https://data.ecb.europa.eu/key-figures/ecb-interest-rates-and-exchange-rates/exchange-rates), [Banco de Canadá, API Valet](https://www.bankofcanada.ca/valet-api-how-to/).
