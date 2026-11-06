# Bonos: formato de sesión

El informe de Bonos utiliza la estructura de Bolsa: resumen calculado, cuatro indicadores, tabla de rendimientos con fechas, gráficas con lectura y «Causas y consecuencias» al final. La presentación se comparte entre pantalla, PDF y exportación textual; CSV conserva los rendimientos numéricos originales.

## Cobertura y unidades

- 13 plazos nominales Treasury (1, 2, 3, 4 y 6 meses; 1, 2, 3, 5, 7, 10, 20 y 30 años), con curva par diaria oficial de U.S. Treasury.
- CETES a 28, 91, 182 y 364 días de Banxico SIE, series SF43936, SF43939, SF43942 y SF43945. Son publicaciones de resultados de subastas, no cotizaciones diarias ni TIIE.
- Referencias soberanas de largo plazo de 48 países, mediante OCDE y BCE: Alemania, Australia, Austria, Bélgica, Brasil, Bulgaria, Canadá, Chile, China, Chipre, Colombia, Corea del Sur, Costa Rica, Croacia, Dinamarca, Eslovaquia, Eslovenia, España, Estados Unidos, Estonia, Finlandia, Francia, Grecia, Hungría, India, Indonesia, Irlanda, Islandia, Israel, Italia, Japón, Letonia, Lituania, Luxemburgo, Malta, México, Noruega, Nueva Zelanda, Países Bajos, Polonia, Portugal, Reino Unido, República Checa, Rumania, Rusia, Sudáfrica, Suecia y Suiza. Se excluyen agregados regionales.
- Los niveles son tasas anuales en porcentaje. El cambio es diferencia de tasas en puntos base: 1 pb = 0.01 puntos porcentuales. No se interpreta como retorno de una inversión.
- Se mantienen cero y rendimientos negativos cuando son numéricos y fechados; se rechazan fechas imposibles, datos posteriores al corte y duplicados contradictorios. Los fines de semana no eliminan la sesión anterior.
- Las comparaciones requieren observaciones recientes: siete días para Treasury y 35 para subastas. El dato antiguo se muestra con su fecha y sin atribuirle una variación reciente.

La carga consulta el XML anual oficial de Treasury y una solicitud agrupada a Banxico con el token existente del servidor. No se incorpora el token a informes o exportaciones. Al inicio de año se consulta también el año anterior. Una interrupción conserva observaciones previas fechadas; las referencias sin datos siguen visibles. El respaldo Yahoo disponible distingue la tasa de descuento de ^IRX de las tasas par: no calcula una pendiente 10A–3M mezclando bases.

La ampliación internacional usa dos solicitudes SDMX CSV agrupadas. Conserva los periodos mensuales originales (`YYYY-MM`), moneda y una sola fuente por serie: se elige la más reciente y el BCE en igualdad de periodo. No empalma métodos o cambios de moneda. Los cambios mensuales requieren meses consecutivos y dato de menos de 120 días; se presentan en tablas y gráficas por región, aparte de sesiones y subastas. Los indicadores iniciales conservan su frecuencia de sesión/subasta. No se atribuye un promedio mensual a una noticia del día. Cada panel contiene hasta seis países, y las referencias antiguas siguen en la tabla sin entrar en gráficas ni comparaciones recientes.

Consulta real del 19 de octubre de 2026: 65 referencias (17 de mercado/subasta y 48 mensuales), con 45 países mensuales recientes. Islandia (2022-08), Rusia (2018-06) e Indonesia (2024-12) sólo tienen datos históricos en estas fuentes. No constituye un censo de todos los mercados de deuda del mundo. Fuentes: OCDE (2026), [Financial market, DSD_STES@DF_FINMARK 4.0](https://data-explorer.oecd.org/vis?df%5Bag%5D=OECD.SDD.STES&df%5Bid%5D=DSD_STES%40DF_FINMARK&df%5Bvs%5D=4.0&dq=.M.IRLT.PA.....), consulta 2026-10-19; [definición de tipos de largo plazo](https://www.oecd.org/en/data/indicators/long-term-interest-rates.html); BCE, [Interest rate statistics (IRS)](https://data.ecb.europa.eu/data/datasets/IRS), consulta 2026-10-19.

## Gráficas y explicación

Las barras muestran cambios en pb por mercado. El perfil por plazo reúne moneda, base y fechas comunes; los plazos tienen separación uniforme, expresamente indicada, y se distinguen los perfiles actual y anterior. Las series históricas usan niveles de tasa, hasta seis líneas por panel y 21 observaciones recientes; no normalizan rendimientos a 100 ni interpolan publicaciones.

La explicación distingue:

1. Movimiento observado y sus fechas.
2. Hechos disponibles e hipótesis que requieren confirmación temporal; una noticia posterior a las tasas no se presenta como su causa.
3. Transmisión de inflación, expectativas monetarias, subastas y primas por plazo a tasas y precios.
4. Pendiente 10A–3M, sólo si hay bases homogéneas y fechas comunes.
5. México: resultados de subastas, reinversión, fondeo y diferencia entre una tasa pactada y el costo de una operación nueva.
6. Repercusiones para bonos existentes a tasa fija, reinversión y financiamiento, con una ilustración de sensibilidad cuyo supuesto de duración se declara. No se calcula el valor de una cartera real sin sus instrumentos.

El mecanismo general se contrastó con [Investor.gov: riesgo de tasa y precio de bonos a tasa fija](https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins-86) y [TreasuryDirect: precios y tasas](https://www.treasurydirect.gov/marketable-securities/understanding-pricing/). Los instrumentos de México se verificaron con [Banxico: consulta de instrumentos](https://www.banxico.org.mx/Indicadores/consulta/Instrumentos.action) y los metadatos de las series oficiales.

## Implementación y comprobaciones

`shared/report-bond-session.mjs` construye el modelo; `backend/lib/report-bond-markets.js` y `backend/lib/report-bond-global.js` obtienen y validan sus fuentes. La presentación común usa `sessionReport`; Bolsa conserva sus reglas propias. Las copias personales conservan `bondObservations`, metadatos, moneda y frecuencia (máximo 96 referencias y 65 observaciones por referencia, con el límite total existente de 384 KB). La traducción protege números y fechas e incluye los textos calculados mediante `causeText`.

El corte existente se amplía una sola vez sin cambiar su fecha ni los otros informes. No se ejecuta IA para esa migración ni se envían correos en las pruebas.

- `node scripts/test-report-bond-session.mjs --preview --ui`: tasas, puntos base, curvas homogéneas, cero y negativos, viernes a lunes, subastas, fechas, exclusiones, guardado, CSV, traducción simulada, PDF y navegador de escritorio y móvil.
- `node scripts/test-report-bond-coverage.cjs`: migración única, respeto del corte y conservación de los otros informes.
- `node scripts/test-report-bond-global.mjs --preview --ui`: 48 países, 65 referencias, CSV SDMX, prioridad de fuentes, meses originales, negativos, conflictos, datos antiguos, guardado, CSV, PDF y navegador de escritorio/móvil. Las muestras usan datos ficticios identificados como simulación.
- Pruebas de Bolsa, causas y consecuencias y los 14 apartados de informes.
- Compilación completa y ESLint de los módulos modificados.
- Renderizado y revisión visual del PDF de simulación; no contiene rendimientos actuales.
