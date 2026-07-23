# Datos inteligentes de VALLNews

La migración `migrations/001_ai_intelligence_schema.sql` prepara MariaDB para:

1. `market_*` y `economic_*`: series numéricas verificables.
2. `knowledge_*`: documentos, fragmentos RAG y eventos.
3. `prediction_*`: pronósticos reproducibles y evaluación contra resultados reales.
4. `ai_queries` y `ai_feedback`: medición de relevancia, exactitud y utilidad.

Los precios y tasas se consultan desde las tablas de series, no desde embeddings.
Los embeddings de `knowledge_chunks.embedding` se almacenan como arreglos
`float32` en `LONGBLOB`, porque MariaDB 10.4 no incluye un tipo vectorial ni
índices ANN nativos. La búsqueda inicial puede combinar `FULLTEXT` con similitud
calculada en la aplicación.

La migración es idempotente: conserva las tablas existentes y registra su versión
en `schema_migrations`.

La migración `002_rag_quality_and_observability.sql` agrega:

- hashes y puntuaciones de calidad por fragmento;
- etiquetas temáticas y relaciones documento-etiqueta;
- cursores incrementales por fuente y trabajo;
- incidencias de calidad de datos;
- evidencia exacta utilizada por cada respuesta;
- índices compuestos para históricos, documentos, eventos y consultas;
- vistas `market_data_coverage`, `source_ingestion_health`,
  `rag_content_inventory` y `ai_quality_dashboard`.

## Carga incremental

Con el backend local iniciado, ejecutar desde la raíz del proyecto:

```powershell
npm run db:migrate
npm run ingest:data
```

El proceso actualiza observaciones existentes, agrega fechas nuevas y evita
duplicar documentos o eventos. Cada intento queda auditado en `ingestion_runs`.
Carga históricos de mercado y commodities, indicadores económicos, las páginas
temáticas propias fragmentadas para RAG y noticias/eventos de las APIs configuradas.

Variables opcionales: `VALL_API_BASE`, `DB_HOST`, `DB_PORT`, `DB_USER`,
`DB_PASSWORD` y `DB_NAME`. Los valores predeterminados usan XAMPP local y `vall_`.

## Recuperación RAG

El chat usa la estrategia `hybrid_lexical_mmr_v2`:

- expande términos financieros y económicos relacionados;
- recupera candidatos con los índices `FULLTEXT`;
- reordena por coincidencia, cobertura temática, confianza, vigencia y prioridad VALLNews;
- diversifica documentos para evitar fragmentos o noticias repetidos;
- separa series verificadas, indicadores, documentos y eventos;
- excluye noticias actuales de consultas históricas puramente cuantitativas;
- identifica cada evidencia con referencias `M`, `I`, `E` o `N`.

Las respuestas devuelven `queryId`, `evidenceCount`, `citations` y
`retrievalStrategy`. La retroalimentación autenticada se registra mediante
`POST /api/ai-feedback`, asociada únicamente a consultas del mismo usuario.

## Gráficas verificadas

Cuando el usuario solicita una gráfica, el servidor aplica una política
determinista:

- identifica activos, indicadores y periodo;
- consulta las observaciones guardadas en MariaDB;
- agrega series diarias a promedios mensuales;
- usa índice base 100 para comparar activos con escalas incompatibles;
- reemplaza cualquier gráfica del modelo por la serie verificada;
- si no existen al menos dos puntos compatibles, no grafica y lo informa.

Los históricos disponibles incluyen diez años de USD/MXN, activos de mercado,
inflación, TIIE y CETES. Para actualizar únicamente Banxico:

```powershell
node scripts/ingest-intelligence.cjs --only=banxico
```
