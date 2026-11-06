# Diagnóstico del botón de descarga

Se probó el botón visible «Descargar PDF» en el frontend compilado, con un navegador limpio, una sesión local de prueba y la ruta real `/api/report-export`. Se usaron los catálogos locales preservados. No se sustituyó la generación de PDF por una respuesta sintética; sólo la autenticación y los endpoints auxiliares de cuenta se aislaron. No hubo correo ni escrituras remotas.

Las seis descargas completaron con HTTP 200, tipo PDF y firma `%PDF-`: Bolsa, Bonos, Divisas y Panorama de Finanzas, Granos y Proteínas de México. El archivo más grande, Panorama, tardó aproximadamente quince segundos. La consola no registró errores de página. Resultados: `output/download-button-20261030/results.json`. Repetición: `node scripts/test-report-download-button.cjs`, después de compilar el frontend.

También se comprobó la localización al español con el proveedor de traducción deshabilitado: los catorce informes actuales normalizados no exigieron una llamada a IA para esa descarga.

El proyecto Vercel identificado por el README (`pruebasvall/vallpruebas`) tiene como despliegue de producción el commit `8d61eeb8d0f85ba1e84b7a11a2af4f10e3906f56`, del 27 de octubre. Las correcciones locales posteriores no están en ese commit. Esto demuestra que son versiones distintas; no identifica por sí solo la causa del fallo del usuario. La consulta de logs de los últimos treinta minutos no devolvió coincidencias para `report-export`; la consulta de una hora excedió la retención admitida por el servicio y no se interpreta como ausencia de errores.

La navegación de lectura a `https://vallpruebas.vercel.app/informes` redirigió a login; no había sesión de usuario disponible en ese navegador. No se accedió a credenciales, no se inició sesión, no se cambió la configuración y no se desplegó el proyecto.

Falta confirmar la URL donde ocurre el fallo y el comportamiento o mensaje exacto del botón. No se declara corregida una falla que todavía no se ha reproducido en ese entorno. Se añadió una prueba del botón y del archivo real, sin modificar el comportamiento de producción por conjetura.
