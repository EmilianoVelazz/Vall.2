# Fuentes de los informes — 20 de octubre de 2026

Se incorporaron proveedores al cálculo y a los anexos, con pruebas de conexión y de identidad de los datos. No se añadieron sólo nombres a una lista.

| Área | Fuente | Uso |
| --- | --- | --- |
| Divisas | BCE | Referencias diarias para MXN, JPY, EUR, GBP, BRL y CNY. Cruce por USD calculado con ambas monedas de la misma publicación en EUR. |
| Divisas | Banco de Canadá, Valet | Promedio diario USD/CAD; tiene prioridad sobre el cruce del BCE. |
| Energía | EIA | Precios físicos WTI en Cushing, Brent europeo y gas Henry Hub. Son referencias separadas de los futuros. |
| Bolsa | Moscow Exchange, ISS | Índice IMOEX, tablero SNDX, cierre oficial en puntos. Incluye enlace al editor original. |
| Publicaciones | BCE, Banco de Japón, Reserva Federal | Comunicados, discursos y publicaciones de política monetaria para los informes financieros. |
| Publicaciones | OMC, FAO, EIA | Comercio, agroalimentación y energía para los informes de mercados. OMC también alimenta finanzas. |

Las conexiones públicas de estas instituciones se probaron con respuestas reales. No todos los organismos publican noticias todos los días: sólo ingresan documentos publicados en el día del corte de Ciudad de México, anteriores a su hora. El límite por editor es de dos noticias; varias menciones de Reuters se consideran el mismo editor aunque lleguen por agregadores diferentes. Los RSS aportan titulares y los extractos publicados, no acceso al artículo completo ni evidencia automática de causalidad.

Las monedas que no cubren los bancos centrales conservan los proveedores anteriores. Las demás bolsas mantienen sus conectores actuales. Yahoo sigue siendo respaldo en las divisas cuando falta una historia oficial reciente; no se encadenan observaciones de dos proveedores para calcular una variación. Las fuentes existentes de bonos, proteínas y estadísticas nacionales se conservan.

Cada registro conserva proveedor, enlace, frecuencia, unidad y fecha del dato. BCE y Banco de Canadá respetan sus horas de publicación; MOEX excluye el día en curso antes del cierre. Un hueco en EIA no se rellena como cero, ni se atribuye a la fecha de descarga. EIA puede publicar con rezago: en la comprobación del 20 de octubre el último precio disponible fue del 14 de octubre.

Los históricos EIA y MOEX también se incorporaron a las 56 ediciones anuales de 2022–2025. Cada año se calcula con observaciones de ese año y una base de diciembre anterior cuando corresponde. La ampliación no convierte las divisas históricas de Yahoo en referencias del BCE.

Anexos incluye una tabla de procedencia por referencia y permite exportarla junto con los datos en CSV. Los enlaces repetidos del mismo conjunto se consolidan.

## Operación y comprobación

- `node scripts/test-report-public-sources.cjs`: identidad, cruces, unidades, fechas, publicación, huecos, fallas y selección editorial.
- `node scripts/test-report-global-commodities.cjs`: 23 futuros y tres referencias físicas, preservación y actualización de cobertura.
- `node scripts/test-report-equity-coverage.cjs`: cobertura y presupuesto de consultas de bolsas.
- `node scripts/test-report-annual-library.mjs`: 56 anuales, exportación, años y persistencia.
- `node scripts/test-report-public-source-ui.mjs`: fuentes visibles, tabla de procedencia, CSV y presentación móvil.
- `node scripts/refresh-report-public-sources.cjs`: actualización inicial de los respaldos locales públicos sin IA ni correo. Guarda la primera copia anterior en `output/fuentes-publicas/` y una auditoría de las series recuperadas. Las actualizaciones normales usan los conectores de los generadores de informes.

La prueba anterior `test-report-fx.cjs` espera dos gráficas, mientras que el diseño vigente devuelve nueve; esa expectativa ya no corresponde a la estructura actual y no se modificó el modelo gráfico en esta ampliación.
