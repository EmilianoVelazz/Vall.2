# Informes de mercados: enfoque y edición semanal

## Comportamiento

- Se retiraron las tarjetas iniciales de indicadores y el bloque «Fecha y cobertura». Las fechas de las observaciones y del corte se conservan para identificar los datos.
- El resumen reúne lectura de la sesión, movimientos por horizonte y mecanismos posibles de causa e impacto. Se eliminó la sección separada que repetía ese análisis. Las hipótesis no se presentan como causas demostradas.
- Bolsa permite elegir un índice de referencia y compararlo con las demás plazas, comenzando por América. Sólo calcula diferencias entre bolsas con las mismas fechas base y final.
- Divisas usa una tabla unificada y una gráfica relativa de seis meses, con base común explícita. Las comparaciones anuales permanecen en la tabla. Se excluye de la expresión actual de VES el tramo anterior a 2021-10-04: el proveedor mantuvo la escala antigua hasta el día 3. No se aplica un factor supuesto a esos datos.
- Proteínas incluye únicamente referencias americanas con precios publicados, agrupadas por especie y país. USD y MXN son equivalencias del último precio, con fecha del tipo de cambio; no se confunden con nuevas cotizaciones físicas ni se convierten los históricos usando el cambio actual.
- Harina de soya pertenece a Granos. Granos, energía y proteínas incluyen contexto de coberturas e interés abierto cuando existe evidencia correspondiente al mercado.
- Se eliminaron filas y gráficas sin valores, también en México. Los ceros publicados sí se conservan.

## Comparaciones y conservación de evidencia

`shared/report-market-analysis.mjs` comparte los cálculos entre lector, PDF, CSV, Excel, anexos y copias guardadas. Conserva las fechas y los valores base de cada variación. No rellena días ni convierte un precio semanal, mensual o anual en un precio diario.

Los horizontes incluyen día, semana, mes, trimestre, semestre, año y acumulado anual cuando hay observaciones comparables. Los años desde 2020 se comparan a la misma altura del calendario, con sus fechas reales; no se compara un año parcial con cierres de diciembre. Un periodo no disponible queda sin cálculo.

Los proveedores con históricos amplios consultan desde 2020. Las fuentes físicas de alcance corto acumulan sus publicaciones verificadas: ampliar una consulta no crea historia que la fuente no proporciona. Las copias retienen observaciones recientes, cierres mensuales y las bases exactas utilizadas.

## Edición semanal

Disponible en Informes → Informes semanales para Bolsa, Divisas, Granos, Energía y metales y Proteínas. Compara la última publicación con la disponible siete días calendario antes, dentro de la tolerancia de su frecuencia. Es una ventana móvil, no una semana completa de lunes a domingo. Mantiene los demás horizontes y permite PDF, Excel, CSV y anexos. No consume créditos del chat.

Se dejó fuera el módulo de básculas y granja conforme a la aclaración del usuario.

## Disponibilidad y persistencia

Mercados entrega el último corte completo mientras actualiza fuentes en segundo plano. La actualización se comparte entre solicitudes simultáneas. Se indica cuando el corte mostrado continúa actualizándose.

La escritura del conjunto de informes dispone de un plazo mayor que la lectura, con señal de cancelación en REST. El respaldo PostgreSQL guarda el conjunto en una transacción y revierte ante un fallo. El respaldo local permanece disponible si la escritura remota falla. Se confirmaron los cinco cortes de Mercados y los cinco de Finanzas con `supabase-service-role`.

Los envíos automáticos de correo permanecen desactivados. No se publicó ni se subió el código en esta revisión.

## Verificaciones

- Compilación de producción y ESLint correctos.
- Renderizado de los 14 lectores diarios y los 5 semanales con los componentes reales de React, sin errores ni advertencias de renderizado; controles de la biblioteca semanal comprobados. Esta prueba no automatiza interacciones del navegador.
- Acceso HTTP autenticado con una fuente externa que nunca termina: el corte de Proteínas sigue abriendo; sin sesión responde 401.
- Pruebas de horizontes, monedas, fechas, reconversión de VES, compresión de evidencia, traducción, guardado, exportaciones y transacciones.
- Revisión de los 56 PDF anuales, 14 diarios y 5 semanales: sin páginas sin contenido, contenido fuera de márgenes, cierres aislados ni huecos interiores superiores a 100 puntos. Máximos medidos: 52.9 puntos en la muestra anual, 41.0 en diarios y 36.7 en semanales. Son métricas de distribución interior, no una promesa de ocupar hasta el pie todas las hojas finales.
- Inspección visual de muestras reales de Proteínas, Bonos, Divisas y Energía, además de exportaciones sintéticas de prueba. Paleta azul grisácea, barras neutras y flechas legibles.

Los registros y las muestras están en `output/report-market-final-20261023`, `output/report-weekly-final-20261023` y los archivos `output/final-*.log`.

## Fuentes técnicas

- [Calendario oficial de CFTC](https://www.cftc.gov/MarketReports/CommitmentsofTraders/ReleaseSchedule/index.htm): datos semanales del martes, publicación habitual el viernes a las 15:30 de Nueva York y excepciones de festivos de 2026. El interés abierto agrega vencimientos; no representa sólo el contrato frontal. Revisar el calendario al cambiar de año.
- [Datos abiertos Legacy Futures Only de CFTC](https://publicreporting.cftc.gov/resource/6dca-aqww.json): identificadores de diez mercados agrícolas, ganaderos, energéticos y de metales verificados con el catálogo oficial.
- [ExchangeRate-API](https://www.exchangerate-api.com/docs/free): referencia diaria para conversión, con atribución visible.
- [BCE](https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.xml) y [Banco de Canadá](https://www.bankofcanada.ca/valet/observations/FXUSDCAD/json?start_date=2020-01-01): históricos de referencias y promedios oficiales, conservando su naturaleza.
- [Banco Central del Ecuador, boletín 2065](https://contenido.bce.fin.ec/documentos/PublicacionesNotas/Catalogo/IEMensual/m2065/IEM2065.pdf): nota sobre la reconversión venezolana efectiva el 1 de octubre de 2021; la serie del proveedor muestra su cambio de escala a partir del día 4.
