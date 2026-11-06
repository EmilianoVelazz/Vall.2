# Librería anual y Anexos

La página de Informes incorpora tres secciones: Informes diarios, Librería y Anexos. El usuario confirmó que Anexos debe ofrecer fuentes, tablas y metodología; no se añadió carga de archivos.

## Ediciones y navegación

La librería contiene los mismos 14 temas de Finanzas, Mercados y México para 2022, 2023, 2024 y 2025: 56 ediciones. Permite elegir año, familia y reporte, buscar títulos, leer la edición, descargar PDF/CSV y abrir sus anexos. Los filtros de Anexos distinguen diario/anual, año, familia e informe. Se incluyen enlaces públicos originales y tablas completas de respaldo.

Los informes diarios conservan sus cálculos por dos sesiones y se mantienen montados al alternar secciones para no perder borradores. Una entrada directa a `?seccion=libreria&anio=2022` sólo carga el archivo anual, sin disparar una consulta oculta de informes diarios. Las selecciones y peticiones se cancelan o validan para evitar mezclar datos de años distintos.

## Identidad anual

Cada edición conserva `periodType: annual`, `reportYear`, título, periodo enero-diciembre y fecha actual de preparación. Es una reconstrucción retrospectiva con la versión histórica disponible al prepararla; no se presenta como informe publicado originalmente en 2022–2025 ni como datos conocidos exactamente al cierre de aquel año.

`shared/report-annual.mjs` se resuelve antes que los modelos diarios de bolsa, bonos o mercados. Se utiliza en pantalla, texto, CSV y PDF. Las exportaciones y copias guardadas conservan año, doce muestras mensuales cuando existen y hasta doce gráficas; no aplican el recorte de dos sesiones. Las fuentes anuales admiten hasta 96 enlaces.

## Fuentes y cálculos

- Bolsa: catálogo internacional existente (62 referencias; 42 series históricas conectadas en la comprobación), historia de cierres de Yahoo Finance. Unidades en puntos y cambios de precio, sin atribuir dividendos. Las trayectorias de índices con escalas diferentes se normalizan a base 100, manteniendo niveles originales en las tablas.
- Bonos: Treasury diario, CETES de Banxico cuando está configurado el conector, OCDE/BCE mensuales; 65 referencias en la comprobación. Cambios en puntos base de rendimiento, no retorno total de bonos. Las fuentes mensuales conservan su método y moneda; no se empalman métodos por país.
- Divisas: nueve pares USD/moneda, con unidades locales por un dólar.
- Materias primas: 23 contratos internacionales existentes, historia de Yahoo/Sina con identidad, moneda y unidad contrastadas. Series continuas sin ajustar y sujetas a cambios de vencimiento.
- Proteínas globales: contratos de ganado/cerdo/alimento, diez historiales físicos de RNM y cuatro precios minoristas mensuales de BLS. Se distinguen especies, presentaciones, nivel comercial, unidad y frecuencia. RNM se consulta mediante su formulario público de periodos para recuperar 2021–2025, en lugar de limitarse a la ventana reciente de su página inicial.
- Macro: WDI del Banco Mundial, para 15 economías/agregados, usando exclusivamente el valor de cada año. No se rellena un año ausente con el más reciente.
- Proteínas de México: cuatro productos de SNIIM (pollo entero, toro en pie, cerdo supremo en pie y huevo blanco) para las 32 entidades: 128 referencias explícitas con datos ausentes identificados. La agrupación nativa “D.F. y Zona Metropolitana” conserva ese alcance, sin reducirla a una cotización exclusiva de Ciudad de México. No se confunden kg vivos, kg de producto ni docenas.
- Agricultura estatal: CSV oficial municipal de DGSIAP para cada uno de los cuatro años, agregado por entidad, cultivo y tonelada, sin duplicar registros. Los resultados de 2025 coinciden con el catálogo estatal existente en las cuatro variables comprobadas. Minería estatal sólo utiliza el anuario 2024 incorporado; 2022, 2023 y 2025 señalan explícitamente la ausencia del desglose y no repiten 2024.
- Noticias: selección de publicaciones oficiales fechadas de la Reserva Federal y OMC, acompañada de indicadores y contexto de mercados. No se presenta como hemeroteca exhaustiva. Los pronósticos publicados entonces no se convierten en resultados observados de cierre.

El cambio anual exige doce meses de observaciones y cierres válidos de diciembre contra diciembre anterior. Para fuentes diarias/semanales se exige que la observación final y la base estén próximas al cierre del año (máximo diez días); para mensuales se usa el periodo de diciembre. Los promedios son aritméticos de observaciones disponibles, sin ponderación por volumen; menos de doce meses se identifica como parcial. BLS tiene un hueco de octubre de 2025 que se conserva. No se inventan cotizaciones para completar el año.

Las gráficas mensuales de fuentes diarias toman el último cierre de cada mes, no un promedio mensual. Los índices de precio se mantienen separados de unidades de precios físicos y de tasas. Los niveles originales se conservan en tablas, y las cifras de presentación se redondean para evitar ruido de coma flotante; el histórico bruto queda disponible para auditoría local.

## Persistencia y operación

`backend/routes/report-library.js` expone catálogo y ediciones anuales con la misma autenticación del resto de informes. Valida años permitidos, sin rutas de archivos derivadas de entradas del usuario. No se envían credenciales de proveedores al cliente.

La librería queda persistida en `backend/cache/annual-report-library.json`. El histórico de importación se conserva en `backend/cache/annual-history-data.json`, sin secretos. La auditoría resumida está en `output/otros-informes/auditoria-libreria-anual.json`. Son archivos generados, ignorados por Git. Si no hay caché, el servidor construye una sola librería compartida por solicitudes concurrentes y la persiste; un reintento no relabela informes diarios. Para regenerar desde el histórico importado: `node scripts/build-annual-report-library.cjs`; para consultar de nuevo las fuentes: añadir `--refresh`.

## Verificación

`scripts/test-report-annual-library.mjs` verifica cálculos, exclusión de fechas, precios BLS, agregado agrícola, ausencias, 56 identidades, año en copias/exportaciones, CSV, conservación de tablas y gráficas, concurrencia y caché en disco. `scripts/test-report-library-ui.mjs` recorre 56 ediciones, cuatro años y tres familias, búsqueda, error/reintento, Anexos, PDF y pantallas de 390/768/1440 px, y regresa a los diarios. Las pruebas previas de proteínas y bonos globales también se ejecutan para comprobar que la nueva composición no altera sus comparaciones diarias.

Los PDF de comprobación son artefactos temporales, no entregables separados: bolsa 2022, proteínas 2025 y producción 2024. Se renderizan y revisan visualmente junto con pantalla de librería y anexos móviles.
