# Depuración de código — 22 de octubre de 2026

## Resultado

Se revisaron fuentes activas, imports, recursos públicos, versiones instaladas, archivos repetidos, ciclo de vida de consultas y contenido que puede terminar en despliegues. La revisión final de ESLint abarcó 527 archivos, sin errores ni avisos. El grafo de referencias revisó 340 fuentes y no encontró imports locales rotos, assets literales ausentes ni módulos huérfanos del frontend o backend dentro de su alcance.

No se retiraron módulos activos por llevar un sufijo de versión. No se borraron informes de usuarios, fuentes de datos, entregables, configuración privada ni cambios anteriores de informes y diseño.

## Correcciones

### Versiones compartidas de gráficas

Mercados cargaba Lightweight Charts 4.2.0 desde un CDN mientras Finanzas usaba la copia local 4.2.2. Ahora ambos consumen la misma URL local, definida en `hojasComunes.js`. También se unificaron Chart.js (`?v=1` frente a `?v=2`) y el mapa mundial (`?v=1` frente a `?v=2`). Esto evita descargas y ejecuciones repetidas al navegar entre módulos.

El cargador compartido ya no considera listo un script solo porque existe su etiqueta: espera su evento de carga. Si ORION ya está cargando Chart.js, Finanzas comparte ese elemento. El cargador de Chart.js de ORION ahora permite reintentar tras un fallo, en lugar de conservar una promesa rechazada indefinidamente.

### Consultas y temporizadores

Mercados y Proteínas podían completar su carga inicial después del desmontaje y crear entonces un intervalo que el cierre anterior no había podido cancelar. Ahora utilizan `startPolling`: inicia una consulta, espera a que termine y solo entonces programa la siguiente. Al salir deja de programar trabajo, incluso si una consulta anterior termina después.

El componente histórico `MktChart` cancela su petición con `AbortController` al cambiar de instrumento o salir. Conserva la liberación de la gráfica y del `ResizeObserver`. Las pruebas verifican que una respuesta tardía no cree otra gráfica ni cambie el estado de la vista cerrada.

### Dependencias de producción

Playwright solo aparece en herramientas de pruebas y verificación. Se movió de `dependencies` a `devDependencies`; ya no figura en el árbol de producción. Se conservaron los dos SDK de Google y las instalaciones de PDF.js de backend y frontend porque tienen consumidores activos diferentes.

`npm ls --all` no reportó dependencias inválidas ni faltantes. El inventario encontró 24 nombres de dependencias transitivas con más de una versión en raíz y ninguno en frontend. La coexistencia responde a árboles y rangos distintos; no se forzaron versiones mayores incompatibles para conseguir artificialmente una sola versión.

### Archivos temporales y herramientas

Se eliminó únicamente la copia desechable `output/perfiles-release-20261021`, creada para una compilación aislada: 973 archivos, 61.931.788 bytes (59,06 MiB). Primero se comprobaron sus rutas y los destinos de sus dos junctions; se retiraron esos enlaces sin recorrerlos. Se verificó después que las dependencias reales de Express y Vite seguían presentes.

Se excluyó `output/` completo del lint y de nuevas incorporaciones a Git, conservando los archivos ya versionados. Los resultados, registros y copias temporales no deben analizarse como código de producción. Se ampliaron las exclusiones de Docker y se añadió `.vercelignore` para temporales, entorno Python, material de diseño y archivos privados locales. Los archivos de bloqueo temporal de Office también quedan excluidos.

El inventario de duplicados por tamaño y SHA-256 no encontró archivos de proyecto repetidos de al menos 4 KiB, excluyendo compilaciones, dependencias, outputs y temporales. Esto no constituye un análisis de similitud semántica de funciones.

## Validación

- ESLint final: 527 archivos, cero errores y cero avisos.
- `audit-legacy.mjs`: 340 fuentes, 19 rutas/archivos retirados protegidos contra reaparición y ninguna referencia rota o módulo huérfano detectado.
- Pruebas de migración: documentación, alias de rutas y precarga de estilos correctos.
- `test-runtime-cleanup.mjs`: salida durante carga, recuperación tras error, ausencia de solapamientos, cancelación de fetch, destrucción de gráfica/observer, carga compartida y reintento de biblioteca correctos.
- `test-frontend-resilience.mjs`: sesiones, respuestas inválidas, plazos, cancelación y scripts compartidos correctos.
- `test-security-http.cjs`: 39 comprobaciones correctas.
- `test-profile-access.cjs`: cuatro cuentas ficticias, permisos, aislamiento y cambio de credenciales correctos; no modifica cuentas reales.
- `test-report-request.mjs`: plazos de conexión y cuerpo, cancelación y respuestas incompletas correctos.
- Build completo correcto. Mantiene advertencias de tamaño de algunos bundles; no se presenta como una optimización completa del peso de la aplicación.
- Navegador autenticado: Inicio → Mercados → análisis de Granos → Finanzas → Bolsa. Gráficas visibles; una copia de Chart.js, Lightweight Charts y mapa mundial en el DOM. Sin mensajes de SyntaxError, ReferenceError o TypeError en la inspección realizada.
- Página local y API a través de Vite: HTTP 200 al finalizar.

Un verificador de UI antiguo no admite `--help` y trató de iniciar un navegador; no llegó a ejecutarse por una restricción de procesos. No se cuenta como prueba aprobada. La comprobación visual se realizó en el navegador integrado.

## Comandos para repetir

`npm run audit:code` combina lint, revisión de referencias y las pruebas de ciclo de vida/resiliencia. `npm run audit:dependencies` consulta vulnerabilidades conocidas de ambos árboles. `node scripts/audit-cleanup.cjs` genera un inventario de solo lectura y no borra archivos.

Evidencias locales: `output/depuracion-eslint-final-2026-10-22.json`, `output/depuracion-limpieza-2026-10-22.json`, `output/depuracion-dependencias-raiz-2026-10-22.json`, `output/depuracion-dependencias-frontend-2026-10-22.json`, `output/depuracion-produccion-2026-10-22.json`, `output/depuracion-seguridad-2026-10-22.log` y `output/build-depuracion-2026-10-22.log`.

## Límites para crecimiento futuro

Esta revisión no equivale a una prueba de carga con usuarios concurrentes. Los límites y cachés en memoria siguen siendo por proceso; para varias instancias deben coordinarse con un almacén compartido. La generación intensiva de informes se beneficiaría de trabajadores y una cola persistente. También siguen pendientes la revocación centralizada por sesión y la reducción de los bundles de mayor tamaño.

Las correcciones están en local y no se publicaron en Vercel durante esta depuración.
