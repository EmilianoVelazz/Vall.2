# Proteínas: cobertura de América

El informe diario incluye referencias físicas de Estados Unidos, Canadá, México, Chile, Argentina, Colombia, Perú y Brasil, conservando el resto de los mercados internacionales. Se añadieron 19 referencias al catálogo y una sección de cobertura por país en pantalla y PDF.

## Criterios del dato

- Estados Unidos: cerdo y vacuno de USDA AMS/MPR, USD/100 lb.
- Canadá: cerdo de Québec, CAD/100 kg al índice publicado; no se presenta como promedio nacional.
- México: pollo entero en Rayón, mínimos publicados de canal porcina y bovina en Aguascalientes, y huevo blanco de mayoreo. Se conservan plaza, presentación y MXN/kg.
- Chile: cinco precios minoristas de la Región Metropolitana, CLP/kg o CLP/docena para huevo; frecuencia semanal de ODEPA.
- Argentina: novillitos y vacas para faena de Cañuelas, promedio ponderado en ARS/kg vivo del Mercado Agroganadero.
- Colombia: pollo y pechuga en Bogotá/Paloquemao, media semanal de DANE SIPSA en COP/kg.
- Perú: pollo vivo mayorista, pollo eviscerado minorista y huevo rosado de Lima, PEN/kg del boletín de MIDAGRI.
- Brasil: se mantienen las referencias físicas existentes de pollo y vacuno de CEPEA.

Los precios diarios comparan las dos últimas observaciones publicadas, mostrando ambas fechas. Los semanales permanecen como contexto, sin reconstruir variaciones diarias. No se mezclan unidades ni se interpretan promedios móviles como observaciones diarias. Se excluyen fechas futuras; si una consulta falla se conserva únicamente una serie anterior de la misma identidad, unidad y frecuencia, manteniendo su fecha original.

## Presentación y persistencia

Las tablas y gráficas mantienen separados producto, mercado físico, futuros, unidad y frecuencia. El cuerpo del informe, el PDF y el CSV mantienen ocultos los nombres de los proveedores; la trazabilidad interna y los anexos conservan los metadatos.

Se amplió a 96 el límite interno de referencias documentales de los informes de proteínas. Al crear una copia se utilizan los cuatro indicadores de resumen y se preservan todas las observaciones, evitando superar el límite de indicadores del editor.

## Validación

Se verificaron las 19 referencias nuevas mediante consultas públicas reales. El corte de comprobación contiene 57 referencias totales y 21 gráficas. Las pruebas cubren extracción de precios, fechas, unidades, datos semanales, conservación ante errores, ruta del informe, copias editables, ocho países visibles y diseño entre 320 y 1440 píxeles. Se generó y revisó el PDF `output/pdf/proteinas-america.pdf`.

Para refrescar únicamente el corte público local: `node scripts/refresh-report-americas-proteins.cjs`. La actualización automática ordinaria utiliza el catálogo de proveedores desde la ruta de mercados.

## Distribución del espacio

Las tablillas utilizan todo el ancho de lectura. El resumen se sitúa encima y se adapta a una columna en pantallas pequeñas; se redujeron separaciones y rellenos conservando el tamaño de letra de los datos. En el PDF, las gráficas y las explicaciones ocupan columnas independientes para aprovechar el espacio bajo los bloques cortos. Se eliminaron frases repetidas de las leyendas conservando fechas y metodología. Los títulos permanecen junto a su contenido. El mismo corte pasó de 11 a 10 páginas, con revisión visual completa y pruebas en anchuras de 320 a 1440 píxeles.
