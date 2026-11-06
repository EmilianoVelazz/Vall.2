# Distribución de espacios en el PDF de informes

Se revisaron las cuatro capturas entregadas y se reprodujo el problema con los cortes guardados del 21 de octubre. Las filas de gráficas avanzaban según la tarjeta más alta; las tarjetas cortas dejaban huecos grandes. Bolsa y Bonos también usaban filas para sus explicaciones, mientras que Proteínas ya contaba con una distribución parcial por columnas.

## Cambios

- Las gráficas de informes diarios y anuales comparten columnas independientes. Cada tarjeta comienza en el siguiente espacio disponible, sin esperar a su vecina.
- Antes de pasar de página, una gráfica con título propio puede ocupar un hueco donde quepa. No se altera su serie, escala, unidad ni explicación.
- Las tarjetas de Causas y consecuencias aprovechan las columnas de forma independiente. Se mantienen completas cuando caben en una página; los textos excepcionalmente largos continúan a lo ancho con su contenido íntegro.
- Un cierre o una tarjeta que no cabe a media página puede ocupar el ancho disponible debajo de ambas columnas antes de crear otra hoja. Esto evita páginas dedicadas únicamente a unas líneas finales.
- Los párrafos tienen una separación explícita de tres puntos, en lugar de una línea vacía completa. No se redujeron las fuentes ni los tamaños de letra.
- La revisión `2026-10-21-pdf-espacios-15` invalida las vistas previas de la presentación anterior. Los PDF ya descargados conservan su composición; las nuevas exportaciones utilizan la corregida.

## Resultado con los mismos cortes

| Informe | Antes | Después |
| --- | ---: | ---: |
| Bolsa | 9 páginas | 7 páginas |
| Bonos | 5 páginas | 5 páginas |
| Proteínas globales | 11 páginas | 11 páginas |
| Proteínas de México | 17 páginas | 16 páginas |

La reducción depende del contenido de cada edición. Se conservan los márgenes y el espacio natural al terminar un documento; no se agregan textos o datos para rellenarlo.

## Validación

- `scripts/test-report-pdf-column-flow.mjs`: verifica columnas independientes, conservación de párrafos, ausencia de superposiciones, cierre a todo el ancho y textos largos sin hojas vacías.
- Exportación de los 14 informes diarios del caché: modelos sin modificar, páginas con contenido, texto dentro del ancho imprimible y separado del pie.
- `scripts/test-report-languages.mjs`: seis idiomas y los 14 orígenes de informe; PDF, CSV y otros formatos, sin llamadas reales a IA ni envíos SMTP.
- ESLint y compilación de producción.
- Renderizado con Poppler e inspección de las páginas de Bolsa, Bonos, Proteínas globales y Proteínas de México, incluidas las gráficas y los cierres.

También se ejecutaron pruebas heredadas de Bolsa/Bonos, formato semanal, presentación, sectores y densidad. Esas pruebas contienen expectativas de versiones anteriores: traducción simulada que conserva el español, documentos propios con composición semanal, ausencia de resumen o rótulos antiguos. Sus fallos no se corrigieron cambiando las reglas actuales del producto. Las verificaciones de la nueva distribución y de los PDF actuales son independientes de esas expectativas.

Muestra para revisión: `output/pdf/bolsa-espacios-optimizados-2026-10-21.pdf`, con las mismas observaciones del corte archivado utilizado en la comparación. Este trabajo revisa la presentación; no vuelve a consultar ni certifica las cotizaciones económicas.
