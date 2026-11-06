# Revisión de código antiguo — 8 de octubre de 2026

Se retiraron 18 archivos sin consumidores comprobados: 420.088 bytes de código
y estilos, de los cuales 246.632 bytes se copiaban como archivos públicos.
El criterio fue verificar referencias y entradas de ejecución, no borrar por
el nombre o el número de versión.

## Problemas corregidos

- El chat flotante anterior, su login, su loader y su conversor de banderas
  seguían incluidos en `dist/assets` aunque React y ORION ya no los cargaban.
- Geopolítica estaba redirigida a Inicio, pero conservaba una pantalla completa,
  estilos, mapa Leaflet y datos de demostración sin consumidores.
- Había siete componentes y módulos de animación de diseños anteriores que no
  eran alcanzables desde la entrada de React.
- El precargador de Finanzas mantenía cuatro versiones de CSS diferentes a las
  de la pantalla y dos capas que ya no utilizaba. Ambos consumidores usan ahora
  `frontend/src/lib/finanzasStyles.js`.
- El guard de HTML protegía `inicio.html`, un archivo eliminado. Las URLs
  antiguas redirigen a la SPA, donde se comprueba la sesión antes de montar las
  pantallas; las APIs privadas conservan su autenticación. La configuración de
  JWT sigue siendo obligatoria en el router de autenticación.
- Los enlaces HTML antiguos no funcionaban de forma consistente en producción.
  Express y React usan `shared/legacy-routes.json`, incluidos los marcadores de
  Finanzas, Mercados, Inicio y ORION. Se conservan los parámetros; React también
  conserva el fragmento cuando existe sesión.
- La ingesta de conocimiento intentaba abrir siete HTML inexistentes y fallaba
  con `ENOENT`. Ahora lee tres documentos Markdown actuales de ORION, sin
  ingerir JSX ni expresiones de código sin renderizar. Se verificó su lectura
  local; esta revisión no ejecutó la ingesta contra una base de datos.
- Las pruebas de XSS y enlaces comerciales comprobaban además el chat retirado.
  Ahora usan el renderer activo de ORION. Se eliminaron las llamadas restantes
  al loader que ya no existe y el mecanismo vacío de poda del build.

## Archivos retirados

| Grupo | Archivos |
| --- | --- |
| JavaScript público | `chat-widget.js`, `login.js`, `page-loader.js`, `flags-widget.js` |
| CSS público | `login.css`, `finanzas-map-unified.css`, `finanzas-bolsa-harmony.css` |
| Pantalla desconectada | `Geopolitica.jsx`, `Geopolitica.css`, `AcledMap.jsx`, `acledDemo.js` |
| Componentes anteriores | `DataSphere.jsx`, `ProteinGlobalOverview.jsx`, `SalaNoticiasMercados.jsx` |
| Animaciones anteriores | `animaInicio.js`, `animaLogin.js`, `fondoWebGL.js`, `usePresentationMotion.js` |

El registro local `output/auditoria-codigo/codigo-antiguo/archivos-retirados.json`
conserva las rutas, tamaños y hashes SHA-256 previos a la eliminación.

## Verificación

- Auditoría de 224 fuentes y grafo de la SPA: sin consumidores de archivos
  retirados, imports rotos, assets literales faltantes ni módulos huérfanos.
- Grafo de 76 módulos del backend, con entradas HTTP y scripts de operación:
  sin módulos huérfanos en los requires locales examinados.
- Build de producción completado; sus archivos públicos excluyen los retirados.
- ESLint completado sin errores ni advertencias al terminar la revisión.
- Seguridad HTTP y recursos: 38 comprobaciones, incluida autenticación de APIs,
  compatibilidad de enlaces y rechazo de solicitudes a motores retirados.
- XSS: 20 comprobaciones de ORION/texto enriquecido y 24 del renderer activo,
  además de dos controles positivos.
- Resiliencia de frontend, entrenamiento, validación de login y streaming: pasó.
- Investigación comercial y pruebas de proteínas: pasaron; estas últimas
  incluyen 59 casos de clasificación, precios mexicanos y las 32 entidades.
- Navegador sobre el bundle de producción: 17 comprobaciones de enlaces con y
  sin sesión, incluidas Inicio, Finanzas y ORION; sin errores JavaScript ni
  respuestas 404 de assets observadas en esas comprobaciones. Autenticación y
  proveedores se simularon; los archivos del bundle y assets fueron reales.

## Mantenimiento

`npm run audit:legacy` revisa imports y URLs literales, y deja evidencia en
`output/auditoria-codigo/codigo-antiguo/referencias.json`.
`npm run test:legacy` comprueba además documentación y estilos compartidos.
Después de compilar, `npm run test:legacy:ui` verifica las rutas en Chromium.
La compilación rechaza que reaparezcan los archivos retirados.

Se conservaron `vall-ai-page-v4.js`, los motores de Finanzas y datos, las rutas
de autenticación para Express/Vercel y ambos SDK de Gemini porque tienen
consumidores activos. Migrarlos exige adaptar sus llamadas y contratos; sus
nombres antiguos no justifican eliminarlos. La auditoría de referencias no
interpreta rutas calculadas ni valida la exactitud de proveedores externos.

Los cambios están en el proyecto local. Esta revisión no publicó un despliegue
ni modificó los datos existentes de producción.
