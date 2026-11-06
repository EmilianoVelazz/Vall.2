# México: señales ejecutivas y comparativas

Los cuatro reportes incorporan señales calculadas a partir de sus propias tablas y observaciones. La fecha de corte aparece junto al título y cada señal conserva su periodo observado. El catálogo disponible revisado sigue fechado el 27 de octubre de 2026; esta mejora no cambia esa fecha ni declara una actualización de cotizaciones.

- Panorama: seis indicadores con observación anterior y cambio, vista conjunta de las seis historias y opción de detalle. Remesas se expresan visualmente en miles de millones de USD y población en millones de personas; las tablas conservan las unidades originales.
- Bolsa: balance de alzas/bajas, mayor avance y mayor retroceso del grupo más amplio con fechas de comparación idénticas. La muestra no se presenta como índice ni como rendimiento de una cartera. El balance también se incluye en el resumen PDF.
- Proteínas: rango mínimo/máximo y brecha del grupo más amplio por especie con igual presentación, unidad, periodo y frecuencia. Se identifica el tamaño de ese grupo y sus estados extremos; no es una media nacional ni un precio entregado. Los registros de otras frecuencias siguen separados.
- Producción: participación de la entidad principal en el total registrado de cada cultivo y del valor minero. El explorador consulta todas las entidades con valor positivo en grupos de diez. El filtro estatal alcanza también las entidades fuera de los primeros lugares; las ausencias no se convierten en cero. Se conservan la precisión original de las barras existentes y los valores publicados de las tablas para los demás estados.

Las señales aparecen en los anexos exportables. El guardado reconstruye los cálculos, tablas y gráficas a partir de la evidencia, sin persistir un tablero desconectado de sus observaciones. Se mantiene la política de PDF ejecutivo de hasta tres páginas y el detalle de respaldo en página/CSV/Excel.

## Verificación

Historia comprobada: navegación por reporte → ruta de México → catálogo almacenado → modelo compartido → lector; descargas autenticadas → normalización de la evidencia → composición PDF/CSV/Excel.

La vista local utiliza la ruta real de México con el catálogo almacenado inyectado, sin autenticación únicamente dentro de ese servidor de revisión en loopback. La ruta de producción mantiene su autenticación. La prueba de descargas usa el exportador real con una identidad temporal de prueba.

- Pruebas de México: identidad comercial, frecuencia, unidades, porcentajes y puntos porcentuales, estado fuera del grupo principal, guardado y exportación equivalentes.
- Dieciséis respuestas HTTP 200: ocho PDF diarios/semanales, cuatro CSV y cuatro Excel.
- PDF diarios: Panorama 1 página, Bolsa 2, Proteínas 3 y Producción 2. Verificación de márgenes por extracción y revisión de las ocho páginas renderizadas.
- Lector: seis gráficas simultáneas de indicadores; paginación de producción a posiciones 11–20; filtro de Tlaxcala; navegación entre reportes; rangos de las cuatro proteínas; escritorio y móvil sin desbordamiento del contenido principal.
- Compilación de producción y ESLint de los módulos modificados.

Evidencia y entregables: `output/mexico-mejoras-20261029/`.
