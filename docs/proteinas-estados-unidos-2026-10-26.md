# Proteínas: cobertura de Estados Unidos

El informe de mercado de proteínas se limita temporalmente a Estados Unidos, conforme a la solicitud del usuario. La política se aplica a los informes actuales, las nuevas ediciones, la lectura, los datos de respaldo y las descargas. La cobertura geográfica de los archivos anuales originales no se reescribe.

## Referencias y periodos

El corte disponible contiene tres futuros estadounidenses —cerdo magro, ganado vivo y ganado de engorda— y dos precios físicos de USDA AMS —canal porcina y vacuno Choice—. Mantienen presentación, unidad, proveedor y fechas. Los futuros y los precios físicos se muestran separados; se eliminan las equivalencias en pesos mexicanos.

- Día: última sesión publicada contra la sesión publicada anterior de cada referencia, con ambas fechas. No se fuerza una fecha común entre instrumentos ni se sustituye por un día calendario sin operación.
- Mes, trimestre, semestre y año: comparación con la publicación anterior o igual a la fecha equivalente del horizonte, dentro de la tolerancia de la frecuencia.
- Acumulado del año: última observación contra el cierre disponible del año anterior. Es diferente de la variación interanual de doce meses.
- Desde 2020: primera observación verificable disponible en 2020 contra la última, con la fecha exacta del punto de partida en los anexos. No se supone que sea el 1 de enero.
- Tabla interanual: niveles a la misma altura de cada año desde 2020; no son promedios anuales. Se conservan las fechas por referencia.
- Gráfica histórica: índice base 100 de las tres series de futuros sobre una fecha común observada desde 2020. No incluye precios físicos, ni encadena proveedores, ni calcula una rentabilidad con renovación de contratos.

Las series físicas del corte actual empiezan en septiembre de 2026. No se les asignan variaciones trimestrales, semestrales, anuales o desde 2020 copiando los movimientos de futuros. Esos cálculos quedan sin base cuando faltan observaciones propias.

## Aplicación

La selección geográfica se centraliza en `shared/report-protein-scope.mjs`. La moneda USD no acredita por sí sola el origen estadounidense; un mercado extranjero explícito prevalece sobre el ticker o la mención de CME. Las referencias sin país verificable se excluyen. La evidencia original almacenada no se modifica al construir la vista.

La API entrega título, resumen, cuadros y referencias estadounidenses. La lectura y las exportaciones usan el mismo contrato de cálculo. Se conservan los call/put y el interés abierto de los tres productos estadounidenses. Los anexos, CSV y Excel conservan los niveles, unidades y fechas utilizados para cada variación.

## Verificación

Pruebas con porcentajes calculados a mano: diario 5 %, mensual 26 %, trimestral 40 %, semestral 57,5 %, interanual 110 %, acumulado 68 % y desde 2020 404 %. Se comprueban las dos fechas de cada cálculo, el rechazo de mercados extranjeros, la ausencia de interpolaciones, las ediciones propias y las hojas del Excel.

Las exportaciones del corte real, diaria y semanal, contienen cinco referencias estadounidenses en tres páginas cada una. Se revisan los límites de página, la ausencia de texto cortado, el gráfico desde 2020 y la exclusión de precios extranjeros y conversiones en MXN. Los envíos automáticos permanecen desactivados.
