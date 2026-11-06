# Proteínas: Estados Unidos, Mercolleida y América

El informe diario y semanal de Mercados → Proteínas admite hasta seis páginas por solicitud del usuario. Esta excepción sustituye su límite anterior de tres páginas; los demás informes conservan sus políticas.

## Cobertura y presentación

- Estados Unidos tiene bloques propios para precios físicos USDA y futuros CME. Todas sus referencias disponibles se protegen durante la selección del PDF.
- Las cotizaciones españolas de Mercolleida tienen tablas y una gráfica propias, con filas protegidas en el PDF. Incluyen las referencias disponibles de porcino, vacuno, pollo y huevo.
- México y Latinoamérica conservan su cobertura. La muestra validada incluye México, Estados Unidos, Canadá, Brasil, Argentina, Chile, Colombia y Perú.
- La página permite explorar por separado Estados Unidos, Mercolleida, América e historia desde 2020. Los precios físicos y los futuros conservan sus unidades, etapas comerciales y fechas.

La muestra del 4 de noviembre de 2026 contiene nueve referencias estadounidenses y once españolas de Mercolleida. Estas cantidades describen la muestra; no son cupos ni valores fijos de cobertura.

## Calidad del dato

La comparación diaria utiliza sesiones publicadas consecutivas; las series periódicas comparan publicaciones, sin inventar cambios diarios. Las variaciones semestrales y anuales muestran su fecha base cuando existe una observación válida. Las celdas sin dato se omiten y los ceros reales se conservan.

El histórico desde 2020 se mantiene para las series verificables. Los promedios anuales repetidos en el catálogo no se presentan como observaciones diarias o semanales. La ampliación de espacio no inventa historia faltante.

CSV y Excel conservan los datos completos; el modelo original y las copias guardadas no se modifican al seleccionar contenido para imprimir. Se mantiene el tamaño legible de letra y se rechaza un PDF que exceda seis páginas.

## Aprovechamiento del espacio

En el PDF, el país aparece en el título cuando todas las filas pertenecen al mismo país. Una unidad o fecha de observación idéntica para todas las filas se imprime una vez como contexto de la tabla; las fechas base de las variaciones permanecen junto a cada porcentaje. Las notas metodológicas idénticas se imprimen una sola vez. Las unidades o fechas diferentes conservan sus columnas individuales.

Esta composición redujo la muestra diaria y semanal de seis a cinco páginas, sin eliminar filas ni gráficas y sin reducir la letra. El máximo autorizado sigue siendo seis páginas; la cantidad final depende de la información disponible.

## Validación

Las pruebas de `test-report-protein-americas.mjs` y `test-report-protein-history.mjs` verifican cálculos, fechas, conservación de todas las referencias estadounidenses y españolas protegidas, cobertura de ocho países, exportaciones completas y PDF diario/semanal. La prueba `test-report-protein-history-ui.cjs` comprueba las pestañas de Estados Unidos y Mercolleida, los controles históricos y la vista móvil.

Los artefactos de esta revisión se guardan localmente en `output/proteinas-cobertura-20261104/`. Los envíos automáticos permanecen desactivados.

La regresión `test-report-protein-print-layout.mjs` comprueba conservación de cifras, unidades, fechas y ceros, ausencia de recortes y huecos interiores grandes, y distribución de la muestra en cinco páginas. Sus PDF se guardan en `output/proteinas-espacios-20261104/`.

## Lectura visual de gráficas

Las tendencias tienen trazos más definidos y marcas de calendario intermedias. Los precios de una sola referencia añaden un relleno tenue; el histórico normalizado muestra la base 100. La página incorpora etiquetas al final de cada línea en escritorio, y una leyenda con último valor y fecha en escritorio y móvil. Las etiquetas mantienen diferencias comerciales cuando acortar sus nombres produciría duplicados.

Las comparaciones de precios anuales destacan el año más reciente con azul sobrio y dejan los anteriores en azul grisáceo. Las variaciones conservan sus colores de dirección. El PDF muestra el valor final junto a cada referencia de la leyenda y mantiene cuatro gráficas, todas sus observaciones y cinco páginas en la muestra validada. No se suavizan ni se generan puntos de precio nuevos.
