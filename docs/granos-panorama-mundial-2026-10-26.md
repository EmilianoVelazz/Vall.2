# Granos y forrajes: panorama mundial

La lectura local pasa de siete futuros de Estados Unidos y China a 32 referencias recientes: 16 países y una referencia regional del mar Negro, con disponibilidad comprobada el 26 de octubre de 2026. Los países sin publicaciones recientes no se presentan como si tuvieran cotizaciones actuales.

## Datos conectados

- Estados Unidos y China: futuros del catálogo existente, con históricos disponibles desde 2020.
- Brasil: indicadores físicos diarios de maíz en Campinas y soya en Paranaguá, CEPEA/ESALQ–USP, BRL por saco de 60 kg.
- Argentina: referencias FOB oficiales de trigo, maíz, soya y harina/pellets de soya, USD por tonelada, con posición arancelaria y mes de embarque identificados. Un intervalo oficial que incluye ese mes es válido; dos precios incompatibles para el mismo mes se excluyen. No se encadenan distintos meses de embarque.
- España, Alemania, Francia, Polonia, Rumanía, Bulgaria, Hungría, Italia y Austria: cereales y salvado físicos semanales, DG AGRI. Cada serie fija país, producto, plaza y etapa comercial; se valida también su periodo de publicación.
- Francia y mar Negro: referencias FOB semanales del archivo oficial de precios mundiales de la Comisión Europea. Canadá y Ucrania se recuperan como históricos, pero sus observaciones de este corte no son suficientemente recientes para mostrarse como precios actuales.
- Tailandia y Vietnam: arroz blanco con 5 % de quebrado, FOB Bangkok y Hanói, promedios mensuales de la Pink Sheet del Banco Mundial. Su fecha es el final del mes observado; no se calcula una variación diaria con esos promedios.
- Sudáfrica: liquidaciones de maíz blanco, maíz amarillo, trigo, girasol y soya SAFEX publicadas por Applied Derivatives. Se identifica el vencimiento y se corta la serie al encontrar el marcador de cambio de contrato. No se atribuyen esos datos directamente a un acceso a la API de JSE.

Se conserva la moneda y la unidad original. FOB no incluye transporte hasta destino. El FOB oficial argentino es una referencia administrativa. Compartir unidad no convierte dos calidades, plazas o etapas comerciales en precios intercambiables.

## Lectura y exportación

- Panorama por región, país y frecuencia, más tablas de horizontes e históricos con bases observadas.
- Filtros internacionales en el lector, sin afectar el informe completo que se descarga.
- Las copias aceptan hasta 64 gráficas para informes de mercados; se mantiene el límite de tamaño del documento y los límites de series/puntos. El límite anterior de seis impedía guardar la cobertura internacional completa.
- Gráficas agrupadas únicamente con unidad, frecuencia y base comercial compatibles; cada línea conserva su identidad.
- PDF diario y semanal verificados con un máximo de cinco páginas, sin reducir la tipografía para forzar el límite. Se conservan todas las filas de precios actuales y todos los pares call/put e intereses abiertos disponibles; las observaciones y horizontes completos también se descargan en Excel.
- Opciones e interés abierto de granos: cuatro pares call/put y cuatro totales de futuros del boletín CME disponible. No se inventa cobertura de derivados para los países añadidos.
- La lectura del último corte no queda bloqueada mientras se actualizan fuentes en segundo plano. Un fallo conserva únicamente la misma serie fechada; no se sustituyen precios con los de otro mercado.
- Los libros externos se leen como datos acotados, sin ejecutar fórmulas ni seguir vínculos del documento.

Los envíos automáticos permanecen desactivados en la revisión local. La publicación en Git y el despliegue se administran por separado de estas comprobaciones.

## Validación

- `node scripts/test-report-global-grains.cjs`: producto, plaza, etapa, moneda, publicación, frecuencia, conflictos, mes de embarque, cambio de vencimiento y tiempo máximo de consulta.
- `node --use-system-ca scripts/test-report-global-grains.cjs --live`: acceso a fuentes, persistencia de copias, Excel, fechas/horizontes y PDF diario/semanal de hasta cinco páginas sin desbordes.
- `node scripts/test-report-global-grains-reader.cjs`: lector React diario/semanal, once filtros internacionales y tablas de derivados sin duplicaciones ni advertencias de renderizado.
- `node scripts/test-report-global-grains-http.cjs --server`: servidor local y ruta protegida, descargas HTTP autenticadas de Excel y PDF, MIME, archivo y permisos.
- Regresión de proteínas: cinco referencias estadounidenses; el alcance de ese informe se mantiene limitado a Estados Unidos.
- Compilación completa con `npm run build`.

## Cambio de rama durante la tarea

El checkout cambió de `main` a `deploy-valla` mientras se trabajaba. El usuario eligió continuar en `main`. Dos archivos que impedían volver se conservaron en el stash llamado «Respaldo de robot y configuración antes de volver a main para granos globales 2026-10-26»; no se forzó la sobrescritura.

La versión de `main` tenía referencias a las rutas antiguas de imágenes ya retiradas; se ajustaron a los archivos conservados en `assets/img/brand` y `assets/img/fallback`. Diez módulos que quedaron sin consumidores en ese checkout se conservaron completos bajo `output/granos-global-20261026/componentes-sin-consumidor`, fuera del árbol activo. No se eliminó ese material. La auditoría de referencias y módulos volvió a pasar.

La comprobación visual, los PDFs, Excel, resultados de validación y HTML de prueba están en `output/granos-global-20261026`.
