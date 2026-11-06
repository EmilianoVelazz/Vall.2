# Exportaciones y títulos de PDF — 5 de noviembre de 2026

## Identificación de los documentos

Los informes actuales, la librería anual y el historial comparten una misma función de nombres. Incluyen marca, familia, nombre del informe, edición y fecha de corte o año. Los datos llevan además el sufijo `Datos`.

Ejemplos:

- `VALLNews-Finanzas-Bolsa-Diario-2026-11-05.pdf`
- `VALLNews-Mercados-Granos-y-forrajes-Semanal-2026-11-05.pdf`
- `VALLNews-Mexico-Produccion-estatal-granos-y-mineria-Anual-2024.pdf`

Los 14 informes base tienen nombres distintos, incluidos los tres panoramas. Las ediciones personales conservan su título. La fecha diaria corresponde al corte en Ciudad de México, no al día de descarga ni a la fecha UTC. Las ediciones anuales usan su año de estudio. La etiqueta diaria o semanal identifica el periodo de análisis; no se deduce de la frecuencia con la que se publica un informe.

El título interno del PDF incluye también familia, edición y fecha. Se activa la preferencia para mostrarlo en la barra del visor. La actualización conserva páginas, tablas, gráficas y enlaces; no cambia las observaciones. Se incrementó la versión de presentación para descartar vistas previas anteriores.

## Correcciones adicionales

- Un informe estructurado con tablas o gráficas ya no se rechaza como vacío por carecer de resumen escrito. El contenido de las exportaciones se reconstruye a partir del informe normalizado. Un PDF sin datos publicados continúa siendo rechazado.
- La normalización de los informes base de México conserva su identidad: ya no los marca automáticamente como ediciones personales. Esto evita diferencias entre el nombre descargado por el navegador y el título interno del servidor.
- La librería y el historial comprueban la cuenta antes de descargar, también en los CSV creados localmente. Se evita iniciar una segunda descarga simultánea y se cancela la operación si cambia la cuenta o el idioma.

## Validación

- 75 ediciones revisadas: 14 actuales, cuatro semanales, 56 anuales de 2022–2025 y una edición personal creada con el flujo real del editor.
- 156 archivos verificados: 75 PDF, 75 CSV y seis Excel de Granos. Las comprobaciones HTTP incluyen estado, tamaño, tipo, idioma, nombre, privacidad de caché e integridad del archivo. Los PDF se abren y conservan su título y páginas; los CSV coinciden con los datos normalizados completos y mantienen su BOM; los Excel se abren como archivos válidos con sus hojas y sin fórmulas implícitas.
- La matriz HTTP verificó primero las 74 ediciones estándar. La edición personal se completó usando `createReportDraft`, después de corregir la estructura del dato de prueba. Los artefactos se consolidaron y volvieron a verificar sin repetir las exportaciones ya aprobadas.
- 24 descargas desde el navegador compilado: diez informes actuales y 14 descargas PDF/CSV de la librería y el historial. Sin errores de JavaScript. Un cambio de cuenta bloqueó correctamente el CSV local.
- Los tres panoramas conservaron capítulos, señales, tablas, Excel y enlaces PDF hacia sus capítulos, en ediciones diarias y semanales.
- Se verificaron el rechazo sin sesión, el cambio de cuenta y el límite de exportaciones. Los envíos de correo permanecieron desactivados.
- Aprobadas las regresiones de nombres, exportación, datos de México, entradas inválidas y librería anual. Compilación de producción y análisis estático aprobados; continúan los avisos previos de tamaño de paquetes de Vite.

Evidencias: `output/exportaciones-20261105/validation.json`, `output/archive-downloads-20261105/validation.json`, `output/download-button-20261030/results.json`, `output/export-panoramas-run.log` y los registros de compilación y ESLint de esta revisión. También se inspeccionaron páginas PDF renderizadas.

Las pruebas utilizan datos guardados e identidades simuladas. No verifican la conexión remota pendiente de Supabase, no envían correos y no modifican la base de datos real. No se realizó publicación ni envío a Git.
