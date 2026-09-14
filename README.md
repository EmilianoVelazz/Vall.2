# VALLNews

Plataforma de inteligencia económica y financiera: finanzas, mercados de
insumos, geopolítica, México y un asistente de análisis (VALL-AI).

## Arrancar

```bash
npm install
cd frontend && npm install && cd ..
npm run dev
```

`scripts/dev.mjs` levanta las dos piezas a la vez:

| Puerto | Qué | |
|---|---|---|
| **5273** | Vite + React | **es el que se abre** |
| 3101 | Express | sirve `/api`; Vite le hace proxy |

Abre siempre **http://localhost:5273**. Si entras al 3101 te redirige a la SPA.

No son el 5173 y el 3001 de siempre a propósito: el 5173 lo toma cualquier otro
proyecto con Vite de la máquina, y con dos abiertos a la vez uno acababa
sirviendo la app equivocada. Para moverlos, sin editar nada:

```powershell
$env:VN_API_PORT=3102; $env:VN_WEB_PORT=5274; npm run dev
```

Hace falta `backend/.env`; parte de `backend/.env.example`. Sin `JWT_SECRET` el
servidor no arranca, a propósito.

## Cómo está organizado

```
frontend/          SPA de React (Vite + React Router). Las 9 rutas.
  src/pages/         una por sección, con su .css
  src/lib/           hooks y utilidades compartidas
backend/           API en Express
  routes/            un archivo por familia de endpoints
  ai/                orquestación de VALL-AI
assets/            CSS, JS heredado e imágenes que el frontend carga en runtime
scripts/           herramientas: arranque, build y verificadores
```

**`assets/` no es código muerto.** Los `.jsx` no incluyen ni el CSS de las
secciones ni los motores de datos (`finanzas-page.js`, `finanzas-favro.js`,
`live-engine.js`, `data-service.js`): se cargan desde `/assets` al montar. Por
eso el build lo copia a `dist/`.

## Dos cosas que conviene saber antes de tocar nada

**El CSS depende del orden.** Las hojas heredadas van *antes* que el CSS propio
de cada página, para que este último gane. De eso se encarga
`lib/usePageStyles.js`, que las inserta antes del bundle en lugar de añadirlas
al final. Las hojas comunes están en `lib/hojasComunes.js`: no las copies en
cada página o las versiones se desincronizan.

**Los ids son un contrato.** Varias secciones (Finanzas sobre todo) las pinta
JavaScript heredado que escribe por `getElementById`. Renombrar un id en el JSX
deja su recuadro congelado en el texto inicial **sin dar ningún error**.

## Verificar antes de dar algo por bueno

```bash
node scripts/verify-page.mjs /finanzas /inicio     # renderizado y codificación
node scripts/verify-finanzas.mjs                   # recorrido funcional completo
node scripts/verify-dark.mjs                       # modo oscuro, contraste incluido
```

`verify-page` marca **FALLA con cualquier error de consola**, y hoy varias
fuentes externas dan 404 o limitan por ritmo. Compara las cifras (texto, canvas,
mojibake), no el veredicto.

## Publicar

```bash
node scripts/build-dist.mjs      # compila React y arma dist/
```

Vercel sirve `dist/` y enruta solo `/api` al Express.

## Tema oscuro

Hay dos mecanismos, y no son lo mismo:

- **Piloto por clase** (`dark-pilot.css`): Inicio y Finanzas, siempre activo.
- **Global por atributo** (`dark-theme.css`): todo el sitio, se enciende en
  Configuración → Apariencia. Ese archivo **se genera**:
  `node scripts/build-dark-theme.mjs`. No lo edites a mano.
