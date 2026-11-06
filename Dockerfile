# VALLNews para Dokploy (o cualquier host Docker): un solo proceso Express
# que sirve la API, /assets y la SPA de React compilada en dist/.
# Vercel no usa este archivo; sigue con vercel.json.

ARG NODE_IMAGE=node:22.23.4-bookworm-slim

# ── Dependencias de producción de la raíz ─────────────────────────────────────
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
# Puppeteer (devDependency) y Playwright solo los usan las pruebas de UI; la
# imagen no lleva navegadores.
ENV PUPPETEER_SKIP_DOWNLOAD=1 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    npm_config_update_notifier=false
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# ── Compilación de la SPA ─────────────────────────────────────────────────────
FROM deps AS build
COPY frontend/package.json frontend/package-lock.json frontend/
RUN npm ci --prefix frontend --include=dev --no-audit --no-fund
COPY . .
RUN node scripts/build-dist.mjs

# ── Runtime ───────────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    PORT=3101 \
    npm_config_update_notifier=false
WORKDIR /app

COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node backend ./backend
COPY --chown=node:node shared ./shared
COPY --chown=node:node assets ./assets
COPY --chown=node:node api ./api
COPY --chown=node:node scripts ./scripts
# El backend importa módulos ESM de frontend/src/lib; package.json declara
# "type": "module" para que Node los cargue como tales.
COPY --chown=node:node frontend/package.json ./frontend/package.json
COPY --chown=node:node frontend/src/lib ./frontend/src/lib
# Fuentes de conocimiento que lee el ciclo de entrenamiento de Loopus.
COPY --chown=node:node docs ./docs
COPY --chown=node:node boveda_obsidian ./boveda_obsidian
COPY --from=build --chown=node:node /app/dist ./dist

# Directorios que Dokploy debe montar como volúmenes persistentes.
RUN mkdir -p backend/cache backend/generated-reports \
    && chown -R node:node backend/cache backend/generated-reports

USER node
EXPOSE 3101

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3101)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "backend/server.js"]
