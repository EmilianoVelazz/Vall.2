# Estructura e imágenes — 22 de octubre de 2026

## Cambios realizados

Se retiró la duplicación de compilados: Vite genera directamente `dist/` en la raíz y `build-dist.mjs` completa esa misma salida con los recursos clásicos. Se eliminó `frontend/dist/` después de verificar la compilación nueva: 47 archivos, 4.952.565 bytes. Trece verificadores de interfaz se actualizaron para consumir `dist/`.

Los dos paquetes npm se conservan porque representan responsabilidades distintas: servidor/herramientas en la raíz e interfaz en `frontend/`. Sus lockfiles y dependencias no son dos versiones de la aplicación. Las copias de recursos dentro de `dist/assets/` son artefactos de despliegue, no fuentes que deban editarse.

Las referencias de diseño se conservaron en `docs/referencias/linear-design/` y `docs/referencias/tusitio-design/`, fuera del código publicado. Docker y Vercel las excluyen. Se retiró la carpeta raíz `mercados/`, que estaba vacía; la página activa permanece en `frontend/src/pages/Mercados.jsx`.

## Imágenes

Se revisaron las rutas literales de la aplicación y los nombres utilizados en catálogos, estilos y rutas de archivos. Se retiraron siete imágenes sin referencias activas encontradas, de secciones o diseños anteriores:

- `geo.webp`
- `logo2.png`
- `mexico-productivo.png`
- `mexico.webp`
- `mexico2.webp`
- `robot.svg`
- `vall-ai-mascot.svg`

Suman 1.078.713 bytes. Antes de retirarlas se creó `output/imagenes-retiradas-20261022.zip`, fuera de los recursos públicos. `output/imagenes-retiradas-20261022.json` registra sus rutas, tamaños y SHA-256. No se borraron imágenes de informes guardados ni capturas personales.

Se reorganizaron seis imágenes activas, conservando exactamente sus bytes:

| Antes | Ahora |
| --- | --- |
| `assets/img/logo1.png` | `assets/img/brand/logo.png` |
| `assets/img/finanzas.webp` | `assets/img/fallback/finanzas.webp` |
| `assets/img/mercadoP.webp` | `assets/img/fallback/ganaderia.webp` |
| `assets/img/mercados.webp` | `assets/img/fallback/materias-primas.webp` |
| `assets/img/bolsa-mexico-centro-bursatil.jpg` | `assets/img/mexico/centro-bursatil.jpg` |
| `assets/img/mexico-productivo-campo.jpg` | `assets/img/mexico/campo.jpg` |

Se actualizaron cabecera, pie, acceso, México, noticias, fotografías de respaldo, icono de la pestaña y sus pruebas. Se mantienen las carpetas `finance/`, `markets/` y `space/`, además de la marca de agua de `assets/templates/`.

## Controles para mantener el orden

`npm run audit:assets` inventaría imágenes de `assets/img/` y `assets/templates/`, busca consumidores en fuentes activas, comprueba URLs locales y calcula SHA-256. El build lo ejecuta antes de publicar. Rechaza imágenes sin referencias detectadas, copias idénticas y rutas literales ausentes. La revisión es estática: no prueba referencias guardadas en servicios externos ni deduce todas las rutas calculadas posibles.

`npm run test:structure` comprueba la salida única y utiliza fixtures aislados para demostrar que el auditor rechaza imágenes sobrantes, repetidas y enlaces rotos. Después de compilar puede ejecutarse `node scripts/test-project-structure.mjs --built` para revisar el resultado publicado y la ausencia de la salida antigua.

La guía principal y los README de `frontend/`, `assets/` y `scripts/` describen qué se mantiene en cada carpeta. Los resultados y respaldos quedan en `output/`, excluido de publicación.

## Validación

- Compilación completa correcta, generada únicamente en `dist/`.
- 530 archivos revisados por ESLint: cero errores y cero avisos.
- 15 imágenes activas revisadas: sin copias idénticas ni rutas rotas detectadas.
- Las 15 imágenes responden HTTP 200 desde el proyecto local; su contenido coincide con los SHA-256 de los originales.
- Pruebas de estructura, fotografías de noticias, clasificación de noticias, carga de bibliotecas, ciclo de vida y migración de rutas correctas.
- Prueba visual en Finanzas y México: logotipo, icono de la pestaña, fotografías y navegación operativos.

Evidencias: `output/auditoria-imagenes.json`, `output/imagenes-http-20261022.json`, `output/imagenes-reorganizadas-20261022.json`, `output/compilacion-unica-20261022.json`, `output/estructura-eslint-final-2026-10-22.json` y `output/build-estructura-2026-10-22.log`.

Los cambios están en local. No se publicaron en Vercel durante esta reorganización.
