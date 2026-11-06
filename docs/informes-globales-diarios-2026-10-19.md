# Informes diarios: formato común y cobertura internacional

Los 14 informes de Finanzas, Mercados y México comparten resumen, indicadores, datos, gráficas con lectura y «Causas y consecuencias» debajo de las gráficas. Cada tema explica sus mecanismos, posibles repercusiones y evidencia pendiente. No se atribuye una causa concreta sólo porque dos variables se muevan juntas.

La preferencia confirmada por el usuario es comparar la última sesión publicada contra la anterior, mostrando ambas fechas. Las gráficas temporales muestran sólo dos observaciones. Las barras regionales de Mercados muestran la variación de esa sesión por referencia; no comparan niveles de monedas, productos o etapas diferentes. Se retiraron ventanas de cinco sesiones, un mes y YTD de la comparación visible. El historial original se conserva internamente para reconstruir y validar el corte.

## Cobertura de Mercados

El catálogo incorpora 23 referencias distintas: siete de granos y alimentación, once de energía y metales y cinco pecuarias. Los informes de proteínas incluyen también las dos harinas de soya como alimento, sin duplicar consultas. El panorama reúne las 23 referencias. Los datos diarios cubren referencias de América, Asia y Europa; esto no constituye un censo de todos los mercados del mundo.

- CBOT/CME/COMEX/NYMEX: maíz, soya, trigo, harina de soya, WTI, Henry Hub, cobre, oro, aluminio, cerdo magro, ganado vivo y ganado de engorda.
- Dalian, China: maíz, soya n.º 1, harina de soya, cerdo vivo y huevo.
- Shanghái, China: cobre y aluminio de SHFE y petróleo de INE.
- Referencias internacionales cotizadas mediante contratos NYMEX/COMEX: Brent del mar del Norte, gas TTF neerlandés y hierro 62 % CFR China. Se distingue el mercado de referencia de la bolsa donde cotiza el contrato; no se presentan como precios físicos de cada país.

Yahoo Finance y Sina Finance proporcionan las series. Se verifican identidad y moneda en los metadatos disponibles de Yahoo; las rutas de Sina se limitan a símbolos de contratos previamente identificados y sus cierres diarios. No se usan los CFD indicativos de metales de Londres ni símbolos europeos/canadienses que no devolvieron series verificables. No se rellenan mercados sin datos.

Las series continuas pueden cambiar de contrato. La variación no equivale al costo físico entregado; se requiere verificar vencimiento, base, calidad, moneda y logística. No se declara una corroboración independiente de cada cierre contra una segunda bolsa o proveedor.

## Correcciones y validaciones de datos

Maíz, soya y trigo de CBOT conservan el valor publicado en **US¢/bu**, no USD/bu: no se divide el número ni se presenta como dólares. Cerdo y ganado de CME usan US¢/lb. Harina de soya CBOT usa USD por tonelada corta; no se mezcla con toneladas métricas. Los contratos chinos conservan CNY; huevo usa CNY por 500 kg y cerdo vivo CNY por tonelada. Gas TTF mantiene EUR/MWh.

Especificaciones y referencias consultadas el 19 de octubre de 2026:

- [CME: maíz, cotización en centavos de dólar por bushel](https://www.cmegroup.com/markets/agriculture/grains/corn/specs).
- [CME: especificaciones de granos y oleaginosas](https://www.cmegroup.com/trading/agricultural/files/grain-and-oilseed-futures-options-fact-card.pdf).
- [CME: cerdo magro, centavos de dólar por libra](https://www.cmegroup.com/markets/agriculture/livestock/lean-hogs.contractSpecs.html).
- [Sina: contrato de cerdo vivo de Dalian, unidad CNY/t](https://finance.sina.com.cn/futures/quotes/LH0.shtml).
- [Sina: contrato de huevo de Dalian, unidad CNY/500 kg](https://finance.sina.com.cn/futures/quotes/JD0.shtml).
- [SHFE: especificaciones del cobre, yuanes por tonelada](https://www.shfe.com.cn/docview/docview_211238434.htm).
- [CME: contrato de gas TTF](https://www.cmegroup.com/markets/energy/natural-gas/dutch-ttf-natural-gas-calendar-month.contractSpecs.html).

Los cierres se calculan desde dos observaciones fechadas; no desde el cierre anterior de toda la ventana del proveedor. Se excluyen valores no numéricos, fechas imposibles, observaciones posteriores al corte y duplicados contradictorios. Cero y negativos se conservan si son cifras publicadas válidas; nunca se usan para llenar ausencias. Las unidades distintas forman referencias distintas.

La precisión publicada corresponde al contrato: por ejemplo, la harina de soya se presenta con un decimal, sin residuos de representación como `359.799987`. El valor numérico original se conserva como `rawValue` cuando la normalización modifica esa representación; los cálculos usan el precio normalizado de la referencia, sin convertir divisas o unidades.

Para Yahoo se descarta la barra de la sesión en curso hasta su hora de cierre publicada. Se usa el día de cierre de la sesión en la zona de la bolsa, para tratar las aperturas nocturnas sin borrar el cierre ya finalizado. Los contratos chinos no utilizan la barra del día antes de las 15:00 de Shanghái. Los mercados sin dos cierres recientes quedan sin comparación; no se transforman en variación cero.

Las noticias se filtran al día del corte en Ciudad de México, sin publicaciones futuras ni duplicados. Su conteo mide cobertura informativa; no impacto económico ni reacción de precios.

## Otras frecuencias

Los datos mensuales internacionales de bonos y las subastas de CETES muestran sólo su último nivel, frecuencia y periodo como contexto; no tienen variación diaria ni gráficas de comparación entre meses/subastas. Se conservan los 48 países con datos mensuales disponibles, identificando los históricos.

Producción regional, indicadores anuales y referencias estatales mantienen sus periodos. Las gráficas anuales muestran el último periodo publicado. Se conservan todas las entidades en las tablas y se explica cuándo faltan datos; no se reemplaza un estado por otro ni se simula una comparación diaria.

## Implementación y comprobación

`shared/report-sector-session.mjs` compone los otros doce apartados y mantiene las reglas específicas de Bolsa y Bonos. Las copias personales conservan `sessionObservations` y `sessionNews`, con sus límites de tamaño y validación; los archivos fuente no se reescriben para presentar el informe. Pantalla, PDF, texto y CSV comparten el modelo. Los textos calculados se incorporan al glosario de traducción sin modificar cifras o fechas.

`backend/lib/report-global-commodities.js` consulta el catálogo, valida respuestas, limita concurrencia a seis solicitudes y conserva referencias previas identificadas cuando falla un proveedor. La migración amplía sólo Mercados, publica un nuevo corte y se ejecuta una vez por versión. Los cortes automáticos posteriores utilizan el mismo catálogo. La persistencia local quedó confirmada; no se confirmó la sincronización remota de Supabase.

Comprobaciones: `test-report-global-commodities.cjs`, `test-report-sector-session.mjs`, `test-report-global-market-ui.mjs`, `test-report-dashboard.mjs`, pruebas de Bolsa, Bonos, causas, proyección diaria interna y formato común; ESLint y compilación. Se revisaron los 14 informes a 390/768/1440 px y se renderizaron los PDF de granos, energía/metales y proteínas.

El detalle del corte validado, con símbolos, unidades, fuentes, fechas, valores y estados, está en `output/otros-informes/auditoria-datos-globales.json`. La evidencia visual y los PDF usados para revisión son artefactos locales; no se enviaron correos ni se modificó el despliegue externo.
