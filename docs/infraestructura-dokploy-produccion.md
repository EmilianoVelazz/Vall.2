# Infraestructura de Producción en Dokploy · VALLNews

Guía operativa para desplegar la topología **Web + Worker**, aplicar las migraciones vectoriales `023` y `024` sobre el PostgreSQL de Dokploy (`pgvector/pgvector:0.8.7-pg17`) y configurar el monitoreo continuo.

---

## 1. Topología recomendada (`docker-compose.dokploy.yml`)

El archivo [`docker-compose.dokploy.yml`](../docker-compose.dokploy.yml) separa el servicio en dos contenedores usando la misma imagen de [`Dockerfile`](../Dockerfile):

| Servicio | `RUN_BACKGROUND_JOBS` | Función | Puerto expuesto |
| --- | --- | --- | --- |
| `vallnews-web` | `false` | Sirve SPA React, API `/api/*`, ORION y exportaciones Word/PDF sin interferencia de crons. | `3101` (vía Traefik) |
| `vallnews-worker` | `true` | Ejecuta warmers (commodities, SNIIM, noticias), cortes diarios de informes, envíos programados y ciclo ML. | Ninguno (interno) |

Ambos comparten los volúmenes persistentes `vallnews_cache` (`/app/backend/cache`) y `vallnews_generated_reports` (`/app/backend/generated-reports`), de modo que los informes y pronósticos ML generados por el worker quedan visibles de inmediato en `vallnews-web`.

### Variables recomendadas en Dokploy (Environment)

- `TRUST_PROXY=1` (para que el rate limiter lea la IP real tras Traefik).
- `MARIADB_ENABLED=false` (evita intentos de conexión a `127.0.0.1:3306` si no usas MariaDB).
- `GEMINI_API_KEY` con facturación/cuota activa (evita `429` en picos de ORION).
- `INEGI_TOKEN` para series macroeconómicas directas del INEGI en informes de México.
- `SUPABASE_URL=https://vallnews.com/_data` y `SUPABASE_SERVICE_ROLE_KEY` (PostgREST interno de Dokploy).
- `CRON_SECRET`, `JWT_SECRET` y credenciales SMTP existentes.

---

## 2. Aplicar migraciones `023` y `024` en `vallnews-postgres`

El diagnóstico actual confirma que `vallnews-postgres` ya corre `pgvector/pgvector:0.8.7-pg17`, pero las tablas `orion_knowledge_vectors` y `orion_feedback_events` aún no existen en producción (PostgREST devuelve `404`).

Como `vallnews-postgres` no expone puerto público, aplica ambas migraciones desde la terminal del servidor Dokploy (o consola del contenedor):

### Paso A · Verificar roles existentes (solo lectura)
```bash
docker exec -i vallnews-postgres psql -U vallnews_owner -d vallnews -c \
  "SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role');"
```

### Paso B · Aplicar migraciones `023` y `024`
Desde el directorio del repositorio en el servidor (o copiando ambos `.sql`):
```bash
docker exec -i vallnews-postgres psql -v ON_ERROR_STOP=1 -U vallnews_owner -d vallnews \
  < backend/db/migrations/023_vector_knowledge_and_ml_store.sql

docker exec -i vallnews-postgres psql -v ON_ERROR_STOP=1 -U vallnews_owner -d vallnews \
  < backend/db/migrations/024_public_knowledge_policy.sql
```

### Paso C · Recargar esquema de PostgREST
```bash
docker exec -i vallnews-postgres psql -U vallnews_owner -d vallnews -c \
  "NOTIFY pgrst, 'reload schema';"
```

### Paso D · Indexar conocimiento inicial y verificar
Desde el contenedor `vallnews-worker` (o localmente con acceso a `https://vallnews.com/_data`):
```bash
npm run index:knowledge
npm run check:orion:storage
```

---

## 3. Monitoreo externo (Uptime Kuma / Dokploy)

El backend expone `GET /api/health` (exento de rate limit y con `Cache-Control: no-store`):

| Modo | URL | Uso |
| --- | --- | --- |
| Liveness Docker | `http://127.0.0.1:3101/api/health` | `HEALTHCHECK` del contenedor (siempre `< 20 ms`, HTTP `200`). |
| Alerta externa | `https://vallnews.com/api/health?deep=1&strict=1` | Uptime Kuma cada 5 min: valida frescura de los 3 informes (`<= 26h`), artefacto ML y conectividad real a PostgREST; devuelve HTTP `503` si algún chequeo entra en `degraded`. |

Configuración sugerida en Uptime Kuma:
- **Tipo**: HTTP(s) - JSON Query (o Keyword)
- **URL**: `https://vallnews.com/api/health?deep=1&strict=1`
- **Intervalo**: `300` segundos (5 min)
- **Código esperado**: `200`
- **Keyword opcional**: `"status":"ok"`

---

## 4. Respaldos fuera del servidor (pendiente operativo)

Configurar en Dokploy → **Destinations** un bucket externo (Cloudflare R2, Backblaze B2 o AWS S3) con copia diaria programada de:
1. Base `vallnews` (`pg_dump` automático de Dokploy).
2. Volúmenes `vallnews_cache` y `vallnews_generated_reports`.
