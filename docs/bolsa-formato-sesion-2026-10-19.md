# Bolsa: formato de sesión

Se adaptó la composición de la hoja «Reporte semanal» del libro proporcionado: título y bandas azul oscuro, indicadores superiores, tabla comparativa y gráficas con lectura. El libro se utilizó como referencia de presentación; sus cifras comerciales no se incorporaron a los informes bursátiles ni se modificó el archivo original.

## Contenido de Bolsa

1. Resumen calculado de las últimas sesiones disponibles: índices al alza, a la baja y sin cambio, referencias extremas y fechas de cobertura.
2. Indicadores de participación y VIX. VIX se presenta aparte y no se cuenta como una bolsa.
3. Tabla con nivel anterior, fecha anterior, último nivel, fecha del dato y variación de cada índice.
4. Barras de la variación de sesión y curvas para México, América, Europa, Asia, Oceanía, África y Medio Oriente, con hasta 21 fechas comunes y seis líneas por panel. Cada gráfica incluye una lectura escrita; las curvas normalizadas distinguen el cambio del periodo de la variación de una sesión.
5. Causas y consecuencias: hechos fechados del corte, movimientos regionales, posibles causas a contrastar, transmisión de tasas, resultados, costos y riesgo a las valuaciones y repercusiones sobre posiciones compradas, garantías, financiamiento y activos extranjeros. México tiene un desarrollo propio con comparación del IPC contra S&P 500 sólo cuando coinciden las fechas e ilustración del efecto en una posición hipotética de $100,000 MXN. Una noticia no se presenta como causa confirmada por coincidir con una variación.

Los datos de mercados que cierran en fechas diferentes se identifican expresamente. No se sustituye un cierre ausente por cero ni se interpolan curvas. Los cierres no positivos, las fechas imposibles, los puntos posteriores al corte y los duplicados contradictorios se descartan. La comparación usa dos sesiones observadas y puede cruzar un fin de semana.

Las noticias se incorporan en nuevos cortes únicamente cuando tienen fecha válida del día del corte en Ciudad de México y no son posteriores a éste. Se presentan como contexto, sin afirmar que causaron el movimiento de precios. Un corte anterior sin noticias conserva su evidencia disponible.

## Implementación

`shared/report-equity-session.mjs` construye el modelo común de Bolsa. `shared/report-weekly.mjs` selecciona esa composición únicamente para el origen `finance/equities`; conserva el anexo condicional como dato para clientes de traducción anteriores. Las demás colecciones mantienen su composición.

Lectura, PDF y exportación textual utilizan el modelo común. El CSV de Bolsa conserva números originales de las observaciones disponibles y referencias, además de las comparaciones presentadas. Las nuevas copias desde Bolsa conservan `equityObservations`, validado en el almacén personal, para no perder la sesión anterior al guardar un lunes. Las exclusiones de indicadores, tablas, gráficas, riesgos y fuentes siguen aplicándose.

La traducción incluye los nuevos textos calculados con el proveedor existente y su protección de cifras, fechas y enlaces. No se ejecutó traducción con un proveedor real en esta implementación.

## Comprobaciones

- `node scripts/test-report-equity-session.mjs --preview --ui`: datos, fechas, fin de semana, conflictos, exclusiones, guardado, CSV, traducción simulada, PDF, navegador de escritorio y anchos de 390 y 768 píxeles.
- Pruebas existentes de informes diarios, guardado, borradores, preferencias de creación, divisas, causas y reparación de traducciones.
- Compilación local completa mediante `node scripts/build-dist.mjs`, con su auditoría de referencias.
- ESLint sobre los módulos modificados.
- Renderizado de la muestra PDF y revisión visual de páginas, tablas, gráficas, pies y marca de agua.

La muestra `output/pdf/bolsa-formato-sesion-muestra.pdf` utiliza datos ficticios y se titula «simulación de formato». La muestra ampliada se compone en siete páginas según el contenido: tabla de siete columnas en un solo grupo, gráficas regionales y después causas y consecuencias. Las gráficas conservan leyendas sin duplicar la tabla completa de niveles; no se impone un límite de dos páginas que obligue a omitir bolsas. No se reduce la tipografía ni se omite el desarrollo de causas y consecuencias. Las capturas de navegador están en `output/bolsa-sesion`. No se desplegó el sitio ni se enviaron correos como parte de estas comprobaciones.

`npm run test:reports:bolsa` ejecuta la prueba del formato actual. `scripts/test-equity-report.mjs` conserva expectativas de un diseño anterior en oficio y no es la prueba del nuevo formato A4.

## Ampliación del catálogo y evidencia (19 de octubre)

- Se cubren las 59 bolsas del mapa del proyecto, incluida BIVA, y tres índices complementarios (Nasdaq Composite, Dow Jones y Euro Stoxx 50): 62 referencias en total. VIX se mantiene separado de los índices de renta variable y Stuttgart se conserva como ficha informativa de renta fija. No se afirma cubrir todas las bolsas existentes en el mundo.
- Hay 42 símbolos conectados; las 20 referencias sin símbolo permanecen visibles sin precio. Una falla del proveedor conserva los cierres previos, con sus fechas; no asigna cero. Cierres de más de siete días o comparaciones separadas por más de siete días no se presentan como una sesión reciente.
- El catálogo de informes se verifica contra el catálogo del mapa en la prueba. La carga usa hasta seis consultas simultáneas y un presupuesto global de 30 segundos; una migración del corte anterior conserva la hora original y no modifica los otros informes.
- Las copias y exportaciones preservan hasta 80 referencias y 65 cierres recientes por referencia; el límite total de las ediciones personales sigue en 384 KB.
- Las noticias estructuradas se filtran por día de CDMX y hora del corte, y se conservan al guardar. Se explicitan sorpresa frente a expectativas, secuencia temporal y contribución de emisoras para comprobar una hipótesis. No se presentan titulares como una causalidad demostrada.
- Validación adicional: `node scripts/test-report-equity-coverage.cjs` comprueba concurrencia, plazo global, migración única, conservación del resto de informes y exclusión de observaciones posteriores al corte.

Identidad del índice mexicano adicional contrastada con [BIVA: información general de índices](https://www.biva.mx/informacion_de_mercado/indices/informacion_general). No se encontró una conexión de cotización validada para FTSE BIVA: la ficha lo indica. Definición de volatilidad esperada contrastada con [Cboe: volatilidad](https://www.cboe.com/tradable-products/volatility-trading/).
