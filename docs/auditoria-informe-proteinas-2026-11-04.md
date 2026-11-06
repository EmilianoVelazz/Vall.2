# Auditoría del informe de proteínas

Revisión del 4 de noviembre de 2026: código de cálculo, procedencia, persistencia, resúmenes, tablas, gráficas, anexos y exportaciones diaria/semanal. Se conserva el máximo autorizado de seis páginas, sin reducir tipografía.

## Hallazgos corregidos

| Problema | Corrección y resultado |
| --- | --- |
| El resumen compacto descartaba las repercusiones para compras y margen. | La selección prioriza hechos, historia, repercusiones y contexto publicado; el seguimiento completa el espacio cuando no hay contexto. |
| Semana, mes y trimestre se calculaban, pero desaparecían de las tablas regionales nuevas. | Se recuperaron los seis horizontes: sesión/publicación anterior, semana, mes, trimestre, semestre y año. Sólo aparecen con bases válidas, identificadas por fecha. |
| La equivalencia en pesos de Estados Unidos había quedado fuera de la tabla principal. | Se integra en las mismas filas, con tipo de cambio fechado, conversión correcta de US¢ a USD y denominador físico original. No se aplica el cambio actual a variaciones históricas. |
| El respaldo podía llamar «Desde 2020» a una historia iniciada en 2026 y duplicar el horizonte histórico. | Para proteínas se exige una observación real de 2020; se elimina el alias duplicado. |
| El cargador del servidor podía recuperar las últimas observaciones del catálogo cuando el corte precedía a todo el archivo. | Se unificó con el cargador compartido: un corte inválido o sin observaciones devuelve vacío, nunca precios futuros. Una sola observación no genera un cambio ficticio de cero. |
| El catálogo local se marcaba como verificado y se perdían proveedor, estado y fecha de consulta al normalizar. | Las referencias de catálogo se identifican como respaldo; las consultas conservadas y las no documentadas se distinguen en Anexos. Se preservan estos metadatos al guardar y exportar. |
| Los comentarios públicos y noticias podían borrarse al normalizar el informe. | Se conserva el contexto público de Mercolleida separado del precio; se validan origen, fecha, duplicados y antigüedad. Las noticias del día y los comentarios fechados no se presentan como causas demostradas de cada movimiento. |
| Repetir fechas en cada celda ensanchaba las tablas y aumentaba su altura. | Las fechas base idénticas se trasladan al encabezado de su columna; las diferentes permanecen en la fila. País, unidad y fecha comunes se muestran una vez. |

## Cobertura y contraste externo

La muestra inicial contiene **103 referencias de 22 mercados**, incluidos México, Estados Unidos, Canadá, Brasil, Argentina, Chile, Colombia y Perú. Sus cuatro sectores son porcino, vacuno, pollo y huevo. Estados Unidos conserva nueve referencias; las once españolas de Mercolleida se mantienen protegidas en el PDF.

La auditoría detectó **55 referencias de catálogo de respaldo**. Esta clasificación expresa el origen del dato y no convierte la fecha del archivo en fecha de consulta del proveedor. El panel de Anexos muestra fuente, unidad, observación, frecuencia, antigüedad al corte y estado; no inventa una fecha de consulta ausente.

Se contrastaron las dos series diarias USDA con sus respuestas públicas, HTTP 200: porcino `2498 / Cutout and Primal Values` y vacuno `2453 / Current Cutout Values`. Para el 4 de noviembre coinciden con el corte: 69.29 y 362.50 USD/100 lb, respectivamente. Esta comprobación **no valida independientemente las otras 101 referencias**.

- [USDA AMS · canal porcina](https://mpr.datamart.ams.usda.gov/services/v1.1/reports/2498/Cutout%20and%20Primal%20Values).
- [USDA AMS · vacuno Choice](https://mpr.datamart.ams.usda.gov/services/v1.1/reports/2453/Current%20Cutout%20Values).
- [Mercolleida · porcino](https://www.mercolleida.com/es/servicios/mercados/porcino/cerdo-cebado/mercolleida): la consulta pública muestra acceso restringido. No se usó ese portal como prueba de los importes del catálogo ni se compró acceso.

## Lo que sigue faltando

1. **Revalidación automática del catálogo.** Sustituir sus referencias por observaciones descargadas de boletines o interfaces autorizadas, con documento y fecha por observación. Se conserva como respaldo identificado; no se afirma actualización en vivo.
2. **Historia física desde 2020.** Los futuros CME tienen historia comparable, pero no completa la del cerdo físico, pollo o huevo. Los promedios anuales repetidos en varias fechas no se convierten en cotizaciones diarias o semanales.
3. **Pescado y procesados.** El alcance actual filtra esas especies/presentaciones. Hace falta una integración explícita con precios verificables y agrupaciones comerciales propias; no deben clasificarse como vacuno ni rellenarse con otra proteína.
4. **Call y put recientes.** Sólo pueden presentarse parejas publicadas para la misma serie y fecha. El interés abierto semanal CFTC que existe en el corte no sustituye opciones, primas ni volatilidad implícita. La ausencia de evidencia reciente no se representa con ceros.
5. **Impacto empresarial cuantificado.** El informe expone canales de costo y margen. Para estimar pesos de impacto o porcentajes de cobertura concretos hacen falta volúmenes, fórmula de compra, exposición cambiaria, inventarios y contratos de la empresa.

## Comprobaciones

Las pruebas cubren cálculos con bases conocidas, seis horizontes, moneda y unidad de la equivalencia, fechas inválidas/futuras, catálogo sin consulta en vivo, conservación de copias, datos ausentes y ceros reales, comentarios públicos fechados, cobertura protegida, controles de gráficas y ausencia de recortes en PDF.

La muestra diaria y semanal final se compone en **cinco páginas**, incluso con el contexto público de Mercolleida recuperado en la comprobación. El ajuste conserva la tipografía y evita desplazar una sola gráfica a una hoja adicional. El PDF selecciona una lectura contextual completa; los dos comentarios íntegros del respaldo permanecen en la página y Anexos. Conserva las cuatro gráficas seleccionadas, las referencias protegidas y la tabla histórica desde 2020. El límite operativo sigue siendo seis, ya que el tamaño cambia según el contenido disponible.

Regresiones principales: `npm run test:reports:protein-audit`, `npm run test:reports:protein-charts`, `scripts/test-report-protein-history.mjs`, `scripts/test-report-americas-proteins.cjs`, `scripts/test-report-protein-sources.cjs`, `scripts/test-report-available-data.mjs` y `scripts/test-report-print-tables.mjs`. Los artefactos y el contraste USDA se guardan localmente en `output/proteinas-auditoria-20261104/`.

Los envíos automáticos permanecen desactivados. No se ha publicado ni enviado esta revisión a Git, Vercel o Dokploy.
