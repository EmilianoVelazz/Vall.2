# Revisión de informes como usuario · 10 de noviembre de 2026

Se probaron apertura, actualización, vista previa, descarga, recuperación de errores, tablas y navegación de Finanzas, Mercados y México. Las pruebas usan la aplicación compilada, navegadores reales automatizados y el enrutador real de exportación con identidades locales aisladas.

## Correcciones aplicadas

La vista previa identificaba una edición por su clave, fecha y versión. Si se corregían cotizaciones sin cambiar esos campos, la lectura recibía los datos nuevos, pero podía conservarse el PDF anterior. La identidad de la edición ahora incorpora su contenido completo, cuenta, idioma y preferencias. Cambiar cualquiera de esos elementos invalida el archivo anterior y cancela solicitudes que ya no correspondan. La serialización se memoriza para evitar repetirla en cada renderizado.

La revisión de los PDF encontró un índice aislado en la segunda página de la introducción de México y una tabla de USD/MXN aislada al final del capítulo de Bolsa. La apertura aprovecha un espacio libre de las tarjetas para una referencia sin historia, sin inventarle una gráfica. Los capítulos mexicanos del panorama usan la misma distribución ejecutiva que sus informes individuales. Se conservan las tablas, unidades, fechas e índices navegables.

| Panorama diario | Antes | Después |
| --- | ---: | ---: |
| Financiero integrado | 35 páginas | 33 páginas |
| México | 12 páginas | 9 páginas |
| Mercados | 13 páginas | 13 páginas |

Los panoramas semanales también se comprobaron: financiero 34 páginas, México 10 y Mercados 13. La versión de presentación es `2026-11-10-exportacion-y-orden-panorama-103`.

## Resultados

- **57 archivos correctos:** 14 informes diarios, cuatro semanales de Mercados y una edición personalizada, cada uno en PDF, CSV y Excel. Se verificaron respuesta HTTP, tipo de archivo, nombre, tamaño, apertura y protección de cuenta. Sesión ausente: 401; cuenta distinta: 409; límite de solicitudes: 429.
- **Diez botones de descarga:** Bolsa, Bonos, Divisas, Panorama financiero, Granos, Energía, Proteínas, Panorama de Mercados, Proteínas por estado y Panorama de México. La descarga reutiliza el PDF mostrado. Los tres botones de panorama se repitieron después del ajuste final de distribución y pasaron.
- **Ocho escenarios de actualización:** vista previa y descarga idénticas por SHA-256; aviso de un nuevo corte; aceptación del corte; corrección conservando la misma fecha; error al actualizar; reintento tras un error de PDF; tablas visibles en escritorio y móvil; y rechazo al cambiar de cuenta. No hubo excepciones JavaScript.
- **19 libros Excel:** ZIP/OOXML íntegros, sin celdas de error ni fórmulas inesperadas, 174,155 observaciones numéricas y 33,030 filas documentales comprobadas. Las observaciones comunes y las tablas se contrastaron con el CSV correspondiente. El contexto bursátil que existe solo en Excel se validó como numérico y no se presentó como una comparación inexistente con CSV. Los rótulos y notas propios del libro se distinguen de las filas de datos.
- **81 variantes del lector:** 30,840 celdas publicadas, sin valores inválidos, entradas inmutables y orden de tablas anterior a los exploradores de gráficas donde corresponde. Los panoramas conservan su introducción e índice por capítulos.
- **73 modelos especializados diarios, semanales y anuales:** selección ejecutiva con precios, fechas y referencias americanas obligatorias conservados. Se actualizó el comprobador heredado para las tablas actuales de energía, las siete columnas de la tabla maestra de granos y la cobertura protegida de proteínas. Los panoramas se comprueban con su suite específica porque combinan presupuestos por capítulo.
- **Actualización y recuperación:** pasaron las pruebas de solicitudes, agenda diaria/semanal, API de actualización y biblioteca ante fallos de proveedores o persistencia.
- **Verificación visual:** se renderizaron 118 páginas de la primera matriz y 68 páginas de los cuatro panoramas finales. Se revisaron tablas, gráficas, encabezados, pies, enlaces del índice y capturas de escritorio y móvil. Los dos problemas de distribución encontrados se corrigieron y sus páginas se volvieron a revisar.
- **Compilación y ESLint específico:** correctos. Persisten los avisos previos del compilador sobre recursos heredados y tamaño de paquetes.

## Alcance de la comprobación

