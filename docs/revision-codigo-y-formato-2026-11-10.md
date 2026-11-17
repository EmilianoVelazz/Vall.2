# Código y formato de informes · 10 de noviembre de 2026

Se revisó el código y se recuperó la presentación de los seis informes diarios tomando como referencia los siete PDF proporcionados, incluidos los dos ejemplares de Proteínas. Las plantillas recuperadas usan los datos de los cortes disponibles del proyecto.

## Corrección del recorrido de pantalla

La revisión posterior del problema en `http://localhost:5273/informes` encontró una diferencia que la validación inicial no cubría: el lector adjunta preferencias normalizadas a todos los informes, incluso sin cambios del usuario. El serializador interpretaba la mera existencia de ese objeto como una edición personalizada y seleccionaba otra plantilla para las descargas de Finanzas. En Bonos, tanto el PDF base correcto como la descarga incorrecta tenían cinco páginas; verificar únicamente descarga y paginación no detectaba la pérdida de las comparativas regionales y europeas.

La selección ahora distingue las preferencias del lector del análisis personalizado con una guía de decisión. Los datos de empresa, destinatario, título, público, horizonte y opciones de bloques conservan la plantilla del informe base. El análisis explícitamente personalizado mantiene su compositor narrativo y su contenido. La versión de presentación `2026-11-10-formato-original-desde-pantalla-106` renueva las vistas previas almacenadas. Se reinició el servidor local con esta corrección.

La nueva verificación genera los seis informes a través de `visibleReportEdition` y del serializador real, con preferencias predeterminadas, identidad de empresa y preferencias de público, detalle y horizonte. Comprueba tablas, países, comparativas, márgenes y conservación de la evidencia. Además, pasaron veinte descargas mediante el botón del navegador (diez sin identidad y diez con empresa y destinatario), sin excepciones JavaScript; ahora se inspecciona el contenido de los PDF de Finanzas para verificar su plantilla. Se revisaron visualmente las 22 páginas y se capturó la página europea de Bonos dentro del visor. Los ocho escenarios de actualización comprobaron que la vista previa y la descarga coinciden, incluido un cambio de datos que conserva la misma fecha. La prueba de edición personalizada conserva título, audiencia, detalle y las exclusiones de bloques.

Evidencia: `output/correccion-formato-real-20261110/`, con manifiestos en `pantalla/`, `pantalla-identidad/` y `pantalla-preferencias/`; descargas y capturas en `navegador/` y `navegador-identidad/`. Las cuentas de estas pruebas son simuladas y usan los cortes del proyecto; no se accedió a una cuenta real.

## Formato recuperado

Actualización de navegación y novedades (`2026-11-10-navegacion-y-novedades-109`): el visor permite introducir una página y buscar texto en todo el PDF, ignorando diferencias de acentos y mayúsculas. Muestra las páginas encontradas y permite abrirlas; distingue una búsqueda sin resultados de un fallo de extracción. Las búsquedas se pueden cancelar, tienen plazo y caché de texto por documento, y se limpian al cambiar el PDF.

El bloque «Qué cambió desde el informe anterior» compara evidencia canónica de cortes abiertos en la sesión. Distingue movimientos entre observaciones, publicaciones, revisiones con la misma fecha, cambios de historia y referencias ausentes, sin convertir una ausencia en cero ni atribuir causas. Muestra tres novedades y permite consultar el resto. Anticipa el corte pendiente sin reemplazar el PDF abierto; mantiene separadas las familias, periodos y años, y limpia la memoria al cambiar de cuenta. Al primer corte informa de que aún no existe una base de comparación; no recupera ni inventa un informe previo.

Las tablas resaltan las frecuencias explícitas y las consultas conservadas o pendientes de corroboración. La clasificación compartida no deduce una frecuencia a partir de una fecha o de palabras de unidades como «rendimiento anual». Las gráficas acercan sus fechas observadas y el tipo de escala al título; la aclaración de escalas regionales de Bolsa también pasa al inicio de la página PDF. El visor explica el alcance de la edición ejecutiva y ofrece acceso a los anexos.

Comprobaciones: compilación y ESLint correctos; seis PDF y sus 23 páginas, conservación de países y evidencia, diez descargas con el recorrido real del botón, búsqueda sin acentos, saltos de página, límites de entrada, restablecimiento al cambiar documento y ausencia de excepciones JavaScript. Nueve escenarios de actualización verificaron vistas y descargas idénticas, aviso y aceptación de corte, novedades, revisión con igual fecha, recuperación tras errores, tablas móviles y bloqueo por cambio de cuenta. Evidencia en `output/navegacion-novedades-20261110/`, incluidas las capturas de las novedades y las comprobaciones finales del visor. Las pruebas usan cuentas y precios simulados junto con los cortes locales; no validan cotizaciones en vivo.

Actualización de legibilidad posterior (`2026-11-10-legibilidad-y-comparativas-107`): se conserva la plantilla institucional y se amplía Bolsa a cuatro páginas para añadir cuatro comparativas regionales sin sustituir su gráfica global de 41 referencias. El lector incorpora selección por región, conservando colores, trazos y acceso a la vista completa que ofrece cada gráfica. La vista principal mantiene su exclusión explícita de trayectorias inflacionarias extremas; el anexo global del PDF conserva todas las series.

La tabla internacional de Bonos reúne los países por región, conserva sus columnas y fuentes enlazadas, aumenta el cuerpo de 6.7 a 7.1 puntos y explica las bases ausentes con `—`. Los cambios en puntos base se presentan con hasta dos decimales; los rendimientos mantienen hasta tres. Bonos conserva cinco páginas y el capítulo europeo. Las tablas generales aumentan de 7.2 a 7.6 puntos salvo las de Granos, que conservan su cuerpo para mantener la cobertura; se mejoran encabezados, alineación numérica y cortes de unidades como CAD/100 kg. En pantalla, las tablas pasan de 10 a 11 píxeles y aumenta el espaciado.

Los resúmenes de Mercados y México destacan su primera lectura con el azul y fondo de la identidad actual. Las fechas de cabecera de Finanzas se identifican como corte del informe, separadas de las fechas originales de cada referencia. Los títulos de México sustituyen sufijos numéricos sueltos por «Grupo N de M» y distinguen explícitamente las publicaciones semanales o mensuales en el resumen.

La revisión de esta actualización está en `output/mejoras-legibilidad-20261110/`: seis PDF, comprobación de márgenes, contenido, países y datos de entrada, y renderizado de sus 23 páginas. También pasaron los ocho casos de PDF de México (diario/semanal), los modelos de Bolsa y Bonos y la selección ejecutiva de 73 modelos. La comprobación de México distingue ahora exportación base de borrador privado: el segundo conserva sus secciones y tablas propias y no debe reconstruir el catálogo sobre el contenido editable.

Las diez descargas por botón terminaron con HTTP 200 y sin excepciones JavaScript. La prueba regional verifica el número de trayectorias, que cada bolsa conserve su color al filtrar Europa y que volver a todas las regiones restaure la vista completa. La revisión detectó y corrigió el tratamiento de la primera línea filtrada como si fuera siempre el S&P 500; ahora la referencia y su estilo se identifican por su posición original. La compilación, ESLint de los archivos modificados y la conservación de contenido en ediciones personalizadas también fueron correctos. El proyecto actualizado responde en `http://localhost:5273/informes`.

