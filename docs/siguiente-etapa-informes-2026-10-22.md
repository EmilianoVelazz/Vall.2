# Siguiente etapa de mejora de informes · 22 de octubre de 2026

Revisión del código actual y de las 56 ediciones anuales incluidas. Se ejecutaron sondeos aislados de selección de movimientos y un análisis de cobertura y continuidad mensual. Este documento propone cambios; no modifica la aplicación, los informes ni sus cifras. No se verificó externamente cada precio ni se repitió la auditoría visual de PDF.

## 1. Interrumpir las curvas cuando falten observaciones mensuales · prioridad alta

`frontend/src/components/ExecutiveReportsHub.jsx:226` construye una línea continua entre todos los puntos disponibles. La nota metodológica advierte que no se rellenan meses ausentes, pero el trazo cruza esos huecos.

Ejemplos de las ediciones incluidas:

- Proteínas de México 2025: Pollo entero · Nayarit pasa de enero a julio sin observaciones de febrero a junio.
- Proteínas de México 2024: Pollo entero · Baja California Sur pasa de febrero a abril sin marzo.
- Proteínas de Mercados 2025: cuatro series tienen saltos de septiembre a noviembre.

Mejora: separar los segmentos al faltar meses, conservar puntos aislados y señalar «sin dato» en el detalle. Aplicar el mismo criterio al PDF. No asignar ceros ni interpolar precios. En los informes diarios, mantener la comparación entre sus dos sesiones observadas; no introducir una regla mensual indiscriminada.

Aceptación: la curva de Nayarit no une enero con julio; la tabla y el CSV conservan exactamente las observaciones originales. Pantalla y PDF coinciden.

## 2. Seleccionar movimientos por relevancia y cobertura · prioridad alta

`shared/report-causes.mjs:43` toma los primeros nueve movimientos, en el orden recibido. El número incluido se declara, pero el criterio no prioriza magnitud ni diversidad regional.

Sondeo reproducido: nueve movimientos de +1 % seguidos de uno de +40 % dejan fuera el de +40 %. Es un ejemplo simulado que comprueba el algoritmo, no una cotización real.

Mejora: selección explicable por magnitud dentro de cada grupo comparable, con representación por país/producto y prioridad a intereses del destinatario. No ordenar conjuntamente porcentajes, puntos base y cambios absolutos como si fueran equivalentes. Mantener visibles el criterio y el acceso al resto.

Aceptación: reordenar las entradas no cambia arbitrariamente los destacados; el movimiento extremo de la prueba se incluye. No se atribuye causalidad a partir de su magnitud.

## 3. Resumen y repercusiones específicos del año · prioridad media

`backend/services/annual-report-library.js:81` abre con recuentos de cobertura. En las ediciones incluidas, el apartado «Repercusiones y transmisión» de cada uno de los 14 tipos se repite literalmente en 2022, 2023, 2024 y 2025.

Mejora: abrir con tres o cuatro hallazgos calculados del año: movimientos extremos comparables, dirección por región o especie y limitaciones que cambian la interpretación. Después explicar repercusiones ligadas al producto, unidad, mercado y periodo concretos, conservando separados hechos e hipótesis. El contexto metodológico común puede permanecer en Anexos.

Aceptación: cada edición describe sus resultados propios, enlaza las referencias que sustentan la lectura y no inventa detonantes cuando sólo hay precios.

## 4. Elegir países y referencias en la librería anual · prioridad media

`frontend/src/components/ExecutiveReportsHub.jsx:438` excluye las ediciones anuales de los filtros por país y referencia. `backend/services/annual-report-library.js:44` toma las primeras cuatro series de cada unidad y limita el conjunto de gráficas a doce.

Ejemplo: Bolsa anual contiene 43 referencias con datos y comparación anual, pero su gráfica de evolución mensual ilustra cuatro series. Las demás se conservan en tablas y barras: no se afirma que estén ausentes del informe.

Mejora: añadir filtros anuales por país, región, producto y entidad; permitir seleccionar las series de evolución mensual y declarar la cobertura de la selección. Mantener la vista global predeterminada. Si se ofrece descarga filtrada, distinguirla de la descarga completa mediante un control explícito.

Aceptación: se puede explorar una referencia disponible fuera de las primeras cuatro sin alterar las fechas, unidades o cifras del informe completo.

## 5. Mostrar cobertura útil para decidir qué falta mejorar · prioridad media

La edición de Proteínas de México 2025 declara 128 referencias del catálogo, 63 con observaciones y 65 sin historia incorporada. De las 63 disponibles, 55 admiten comparación anual y ocho son parciales. Estos números describen la edición incluida; no demuestran que no existan precios en las fuentes originales.

Mejora: un panel por especie y entidad, o país cuando corresponda, con meses disponibles, comparabilidad y motivo de ausencia. Facilitar la consulta de las referencias faltantes y priorizar la incorporación de historia verificable. No sustituirlas con cotizaciones actuales ni con otra plaza.

Aceptación: el usuario distingue cobertura del catálogo, disponibilidad y comparación válida sin recorrer varias tablas. Los recuentos cuadran con la evidencia original.

## 6. Exportación preparada para análisis en Excel · prioridad posterior

La interfaz anual ofrece PDF y CSV; `backend/routes/export.js:1644` no admite XLSX. El CSV actual mezcla encabezados y bloques de varias tablas, adecuado como documento de respaldo, pero menos cómodo para filtrar y calcular.

Mejora: ofrecer un libro con hojas de resumen, observaciones, comparaciones, cobertura y fuentes, conservando números como números y fechas como fechas. Preservar unidad, moneda, frecuencia y etapa comercial; no convertir texto redondeado en supuestos valores originales. Si no se conserva una observación numérica original, declarar esa limitación.

Aceptación: las columnas numéricas se calculan sin limpieza manual y los datos mantienen correspondencia con las tablas del informe y su periodo.

## Orden recomendado

Primero continuidad visual y selección de destacados. Después resúmenes específicos, filtros y cobertura; finalmente la exportación XLSX. Conservar la paleta neutral azul/gris y la comparación diaria entre las últimas dos sesiones, con ambas fechas.

Evidencia del análisis: `output/revision-informes-siguiente-etapa-20261022/hallazgos.json`. No se desplegó, no se ejecutaron migraciones y no se activaron envíos programados.
