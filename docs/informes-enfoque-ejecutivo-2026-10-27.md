# Informes para dirección

Los apuntes de la reunión se aplican como una lectura de hechos, contexto e implicaciones. Las cifras completas permanecen en las tablas y anexos. Una noticia coincidente no se presenta como causa demostrada de un movimiento.

## Composición

1. Resumen: qué pasó, horizontes disponibles, explicación y repercusiones posibles. Los mercados mixtos muestran una subida y una bajada, cada una con sus propias fechas. Las noticias destacan hechos publicados; los indicadores estructurales conservan su periodo.
2. Gráfica principal de tamaño legible antes de las tablas. Se evita abrir con una gráfica de demasiadas categorías que obligue a dejar la primera hoja casi vacía.
3. Tablas de niveles y variaciones con flechas, unidades, países o sectores y ambas fechas. No se muestran tarjetas de referencias ni un apartado duplicado de causas.
4. Call, put e interés abierto únicamente con observaciones válidas del mercado correspondiente.
5. Gráficas de detalle y comparativa histórica. Se conserva la metodología común una sola vez. Los resultados ya tabulados no se vuelven a imprimir bajo cada figura; el lector mantiene su explorador de fechas.

El PDF conserva el máximo de cinco páginas y el conjunto completo sigue disponible en lector, anexos y hoja de cálculo. La figura principal y las comparativas históricas obligatorias sobreviven a la selección del PDF. Los filtros no dejan epígrafes vacíos.

## Alcance y precisión

- Bolsa conserva las minigráficas regionales y la comparativa global desde 2020. La escala logarítmica ahora se aplica realmente en pantalla y PDF, con iguales distancias para iguales cambios proporcionales. Las leyendas identifican trazos y fechas base de las historias parciales.
- Divisas mantiene cotizaciones frente al USD y una comparación normalizada; no mezcla niveles de distintas monedas. Las variaciones conservan sus bases observadas.
- Proteínas mantiene el alcance de Estados Unidos indicado después de la reunión. USD y el equivalente informativo MXN comparten una fila. La conversión exige una tasa reciente, fechada y trazable. No transforma una cotización estadounidense en precio mexicano ni aplica el tipo de cambio actual a rendimientos históricos. Los centavos se convierten a dólares sin cambiar la unidad física.
- Granos y forrajes mantiene cobertura mundial y harina de soya. Su respaldo persistente conserva series por proveedor, producto, unidad y base comercial durante interrupciones de una fuente.
- CFTC publica OI en contratos y el colector calcula el cambio semanal porcentual. La tabla distingue ambas magnitudes, retiene las fechas y lo separa del cambio de CME expresado en contratos.
- Las series diarias, semanales, mensuales y anuales conservan su frecuencia. No se inventan precios ni cambios cuando falta una observación comparable.

## Comprobación reproducible

`npm run test:reports:executive` verifica hechos, periodos, orden visual, filtros, equivalencias monetarias, frecuencias, OI y geometría logarítmica con datos controlados. Las simulaciones de exportación y renderizado usan además los cortes disponibles localmente; sus resultados se guardan fuera de Git, en `output/`.

Los envíos automáticos de correo permanecen desactivados en el entorno local.