| Informe | Páginas comprobadas | Presentación |
| --- | ---: | --- |
| Bolsa | 4 | Indicadores, tablas, comparativas anuales, historia conjunta y comparativas regionales con colores por mercado |
| Bonos | 5 | Curva soberana, fondeo, comparativas regionales, tabla internacional y capítulo europeo |
| Divisas | 3 | Tablas operativas y globales, DXY, coberturas indicativas y comparativas regionales |
| Granos y forrajes | 3 | Resumen por bloques, tabla maestra, derivados e historia comparativa |
| Energía y metales | 3 | Resumen, tablas físicas y de futuros, horizontes e historia por referencia |
| Proteínas | 5 | Lectura de compras, matriz USD/kg, tablas por especie, historia y participación |

Bolsa vuelve a mostrar las 41 trayectorias disponibles en sus colores y estilos, con la opción de resaltar una referencia en el lector. Bonos recupera su presupuesto de cinco páginas para conservar las comparativas internacionales y europeas. Los títulos de gráficas de mercados recuperan país y unidad cuando corresponden. Las ediciones diarias y semanales vuelven a usar su presentación especializada; la edición anual conserva su tratamiento propio.

Se renderizaron y revisaron las 22 páginas de las plantillas base. La comprobación automática verificó márgenes, texto, países internacionales, convenciones de divisas, colores y conservación de la evidencia de entrada. Esta validación inicial, con la versión `2026-11-10-formato-anterior-completo-105`, no cubría la selección de plantilla con las preferencias que añade el lector; la corrección y comprobación de ese recorrido se describen arriba.

## Hallazgos de código corregidos

1. **Datos fijos presentados como cotizaciones.** El briefing usaba constantes cuando una fuente fallaba y tomaba posiciones de columnas que podían pertenecer a otra fecha o producto. Ahora obtiene valores de los modelos canónicos de los informes. Conserva precio numérico, unidad, fecha, fuente y base de comparación; marca las ausencias y devuelve 503 si no hay observaciones utilizables. La fecha del informe corresponde a las publicaciones disponibles.
2. **Reintento y actualización del briefing.** El evento del botón se pasaba como `AbortSignal`, provocando un fallo de `fetch`. Los controles gestionan su propio `AbortController` y reutilizan la solicitud con plazo del proyecto. Cancelan respuestas sustituidas, verifican la cuenta y conservan el último contenido cuando ocurre un error temporal.
3. **Ruta pública y caché compartida.** La consulta del briefing ahora exige sesión, identifica la cuenta y responde con `Cache-Control: private, no-store`. El contenido se monta mediante un router independiente.
4. **Trabajo repetido con lectores simultáneos.** Una composición se comparte entre solicitudes concurrentes. Hay caché de 30 segundos, plazo por proveedor y un máximo de tres cargas de fuente pendientes. Un proveedor que ignora la cancelación no acumula nuevas operaciones en cada reintento. Se conserva el último corte disponible ante fallos posteriores.
5. **Duplicación entre servidor y navegador.** Preferencias y presentación se concentran en módulos compartidos con adaptadores que conservan los puntos de entrada. La proyección de evidencia reutiliza el módulo existente. Las rutas de Finanzas y Mercados comparten serialización de tablas y conversión de fechas de noticias.
6. **Fechas malformadas de noticias.** Una fecha compacta inválida podía lanzar una excepción y hacer perder el conjunto de noticias de respaldo. La conversión compartida devuelve `null` para ese dato y conserva el procesamiento del resto.
7. **Código sin uso.** Se eliminaron imports innecesarios y un comentario con texto de una petición. El texto extraído en una simulación ahora se comprueba. Las pruebas del antiguo proyector diario se actualizaron para distinguir el historial de respaldo de su ventana de presentación.

## Comprobaciones

- **ESLint completo:** 755 archivos JavaScript, cero errores y cero advertencias. También se verificó la modificación posterior del comprobador de actualización.
- **Inventario:** 817 archivos propios de JS/CSS; sin errores de análisis en el alcance JavaScript de producción. Se eliminaron los ocho grupos de funciones idénticas de al menos 80 tokens encontrados entre archivos. El escaneo final no encuentra archivos fuente idénticos ni grupos de funciones idénticas de ese tamaño. No es una medición de similitud aproximada ni de duplicación de reglas CSS.
- **Estructura y recursos:** el auditor de importaciones y recursos revisó 402 fuentes sin referencias rotas ni módulos huérfanos. El inventario de imágenes comprobó los 15 recursos en uso.
- **Seguridad y recuperación:** pasaron las suites de seguridad, 39 comprobaciones HTTP/recursos, seis grupos de aislamiento de análisis, 44 casos XSS y las pruebas de recuperación del frontend, autenticación y flujos HTTP.
- **Briefing:** ocho grupos de integridad y concurrencia, incluida una carga para 30 lectores, proveedores sin respuesta, fallos parciales, conservación del corte y autenticación. En navegador se probaron reintento, actualización, fecha publicada, recuperación de errores y control con teclado.
- **Preferencias y guardado:** 32 combinaciones de creación, diez escenarios de guardado, persistencia, recuperación de enlaces y presentación compartida aprobados.
- **Informes:** selección ejecutiva de 73 modelos; países e historia de Bonos; 41 trayectorias de Bolsa; cálculos y unidades de Proteínas; presentación diaria, fechas y evidencia conservadas.
- **Exportaciones:** la matriz generó 38 archivos para 18 informes con datos. El decimonoveno, Noticias financieras, no tenía publicaciones utilizables en ese corte y recibió 422. Las seis plantillas de referencia se regeneraron y verificaron por separado.
- **Navegador:** diez botones de descarga correctos y ocho escenarios de actualización de informes, incluida la corrección que conserva la misma fecha, vista previa y descarga idénticas y cambio de cuenta. No hubo excepciones JavaScript en esos recorridos.
- **Compilación:** correcta. Permanecen los avisos previos sobre recursos heredados y tamaño de algunos paquetes.

## Mantenimiento y alcance

Los módulos de Finanzas y los estilos heredados siguen siendo grandes y se cargan en tiempo de ejecución. El inventario confirma su uso; no se eliminaron por su antigüedad. Para reducir el costo de cambios futuros conviene seguir separando responsabilidades y dividir la carga de los módulos mayores, conservando los contratos de ids y el orden del CSS documentados en el proyecto. El paquete de Informes continúa alrededor de 1.1 MB antes de compresión; esta revisión no elimina ese riesgo de crecimiento.

Las pruebas funcionales usan cuentas, errores y proveedores simulados, además de los cortes disponibles en disco. No certifican credenciales remotas, cotizaciones en vivo ni persistencia contra una cuenta real. No se enviaron correos desde las pruebas, no se aplicaron migraciones y no se publicó un despliegue remoto. Se conservaron los demás cambios del espacio de trabajo.

El proyecto quedó activo en `http://127.0.0.1:5273/informes`, con la API en el puerto 3101.

## Evidencia

