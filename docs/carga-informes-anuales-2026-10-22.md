# Carga de la librería anual · 22 de octubre de 2026

Se corrigió la entrega de las 56 ediciones de 2022–2025 (14 informes por año).

## Causas encontradas

- La caché de `backend/cache` no se incluye en un despliegue limpio. Al faltar, una consulta iniciaba la reconstrucción completa desde proveedores externos antes de responder.
- La pantalla admitía esperas de tres minutos. Las fallas transitorias requerían intervención manual.
- Una falla al escribir la caché descartaba la entrega de informes ya preparados y validados.
- La validación no rechazaba todas las ediciones duplicadas, sin fecha o sin cobertura que podían romper la pantalla.

## Cambios

La edición histórica existente se incluye en `backend/data/annual-report-library.json`, con sus cifras, fechas, fuentes y limitaciones originales. No se reconstruyeron datos ni se rellenaron periodos ausentes. Vercel ya incluye esa carpeta y Docker copia `backend`; el build comprueba que el archivo contenga los cuatro años completos.

La API autenticada lee memoria, caché válida o la edición incluida. Una lectura HTTP nunca inicia la importación histórica masiva. Si no hay ninguna edición válida, devuelve 503 y un mensaje recuperable. Conserva `Cache-Control: private, no-store` y comunica la identidad de la sesión para la localización y exportación.

La generación explícita conserva el resultado válido en memoria aunque no pueda escribir al disco. Un refresco fallido conserva la última edición en memoria.

La pantalla permite hasta tres intentos ante problemas transitorios, con nueve segundos por intento y un límite total de treinta segundos que también abarca la lectura del cuerpo. No reintenta automáticamente errores de sesión, permisos, cambio de cuenta o límite de solicitudes. Mantiene el botón manual de recuperación y recupera cargas fallidas al volver la conexión o el foco.

Cambiar de año cancela la consulta anterior y descarta sus respuestas tardías. Las ediciones cargadas se conservan en memoria del componente; la sección oculta cancela su carga. Las exportaciones pendientes se cancelan al cambiar de edición, familia, idioma, cuenta o sección.

## Validación

- `npm run test:reports:annual`: pruebas sin proveedores remotos de arranque sin caché, caché corrupta/incompleta/duplicada, disco sin escritura, refresco fallido, HTTP autenticado para los cuatro años, sesión inválida, año inválido, 503, reintentos, tiempo límite, cancelación y selección rápida de años. Comprueba también periodos, tablas, gráficas, datos CSV y preparación del contenido para PDF en las 56 ediciones.
- Navegador local: apertura de las 56 ediciones, con título/año correcto y gráficas; sin alertas de carga.
- Navegador local: anexos de proteínas 2025 con fuentes, tablas y metodología; descarga efectiva del PDF `vallnews-markets-proteins-anual-2025.pdf`.
- Anchos de 390 y 768 píxeles: sin desbordamiento horizontal de la página.
- Evidencia: `output/annual-loading-20261022/ui-checks.json`, `output/annual-loading-20261022/libreria-anual.png`, `output/annual-tests-20261022.log` y `output/annual-build-20261022.log`.

## Mantenimiento

Para reconstruir con datos históricos conservados: `node scripts/build-annual-report-library.cjs`.
Para actualizar proveedores y publicar deliberadamente una nueva edición incluida: `node --use-system-ca scripts/build-annual-report-library.cjs --refresh --bundle`. Este proceso realiza consultas externas y debe ejecutarse como tarea de mantenimiento, nunca al abrir la librería. Revisar cobertura y auditoría antes de desplegar.

Cambios locales. No se desplegó ni se modificaron registros de Supabase. Los envíos programados permanecen desactivados.
