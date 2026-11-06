# Revisión general de reportes

Fecha: 14 de octubre de 2026.

## Cobertura

Se revisaron estructura, contenido admitido, indicadores, gráficas, tablas, conclusiones, riesgos, fuentes, PDF y CSV, junto con los flujos de creación, guardado, recuperación, eliminación y entrega.

| Colección | Subapartados revisados |
| --- | --- |
| Finanzas | Bolsa, bonos, divisas, noticias financieras y panorama general |
| Mercados | Panorama general, granos, energía y metales, proteínas y noticias de mercados |
| México | Panorama nacional, bolsa y tipo de cambio, proteínas por estado y producción estatal |
| Mis informes | Creación desde base y desde cero; IA, borrador, guardado, recarga, exportación, eliminación y aislamiento por cuenta |

## Problemas corregidos

| Problema reproducido | Corrección y efecto |
| --- | --- |
| El PDF general convertía un cero numérico en una celda o indicador vacío. | La conversión distingue cero de ausencia; conserva «0». Se mantiene la validación de niveles positivos de índices bursátiles. |
| Una observación ausente podía producir una caída calculada del 100%; un cambio ausente podía interpretarse como cero. | Se validan las observaciones antes de comparar; se calcula el cambio ausente únicamente con ambos valores válidos y base distinta de cero. Un cambio explícito de cero se conserva. |
| Finanzas y Mercados recortaban a diez secciones y 2.500 caracteres por sección, aunque el documento admitía más. | Se conservan hasta 20 secciones de 8.000 caracteres, resumen y cierre de 4.000 y objetivo de 2.000, además de las señales y riesgos admitidos. |
| La lectura y el CSV perdían fuentes con el mismo nombre y distinto enlace. | Cada combinación de nombre y URL conserva su entrada. El conteo utiliza la misma lista; los duplicados exactos y referencias simples ya representadas se suprimen. Los enlaces no públicos siguen sin abrirse. |
| El redondeo ocultaba diferencias pequeñas en gráficas y comparaciones derivadas. | Pantalla y PDF comparten hasta ocho decimales; los ejes adaptan la precisión a su rango y reservan espacio para las etiquetas. El CSV conserva los valores numéricos de las observaciones. |
| El PDF general cortaba fechas ISO y perdía puntos intradía. | Se conserva la fecha completa; las gráficas identifican horas y UTC cuando existe observación intradía. |
| Dos gráficas dejaban una columna vacía y algunas cifras se partían entre líneas. | La cuadrícula ajusta sus columnas al contenido; las cifras permanecen juntas y las tablas tienen desplazamiento propio si lo necesitan. Los indicadores del PDF disponen del ancho completo de su ficha, con la variación debajo. |
| Un título de validación podía quedar al final de una hoja con el contenido en la siguiente. | La paginación reserva espacio para el encabezado, la explicación y un primer bloque legible. |

El formato institucional, la marca de agua, las unidades y los bloques elegidos se mantienen. La revisión modifica presentación y conservación de la evidencia; no añade cotizaciones ni hechos de mercado.

## Verificación

- `npm run test:reports`: lectura, preferencias, perfiles, sincronización, permisos, persistencia, PDF, versiones, programación y generación con IA simulada.
- `npm run test:reports:quality`: evidencia completa y nuevas regresiones de los 14 subapartados, incluyendo extracción del PDF con marcadores al final de los textos.
- `npm run test:reports:observations`: fechas, datos ausentes, ventanas, bases, rendimientos, cobertura, CSV, IA simulada y PDF.
- `node scripts/test-report-dashboard.mjs --ui --preview`: los 14 subapartados en navegador y PDF; fuentes accesibles, precisión, horas, marca de agua y muestras de las tres colecciones. Comprobación de anchos de 360, 390 y 768 píxeles, además de escritorio.
- `npm run test:reports:user`: diez casos de guardado, 23 pruebas de entradas inválidas por HTTP, 17 recorridos de usuario y doce casos adicionales de usabilidad, más recuperación de borradores y vinculación de sesión. Incluye respuestas perdidas, concurrencia, cuentas distintas, sesión vencida, conexión interrumpida, cancelación de IA, eliminación y accesibilidad con teclado.
- `npm run test:reports:email`: firma, nota breve, destinatario, permisos, PDF y entregas inmediata y programada con SMTP simulado.
- `npm run lint` y `npm run build`: análisis estático y compilación de producción.

Se renderizaron las páginas de las muestras de Finanzas, Mercados y México para revisar espacios, márgenes, tablas, fuentes y marca. Las muestras y capturas son material de simulación bajo `output/pdf` y `output/tableros-informes`.

Las pruebas utilizan cuentas y datos aislados, respuestas de IA simuladas y correo simulado. No se enviaron correos reales, no se escribieron datos de clientes y no se contrastaron cotizaciones actuales con fuentes externas en esta revisión.

## Punto de infraestructura para producción

**Prioridad alta: conservación de Mis informes en Vercel.** El almacén actual guarda JSON por cuenta en archivos privados. En local se puede conservar en disco o en un volumen definido por `VALL_REPORT_EDITIONS_DIR`; admite un proceso de escritura. En Vercel su ubicación predeterminada es `/tmp`, que es temporal y no se comparte entre instancias. La interfaz avisa cuando el servidor declara ese modo.

Para ofrecer conservación duradera en varias instancias hace falta trasladar los documentos a almacenamiento compartido y mantener sus comprobaciones de propietario, versión y reintento en transacciones. Esta revisión no configura almacenamiento remoto ni cambia la infraestructura de producción. Las pruebas de persistencia en disco no acreditan persistencia entre instancias de Vercel.

Los cambios quedan en el proyecto local; no se publicaron en Git ni se desplegaron a Vercel como parte de esta revisión.