Los informes de la matriz parten de las cachés disponibles con corte del 9 de noviembre. La simulación de actualización cambia deliberadamente valores y cortes para comprobar el comportamiento; esos precios sintéticos no se escriben en las fuentes del proyecto ni son cotizaciones para uso financiero.

La autenticación, los perfiles, las traducciones externas y ciertos errores de proveedores se simulan únicamente dentro de los servidores de prueba. Esto verifica el comportamiento del programa, pero no acredita las credenciales de una cuenta real, la disponibilidad actual de Gemini/Supabase ni la exactitud económica de las fuentes externas. No se enviaron correos desde las simulaciones.

Se importaron y renderizaron muestras de los libros de Granos y Producción estatal con un lector independiente. El lector generó las imágenes y el manifiesto, aunque su proceso terminó con código 1 sin diagnóstico adicional. La comprobación independiente de integridad y paridad de los 19 libros terminó con código 0; no se afirma una prueba dentro de Microsoft Excel.

Se reinició el servidor local para cargar las correcciones. La aplicación está en `http://127.0.0.1:5273/informes`; la API usa el puerto 3101. Esta revisión no publica un despliegue remoto.

## Evidencia y reproducción

Evidencia principal en `output/pruebas-informes-20261110/`:

- `exportaciones/validation.json`: matriz de 57 archivos; `parity-validation.json`: comparación Excel/CSV.
- `usuario/results.json`: ocho escenarios, hashes y cortes de los PDF.
- `navegador/results.json`: diez descargas; `navegador-final/results.json`: tres panoramas finales.
- `panoramas-finales/validation.json`: cuatro panoramas diarios/semanales reexportados en PDF y CSV.
- `exportaciones/visual-qa/` y `panoramas-finales/visual-qa/`: páginas y hojas de revisión visual.

Comprobadores principales:

```powershell
$env:REPORT_EXPORT_OUTPUT='output/pruebas-informes-20261110/exportaciones'
node scripts/test-report-export-matrix.mjs --current-only --all-formats
node scripts/test-report-refresh-user.cjs
$env:REPORT_BUTTON_OUTPUT='output/pruebas-informes-20261110/navegador'
node scripts/test-report-download-button.cjs
node scripts/test-report-panoramas-executive.mjs
node scripts/test-report-print-edition.mjs
node scripts/test-report-availability-reader.cjs
node scripts/test-report-request.mjs
node scripts/test-report-weekly-refresh.cjs
node scripts/test-report-weekly-refresh-api.cjs
node scripts/test-report-library-resilience.cjs
npm run build
```

## Nueva ronda de pruebas como usuario · versión 109

Se repitieron los recorridos sobre la aplicación compilada, en navegador real y con cuentas aisladas. El proyecto local y su API respondieron con HTTP 200. No se modificaron datos de cuentas reales ni se enviaron correos.

- Diez informes abiertos y descargados desde su botón: Finanzas, Mercados y México. Todos devolvieron PDF válido con HTTP 200 y reutilizaron el documento mostrado. Se comprobaron las plantillas de referencia, tablas y comparativas, incluida Europa en Bonos.
- Búsqueda en todo el PDF sin distinguir acentos, resultados y ausencia de coincidencias, salto a una página concreta, rechazo de un número inválido y limpieza de búsqueda al cambiar documento. El selector regional conserva colores y restaura la vista completa.
- Nueve escenarios de actualización: archivo y vista previa idénticos, aviso de nuevo corte, novedades antes de aceptarlo, aceptación, revisión con igual fecha, recuperación ante fallos de biblioteca o generación, tablas móviles y bloqueo tras cambiar de cuenta. Cero excepciones JavaScript.
- Diecinueve recorridos de creación y recuperación: cancelar, escribir y borrar identidad, recuperar borrador, respuesta de guardado perdida, doble clic, sesión vencida, IA incompleta, falta de conexión, confirmaciones incompletas, límite de informes, almacenamiento bloqueado, dos pestañas y cambio de cuenta. La IA y las exportaciones de esta suite se simulan; los formularios, servidor y almacén temporal son reales.
- Una edición personalizada se exportó aparte por la ruta HTTP real a PDF, CSV y Excel: tres archivos válidos, encabezados de descarga correctos, separación de cuenta y contenido verificado. Esto complementa las exportaciones simuladas del recorrido de creación.

Se inspeccionaron las capturas de escritorio y móvil, incluidas tablas y cancelación. No se detectaron fallos de producto en estos recorridos. El comprobador de creación ahora guarda un manifiesto de resultados y verifica que sólo elimina su directorio temporal aislado.