- `output/revision-codigo-20261110/`: análisis estático, inventario, integridad y capturas del briefing.
- `output/restauracion-formato-20261110/referencias/`: extracción y renderizado de los PDF proporcionados.
- `output/restauracion-formato-20261110/exportaciones/`: matriz de exportación y manifiesto de disponibilidad.
- `output/restauracion-formato-20261110/finales/`: seis PDF regenerados, manifiesto y revisión visual de 22 páginas.
- `output/restauracion-formato-20261110/navegador/results.json`: diez descargas.
- `output/pruebas-informes-20261110/usuario/results.json`: ocho escenarios de actualización repetidos con la versión final.

Comprobadores nuevos: `test-report-reference-format.mjs`, `test-morning-brief-integrity.cjs`, `test-morning-brief-ui.cjs` y `test-news-date.cjs`.

## Revisión general del proyecto: diagnóstico inicial

Esta revisión amplía el alcance a ORION, autenticación de la SPA, Finanzas, datos de mercado y carga inicial. El diagnóstico inicial no modificó el comportamiento de producción y confirmó los hallazgos siguientes. Sus siete casos se agruparon en seis mejoras. Las correcciones posteriores se describen al final; la evidencia inicial permanece en `output/revision-general-20261110/`.

| Prioridad | Hallazgo confirmado | Evidencia y efecto | Corrección propuesta |
| --- | --- | --- | --- |
| Alta | Guardados de chat sin vínculo con la cuenta de origen | `assets/js/vall-ai-page-v4.js:298` encola contenido y lo envía con la cookie vigente; `backend/routes/chat.js:243` lo guarda bajo `req.user.sub` sin comparar propietario esperado. La simulación envió un mensaje ficticio de A cuando la sesión ya era B y comprobó que se guardó para B. `AuthContext.jsx` comprueba la sesión al montar y no sincroniza cambios entre pestañas. | Añadir identidad esperada a lecturas, guardados y borrados; validarla en servidor; cancelar respuestas y colas al cambiar cuenta, y revisar sesión al recuperar foco. Mantener la autorización existente por perfil. |
| Alta | El mapa de divisas presenta respaldo antiguo como listo | `assets/js/finanzas-currency-map.js:172` absorbe el error de cotizaciones y conserva tasas; la línea 182 establece `is-ready` y «actualización diaria». Con ambos proveedores ficticios caídos conservó el respaldo fechado 2026-08-13 y mostró ese estado. | Propagar procedencia, fecha y estado conservado hasta el mapa y su conversor; usar un solo respaldo versionado, conservando la fecha. No presentar un fallo como actualización exitosa. |
| Media | Scripts de Finanzas añadidos después del desmontaje | En el efecto de `frontend/src/pages/Finanzas.jsx:73`, `vivo` se comprueba antes del bucle y cada iteración sólo espera `setTimeout(0)`. Al desmontar después de la primera inserción, el callback siguió añadiendo cinco scripts que ya no entraron en la limpieza ejecutada. | Esperar eventos reales de carga, comprobar vigencia en cada paso y cancelar la secuencia al salir. Limpiar una ejecución tardía y mostrar un error recuperable si una dependencia falla. |
| Media | Historial bursátil conservado sin identificación | `backend/routes/market.js:561` devuelve `hit.data` después de fallar Yahoo, aunque haya vencido el TTL. Con 16 minutos de antigüedad y proveedor caído devolvió el mismo cuerpo, sin `stale` ni fecha de recuperación, manteniendo la política pública de caché normal. | Añadir estado, fecha del dato y de recuperación; definir antigüedad máxima del respaldo y cabeceras de caché acordes; mostrarlo también en los consumidores. |
| Media | ORION depende de almacenamiento del navegador disponible | Las lecturas directas en `assets/js/vall-ai-page-v4.js:21` y `:45` interrumpieron la inicialización al bloquear respectivamente `sessionStorage` y `localStorage`. También hay escrituras directas que pueden fallar por cuota. | Usar un adaptador tolerante a errores y estado en memoria; obtener identidad de la sesión verificada; permitir conversar aunque la persistencia local no esté disponible e indicar su alcance. |
| Media | La precarga pública descarga todas las secciones | `frontend/src/App.jsx:132` solicita los módulos de las nueve rutas protegidas desde un efecto sin condición de sesión. En una carga nueva de `/login`, sin autenticar, se solicitaron 25 archivos JavaScript que suman 2,164,512 bytes sin comprimir, incluidos Informes, Finanzas, Mercados, México y ORION. | Precargar según intención y sesión, con concurrencia limitada y respeto al ahorro de datos. Medir carga pública y navegación posterior por separado para conservar la fluidez. |

El caso del chat es un cruce accidental de contenido entre sesiones compartidas del mismo navegador; la prueba no demuestra acceso arbitrario a historiales de terceros. Las reproducciones de scripts, almacenamiento y respaldo usan callbacks reales con dependencias controladas, no recorridos completos contra proveedores en vivo. La medición del acceso es una observación de solicitudes y tamaños de archivos, no una prueba de velocidad móvil ni de bytes comprimidos transferidos.

### Mantenimiento y escalabilidad

Después de las correcciones de comportamiento, conviene separar responsabilidades en los módulos mayores: `finanzas-page.js` tiene 5,098 líneas, `finanzas-favro.js` 4,190, `Mercados.jsx` 3,559 y el script de ORION 2,715. En ORION se mezclan historial, sincronización, voz, adjuntos, respuesta en streaming y edición de documentos. La separación debe conservar ids y contratos del puente React, y acompañarse de pruebas de navegación, cancelación y cuenta. El tamaño por sí solo no prueba un defecto ni autoriza borrar código.

Las tasas de respaldo también se repiten entre `world-fx-fallback.js` y `FALLBACK_RATES` del mapa. Un único objeto con fecha y proveedor evita que las copias diverjan. No se identificaron archivos para eliminar con seguridad en esta revisión.

Para prevenir regresiones, el despliegue debería ejecutar una selección explícita de lint, autenticación, aislamiento de cuentas y navegación. El Dockerfile actual compila la SPA sin ejecutar esas suites; no hay un flujo de GitHub Actions en este checkout. Esto no permite afirmar que el hosting carezca de comprobaciones externas.

### Comprobaciones y evidencia

Pasaron `npm run lint`, la prueba de estructura y recursos, `test-http-resilience.cjs`, `test-frontend-resilience.mjs` y `test-auth-validation.cjs`. El diagnóstico adicional completó sus siete reproducciones: su código de salida correcto significa que la auditoría terminó, no que esos comportamientos sean correctos.

Evidencia en `output/revision-general-20261110/findings.json`, `login-prefetch.png` y `largest-modules.json`. El inventario de módulos excluye bibliotecas de terceros y archivos de datos identificados por nombre; es una selección, no una medición completa de complejidad o duplicación. Se conservaron los cambios previos del espacio de trabajo y el servidor local en ejecución.

## Corrección de los seis hallazgos generales

