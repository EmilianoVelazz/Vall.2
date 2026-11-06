# Gráficas legibles

La densidad se resuelve en la presentación, conservando los modelos y las observaciones originales.

- El lector muestra hasta cuatro series a la vez y permite recorrer todos los grupos con selector y botones accesibles. Las comparativas bursátiles mantienen el índice de referencia en cada grupo; no se vuelve a calcular ninguna base.
- Los colores y trazos de cada serie conservan su identidad al cambiar de grupo.
- Las leyendas muestran producto y plaza. Cuando dos nombres coinciden, conservan la presentación necesaria para distinguirlos. Las condiciones completas permanecen en los datos de la gráfica y en la evidencia original. No se muestran hashes internos como parte de la leyenda.
- Las lecturas que repiten cifras ya tabuladas quedan desplegables en pantalla. En el PDF se evita volver a imprimir ese párrafo numérico; se conserva la metodología y la interpretación independiente.
- El histórico global del PDF usa una fila con minigráfica por bolsa, fecha base, rango y último valor. La escala logarítmica es propia por referencia y se indica expresamente: la altura de dos trazos no equivale a comparar sus rendimientos.
- Las demás gráficas del PDF se dividen en paneles de hasta cuatro series. Las barras tienen más separación y hasta doce categorías por panel. El paginador mantiene su límite de cinco páginas.

`npm run test:reports:chart-density` comprueba conservación de las 41 historias, observaciones y fechas base, grupos equilibrados, identidad de colores, referencia de comparación, leyendas sin ambigüedades y ausencia de mutaciones. Las exportaciones y los lectores reales se revisan además con los cortes locales; sus resultados permanecen en `output/`.

Los envíos automáticos de correo continúan desactivados en el entorno local.
