# Daily News de Finanzas

El informe diario ahora tiene un formato propio: edición y corte, mapa de canales financieros, noticias por tema y tarjetas con el hecho publicado, sus posibles repercusiones, qué vigilar y el enlace de origen. La vista permite filtrar tema, buscar título/fuente y limpiar filtros. Las descargas conservan toda la selección. No se duplican titulares en una tabla visible ni se presentan conteos editoriales como gráficas de impacto.

La selección admite hasta doce publicaciones con fecha del mismo día del corte en Ciudad de México. Rechaza fechas ausentes, posteriores al corte y de días anteriores, enlaces inseguros, formatos sin hecho financiero y duplicados por enlace/título. También reconoce actualizaciones casi iguales del mismo medio. Se limita a dos notas por medio y se busca cobertura temática antes de completar por relevancia; no se fabrican noticias para llenar cupos.

La recuperación combina RSS institucionales (Fed, BCE, Banco de Japón, OMC y EIA cuando publican contenido vigente), fuentes directas de El País/Economía y CNBC, los proveedores ya conectados y búsquedas públicas financieras en español. Si Google News no responde, se consulta Bing sin relajar TLS. Los agregadores no se presentan como autores. El informe incluye el material disponible; no promete cobertura total de cada región o categoría todos los días.

La edición en español usa un proveedor aislado para noticias, con `GEMINI_MODEL_NEWS` opcional y respaldo independiente de los modelos del chat. Se conservan identidad, fecha y fuente. El control editorial rechaza magnitudes/unidades añadidas. Si el servicio no puede traducir, se conserva el original identificado. Las repercusiones se derivan del tipo de noticia y distinguen expectativas, resultados, inflación, empleo, crédito soberano, energía y medidas comerciales.

Al consultar Finanzas, los cortes anteriores al nuevo esquema o a otro día se actualizan. Se reutiliza durante veinte minutos una edición del día, o cinco minutos cuando no respondieron las fuentes. Las consultas simultáneas comparten la actualización. No se conserva automáticamente un titular de ayer bajo el corte de hoy. La fecha original sigue visible. Una actualización de noticias no cambia los datos de Bolsa, Bonos o Divisas ni reactiva envíos.

`financialNews` conserva la evidencia canónica en borradores, guardado privado y exportación. El PDF usa tipografía legible y paleta azul/gris; CSV, Excel y texto conservan todos los artículos de la selección. Los anexos explican método y procedencia. Panorama integra también las repercusiones y seguimiento de estas notas, deduplicando con las noticias de Mercados.

Se corrigió además la reapertura en disco de ediciones privadas grandes de Panorama, manteniendo el límite menor para otros informes.

Validaciones: `npm run test:reports:news`, `npm run test:reports:panorama`, fuentes públicas, formato Bonos/Divisas y guardado privado; compilación y ESLint. El corte real revisado del 28 de octubre contiene siete notas en español de cinco medios, distribuidas en seis temas. El PDF de prueba tiene tres páginas y siete enlaces. Se revisaron todas sus páginas, texto dentro del área imprimible, vista de escritorio/móvil, filtros, descarga HTTP autenticada y lectura del endpoint autenticado. La copia quedó activa en el servidor local; el respaldo en Supabase no confirmó escritura y se conservó en disco. Los envíos automáticos permanecen desactivados.

Archivos de verificación: `output/daily-news-20261028/`. PDF de muestra: `output/pdf/daily-news-finanzas-2026-10-28.pdf`.
