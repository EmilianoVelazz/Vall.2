# Divisas: acciones, costo empresarial y legibilidad

## Presentación ejecutiva

- Dos tablas: MXN/BRL con forwards teóricos 30/90/180D cuando hay tasas comparables; CAD, EUR, GBP, JPY y CNY en un bloque macro sin columnas vacías de forwards. No se afirma que existan coberturas contratadas.
- Seguimiento específico por par, según nivel, movimiento y volatilidad disponibles. Se elimina la regla que repetía «Revisar flujo neto».
- Gráfica de seis meses con cuatro líneas sólidas: DXY gris oscuro, USD/MXN verde institucional, USD/BRL ocre y USD/CAD púrpura apagado. Etiquetas directas con conectores y separación para evitar colisiones, en PDF, escritorio y móvil.
- Variaciones diarias, mensuales y acumuladas con pastillas de costo; horizontes largos conservados en el lector. Los filtros mantienen alineados los tonos con la moneda original.
- Fuentes al pie con texto breve hipervinculado. Fórmulas, tasas, bases y supuestos completos en anexos; nota ejecutiva en una sola línea.
- El PDF de muestra, con corte del 28 de octubre de 2026 y referencias del 27, conserva una página en ediciones diaria y semanal. No hay reducción adicional de la tipografía de datos respecto a la plantilla anterior.

## Significado de los colores

El enfoque es comprar la moneda base del par con la moneda cotizada. En USD/MXN se compran USD con MXN: una subida encarece y se marca roja. En EUR/USD se compra EUR con USD: una bajada abarata esa compra y se marca verde. No se presentan los colores como una ganancia/pérdida universal para exportadores o para una cartera con otra moneda funcional.

Cambios que se redondean a cero a dos decimales se muestran neutrales. Ausencia de base comparable permanece sin señal.

## Propuesta cuantitativa

Se incorporan los parámetros solicitados como **escenario ilustrativo para someter al comité**, no como política aprobada o ejecución: objetivo de 65% de pagos netos confirmados, plazo máximo de 90 días y umbral USD/MXN estrictamente menor a 18.70. Si el umbral no se cumple, se indica expresamente y no se activa la ampliación.

Ejemplo de estrés: tras cubrir 65%, el 35% abierto sufriría un incremento equivalente a 1.75% del costo base del flujo ante USD +5%. Es una sensibilidad simplificada del tramo descubierto, excluye costo de cobertura y no utiliza saldos reales de usuarios. Para BRL se plantea contrastar spot y NDF hasta 30 días, sujeto a exposición y liquidez.

Reglas de seguimiento: BRL alerta con volatilidad realizada anualizada de 20 sesiones al menos 15% o movimiento diario de al menos 1%; CAD estable requiere cambio mensual absoluto menor a 1% y volatilidad menor a 10%; CNY requiere variación mensual menor a 1% para describir estabilidad. Son criterios de la plantilla, no límites aprobados de la empresa.

Los forwards conservan el cálculo anterior con tasas proxy planas SOFR/TIIE/Selic, fechas próximas y convenciones declaradas. No se convierten en ofertas bancarias ni se interpretan como predicciones del spot. Referencia metodológica: [BIS, paridad cubierta y basis](https://www.bis.org/publications/qr-201609/covered-interest-parity-lost-understanding-cross-currency-basis).

La banda mensual cuenta días hábiles desde la fecha del cierre efectivamente observado, incluyendo el día del informe si todavía no hay cotización nueva. El 95% corresponde al modelo lognormal con volatilidad histórica y deriva cero; no es garantía de cobertura futura. No se ajusta por feriados.

## Verificación

Pruebas de divisas: inversión exacta EUR/GBP, horizontes, tono de costo, umbral cumplido/no cumplido, ausencia de tasas, separación de tablas, cálculo y preservación de forwards, guardado, CSV con unidades y escenario de estrés. Lector simulado con siete acciones distintas, cuatro trazos sólidos, etiquetas dentro del SVG móvil, filtro Brasil y sin errores de ejecución. Descarga HTTP 200 de PDF diario/semanal de una página; fuente breve con enlace conservado. PDF renderizado e inspeccionado.

Envíos programados desactivados. No se ejecutan migraciones ni se modifican usuarios.
