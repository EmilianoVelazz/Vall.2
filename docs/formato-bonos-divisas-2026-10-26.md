# Formato de Bonos y Divisas · 26 de octubre de 2026

Los informes diarios conservan la estructura de Bolsa: resumen de la sesión, tablas y comparaciones, tendencias. La edición semanal de Divisas utiliza la misma presentación y su comparación semanal propia.

- Bonos separa los rendimientos diarios, los últimos resultados de subastas y las referencias internacionales mensuales. Los cambios diarios se expresan con flechas y puntos base; las subastas no reciben una variación diaria.
- Divisas muestra todas las monedas en una tabla de cotizaciones con ambas fechas y otra de variaciones por horizonte. La gráfica sigue siendo unificada, con base común observada; no compara niveles brutos de monedas diferentes.
- Los resúmenes distinguen hechos, explicaciones sin confirmar y repercusiones posibles. Se retira del resumen el ejemplo monetario hipotético de Bonos.
- La paleta de seis tonos de Bolsa se comparte mediante `shared/report-finance-colors.json`. Curvas de rendimientos: publicación anterior gris, actual azul. Las leyendas reproducen colores y trazos en pantalla y PDF.
- Los resultados de las gráficas no repiten las tablas principales. Los datos completos y sus fuentes se conservan para anexos y Excel.

Validación: prueba de formato de Bonos y Divisas, lector React, agrupación de 70 modelos, preservación de 75 modelos, compilación y auditoría de PDF. Muestra actual: Bonos 3 páginas; Divisas diario y semanal 2 páginas, con un máximo permitido de cinco. Se verificaron visualmente la primera página y las gráficas.

Comando reproducible: `npm run test:reports:finance-format`.
Los envíos automáticos siguen desactivados.
