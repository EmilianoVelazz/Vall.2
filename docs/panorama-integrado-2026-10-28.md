# Panorama general integrado

El informe de Finanzas `overview` reúne los últimos cortes disponibles de Finanzas, Mercados y México. La edición anual mantiene su flujo independiente. No se aplica a Panorama la selección de cinco páginas de los informes especializados.

La composición incorpora Bolsa, Bonos, Divisas, Granos, Energía y metales, Proteínas de Estados Unidos y los cuatro informes de México. Las dos colecciones de noticias se consolidan en un capítulo; se eliminan repeticiones por título o URL, incluidos parámetros de seguimiento. Las publicaciones posteriores al corte se excluyen.

Cada capítulo conserva tablas, monedas, unidades, frecuencias y fechas propias. El corte integrado es el máximo de los cortes incluidos, sin asignarlo a las observaciones históricas. Panorama nacional y Producción de México se identifican como contexto estructural mensual o anual. No se suman precios, porcentajes o rendimientos entre mercados incompatibles.

El lector presenta una síntesis por frente, implicaciones para el negocio, índice y capítulos desplegables. Abrir o cerrar capítulos no altera la descarga. El PDF combina los formatos especializados completos, retira las marcas de agua de los capítulos generales, añade enlaces internos y una sola numeración continua. La tabla de contenido muestra la primera página de cada capítulo. Hay un límite operativo de 200 páginas que produce un error explícito, sin recortar contenido silenciosamente.

La evidencia de Panorama se guarda como doce partes canónicas, sin panoramas anidados ni copias de las gráficas calculadas. Las series largas conservan muestras históricas mensuales y bases exactas de las comparativas, conforme al formato persistido de cada informe. El guardado privado admite hasta 3 MiB para Panorama; los demás informes conservan el límite de 384 KiB. La recepción privada acepta 4 MiB, seguida de normalización, validación de origen y comprobación del tamaño específico. La recuperación de borradores admite la composición ampliada. CSV, Excel y texto incluyen los capítulos y conservan unidades originales.

La composición se actualiza durante la lectura de Finanzas y al renovar sus informes. Una huella evita persistir de nuevo partes idénticas. Las colecciones ausentes se señalan en el lector; no se generan datos para completarlas. El cambio no reactiva envíos programados.

Validación: `npm run test:reports:panorama`, pruebas de Bolsa, Bonos, Divisas y recuperación de borradores; compilación y ESLint. La simulación del corte local del 28 de octubre integró doce informes en once capítulos, con 105 gráficas disponibles, siete noticias únicas y un PDF de 53 páginas. Se verificaron todas las páginas, límites del texto, once enlaces internos, descarga HTTP 200, conservación de tablas y extremos de las series, guardado/exportación y navegación móvil. Los archivos de comprobación están en `output/panorama-20261028/`.

La activación local se confirmó en disco. Los intentos de persistencia REST y PostgreSQL no confirmaron la sincronización remota. Frontend y backend locales respondieron HTTP 200; los envíos automáticos permanecieron desactivados.
