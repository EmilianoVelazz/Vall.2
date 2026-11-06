# Bolsa ejecutiva

El informe diario y la edición semanal de Bolsa usan una composición PDF específica de hasta dos páginas. La lectura en pantalla, los anexos, CSV y Excel conservan el detalle; la tabla maestra del PDF incluye todas las referencias recientes con observaciones, sin seleccionar cinco bolsas para los horizontes.

## Composición

- Termómetro de Estados Unidos: dirección del S&P 500, VIX y spread HY. Sólo se clasifica favorable o defensivo si coinciden ambas fechas; sin esa coincidencia se indica lectura parcial. No representa una probabilidad ni un pronóstico mundial.
- VIX, Treasury a diez años, spread HY, DXY y WTI cuando exista una fuente reciente. Treasury y spread cambian en puntos base; no se presentan sus cambios de tasa como retorno de un bono.
- Tres mensajes: balance de precios, publicación fechada y canal posible de transmisión, y escenario condicionado para la siguiente sesión. El titular completo y su enlace quedan disponibles en el lector.
- Tabla maestra por Wall Street, Europa, Latinoamérica, Asia y otros mercados: cierre, variación de sesión, equivalencia USD, mes y YTD. Las letras de sesión del PDF remiten a ambas fechas, evitando repetir fechas largas por renglón.
- Dos gráficas pequeñas, desarrollados y Latinoamérica/Asia, con un máximo de cuatro series y base observada común. Mapa de diferencias frente al S&P sólo con fechas coincidentes. No se rellena historia faltante.
- Once sectores estadounidenses mediante ETF SPDR; principales divisas e insumos. No se presenta la rotación de esos ETF como una medición sectorial mundial.
- Implicaciones condicionadas para fondeo, tesorería y compras; evitan repetir las cotizaciones ya presentes en las tablas.
- El PDF de Bolsa no dibuja la marca de agua central.

## Datos y límites

- [Cboe](https://www.cboe.com/tradable-products/vix/vix-historical-data): CSV oficial de cierres VIX. Se actualizó el destino público observado a `cdn-api.cboe.com`; se rechazan redirecciones inesperadas y respuestas HTML.
- [FRED / Reserva Federal DGS10](https://fred.stlouisfed.org/series/DGS10): rendimiento diario a diez años, en porcentaje.
- [FRED / ICE BofA HY OAS](https://fred.stlouisfed.org/series/BAMLH0A0HYM2): spread estadounidense de alto rendimiento, en porcentaje.
- DXY, futuros y ETF: series del proveedor financiero, con símbolo confirmado y moneda USD confirmada antes de asignar unidades a sectores o materias primas. Las divisas incorporan los históricos públicos de BCE y Banco de Canadá cuando están disponibles.
- Noticias: publicaciones primarias disponibles y búsquedas RSS de la fecha de la sesión para América, Europa y Asia. Se conserva el editor y enlace; las noticias posteriores a la sesión no se usan para explicarla. La clasificación del tema y el canal económico son reglas transparentes, no una prueba causal.
- Para equivalencia USD se exige moneda identificada y FX observado en las dos fechas exactas. Fórmula: `(índice final / índice base) × (FX base / FX final) − 1`, con FX en moneda local por USD. Un dato ausente no se transforma en cero ni se sustituye por el cambio actual.
- [DAX](https://stoxx.com/index/DAX/) e [Ibovespa](https://www.b3.com.br/en_us/market-data-and-indices/indices/broad-indices/ibovespa.htm) incorporan dividendos en sus versiones de referencia. Se identifican con † en las tablas y se excluyen de las comparativas de índices de precios. La conversión USD conserva la metodología original del índice.
- Las nuevas observaciones bursátiles respetan el día de la plaza y excluyen velas de la sesión todavía abierta. Las fechas impresas son las fechas observadas por referencia, no una afirmación de que todas las plazas cerraron a la vez.
- Consultas con plazos y concurrencia acotados; un proveedor caído no se reemplaza con cifras inventadas. El contexto nuevo de cortes guardados se completa en segundo plano.
- Los futuros no son precios físicos entregados ni rendimientos de una estrategia con renovación de contratos. Los precios de ETF no incluyen reinversión de dividendos.

## Verificación local

- `npm run test:reports:bolsa`: sesión, almacenamiento y exportación; validación CSV/RSS, conversión USD, fechas, unidades, termómetro, filtros, opciones de contenido y traducción de campos sin modificar observaciones.
- `npm run test:reports:chart-density`: separación de series, geometría y conservación de datos.
- Lint de los archivos modificados y compilación de producción.
- Simulaciones con el corte público: 41 índices, once sectores y contexto completo; PDF diario y semanal de dos páginas, texto dentro de márgenes y revisión de las cuatro páginas renderizadas.
- Matriz de 28 PDF y 28 lecturas React de Finanzas, Mercados y México; Bolsa en dos páginas y demás informes en un máximo de cinco.
- Word/texto y Excel incluyen el nuevo contexto sin duplicar secciones; Excel conserva valores numéricos, unidades, fechas y enlaces de las observaciones auxiliares.
- La prueba antigua `test-report-observations.mjs` conserva una aserción de identidad de objeto que falla también al ejecutar `report-observations.js` de HEAD, antes de estos cambios. No se modificó esa aserción ni se consideró aprobada; los casos nuevos de cierre y zona horaria tienen pruebas propias.

El trabajo se dejó local. No se reactivaron envíos programados ni se publicaron cambios a Git o Vercel.
