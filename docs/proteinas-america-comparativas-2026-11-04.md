# Proteínas: América y tabla de variaciones

El informe prioriza las observaciones disponibles de México, Estados Unidos, Canadá, Brasil, Argentina, Chile, Colombia y Perú. Las referencias globales complementarias permanecen en el lector y en los respaldos. La selección ejecutiva anterior podía favorecer Europa y omitir países americanos que sí tenían precios.

## Comparación por país y producto

La nueva tabla muestra precio, unidad original, fecha del dato y cambios frente a la sesión anterior, seis meses y un año cuando existe una base publicada. Cada variación conserva su fecha base. Las publicaciones semanales y mensuales usan una tabla con el encabezado «Publicación anterior» y no generan un cambio diario. Las filas con poca historia conservan su precio y omiten los horizontes ausentes.

El cálculo es `(último / base - 1) × 100`. Las flechas indican aumento, descenso o estabilidad. Los valores numéricos sin redondear, ambas fechas y las fuentes están en el anexo y en Excel/CSV. Las monedas, unidades y etapas comerciales no se convierten ni se equiparan para comparar niveles.

La tabla sustituye las filas americanas de los cuadros anteriores de precios y horizontes, evitando duplicar sus variaciones en la lectura principal. Las notas metodológicas se imprimen una vez por bloque.

## Protección de la cobertura

`proteinRequiredRows` identifica las referencias que deben sobrevivir a la selección del PDF: al menos una por país disponible, las especies mexicanas disponibles y una base semestral adicional por país cuando la referencia principal tiene historia insuficiente. La selección conserva esos registros incluso cuando baja el presupuesto de filas.

La muestra actual conserva ocho países y cerdo, res, pollo y huevo de México en PDF diario y semanal de tres páginas. La gráfica de México y la historia CME desde 2020 permanecen en el documento. La vista del lector abre en «América · México y Latinoamérica» y permite filtrar por país sin mezclar escalas o unidades.

## Validación

`npm run test:reports:protein-americas` comprueba variaciones calculadas a mano, fechas, publicaciones periódicas, ausencia de datos inventados, cobertura bajo presupuestos reducidos, filtros y copias guardadas. Genera PDF diario/semanal y verifica los ocho países, los encabezados de comparación y la ausencia de recortes. El navegador de prueba comprueba la vista inicial mexicana, la historia desde 2020, los filtros de México y Brasil y el diseño móvil.

Los informes conservan los datos originales. Los envíos de correo programados permanecen desactivados.
