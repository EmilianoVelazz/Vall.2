# Proteínas: informe ejecutivo de compras

Revisión del 5 de noviembre de 2026 basada en las observaciones del archivo adjunto. La edición individual pasa a un máximo de tres páginas. El lector, los anexos y Excel conservan el respaldo completo.

## Correcciones de datos y selección

- Se priorizan los conectores directos recientes sobre las referencias genéricas del catálogo que duplican USDA, SNIIM, Québec, Cañuelas o pollo CEPEA. El cutout porcino estadounidense y el huevo mexicano dejan de aparecer dos veces como precios aparentemente equivalentes. Las referencias desplazadas no se borran: quedan identificadas en un anexo con sus fechas y la referencia priorizada.
- México conserva plaza, presentación, unidad y naturaleza de cada dato. Un mínimo de rango de Aguascalientes no se llama promedio nacional. El huevo blanco de Aguascalientes por kg no se sustituye por la referencia genérica del catálogo ni por huevos estadounidenses por docena.
- La gráfica destacada de Mercolleida usa **cerdo cebado normal**. Desvieje, selecto, lechones y otros detalles permanecen consultables, pero no sustituyen ese benchmark. Las cotizaciones del catálogo siguen identificadas como referencias pendientes de corroboración.
- Las tablas ejecutivas se organizan en **Porcino**, **Vacuno** y **Avícola, huevo y procesados**. Las listas detalladas por plaza y corte pasan al respaldo. La selección del PDF mantiene países americanos y referencias centrales del negocio.
- Se corrige la secuencia del PDF: lectura ejecutiva → compras, precios y variaciones → comparativas históricas → participación y coberturas.
- En México, la lectura compacta da prioridad a mes, trimestre, semestre y año cuando hay una base válida. La frecuencia declarada acompaña siempre al precio. Los ceros observados no se borran ni se convierten en supuestas actualizaciones; las seis ventanas exactas permanecen en Anexos.

## Matriz en USD/kg

Se convierten exclusivamente precios físicos de conectores consultados o conservados, con observación vigente y unidad de masa reconocida. Se conservan **animal vivo, canal, carne mayorista, huevo por kg y procesados** como etapas distintas.

Conversión: `precio original ÷ unidades monetarias por USD ÷ kg de la unidad física`. Los centavos se dividen entre 100. Libra: 0.45359237 kg; 100 lb: 45.359237 kg; arroba explícita: 15 kg. El tipo de cambio conserva fuente y fecha, con vigencia máxima de tres días respecto al corte. USD no requiere un tipo de cambio externo.

Se excluyen futuros, precios por cabeza, docena o caja sin masa documentada, referencias no revalidadas y precios minoristas de la matriz de compras. La expresión «canal tradicional» de ODEPA significa canal de distribución: no se clasifica como canal animal. Tampoco se interpreta «no es precio minorista» como una cotización de supermercado.

**La conversión no convierte productos en sustitutos:** cutout compuesto, mínimo de canal Supremo y liquidación al índice de Québec mantienen su base comercial. No se aplica un rendimiento ficticio a precios vivos para obtener canal. Flete, aranceles, habilitación sanitaria y contrato no se inventan. La tabla es una comparación monetaria, no un arbitraje ejecutable ni un ranking de orígenes de importación. Brasil porcino sólo puede entrar cuando exista una observación física corroborada; el valor de catálogo no basta.

## Alimento, oferta y participación

- Se incorporan maíz y harina de soya como evidencia de apoyo de Granos, sin reclasificarlos como proteína. El cuadro convierte maíz por bushel de 56 lb y harina por tonelada corta de 2,000 lb a USD/t. Sus variaciones originales, junto al cerdo CME, conservan sus fechas.
- Una gráfica compara las tres trayectorias desde una fecha común observada en 2020, base 100. No suma sus precios ni estima una ración. La señal entre venta y alimento exige fórmula, conversión alimenticia, precios físicos, bases locales y costos operativos para convertirse en un margen de granja. [USDA ERS sobre costos y productividad porcina](https://ers.usda.gov/sites/default/files/_laserfiche/publications/104437/ERR-308.pdf).
- El conector de perspectivas lee las tres páginas oficiales de USDA ERS, valida su fecha y reconoce afirmaciones expresas de oferta y producción antes de construir la lectura en español. Si cambia la estructura o no hay una afirmación reconocible, omite el texto o conserva la publicación anterior dentro de su vigencia; no inventa una causa.
- En la consulta se reconocieron las perspectivas del 19 de octubre: revisiones por menores partos esperados, sacrificio vacuno lento y mayor inventario de ponedoras. Son perspectivas mensuales, no pruebas de la causa de un movimiento diario. [Porcino](https://www.ers.usda.gov/topics/animal-products/hogs-pork/market-outlook), [Vacuno](https://www.ers.usda.gov/topics/animal-products/cattle-beef/market-outlook), [Avícola y huevo](https://www.ers.usda.gov/topics/animal-products/poultry-eggs/market-outlook).
- El cuadro CFTC cruza OI y precio **en las dos fechas del COT**, cuando existen ambos cierres; no cruza una variación semanal de OI con una caída mensual del precio. Se identifica la distinta cobertura entre todos los vencimientos y la serie continua. El aumento del OI no acredita cortos de fondos: cada contrato abierto tiene una posición larga y otra corta. [CFTC: definición y notas del COT](https://www.cftc.gov/MarketReports/CommitmentsofTraders/ExplanatoryNotes/index.htm).
- No se atribuyen movimientos del huevo a un brote sin una detección fechada y pertinente, ni una caída china a importaciones sin evidencia comercial. La vigilancia sanitaria corresponde a [USDA APHIS](https://www.aphis.usda.gov/h5n1-hpai); no se inventa un conteo de brotes.

## Verificación

Las pruebas de compras comprueban USD/100 lb, centavos/lb, EUR/kg vivo, arroba explícita, exclusión de unidades ambiguas, vigencia cambiaria, negaciones en la base comercial, fechas futuras, prioridad de fuentes y conservación de copias. Se verifican los tres sectores separados, la matriz, el cerdo normal de Mercolleida, la historia de 2020, las tres series carne/alimento, los encabezados consecutivos y los límites físicos de cada página.

Las simulaciones diaria y semanal del nuevo formato se exportaron en **tres páginas**. Se revisaron las imágenes renderizadas; los cambios de presentación no reducen la tipografía ni recortan páginas. Los archivos de validación y la consulta pública están en `output/proteinas-compras-20261105/`.

No se envían correos ni se modifican perfiles o políticas de Supabase con esta revisión. No se publica a Git, Vercel o Dokploy.
