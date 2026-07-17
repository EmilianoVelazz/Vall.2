# Notas del baseline de contratos (verify-contracts.mjs)

El baseline en `.contract-baseline.json` se capturó el 2026-07-03 antes del
refactor de Fase 1. La mayoría de endpoints se capturaron con respuestas
reales, con estas **salvedades pendientes**:

## Pendientes de re-baseline (cuota de Alpha Vantage)

Durante las pruebas de Fase 1 se agotó la cuota diaria de Alpha Vantage
(25 req/día, plan gratuito). Por eso:

- **`alphavantage-news`** — baseline capturado EN VIVO (200, feed real), pero
  no re-verificable el mismo día (pasó a 502 por rate-limit). El contrato de su
  ruta feliz quedó registrado; falta re-confirmar `check` cuando la cuota se
  reinicie.
- **`commodity`** — baseline capturado desde CACHÉ EN DISCO
  (`backend/cache/commodity-cache.json`), no desde una llamada viva. La forma es
  real, pero conviene re-capturar el baseline con una respuesta fresca.

### Acción: mañana (cuota reiniciada)

```
node scripts/verify-contracts.mjs baseline   # re-captura commodity + AV en vivo
node scripts/verify-contracts.mjs check       # confirma que siguen sin romper contrato
```

Ninguna de estas dos rutas fue modificada por el refactor de Fase 1
(sus routers quedaron intactos), así que el riesgo de ruptura es nulo; esto es
solo para cerrar la verificación con datos frescos.

## Otros endpoints con upstream no disponible en las pruebas

- **`banxico`** — token inválido en `.env` (lo regenera el owner). Devuelve 502
  de forma estable; su circuit breaker lo gestiona.
- **`bmv-market`** — depende del spawn de Python (yfinance); a veces hace
  timeout en frío. Fuera del alcance de Fase 1.
