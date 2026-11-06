# Divisas: tablero de tesorería de una página

## Correcciones de datos y convenciones

- EUR/USD y GBP/USD se calculan invirtiendo cada observación original antes de recalcular niveles, cambios y horizontes. La normalización USD de los proveedores permanece como evidencia interna; las tablas del informe y sus anexos numéricos utilizan las convenciones de mercado.
- BCE: API diaria EXR desde diciembre de 2019. Banco de Canadá: historial completo de USD/CAD desde la misma fecha. Se respetan fechas y horarios de publicación y no se encadenan series de proveedores distintos. Todas las monedas comerciales del corte revisado tienen bases de trimestre, semestre, año y YTD.
- DXY se obtiene de `DX-Y.NYB`, validando símbolo, moneda USD y tipo INDEX. Se excluye la sesión abierta. Al corte del 27 de octubre de 2026, la última sesión verificada es la del 26: 101.96 puntos. El índice representa una cesta de seis monedas, no todo el mercado mundial.
- La única gráfica combina DXY, USD/MXN, USD/BRL y USD/CAD durante seis meses, desde una misma fecha observada y hasta el último cierre común. En el corte revisado: 27 de abril a 26 de octubre de 2026. RUB y VES quedan fuera de la tabla principal, la gráfica y las estadísticas comerciales, con referencias separadas en anexos.
- El +5.96% de USD/BRL corresponde a 23–27 de octubre; la última referencia diaria cayó aproximadamente 4.31% entre 26 y 27. El comentario distingue ambos intervalos y cita Reuters sobre la reacción electoral y fiscal del 26. El artículo se actualizó a las 20:26 UTC; no se atribuye una intervención sin evidencia.

## Tesorería

- Tasas verificadas y fechadas: rango objetivo Fed, tasa objetivo Banxico, Selic, SOFR y TIIE de fondeo. Los diferenciales de política se separan de las tasas de fondeo utilizadas en el escenario de cobertura.
- USD/MXN y USD/BRL: forwards **teóricos** de 30, 90 y 180 días. SOFR/TIIE usan ACT/360 simple; Selic se trata como proxy efectiva ACT/365. Se suponen tasas planas, sin curvas por plazo, basis ni spread bancario. Las tasas y el spot deben tener fechas próximas. No se presentan como cotizaciones ejecutables ni como pronóstico.
- USD/MXN: volatilidad realizada de veinte retornos, rango de cierres observado y escenario de fin de mes con deriva cero y banda lognormal de 1.96 desviaciones. Días hábiles sin calendario de feriados. La volatilidad implícita permanece expresamente no disponible: no se sustituye con volatilidad histórica.
- Impactos separados en costos de importación e ingresos de exportación. El porcentaje de cobertura depende de la exposición neta y los límites de la empresa; el informe no prescribe porcentajes universales.

## Presentación, persistencia y verificación

Lector: tabla maestra, horizontes completos desplegables, termómetro DXY, tasas, escenarios de forwards y riesgo, gráfica única y tres implicaciones ejecutivas. PDF diario y semanal: una sola página, sin marca de agua superpuesta. CSV/Excel y texto exportado conservan bases, horizontes, fuentes y los datos del índice y de la comparación.

Las ediciones compactadas preservan 150 observaciones recientes, muestras mensuales y bases exactas de los horizontes; no se pierden los seis meses de la gráfica ni los cálculos anuales. El corte revisado se guarda en aproximadamente 216 KB, dentro del límite existente.

Pruebas: inversión exacta, horizontes, identidad DXY, ausencia de datos futuros, tasas antiguas, base común, aislamiento de RUB/VES, fórmula forward, volatilidad cero y muestras insuficientes, persistencia y PDF diario/semanal de una página. Se revisa el lector en escritorio y móvil y el PDF renderizado.

Fuentes: [BCE](https://data.ecb.europa.eu/currency-converter), [Banco de Canadá](https://www.bankofcanada.ca/valet/docs), [ICE DXY](https://www.ice.com/forex/usdx), [Banxico](https://www.banxico.org.mx/SieInternet/consultarDirectorioInternetAction.do?sector=18&accion=consultarCuadroAnalitico&idCuadro=CA51&locale=es), [BCB](https://www.bcb.gov.br/en/monetarypolicy/interestrates), [Reuters](https://www.marketscreener.com/news/euro-falls-against-dollar-brazilian-real-tumbles-after-lula-election-win-ce785cdcdc8ffe2d).

## Revisión de visibilidad y coherencia de exportaciones

La revisión posterior detectó que los horizontes largos estaban ocultos en el lector y que las tablas auxiliares de bases/fechas y procedencia todavía usaban los pares originales USD/EUR y USD/GBP. Ahora trimestre, semestre, año, acumulado y fecha aparecen directamente. Las tablas auxiliares derivan sus valores y unidades de las referencias corregidas EUR/USD y GBP/USD; la evidencia interna guardada mantiene su orientación original para reconstruir los cálculos una sola vez. Se corrige también el texto metodológico antiguo de los cruces BCE.

La vista previa local identifica el informe activo, permite cambiar entre Bonos y Divisas y ofrece un enlace al PDF generado con la misma plantilla. Se desactiva su caché HTTP para evitar mostrar una versión anterior después de recompilar.

Verificación del corte real: siete pares comerciales con trimestre, semestre, año y YTD disponibles; DXY fechado; cuatro series de la gráfica con base común; dos escenarios de forward; PDF de una página; CSV y anexos con convenciones coherentes; reconstrucción exacta tras guardar. Pruebas sintéticas adicionales comprueban que niveles, cambios y unidades de EUR/USD y GBP/USD coinciden en lector, bases numéricas y exportaciones.
