# Anexo «Causas y consecuencias»

Los informes conservan sus datos, gráficas y tablas. El nuevo anexo se añade al final de la lectura y del PDF, también en las ediciones guardadas y en los adjuntos preparados para envío programado. Daily News y Noticias conservan su composición editorial y reciben el anexo al final.

El modelo compartido deriva el movimiento de las mismas observaciones fechadas que la comparación diaria: ayer y hoy en America/Mexico_City, sin incorporar valores posteriores al corte ni sustituir ayer por otra sesión. Declara las referencias sin cambio y sin comparación válida. Incluye hasta nueve movimientos, en el orden de las referencias del informe, e indica incluidos/total; todas las referencias siguen disponibles en las tablas principales.

Por mercado se presenta:

- Qué subió o bajó, cambio absoluto y relativo cuando es calculable; tasas en puntos porcentuales.
- De dónde viene la referencia y qué mide.
- Factores que se deben contrastar, separados de los movimientos observados.
- Consecuencias posibles para el comprador, vendedor, tesorería o posiciones expuestas.
- Qué condiciones, contratos y datos deben verificarse antes de trasladar el movimiento al negocio.

Las cotizaciones por sí solas no demuestran una causa. El anexo **no afirma haber investigado noticias del día**: identifica los factores como hipótesis por contrastar y los impactos como condicionales. Las referencias metodológicas públicas explican mecanismos; no se presentan como evidencia de un evento ocurrido en este corte. No se recupera el antiguo apartado «Fuentes y trazabilidad».

En USD/moneda local, una subida requiere más unidades de esa moneda para pagar un dólar. El rendimiento de un bono se distingue de su precio; un cupón fijo no cambia automáticamente. Granos y proteínas conservan especie, unidad y mercado; un futuro no equivale a una compra física local. Indicadores de volatilidad y volúmenes de producción no se interpretan como precios de compra.

Mecanismos contrastados con [Banxico](https://educa.banxico.org.mx/recursos/pdf/%7BC6F6D9FF-A032-F743-C08B-D2924C3947BE%7D.pdf), [SEC — bonos](https://www.investor.gov/introduction-investing/investing-basics/investment-products/bonds-or-fixed-income-products/bonds), [SEC — acciones](https://www.investor.gov/introduction-investing), [USDA — perspectivas agropecuarias](https://www.ers.usda.gov/topics/farm-economy/commodity-outlook/ers-outlook-reports-and-data) y [EIA — energía](https://www.eia.gov/energyexplained/oil-and-petroleum-products/prices-and-outlook.php). Los enlaces se excluyen cuando la edición tiene fuentes desactivadas.

El contenido largo usa el traductor existente del informe, con protección de cifras, unidades y enlaces. El glosario se deriva de nuevo y se mantiene en la copia traducida; no sustituye ni modifica el informe original. Los rótulos se incluyen en el catálogo de los seis idiomas. La versión de presentación cambia para invalidar las vistas PDF anteriores.

Validación principal: `node scripts/test-report-causes.mjs`. Cubre alzas/bajas por mercado, monedas, tasas, ceros y ausencias, conservación del corte, ediciones guardadas, exclusión de enlaces, traducción y PDF sin desbordamientos ni una página aislada sólo para una cita. Las pruebas usan datos simulados y no envían correos ni consultas a proveedores de IA.
