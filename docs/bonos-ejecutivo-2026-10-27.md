# Bonos: informe ejecutivo

La composición pública de Bonos utiliza ahora un modelo específico, compartido por el lector, las ediciones guardadas, el texto, el CSV, Excel y el PDF. El PDF diario y semanal ocupa como máximo dos páginas; conserva todas las referencias diarias y de subasta vigentes, con una tabla separada para las subastas. El modelo de sesión anterior se mantiene para compatibilidad, pero no determina la nueva composición.

## Datos y vigencia

- Se excluyen del seguimiento diario los datos diarios con más de siete días de antigüedad y las subastas con más de catorce. Los niveles mensuales recientes se separan en anexos, con su periodo; no se presentan como cierres diarios. Rusia de 2018, Islandia de 2022 e Indonesia de 2024 no aparecen en el nuevo informe.
- Treasury aporta los trece vencimientos de uno y dos meses hasta treinta años, con publicaciones del año actual, anterior y 2020. Cada curva utiliza una sola fecha común realmente observada: última sesión, hace un mes y hace un año, con tolerancia de siete días. No se mezclan tasas par con descuento bancario.
- SOFR y Fed Funds efectiva proceden de la Fed de Nueva York. FRED aporta rango objetivo Fed, TIPS, breakeven y los diferenciales OAS de grado de inversión y alto rendimiento. Las observaciones OAS en porcentaje se convierten a puntos base una sola vez. FRED limita el historial reciente de las series ICE: no se inventa el cierre de 2020 ausente.
- TIIE de fondeo y TIIE a veintiocho días se verifican por identificador y título. Si no hay token de Banxico, se utilizan la publicación pública y el servicio que alimenta su calendario para consultar la sesión anterior, semana, mes, año y cierre de 2020. Cada cifra conserva su fecha real. No se convierte un nivel único en un historial diario.
- El spread EMBIG México se obtiene de la serie diaria PD43667XD del BCRP, validando su nombre. No se encadenan las series antigua y nueva ni se confunde este índice con el diferencial CETES–Treasury.

## Presentación

El tablero contiene rango Fed, SOFR, TIIE y EMBIG con fecha y fuente enlazada. El resumen combina movimientos por plazo, pendiente y publicaciones fechadas; si no hay una noticia válida, utiliza relaciones observadas entre tasas y crédito sin inventar una decisión monetaria ni una causalidad. Las implicaciones distinguen deuda fija, revisión de deuda variable, liquidez, reinversión, moneda y cobertura.

La curva completa muestra tres fechas superpuestas y trazos sobrios distintos. La tendencia compara dos, diez y treinta años durante tres meses y exige al menos diez observaciones y treinta días de historia. Se retiraron barras redundantes, líneas de dos puntos y lecturas que repetían las tablas.

La tabla conserva nivel actual, sesión previa, cambios de sesión o semana, mes y año, cierre de 2020 y fechas comparadas. Las diferencias se calculan en puntos base, incluso para tasas cero o negativas. Las subastas no reciben una variación diaria. El diferencial CETES veintiocho días–Treasury un mes sólo se calcula con la misma fecha observada y se declara indicativo, con monedas y convenciones distintas; no se presenta como EMBI ni como rendimiento cubierto.

El servicio público de CME no entregó probabilidades utilizables durante la verificación. Se ofrece su enlace oficial en lector y PDF; no se publica una cifra de probabilidad sin datos verificados.

## Persistencia y verificación

Los historiales compactados conservan hasta 256 observaciones: sesiones recientes, muestras mensuales y bases exactas de mes, año y 2020. Las ediciones de Bonos guardan una única evidencia canónica en `bondObservations`; se retiran gráficas derivadas redundantes. El corte público verificado contiene 28 referencias vigentes, tres curvas de trece vencimientos y tres tendencias con 64 observaciones cada una. Su edición guardada ocupa aproximadamente 198 KB, por debajo del límite privado existente.

Se probaron unidades, fechas futuras y conflictivas, antigüedad, periodos, fuentes equivocadas, filtros por país, conservación exacta al guardar y exportación diaria/semanal de dos páginas. Se comprobaron el lector de escritorio y móvil y la descarga HTTP real en un entorno aislado. Los envíos automáticos continúan desactivados; no se aplicaron migraciones ni se publicaron cambios en Git o Vercel.

Fuentes técnicas: [Treasury XML](https://home.treasury.gov/treasury-daily-interest-rate-xml-feed), [Fed de Nueva York](https://markets.newyorkfed.org/static/docs/markets-api.html), [Banxico](https://www.banxico.org.mx/tipcamb/llenarTasasInteresAction.do?idioma=sp), [FRED](https://fred.stlouisfed.org/), [BCRP](https://estadisticas.bcrp.gob.pe/estadisticas/series/diarias/resultados/PD43667XD/html), [CME FedWatch](https://www.cmegroup.com/markets/interest-rates/cme-fedwatch-tool).
