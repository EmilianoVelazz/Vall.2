# Apertura de la biblioteca de México

Al reportarse un fallo al abrir la pestaña México, se comprobó el corte local: existen cuatro informes y cumplen la validación de lectura. La prueba aislada de navegador con el servicio real abrió Panorama nacional, Bolsa y tipo de cambio, Proteínas por estado y Producción estatal. No se reprodujo un fallo de presentación con ese corte.

Se corrigió una dependencia de disponibilidad: antes, un caché vencido obligaba a esperar la consulta de las tres fuentes antes de devolver la biblioteca. Ahora, si existe un corte guardado, la consulta devuelve de inmediato los cuatro informes y actualiza las fuentes en segundo plano. Los informes mostrados durante la actualización conservan su fecha y el estado «Conservado». Si falla la actualización, el corte sigue disponible. La generación inicial sin caché y los trabajos explícitos de actualización siguen esperando la preparación; los envíos mantienen la comprobación del corte vigente.

La ruta devuelve `refreshing` para distinguir una actualización pendiente. Se conserva la autenticación y no se cambia el contenido ni la fecha de las cotizaciones para aparentar actualidad.

Validación: `test-mexico-library-availability.mjs` comprueba respuesta HTTP inmediata con fuentes suspendidas, cuatro informes conservados, una sola actualización concurrente, recuperación posterior y continuidad ante una generación rechazada. `test-mexico-current-cut-ui.mjs` abre los cuatro documentos del caché real en un servidor y sesión de prueba aislados. También pasan las regresiones de México y de mejoras de informes. No se reutilizaron credenciales del usuario ni se enviaron correos.
