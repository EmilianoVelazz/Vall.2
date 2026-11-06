# ORION: precios, noticias y comercio de proteínas

ORION identifica cerdo, pollo, huevo y res por separado, conserva el país en los seguimientos y consulta las fuentes solicitadas simultáneamente. Mercolleida, Rabobank o los acuerdos comerciales ya no excluyen los precios ni las noticias de la misma pregunta.

## Conexiones y cobertura

| Fuente | Cobertura implementada | Límites |
| --- | --- | --- |
| Comisión Europea DG AGRI | JSON público de cerdo clase E, pollo entero broiler, huevo por método de cría y bovino joven AR3, por país UE | Referencias semanales con unidades originales; no precios al consumidor ni cotización mundial |
| USDA AMS LMPR | Cutout de cerdo y res Choice de EE. UU. | USD/cwt; no ganado en pie, pollo, huevo ni retail |
| Mercolleida | Tendencias y publicaciones públicas pertinentes | Las tablas y boletines completos requieren el acceso correspondiente |
| Rabobank | Knowledge Hub público y búsqueda de análisis mundiales del banco | Cobertura pública parcial; no acceso a informes exclusivos |
| GDELT / NewsAPI | Titulares y resúmenes internacionales por producto | No equivalen a lectura del artículo ni prueban acuerdos; GDELT aporta fecha de indexación |
| Búsqueda web del modelo | Complemento para otros países, fuentes nacionales y documentos de acuerdos | Depende de disponibilidad y de que el modelo devuelva evidencia de búsqueda |

Sin país se ofrecen referencias identificadas de España, Alemania, Francia, Polonia y EE. UU. Para un país concreto no se sustituye el precio por el de otro país. Cortes, peso vivo, menudeo y futuros requieren su categoría exacta; el conector no los reemplaza por canal.

La consulta conserva fecha del registro y de recuperación, etapa comercial, categoría, moneda y unidad. Noticias, precios, pronósticos y efectos inferidos se distinguen. Un precio o titular no acredita que un acuerdo esté firmado o vigente. Si faltan documentos comerciales, se conserva la tabla de precios verificados y se explica la brecha.

Los conectores usan caché de diez minutos, deduplicación de consultas simultáneas y plazos por fuente. Una fuente lenta o fallida no descarta los resultados de las demás. Los datos históricos se rotulan como última observación del periodo solicitado, sin presentarlos como promedio anual.

## Configuración

- Precios DG AGRI/LMPR y GDELT: conexiones públicas, sin nueva clave.
- `NEWSAPI_KEY`: opcional, mantiene el respaldo GDELT.
- `GEMINI_WEB_GROUNDING=false`: desactiva la búsqueda web; siguen disponibles los conectores públicos. Los países sin conector tendrán brechas explícitas.
- Bloomberg: cobertura pública recuperada por búsqueda; esta implementación no conecta Bloomberg Terminal, B-PIPE ni Data License. Un feed licenciado exige credenciales y contrato propios.

La recolección de investigación existente de BLS se corrigió: APU0000703112 = res molida, APU0000FF1101 = pechuga de pollo, APU0000708111 = huevo grande grado A por docena y APU0000FD3101 = chuletas de cerdo. Son promedios minoristas mensuales, separados de los cutout y las referencias UE. No se ejecuta entrenamiento ni se modifica evidencia ya guardada al abrir el chat.

## Preguntas de ejemplo

- «Compara los últimos precios de cerdo, pollo, huevo y res en España. Incluye categoría, moneda, unidad, fecha y enlace».
- «Dame un panorama mundial de proteínas con noticias internacionales, tendencias públicas de Mercolleida y perspectivas de Rabobank. Distingue datos de pronósticos».
- «¿Qué acuerdos o permisos sanitarios entre México y Estados Unidos afectan al cerdo en 2026? Cita documentos oficiales y su entrada en vigor».
- Seguimiento: «¿Y el huevo en México?». Cambia producto y país, sin reutilizar la cotización europea del cerdo.

## Validación

`node scripts/test-protein-intelligence.cjs` comprueba productos, países, unidades, periodos, etiquetado de BLS, fallos y tiempos de espera, conservación de fuentes y ambas rutas del chat. También forma parte de `npm run test:ai`.

Documentación primaria: [DG AGRI](https://agridata.ec.europa.eu/extensions/API_Documentation/GeneralInfo.html), [USDA LMPR](https://mpr.datamart.ams.usda.gov/), [BLS Average Price Data](https://www.bls.gov/cpi/factsheets/average-prices.htm), [Rabobank animal protein](https://www.rabobank.com/knowledge/animal-protein), [GDELT DOC API](https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/).
