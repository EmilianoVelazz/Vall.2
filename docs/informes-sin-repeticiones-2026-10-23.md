# Informes más breves sin duplicar información

La composición compartida del lector y las exportaciones elimina copias exactas de tablas, filas, párrafos dentro de una misma sección y gráficas. Conserva diferencias de fecha, moneda, precisión, fuente y contexto. Dos países con el mismo valor siguen siendo dos hechos distintos. Las observaciones originales no se modifican.

Cambios de presentación:

- El resumen presenta una sola vez el movimiento principal. Los destacados amplían otros horizontes y reúnen periodos que utilizan exactamente la misma base.
- El apartado de impacto explica la repercusión sin volver a copiar la cotización y su variación.
- Las condiciones y metodologías comunes aparecen una vez. Al filtrar un país o producto, se recuperan en la primera tabla visible que las utiliza.
- Se suprimen los gráficos interanuales que repiten las comparativas extensas de Bolsa. En materias primas queda una muestra visual interanual; la tabla mantiene todas las referencias y años disponibles.
- Coberturas conserva producto, símbolo y mercado. Precios, unidades y fechas permanecen en sus tablas principales y el criterio de riesgo se explica una vez.
- Se elimina la tabla repetida de indicadores anuales del panorama mexicano.
- Excel evita repetir el resumen en otra fila y usa las tablas depuradas. Las notas de las gráficas no se repiten en la explicación y en un desplegable ni en la exportación narrativa.

Comprobaciones: 70 modelos de informes, los 19 lectores diarios/semanales de React, preservación de hechos anuales, pruebas de filtros y exportaciones, ESLint y compilación. La revisión de distribución abarca 75 PDF, incluyendo las ediciones semanales. Se conservan la paleta neutra y los envíos automáticos desactivados.

En la misma muestra local, Bolsa pasa de 10 a 9 páginas, Granos de 4 a 3, Energía y metales de 7 a 6, Proteínas de 7 a 6 y el Panorama nacional de México de 4 a 3. La extensión final depende de los datos de cada corte.

Implementación central: `shared/report-concision.mjs`. Versión de presentación: `2026-10-23-informes-sin-repeticiones-28`, que invalida las vistas previas anteriores. Pruebas y exportaciones revisadas: `output/report-concision-20261023`.