Evidencia de esta ronda: `output/pruebas-usuario-final-20261110/`, con resultados separados en `descargas/`, `actualizacion/`, `creacion-recuperacion/` y `exportacion-privada/`. Estas pruebas no certifican la disponibilidad de proveedores de datos o IA en vivo.

## Mejoras operativas · versión 110

Se conservaron las plantillas, las tablas y la identidad visual. El centro de informes incorpora estas seis mejoras:

1. El historial compara dos ediciones realmente archivadas del mismo informe, con sus valores, unidades y fechas. Permite cargar más cortes, rechaza el orden temporal inverso y funciona después de recargar. No reconstruye ediciones ausentes.
2. El mismo selector de PDF, Excel y CSV sirve en el lector diario, la librería anual, el historial y los anexos. Las exportaciones verifican la cuenta antes y después de obtener el archivo; los anexos conservan su respaldo de procedencia en CSV.
3. El estado de los datos despliega referencias, fechas, frecuencias y fuentes para explicar la cobertura. Distingue observaciones vigentes, antiguas, conservadas, históricas y ausentes según los criterios existentes del informe.
4. Los anexos permiten buscar sin distinguir mayúsculas ni acentos, ordenar por columna y restaurar el orden original. Los filtros afectan la vista; las descargas conservan todas las filas y sus unidades.
5. La lectura recuerda la selección, la página y el zoom por cuenta, documento, corte e idioma. Guarda como máximo 32 posiciones locales, sin contenido financiero ni credenciales. Si el almacenamiento está bloqueado, el lector sigue disponible. Un enlace explícito a una edición tiene prioridad sobre la selección recordada.
6. La cabecera obtiene horarios, formatos y años del catálogo y la política de actualización vigentes. Identifica la periodicidad semanal de Mercados y deja de ofrecer Audio, que no está disponible.

Las pruebas detectaron tres fallos de producto que se corrigieron. La carga de la biblioteca podía sustituir la selección recordada por el primer informe; ahora respeta la selección restaurada. Además, el historial descartaba silenciosamente los archivos actuales de Bolsa y Divisas al superar 3 MiB. Su límite de lectura y escritura ahora es coherente, de 7 MiB, y se verificó la recuperación íntegra de ambas series, la reconstrucción del índice y el rechazo de archivos excesivos. Las ediciones omitidas anteriormente no se pueden reconstruir; el siguiente registro conserva el corte disponible completo. Por último, los anexos de una edición personalizada podían sustituir su tabla guardada por una comparación diaria genérica: ahora conservan sus tablas originales, incluidos ceros y textos de control.

También se reforzó el aislamiento de los anexos al cambiar de cuenta y se corrigió el contraste del control de comparación. No se cambiaron las cotizaciones ni se redujeron las series para hacerlas caber en las pruebas.

Evidencia de esta actualización en `output/mejoras-operativas-20261110/`: `descargas/` contiene las diez descargas de las plantillas diarias y semanales; `actualizacion/`, los nueve escenarios de actualización; `creacion-recuperacion/`, los diecinueve recorridos de creación y recuperación; `archivo-descargas/`, seis exportaciones reales desde librería anual e historial. Los recorridos nuevos y sus capturas están en `usuario/`.

Comprobadores añadidos: `test-report-operational-tools.mjs`, `test-report-operational-ui.cjs`, `test-report-history-capacity.cjs` y `test-report-archive-downloads-ui.cjs`. Las pruebas de navegador usan cuentas y servidores aislados, la ruta real de exportación y cortes disponibles en disco. No certifican servicios remotos ni realizan envíos de correo.

La aceptación final completó once comprobaciones nuevas sin excepciones JavaScript, incluidas la exportación autorizada de la tabla privada y el bloqueo de su CSV local tras cambiar de cuenta. Pasaron también las seis descargas del archivo, las diez de plantillas, los nueve escenarios de actualización y los diecinueve de creación y recuperación. Las comprobaciones independientes de datos conservaron 55,012 puntos de divisas y 279 horizontes; la prueba del historial recuperó íntegros los informes actuales de Bolsa y Divisas. Se revisaron las capturas de comparación, cobertura y móvil. La compilación y ESLint de los archivos modificados terminaron correctamente; permanecen los avisos conocidos de recursos heredados y tamaño de paquetes. La aplicación reiniciada respondió con HTTP 200 en `/informes` y `/api/health`, y el historial sin sesión respondió con 401.
