# Mejoras aplicadas al centro de informes · 22 de octubre de 2026

Cambios locales posteriores a `revision-informes-2026-10-22.md`. No se publicó un despliegue ni se modificaron las cotizaciones originales.

## Disponibilidad y recuperación

- La etiqueta de disponibilidad evalúa fechas reales y frecuencia de publicación. Diferencia datos recientes, antiguos, conservados, parciales, sin fecha comprobable y ediciones históricas. Una métrica con el número cero ya no basta para declarar «Actualizado».
- Las proyecciones repetidas no convierten una referencia semanal en diaria. Se excluyen observaciones futuras o posteriores al corte. Los fines de semana no añaden sesiones hábiles. Las fechas siguen visibles: no se incorporó un calendario completo de festivos de cada bolsa.
- Un fallo temporal en la preparación del historial permite reintentar sin reiniciar el servidor. Las solicitudes concurrentes siguen compartiendo la preparación.

## Historial e índice

- Los documentos históricos conservan sus archivos inmutables. Se añade un índice privado de metadatos, reconstruible a partir de los archivos existentes.
- Listar ediciones no requiere releer cada documento completo. El primer acceso recupera metadatos ausentes; los accesos siguientes consultan el índice y detectan archivos nuevos.
- La API admite paginación por cursor y la interfaz ofrece «Ver más ediciones». Los empates de fecha usan un identificador estable para evitar pérdidas o duplicados.
- La escritura exclusiva de metadatos soporta archivados simultáneos sin reemplazos de archivos abiertos en Windows. No se borran informes ni se requiere una migración de base de datos.

## Idioma, cifras y explicación

- El español deja de suponer que todas las noticias de origen ya están traducidas. Se detecta prosa editorial en inglés y se utiliza el mismo traductor validado de las otras ediciones.
- La traducción conserva cifras, unidades, fechas y enlaces mediante tokens protegidos. Se rechazan respuestas que introduzcan valores o conserven los pasajes detectados en inglés; existe reintento acotado y caché por cuenta.
- La reconstrucción del resumen de Bolsa utiliza etiquetas canónicas antes de aplicar la traducción. Esto evita combinar plantillas españolas con nombres previamente traducidos.
- La edición base «Daily News» se presenta como «Noticias financieras». Los títulos propios de los usuarios no se renombran por esa regla.
- Los titulares estructurados aparecen en «Noticias del corte» una sola vez. «Por qué pudo pasar» explica qué movimiento contrastar, qué expectativa investigar y qué evidencia falta, sin volver a copiar las noticias. El contexto editorial adicional se conserva.
- Si una edición personal cita un titular dentro de su propio análisis, se conserva ese texto y se omite sólo la noticia estructurada duplicada. El detector de idioma reconoce palabras Unicode completas para no confundir terminaciones españolas como «días» con inglés.
- Las gráficas muestran cifras breves según la unidad, con mayor precisión en divisas y tasas. Los cambios pequeños no se presentan como cero. El detalle expandido y la evidencia conservan su precisión; el CSV no se redondea por las reglas visuales.
- Las fechas con hora se presentan de forma legible con `UTC` explícito. Se conserva el instante original y, en las celdas, el texto original puede consultarse mediante su título. La cobertura resume rangos de fechas extensos; cada referencia mantiene su propia fecha en la tabla.

## Lectura y navegación

- Cabecera, navegación y controles más compactos en pantallas estrechas, manteniendo los colores azules pastel y las etiquetas de las secciones.
- La librería anual y el historial conservan sus filtros en la URL. Se comprobó apertura directa de Proteínas de Mercados de 2023, recarga del historial de México y regreso con «Atrás» a la edición anual.
- El actualizador periódico diario y el de estado de envíos se pausan cuando su sección está oculta. Los componentes y borradores siguen montados para conservar el trabajo.
- La comparación de los informes diarios continúa siendo entre las dos últimas sesiones observadas, con ambas fechas. Las publicaciones semanales y las estadísticas anuales conservan su frecuencia y naturaleza.

## Verificación

Se aprobaron estas 17 comprobaciones:

1. `test-report-request.mjs`
2. `test-report-chart-design.mjs`
3. `test-report-chart-layout.mjs`
4. `test-report-quality.mjs`
5. `test-report-presentation.mjs`
6. `test-report-daily.mjs`
7. `test-report-bond-session.mjs`
8. `test-report-protein-bulletin.mjs`
9. `test-report-pdf-column-flow.mjs`
10. `test-report-review.mjs`
11. `test-report-reliability.mjs`
12. `test-report-improvements.mjs`
13. `test-report-equity-session.mjs`
14. `test-report-sector-session.mjs`
15. `test-report-translation-repair.cjs`
16. `test-report-languages.mjs`
17. `test-report-annual-library.mjs`

Las expectativas antiguas se corrigieron para conservar texto propio, evidencia interna anterior al corte y señales de seguimiento. Las horas intradía se verifican en un documento personal separado: no se usan dos observaciones del mismo día para fabricar una comparación diaria. Los proveedores de traducción simulados traducen su contenido de prueba; ya no se limitan a anteponer una palabra inglesa a texto español.

Auditoría adicional: 70 exportaciones, 329 páginas A4. Se verificaron márgenes, presencia de contenido y ausencia de cierres aislados bajo el umbral de la auditoría. El cierre menos ocupado de los documentos de varias hojas utiliza el 32 % del área medida. No se comparó el número de páginas con una versión anterior. Se inspeccionaron visualmente páginas renderizadas de Bolsa, Mercado de proteínas y Producción de México; no se presenta esa muestra visual como inspección de las 329 páginas.

Compilación de producción aprobada. ESLint: 535 archivos, cero errores y cero advertencias. Vite mantiene avisos de tamaño de paquetes y referencias a estáticos que el proceso de compilación incorpora después.

Evidencia local:

- `output/informes-mejoras-pruebas-20261022.log`: ejecuciones y reintentos de comprobaciones; incluye los fallos encontrados y posteriormente corregidos.
- `output/informes-mejoras-eslint-20261022.json`: resultado de análisis estático.
- `output/informes-mejoras-build-20261022.log`: compilación final.
- `output/informes-mejorados-20261022/after.json`: mediciones de los 70 PDF.
- `output/informes-mejorados-20261022/`: exportaciones y tres imágenes de revisión visual.

Los PDF de auditoría se generan para comprobar la distribución sin invocar traducción externa. La localización del contenido se verifica por separado mediante las comprobaciones de idioma y la lectura de la aplicación. No se verificó contra fuentes externas cada precio publicado.

Comprobación final en la aplicación: los seis titulares de la muestra de Bolsa se muestran en español, las cifras de sus gráficas ya no presentan la precisión excesiva detectada y la vista previa real abre un PDF de siete páginas. La prueba de navegación confirmó que recargar el historial de México conserva filtros compatibles y que «Atrás» recupera Proteínas de Mercados de 2023.

## Sesión local y correos

Servidor local: `http://127.0.0.1:5273/informes`. La revisión automática rechazó reactivar los envíos programados durante la validación por el riesgo de enviar pendientes. El usuario indicó expresamente mantenerlos desactivados. Se conserva `VALL_REPORT_EMAIL_AUTOMATION_ENABLED=false` en la configuración local privada y en el proceso de desarrollo; no se cambió la configuración de Vercel o Dokploy.
