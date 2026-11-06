# Unificación de gráficas de informes

Se agrupan series para reducir paneles únicamente cuando la comparación conserva su significado. No se suman precios, no se convierten monedas y no se promedian productos.

## Criterios

- Precios: misma familia, unidad exacta (incluye moneda y presentación), frecuencia y base comercial verificable. La clasificación precede a la división en paneles; cada panel nuevo admite hasta ocho líneas.
- Futuros: separados de referencias físicas, incluso cuando comparten unidad. Se distingue también una serie ajustada de una sin ajustar.
- Referencias sin evidencia suficiente de su base: permanecen individuales. Pollo vivo y pollo eviscerado minorista de Perú conservan paneles separados.
- Bolsa: México entra en la comparación americana. La base 100 se recalcula desde las observaciones originales sobre una fecha común a todas las series; nunca se unen índices calculados con bases distintas.
- Bonos: se mantienen mercado, moneda, base de rendimiento y frecuencia. Sólo se amplía a ocho el límite de líneas por panel; curvas por vencimiento, cambios en puntos base y evolución temporal permanecen separados.
- Bolsa anual: se agrupan porcentajes del mismo año respaldados por las referencias originales. Se conservan todos los valores publicados y se distribuyen hasta 18 barras por panel. La volatilidad y las trayectorias mensuales se mantienen aparte.
- Divisas: conservan la comparación relativa ya unificada y su base común. No se mezclan cotizaciones nominales de distintas monedas.
- México y los demás informes: se revisaron sus modelos; no se fuerza una unión cuando cambian las fechas, unidades o indicadores.

## Resultados sobre el corte almacenado

| Informe | Gráficas antes | Gráficas después |
| --- | ---: | ---: |
| Bolsa diaria | 10 | 9 |
| Bonos diarios | 4 | 3 |
| Energía y metales diarios | 13 | 11 |
| Bolsa anual, cada edición de 2022 a 2025 | 10 | 5 |

En proteínas, el par de pollo congelado y refrigerado de Brasil se une. Al mismo tiempo, se separan precios de distintas etapas comerciales que antes coincidían en un panel: el total de 15 gráficas se conserva. Reducir el número no tiene prioridad sobre mantener comparaciones válidas.

La implementación comparte el cálculo entre lector y exportaciones, conserva la evidencia original y respeta filtros, copias personales y traducción de títulos completos. La versión de presentación se incrementó para renovar las vistas previas almacenadas.

Se corrigió además una duplicación exclusiva de exportación: el rango de presentación `600–900` se convertía a `600-900` y se interpretaba como otra referencia de vacuno. La identidad admite esa normalización tipográfica sin cambiar el rótulo original ni los valores; lector y PDF conservan el mismo número de referencias y gráficas.

## Paginación

El cálculo de la última distribución considera que la figura final puede ocupar todo el ancho. La metodología compartida aprovecha el espacio disponible antes de abandonar una página; así no queda sola en una hoja adicional. La exportación diaria de Energía y metales pasa de seis a cinco páginas sobre este corte.

## Verificaciones

- `scripts/test-report-chart-grouping.mjs`: 70 modelos, observaciones completas y exactas, límites de series, unidades, monedas, cadencias, bases físicas y de futuros, periodos anuales, copias, filtros y traducción.
- `scripts/test-report-chart-grouping-export.mjs`: PDF diario y semanal, metodología una sola vez y ausencia de hojas interiores de gráficas casi vacías.
- Pruebas de enfoque de mercados, librería anual, eliminación de repeticiones, geometría y distribución de PDF, lector React, lint y compilación.
- Exportaciones de revisión: `output/report-chart-unification-20261023/`.
- Auditoría de 75 exportaciones (14 diarias, 56 anuales y cinco semanales): sin hojas vacías, cierres aislados ni huecos interiores superiores a 100 puntos; máximo observado, 78.6 puntos. Se repitió la exportación diaria y semanal de proteínas tras corregir la identidad del rango numérico.

No se refrescaron cotizaciones ni se generaron explicaciones nuevas con IA para estos cambios de presentación. Los envíos automáticos de informes permanecen desactivados.