1. **Cuenta de origen del chat.** Cada instancia de ORION usa la identidad verificada por React y añade `X-VALL-Account` a sus solicitudes. La autenticación del servidor rechaza una identidad esperada distinta de la cookie vigente; leer, guardar o borrar el historial exige esa vinculación. La respuesta identifica también la cuenta. Se permiten y exponen las cabeceras correspondientes en CORS. Cambiar de cuenta recrea el espacio de ORION con nodos nuevos, cancela sus solicitudes y colas anteriores y limpia su contenido. El contexto de sesión revisa foco y visibilidad para detectar cambios en otras pestañas.
2. **Mapa de divisas.** El respaldo procede de un único archivo fechado. Los fallos de red, una respuesta conservada y una publicación sin fecha válida o con más de tres días se identifican como dato conservado. El mapa y su conversor conservan la fecha original. Se eliminó la reconstrucción de fechas de comparación a partir del reloj del navegador: sin comparación fechada del proveedor, el mapa no inventa una sesión anterior. Las consultas del mapa se cancelan al salir.
3. **Carga y salida de Finanzas.** La secuencia descarga cada script propio con plazo y cancelación, comprueba que sigue vigente y sólo entonces lo ejecuta como script clásico, conservando sus enlaces globales. La ejecución síncrona impide que una respuesta recibida después de salir inicialice la pantalla anterior. También evita bloquear ORION en la cola global de scripts. Se cancelan las inserciones y el arranque diferido de Finanzas; un error de carga muestra una recuperación visible. Se actualizaron las versiones de los scripts modificados.
4. **Cotizaciones conservadas.** `/api/stock-history` devuelve fuente, fecha de observación, fecha de recuperación y `stale`. Si falla el proveedor, la copia conservada mantiene sus fechas y lleva `Cache-Control: no-store`. Una copia recuperada hace más de tres días deja de utilizarse como respaldo. Inicio propaga el estado conservado y la gráfica principal de Finanzas muestra la fecha observada. La recuperación posterior del proveedor vuelve a marcar una consulta exitosa.
5. **Almacenamiento opcional de ORION.** Un adaptador en memoria cubre lecturas, escrituras y borrados cuando el almacenamiento está bloqueado o lleno. El chat puede iniciar y contestar; informa de que la persistencia local no está disponible y sigue intentando el guardado en el perfil. La identidad no depende de `sessionStorage`. Las claves por cuenta conservan el correo completo codificado para evitar colisiones por truncamiento.
6. **Carga pública.** Se retiró la precarga automática de las nueve pantallas protegidas. La precarga por intención de navegación permanece y respeta ahorro de datos y conexiones 2G. La pantalla de acceso pasó de 25 archivos JavaScript con 2,164,512 bytes a nueve con 262,798 bytes: aproximadamente 88% menos código solicitado sin comprimir en el escenario local comparado. No es una medición de velocidad móvil ni de bytes transferidos con compresión.

### Validación de las correcciones

`test-general-code-fixes.cjs` completó doce comprobaciones sin excepciones JavaScript: almacenamiento bloqueado y cuota llena, invalidación y cancelación de cuenta, carga cancelada sin ejecución, mapa en fallo y recuperación, respaldo bursátil acotado, autorización real de historial, acceso sin precargas protegidas, cambio de cuenta sin doble envío, navegación con descarga retrasada, carga completa de Finanzas y salida normal, y chat móvil con almacenamiento no disponible. La prueba adicional de navegación descubrió que eliminar un nodo de script no garantiza que deje de ejecutarse: se sustituyó la inserción pendiente por descarga cancelable y ejecución sólo mientras la pantalla sigue vigente.

Pasaron las 39 comprobaciones de seguridad HTTP, incluida la nueva cabecera en preflight; las pruebas del servidor independiente de cuentas; recuperación del frontend; datos, unidades y geometría de Inicio; y nueve recorridos de actualización, descarga y recuperación de informes. El comprobador de carga realizó 200 solicitudes con diez cuentas y 4,000 con mil identidades ficticias, todas HTTP 200. Es un ensayo local con proveedores y almacenamiento simulados y caché caliente; no acredita esa capacidad con servicios remotos. Se corrigió la correspondencia de correo e id en las identidades de esa prueba y se añadió su cabecera de cuenta.

La compilación y ESLint terminaron correctamente. Continúan los avisos previos de recursos heredados y tamaño de algunos paquetes. Las pruebas no enviaron correos ni modificaron conversaciones de cuentas reales. Se conservaron los demás cambios existentes y se reinició el proyecto local: `/informes`, `/orion` y `/api/health` respondieron con HTTP 200; el historial sin sesión respondió 401.

Evidencia de regresión: `output/correcciones-generales-20261110/results.json`, capturas del chat y de Finanzas y `informes/results.json`. El ensayo de carga se guarda en `output/seguridad-carga/carga.json`. `audit-general-code.cjs` ejecuta ahora las comprobaciones actuales para no dejar un diagnóstico que espere encontrar los fallos ya corregidos. La separación de los módulos grandes continúa como mejora futura independiente.

## Test de vulnerabilidades · 10 de noviembre de 2026

Se ejecutó una evaluación local del código, las API y las dependencias. Esta fase añadió comprobadores y evidencia; no actualizó paquetes, no rotó credenciales ni cambió la autenticación de producción. Los proveedores, perfiles, contraseñas y tokens utilizados en las pruebas son ficticios. Las solicitudes de prueba se dirigieron a servidores desechables, nunca al servidor del proyecto en uso. La única consulta externa de la auditoría automática fue al registro público de npm para los avisos de dependencias.

### Controles que pasaron

Las nueve suites locales terminaron correctamente: TLS/SSRF, seguridad HTTP, aislamiento de análisis privados, dos suites de XSS, validación de autenticación, servidor de cuentas, vinculación de propietario en informes y abuso de entradas. Incluyen 39 comprobaciones HTTP y de recursos, 44 casos de XSS y dos controles válidos, y 23 límites y estructuras inválidas de informes. Se verificaron JWT manipulados o expirados, acceso sin sesión, orígenes ajenos, adjuntos de otro usuario, parámetros maliciosos, límites de recursos y archivos internos no publicados. Pasar estos casos no prueba la ausencia de vulnerabilidades distintas de las ensayadas.

El escaneo censurado revisó 1,187 archivos versionados, nuevos no ignorados y de las distribuciones públicas: no encontró coincidencias con los patrones de credenciales ni con los valores locales comparados. Los archivos de entorno examinados no están versionados y la contraseña local configurada está en formato bcrypt. No se revisó el historial Git, no se probaron credenciales y no se imprimieron sus valores.

Las pruebas adicionales confirmaron que desactivar una cuenta ordinaria la bloquea después del TTL documentado de 15 segundos; cambiar su contraseña invalida la versión de credenciales anterior y crea una sesión nueva válida; desactivar el consentimiento de entrenamiento prevalece sobre el claim antiguo del JWT.

### Dependencias señaladas

| Alcance de npm audit | Críticas | Altas | Moderadas | Bajas | Total de paquetes señalados |
| --- | ---: | ---: | ---: | ---: | ---: |
| Raíz, incluyendo desarrollo | 1 | 5 | 3 | 2 | 11 |
| Raíz, sólo producción | 1 | 1 | 3 | 2 | 7 |
| Frontend, incluyendo desarrollo | 0 | 2 | 0 | 0 | 2 |
| Frontend, sólo producción | 0 | 0 | 0 | 0 | 0 |

