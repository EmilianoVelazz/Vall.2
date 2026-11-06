# Divisas frente a USD

El informe de Finanzas / Divisas cubre nueve monedas, en este orden: MXN, JPY, EUR, GBP, CAD, BRL, CNY, VES y RUB. El catálogo está en `shared/report-fx.json`. Todas las cotizaciones expresan unidades de la moneda de destino por **1 USD**.

La presentación reúne las nueve monedas en exactamente dos gráficas: evolución conjunta con índice base 100 en el día anterior y barras de variación porcentual de ayer a hoy. Cada par conserva un color propio en ambas gráficas, en la web y el PDF. La tabla conserva las cotizaciones exactas de las dos fechas y sus unidades por 1 USD. Las series completas se conservan internamente; la salida diaria usa únicamente el día del corte y el anterior, sin resúmenes ni análisis narrativos.

Si falta el dato del día anterior no se inventa una base 100. La moneda conserva su lugar en la leyenda y la comparativa, con «Sin dato». Una serie sin observaciones comparables no dibuja una trayectoria ni una variación de cero.

La fuente histórica ya integrada, Yahoo Finance, se consulta para los nueve símbolos `MXN=X`, `JPY=X`, `EUR=X`, `GBP=X`, `CAD=X`, `BRL=X`, `CNY=X`, `VES=X` y `RUB=X`. Se verifican símbolo y moneda devueltos por el proveedor antes de usar la serie. La cotización de la tabla y su gráfica usan la misma serie. Si no hay historia utilizable, una referencia fechada de ExchangeRate-API puede mostrarse como una observación puntual, sin simular una trayectoria.

Los precios nulos, no positivos, contradictorios o posteriores al corte no se incorporan a los cálculos. Una moneda sin referencia utilizable mantiene su fila con «Sin dato». Los fallos parciales pueden conservar historia previamente verificada con sus fechas originales. Las peticiones históricas se limitan a tres simultáneas. La contingencia de cotizaciones calienta una vez la caché compartida para evitar nueve consultas simultáneas al mismo conjunto de tipos de cambio.

Las ediciones guardadas mantienen las nueve series originales como evidencia; el formato de lectura y PDF las reúne en dos gráficas. El modo breve conserva las nueve monedas si están incluidos indicadores y gráficas. Los códigos VES y RUB también están protegidos en las traducciones.

El primer acceso a una biblioteca con cobertura anterior amplía únicamente Divisas. Conserva la fecha del corte guardado y las otras ediciones. La comprobación del corte ocurre sobre los timestamps originales del proveedor antes de convertirlos a fechas diarias. La actualización se comparte entre solicitudes simultáneas y se guarda con versión de cobertura para no repetir la reconstrucción en cada visita.

## Verificación

- `npm run test:reports:fx`: nueve monedas, dirección USD, escalas y unidades, límites del corte, cotización puntual, fallos parciales, conservación de series anteriores, validación del par y migración sin alterar otros informes.
- La misma prueba verifica que el guardado y la versión breve conserven las nueve monedas y que la salida incluya dos gráficas, normalización, alzas/bajas, fechas ausentes y PDF sin datos comparables.
- `node scripts/test-report-fx.cjs --ui`: navegador con datos simulados, exactamente dos gráficas con nueve monedas, escritorio y móvil sin desbordamiento, sin narrativa ni errores de JavaScript.
- Compilación de producción y ESLint de los archivos afectados.
- Se consultaron las fuentes públicas y se confirmó una serie utilizable para las nueve monedas del corte local guardado. Se verificó por separado el archivo persistido, con nueve indicadores y nueve gráficas.
- No se enviaron correos reales ni se modificaron informes personales para las pruebas.

Referencias de los proveedores: [Yahoo Finance USD/VES](https://ca.finance.yahoo.com/quote/VES%3DX/) y [ExchangeRate-API](https://www.exchangerate-api.com/docs/free).