Los totales son paquetes afectados y propagaciones de avisos, no vulnerabilidades independientes. `npm audit` describe los lockfiles, que se contrastaron con las versiones instaladas.

- **DOMPurify 3.4.16, transitiva de Mermaid: aviso crítico.** El mantenedor identifica un bypass con `SAFE_FOR_TEMPLATES` combinado con modos de salida DOM, corregido en 3.4.17. Se confirmó la versión afectada instalada; no se demostró explotación de esa configuración en la aplicación. El código del chat configura Mermaid como `strict`. Además, la copia pública `assets/js/vendor/mermaid.min.js` incorpora DOMPurify 3.4.0: es distinta de la versión npm y requiere una revisión y actualización propia; no debe asumirse que actualizar npm renueva ese archivo. [Aviso primario del mantenedor](https://github.com/cure53/DOMPurify/security/advisories/GHSA-cg2g-xh64-v4q7).
- **body-parser 2.3.0: aviso alto de disponibilidad.** Está instalado como dependencia de Express, utilizado por el parser JSON de la API. El mantenedor publicó la corrección en 2.4.0. Se enviaron tres cuerpos comprimidos con bytes adicionales, usando gzip, deflate y Brotli, contra tres procesos API desechables: ninguno cayó y los tres conservaron `/api/health` con HTTP 200. Esa reproducción limitada no invalida el aviso ni acredita que todas sus variantes sean seguras. [Publicación del mantenedor](https://github.com/expressjs/body-parser/releases/tag/v2.4.0), [detalle del aviso](https://github.com/advisories/GHSA-27r3-jxmh-p828).
- **Otros paquetes de producción señalados:** `ip-address` 10.7.3, `nodemailer` 10.0.15 y `qs` 6.16.0, con avisos moderados; `katex` 0.16.47 y su propagación a `mermaid` 11.17.2, con aviso bajo. Sus condiciones de explotación no se reprodujeron en esta evaluación. El arreglo que propone npm para Mermaid/KaTeX incluye un cambio de versión mayor; no se ejecutó `npm audit fix --force`.
- **Desarrollo y reproducibilidad:** el lockfile del frontend conserva Vite 6.4.3 y source-map-js 1.2.1, señalados por npm, mientras que están instalados 6.4.5 y 1.2.2, fuera de los rangos de esos avisos. Una instalación limpia usaría el lockfile antiguo. La raíz también señala la cadena de Puppeteer/chromium-bidi y su Zod 3.25.76 de desarrollo. El Zod directo de la aplicación es otro nodo y no debe confundirse con esa copia transitiva.

### Hallazgos de configuración y sesiones

1. **Secreto JWT local por debajo de 32 bytes.** El escáner confirmó esa propiedad en `backend/.env`, sin revelar valor ni longitud exacta. Debe reemplazarse por una clave aleatoria con al menos 256 bits de entropía y revisarse por separado la configuración del hosting. No se intentó adivinar la clave ni falsificar sesiones reales. La rotación invalidaría las sesiones existentes y no se realizó durante el test.
2. **Token reutilizable después de logout: confirmado, prioridad media.** `/api/logout` elimina la cookie, pero una copia del token firmado continuó siendo aceptada por `/api/verify-token`. En la simulación quedaban ocho horas de vigencia. No permite falsificar un token: implica que quien ya tenga una copia puede continuar usándola hasta su vencimiento o cambio de versión de credenciales. Conviene añadir revocación por sesión/`jti` en un almacén compartido. [Referencia de OWASP sobre terminación de sesiones JWT](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html).
3. **Excepción del administrador de configuración: confirmada, prioridad media y decisión de política.** En `verifyToken`, un JWT con el rol administrador y el correo configurado omite los controles ordinarios del perfil. Una simulación con perfil inactivo y versión de credenciales distinta obtuvo HTTP 200 al verificar sesión. La gestión de perfiles sí comprobó el perfil y devolvió 403. La excepción ayuda al acceso de emergencia; impide tratar la desactivación del perfil como revocación general del administrador configurado. Debe limitarse explícitamente al escenario de recuperación previsto o aplicarse una política uniforme de revocación.

Prioridad sugerida: actualizar y verificar las dependencias afectadas, revisar la clave de firma, resolver revocación de sesiones y excepción administrativa, y sincronizar lockfiles y recursos vendorizados. Son pendientes de esta auditoría, no correcciones aplicadas.

### Evidencia y reproducción

Resultados censurados en `output/vulnerabilidades-20261110/`: `local-summary.json`, cuatro informes `npm-*.json`, `dependencies-summary.json`, `dependency-inventory.json`, `secrets-redacted.json`, `session-checks.json` y `compressed-body-checks.json`. Los logs registran la ejecución de cada suite, sin claves reales ni tokens. Comandos:

```powershell
node scripts/security-assessment.cjs
node scripts/security-assessment.cjs --dependencies-only
node scripts/audit-secrets.cjs
node scripts/security-assessment.cjs --inventory-only
node scripts/security-session-checks.cjs
node scripts/security-compressed-check.cjs
```

Los comprobadores de sesiones y compresión salen correctamente cuando termina el diagnóstico; sus campos `findings` y `crashed` indican el resultado de seguridad. Se ejecutaron con Node 26.3.0 de esta estación; Docker declara Node 22.23.4. Conviene repetir las pruebas específicas de dependencias en la versión de ejecución del despliegue antes de cerrar sus avisos. No son una certificación de infraestructura, dependencias remotas, configuración del hosting ni disponibilidad de proveedores. Se mantuvo activo el proyecto local.

## Correcciones de seguridad posteriores a la auditoría

Se actualizaron las dependencias afectadas y ambos lockfiles, sin usar `npm audit fix --force`. Express quedó en 5.3.0, Nodemailer en 10.5.0 y Mermaid en 12.3.0. La copia pública de Mermaid se sincronizó con el paquete oficial y contiene DOMPurify 3.4.17. Su integridad se verifica con `node scripts/sync-mermaid-vendor.cjs --check`. Las cuatro auditorías finales de npm —raíz y frontend, completas y sólo de producción— terminaron con cero avisos. Esto describe los avisos conocidos del registro consultado, no garantiza ausencia de vulnerabilidades.

La clave JWT de `backend/.env` se reemplazó por 64 bytes aleatorios, sin imprimir el valor ni crear copias de la clave antigua. El arranque ahora exige al menos 32 bytes. Se levantó el proyecto con la clave nueva: las sesiones anteriores requieren iniciar sesión otra vez. Las variables del hosting no se modificaron. El escaneo final censurado revisó 1,194 archivos y no encontró coincidencias de credenciales; confirmó la clave mínima y la contraseña local en bcrypt.

Cada sesión nueva recibe un identificador aleatorio. El cierre de sesión persiste una huella de los claims verificados antes de borrar la cookie; no guarda JWT, correos ni contraseñas. La API consulta la revocación en cada solicitud autenticada. Dos procesos que comparten el directorio leen el mismo estado y un reinicio no recupera la sesión revocada. Los registros vencidos se limpian y una saturación no elimina revocaciones aún vigentes. Si no se puede confirmar la revocación, el servidor responde 503 sin anunciar éxito; la interfaz conserva su contexto, muestra el error y permite reintentar. Cerrar una sesión no invalida otra sesión independiente.

El administrador configurado también debe tener perfil activo, correo coincidente y versión de credenciales vigente. El login no reactiva perfiles deshabilitados. Sólo fuera de producción y Vercel se permite recuperación local con las credenciales configuradas durante una caída del almacén: dura cinco minutos y no prevalece sobre un perfil que responde como inactivo. Producción devuelve 503 si no puede comprobar el perfil. Se eliminaron la excepción general del administrador y la aceptación permisiva de perfiles ausentes en pruebas; las fixtures proporcionan perfiles explícitos.

### Almacenamiento y requisito previo al despliegue

El modo local usa `backend/cache/session-revocations`; para contenedores debe mantenerse en un volumen persistente. `VALL_SESSION_STORAGE_DIR` permite configurar ese directorio. Instancias en hosts distintos necesitan `VALL_SESSION_REVOCATION_STORE=database`. Vercel selecciona automáticamente el modo de base de datos. El modo en memoria se admite exclusivamente con `NODE_ENV=test`.

Se preparó `backend/db/migrations/020_session_revocations.sql`, con tabla privada, índice de vencimiento, RLS y acceso del servicio. **La migración no se aplicó a la base remota y debe aplicarse antes de desplegar esta versión en Vercel o activar el modo database.** La comprobación de conectividad no pudo confirmar disponible el almacén remoto; las pruebas SQL utilizaron un adaptador simulado. Para preparar y aplicar, respectivamente:

```powershell
node scripts/apply-session-revocations-migration.cjs
node scripts/apply-session-revocations-migration.cjs --apply
```

El segundo comando requiere una conexión PostgreSQL administrativa del entorno de destino. Sin la tabla o sin acceso al almacén, las comprobaciones de revocación responden 503; no permiten acceso sin verificar. No se desplegó esta versión ni se modificó infraestructura remota.

### Validación de las correcciones de seguridad

Pasaron las nueve suites de la auditoría general de seguridad, la migración de credenciales heredadas y la suite de sesiones. La prueba adicional de sesiones completó siete casos: desactivación, cambio de contraseña, consentimiento vigente, fallo del almacén de revocación, rechazo de un token tras logout conservando otra sesión, restricciones del administrador y recuperación local limitada. No quedaron hallazgos en esas reproducciones. Las pruebas del almacén cubrieron persistencia entre instancias y reinicios, escrituras concurrentes, caducidad, registros corruptos, rutas inválidas, adaptador SQL y rechazo de una clave corta.

En Chromium pasaron cinco diagramas Mermaid, incluidos contenidos hostiles y enlaces ejecutables, sin excepciones JavaScript. Las trece comprobaciones de navegación y aislamiento de cuentas también pasaron e incluyen el fallo y reintento del botón de salida. Las pruebas usan cuentas y proveedores ficticios; no envían correos ni escriben perfiles reales. ESLint terminó sin errores. Los detalles finales están en `output/seguridad-corregida-20261110/`, especialmente `dependencies-summary.json`, `local-summary.json`, `session-checks.json`, `secrets-redacted.json` y `mermaid-browser.json`; la navegación queda en `output/correcciones-generales-20261110/results.json`.

La compilación final terminó correctamente, con 412 fuentes revisadas sin referencias rotas ni módulos huérfanos. Permanecen los avisos anteriores de hojas de estilo estáticas resueltas en ejecución y paquetes grandes. Tres API desechables conservaron `/api/health` con HTTP 200 tras cuerpos gzip, deflate y Brotli malformados, sin caídas; esta reproducción limitada no cubre todas las variantes del aviso corregido. El comprobador ahora devuelve fallo si detecta caída o pérdida de disponibilidad.

La regresión final de informes completó nueve escenarios: PDF mostrado y descargado idénticos, aviso de nuevo corte sin sustituir la lectura abierta, novedades del siguiente corte, aceptación del nuevo corte, corrección con la misma fecha, recuperación ante fallos de actualización y generación, tablas visibles en móvil sin desbordamiento y bloqueo de datos anteriores tras cambiar de cuenta. No hubo excepciones JavaScript. Los PDF de ensayo y sus huellas están en `output/seguridad-corregida-20261110/informes/`; sus precios son sintéticos.

Se comprobaron `/informes`, `/orion` y `/api/health` con HTTP 200; el historial sin sesión respondió 401. La comprobación local se realizó con Node 26.3.0: sigue pendiente la validación del entorno de despliegue con la versión Node declarada y su conexión remota.

## Ampliación de pruebas de seguridad

`node scripts/test-security-extended.cjs` completó **40 casos adicionales, todos correctos**. Las pruebas utilizan una API en un puerto aleatorio de loopback, cuentas ficticias, almacenes temporales y adaptadores SQL/REST simulados; bloquean las solicitudes fetch a hosts externos. No se dirigen al proyecto activo, no envían correos y no utilizan credenciales ni bases de datos remotas.

- **Revocación persistente:** límite de registros sin expulsar revocaciones vigentes, logout repetido con almacén lleno, liberación de capacidad al caducar, registros grandes o inválidos y prohibición del modo en memoria en producción. Cuatro procesos escribieron 16 revocaciones distintas; también revocaron simultáneamente la misma sesión, sin archivos temporales pendientes. Un quinto proceso leyó correctamente una revocación escrita antes de su arranque.
- **Continuidad del almacén compartido:** cierre de conexiones SQL fallidas y respaldo mediante el adaptador REST privado; una lectura permitida anterior no se conserva después de otra revocación. Los errores de lectura o escritura REST se propagan como fallos, sin autenticar ni anunciar logout exitoso.
- **Archivos privados:** ocho guardados simultáneos respetaron el límite de dos archivos por propietario, manteniendo intactos los aceptados. Se verificaron cupo global, aislamiento entre propietarios, normalización del correo, rechazo de rutas o metadatos inseguros, modificación del binario sin cambiar su longitud, JSON corrupto y metadatos demasiado grandes.
- **Autenticación HTTP real:** diez variantes de JWT rechazadas —sin firma, clave o algoritmo distintos, vencido, aún no válido, sin emisión, sin sujeto, correo ajeno, malformado y demasiado grande—. Los permisos actuales del perfil prevalecieron sobre el rol del JWT y una cabecera de cuenta anterior devolvió conflicto. Una cookie de otra cuenta prevaleció sobre el bearer sin revelar archivos ajenos.
- **Entrega y cierre de sesión:** exportación autenticada con descarga privada sin caché compartida; rechazo sin sesión o con otro propietario; ocho intentos concurrentes de exportación con propietario ajeno sin crear archivos. La caída del almacén de revocación bloqueó verificación y exportación incluso con perfil en caché. Dieciséis solicitudes simultáneas de logout terminaron correctamente, invalidaron el token y su acceso al archivo y conservaron otra sesión independiente.

ESLint pasó para el comprobador añadido. No se necesitaron cambios adicionales en la aplicación para superar estos casos. La evidencia individual, duración y alcance están en `output/seguridad-ampliada-20261110/results.json`; el log completo queda en `output/seguridad-ampliada-20261110.log`. Pasar estos escenarios no verifica la infraestructura remota: siguen pendientes la migración 020 y la validación del entorno de despliegue descritas arriba.

## Mejoras de conversación y respuestas de ORION

Se reprodujeron problemas concretos con un ejercicio ficticio de 1,000 kg de cerdo: compra 80 MXN/kg, venta 110 MXN/kg, merma 8% y flete fijo de 5,000 MXN. Un encargo nuevo como «Ahora compara maíz y trigo» conservaba el lote anterior; «Perfecto» volvía a entrar al análisis; las correcciones de merma o flete con «ahora es» no se reconocían; y pedir una frase recibía instrucciones contradictorias de escribir entre 120 y 180 palabras. El archivo `output/orion-respuestas-20261110/before.json` contiene 19 reproducciones seleccionadas de estos fallos. No es una calificación general del asistente.

### Comportamiento aplicado

- Las comparaciones y análisis que nombran otro asunto pueden terminar el encargo anterior sin arrastrar sus costos. Las referencias como «eso», «agrega Brasil» o los cambios de presentación conservan el seguimiento correspondiente. Los agradecimientos y confirmaciones breves responden localmente, sin iniciar otra investigación.
- Las variaciones de venta, compra, merma, flete y volumen recalculan el ejercicio con el motor numérico. Se conserva lo no modificado y se compara el resultado con el cálculo anterior cuando ambas bases son de lote. El parser acepta correcciones naturales y notación como `1.200,50`; valores negativos o porcentajes usados en lugar de precios requieren corrección. Cambiar una venta a USD no convierte silenciosamente costos anteriores en MXN.
- El cálculo por kg puede resolver margen sobre venta, costo vendible y recargo sobre costo sin inventar volumen. Si hay gastos fijos del lote, necesita el peso para distribuirlos. La base por kg se identifica explícitamente y no se presenta su resultado como utilidad total. El recargo con costo cero se identifica como no definido.
- Un módulo compartido de extensión elimina las instrucciones contradictorias para una frase, dos oraciones o un máximo de palabras. El cálculo local también respeta la respuesta breve. Un informe con límite explícito no se amplía automáticamente a mil palabras; los documentos sin ese límite conservan su requisito anterior.
- Si se piden cálculo y explicación de riesgos, el resultado numérico del servidor se entrega al modelo como contexto verificado y se conservan ambas partes de la solicitud. Se evita repetir o duplicar el texto transmitido por streaming.
- El perfil de importador ya no activa automáticamente reglas específicas de proteínas. La guía cambiaria distingue compra spot hoy, exposición abierta y condiciones de un forward; conserva los supuestos y no presume mercancía, unidad por kg o ausencia de garantías. Las preguntas que cuestionan si puede garantizarse una predicción no se interpretan como una orden de emitir otro pronóstico. Como referencia conceptual se consultó el glosario de tipos de cambio de [INEGI](https://www.inegi.org.mx/contenidos/productos/prod_serv/contenidos/espanol/bvinegi/productos/nueva_estruc/702825007056.pdf).

### Simulaciones y alcance de la comprobación

`node scripts/simulate-orion-conversation.cjs` cubre 36 comprobaciones locales, incluidos ambos caminos de respuesta y streaming. Diecinueve corresponden a los fallos seleccionados del diagnóstico inicial; el resto amplía la cobertura. La generación simulada sirve para verificar rutas, cálculos, contexto y formato, no para puntuar redacción real.

También se ejecutaron muestras con Gemini mediante `--live`, usando exclusivamente preguntas y datos ficticios, sin conversaciones de usuarios ni herramientas de búsqueda. Se revisaron las respuestas y se ajustó la separación entre contexto cambiario y comercial, la clasificación de preguntas sobre garantías y la distinción entre resultado del ejercicio y utilidad neta. La muestra final contiene tres respuestas completas: una sola oración para margen/recargo, comparación de pago spot/forward de 79 palabras y respuesta sobre la ausencia de garantías de 78 palabras. Los límites pedidos eran 100 y 80 palabras, respectivamente; el contador excluye separadores Markdown. Las rondas intermedias se conservan en archivos separados. No se entrenaron ni cambiaron pesos del proveedor. Esta revisión muestral no acredita exactitud general de noticias, cotizaciones o recomendaciones.

Pasaron las suites de inteligencia, regresiones de respuesta, 59 casos de negocio de proteínas, contrato de chat, precios verificados, prioridades de ORION, MCP, respuesta de IA y seguridad de sesiones. La prueba de navegador verificó perfil, recarga, cinco cálculos con memoria, cálculo por kg y corrección natural de merma, pronóstico y fuentes en escritorio y móvil. La prueba de precios se reforzó para comprobar que cada tabla alterada se sustituye exactamente por la tabla respaldada: una sustitución segura puede tener `changed=true` sin `blocked=true`. El fixture de créditos proporciona ahora un perfil administrador activo explícito, conforme al control de perfiles introducido en la corrección de seguridad.

La evidencia principal queda en `output/orion-respuestas-20261110/after.json`; las capturas y el resultado del navegador están en `output/analisis-inteligencia-orion/navegador-inteligencia.json` y `margen-por-kilo-movil.png`. Las comprobaciones con cuentas reales, base remota y condiciones del hosting quedan fuera de estas simulaciones.

El cierre de esta fase confirmó 36/36 simulaciones, 90 comprobaciones de inteligencia, 25 regresiones de respuesta y los 59 casos de negocio, además del control HTTP de créditos y la prueba ampliada de navegador. ESLint pasó. Se reparó una línea incompleta de Configuración que interrumpía la revisión sintáctica de la compilación; la compilación final revisó 413 fuentes sin referencias rotas ni módulos huérfanos y terminó correctamente, conservando los avisos de tamaño de paquetes conocidos. Se reiniciaron exclusivamente los procesos verificados del proyecto en 5273/3101. `/orion`, `/informes` y `/api/health` respondieron 200; `/api/chat-usage` sin sesión respondió 401. El log de compilación y el comprobante de disponibilidad están en la misma carpeta de evidencia de ORION.


## ORION: memoria financiera, escenarios y revisión de afirmaciones

La segunda etapa amplía la memoria estructurada a divisas, bonos y bolsa. Conserva activo, países, periodo, horizonte, objetivo y formato dentro de la conversación. Los campos se validan y limitan; las correcciones posteriores prevalecen y los límites de fecha se mantienen aunque el resumen de ajustes ya haya descartado turnos antiguos. Se probaron cadenas de 35 seguimientos, recarga sin el historial original, cambio de mercado y separación entre condiciones del usuario y texto del asistente. La memoria no acredita una cotización ni se comparte entre cuentas.

El motor comercial compara una o dos variables, hasta cinco valores por variable y 25 combinaciones. Calcula resultados de venta, compra, merma y flete con el servidor; conserva el caso base y permite aplicar una fila mediante «Usa el escenario 2». Se distingue resultado por kg de resultado del lote. Una merma inválida, una moneda incompatible o importes fuera del rango monetario seguro impiden entregar una comparación parcial engañosa.

También se añadieron escenarios de pagos en divisas con hasta cinco tipos aportados por el usuario. El importe se multiplica por cada tipo, con dirección explícita del par y unidades de salida. Por ejemplo, «Pago 10000 USD; compara escenarios USD/MXN 18, 19 y 20» produce costos hipotéticos de 180000, 190000 y 200000 MXN. No son cotizaciones, forwards ejecutables ni pronósticos y excluyen comisiones y financiación. Cambiar el importe invalida la selección anterior; pedir después una cotización actual vuelve a exigir evidencia externa. Los pares del ejercicio admiten USD, MXN, EUR, GBP, CAD, BRL y JPY.

La revisión de afirmaciones contrasta cotizaciones explícitas con observaciones estructuradas: activo completo, valor, moneda o porcentaje, y fecha y enlace cuando se indican en el texto. Retira valores sin respaldo y promesas explícitas de ganancia. Un número con separador de miles no valida una cotización mil veces menor. Las observaciones FX se incorporan a la evidencia estructurada con el par y la fuente correspondientes. Las respuestas financieras se revisan antes de transmitir su cuerpo; los estados de avance y la conexión SSE permanecen activos. Esto puede retrasar el primer fragmento de texto respecto a una transmisión sin revisión. El control cubre patrones de afirmación concretos; no certifica la verdad de cualquier argumento, causa, noticia o recomendación ni la exactitud del proveedor de datos.

Se consolidó la instrucción de extensión para evitar duplicarla entre la estrategia y el prompt. Las preguntas de aclaración se reservan para condiciones indispensables de un cálculo o una decisión personalizada. Las definiciones y revisiones conceptuales deben contestarse sin pedir datos de negocio innecesarios. Las consultas nuevas sobre forwards y swaps entran al dominio financiero; eso no habilita programación ni temas ajenos al alcance del asistente.

### Pruebas y evidencia de esta etapa

El comprobador `scripts/test-orion-next-improvements.cjs` completó **68/68 casos**, incluidos ambos caminos de respuesta y streaming, persistencia de condiciones, selección explícita de escenarios, rechazo de cotizaciones alteradas y garantías y límites de formato. Pasaron además las suites existentes de inteligencia (90 comprobaciones), respuesta (25 regresiones), negocio de proteínas (59 casos), contrato de chat, precios, prioridades, respuesta de IA, créditos, sesiones y los seis grupos de aislamiento de análisis privados. ESLint y la compilación terminaron correctamente; se conservaron los avisos previos de tamaño de paquetes.

La prueba de navegador completó 13 turnos con el bundle real, autenticación y proveedores simulados. Verificó tablas, selección comercial y cambiaria, recarga de memoria financiera y presentación móvil sin desbordar la página. Las tablas anchas permiten desplazamiento horizontal dentro del mensaje. Se repitió la prueba después de terminar la compilación: ejecutarlas simultáneamente puede hacer que el navegador lea archivos mientras se regeneran. No se envió correo ni se utilizaron conversaciones de usuarios reales.

Tres muestras con Gemini, exclusivamente con datos ficticios y sin búsqueda de fuentes, conservaron el objetivo financiero, explicaron los escenarios calculados y respondieron una consulta conceptual sin pregunta adicional; respetaron los límites de 90, 100 y 80 palabras. Se guardaron las respuestas completas para revisión. Es una evaluación muestral de controles y comportamiento, no una certificación de calidad general ni de idoneidad de recomendaciones. No se entrenaron pesos del proveedor ni se desplegó esta versión en el hosting.

Resultados: `output/orion-mejoras-20261110/results.json`, `tests.log`, `live-samples.json` y `build.log`. La prueba visual y sus capturas están en `output/analisis-inteligencia-orion/navegador-inteligencia.json`, `escenarios-movil.png` y `escenarios-divisas-movil.png`.

Para reproducir, primero compilar y después ejecutar la prueba del navegador; la muestra con proveedor es optativa y usa la configuración local:

```powershell
node scripts/test-orion-next-improvements.cjs
npm run build
node scripts/test-orion-intelligence-ui.cjs
node --use-system-ca scripts/evaluate-orion-next-live.cjs --run
```

### Paleta de los paneles auxiliares de Informes

Se detectaron fondos claros y etiquetas pastel en paneles de consulta insertados en la interfaz oscura. «Qué cambió», «Estado de los datos», «Comparar ediciones guardadas» y «Alcance de esta exportación» comparten ahora una clase de presentación y la paleta azul de Informes. Se armonizaron también tablas, campos, botones, selector de formato y controles del visor PDF. El documento y su papel blanco conservan su formato. Los indicadores de vigencia mantienen su texto y un punto de estado; no califican la conveniencia de una inversión.

Las novedades comparan cortes abiertos durante la sesión; el historial compara ediciones archivadas. La cobertura permite revisar fechas y frecuencia de las fuentes, y el alcance explica qué contiene el PDF y dónde consultar los anexos. Estos controles no modifican los datos.

Validación: ESLint de los cuatro componentes sin errores; compilación correcta; revisión visual con perfil y API ficticios en escritorio y móvil, sin errores de JavaScript ni desbordamiento de página. Pasaron nueve escenarios existentes de actualización, correcciones, conservación de lectura ante fallos, reintento, tablas, aislamiento entre cuentas y coincidencia entre PDF previsualizado y descargado. Las capturas visuales utilizan un PDF ficticio, mientras que los escenarios funcionales usan el exportador del proyecto. Evidencia en `output/revision-color-informes-20261110/`: carpetas `before`, `after` y `funcional`, además de `build.log` y `funcional.log`. No se desplegó al hosting.
### Recuperación de carga de secciones

Ante el aviso «No pudimos cargar esta sección» al entrar a `localhost:5273/informes`, la comprobación HTTP respondió correctamente y una sesión nueva con perfil ficticio pudo cargar las bibliotecas actuales. No se capturó la excepción original de la pestaña del usuario; por tanto, no se atribuye de forma confirmada a su conexión ni a un archivo concreto.

Se corrigió una limitación reproducible del contenedor de errores: un fallo al importar una sección dejaba rechazada la carga de React.lazy hasta una recarga manual. Los errores reconocidos de descarga de módulos o CSS ahora intentan una recarga completa con un límite por ruta de una vez en 60 segundos, conservando URL y sesión. Se evita el intento automático sin conexión o con almacenamiento bloqueado. Los errores al mostrar componentes mantienen la recuperación manual y un mensaje distinto del de descarga; ya no se indica que todo fallo sea de conexión.

Validación: compilación y ESLint correctos, suite de resiliencia existente aprobada y cinco escenarios en `scripts/test-route-recovery-ui.cjs`: fallo temporal, persistente, render, sin conexión y almacenamiento bloqueado. Se verificaron recuperación manual, límite de recarga y conservación de consulta y sesión. El diagnóstico adicional abrió las 14 lecturas de Finanzas, Mercados y México desde el servidor Vite de localhost, utilizando datos de caché y perfil ficticio, sin errores de JavaScript. En ese diagnóstico se desactivó deliberadamente la exportación con HTTP 503; no constituye una prueba del exportador. Evidencia en `output/pruebas-recuperacion-rutas/` y `output/revision-carga-informes-20261110/`. Para reproducir la regresión del navegador, compilar primero y después ejecutar `node scripts/test-route-recovery-ui.cjs`.

