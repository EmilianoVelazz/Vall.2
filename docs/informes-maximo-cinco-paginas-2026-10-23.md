# Edición ejecutiva de hasta cinco páginas

La presentación 32 establece un máximo de cinco páginas para los PDF de informes. Las ediciones que ya caben conservan su contenido y extensión. Cuando el detalle excede el límite, el exportador prepara y mide una selección ejecutiva antes de entregar el archivo.

La muestra final comprende 75 PDF: 14 diarios, 5 semanales y 56 anuales. Todos tienen entre una y cinco páginas. El conjunto pasa de 307 a 271 páginas, con 36 páginas menos en 16 informes; ninguna edición crece. Bolsa diaria pasa de 6 a 5, Bolsa semanal de 7 a 5, Proteínas de México diaria de 9 a 5 y cada edición anual de Proteínas de México de 8 a 4. El mínimo tipográfico medido en el cuerpo es de 6.3 puntos; no aparecen páginas vacías, cierres aislados ni contenido fuera de márgenes. El hueco interior máximo es de 89.4 puntos, dentro del límite de 100 puntos.

El resumen completo, las explicaciones causales, sus condiciones, la cobertura y los riesgos se conservan. Las filas se seleccionan completas, distribuidas entre países, productos o unidades según la estructura disponible; todas sus columnas, cifras, fechas y condiciones comerciales siguen juntas. La selección no se utiliza para recalcular movimientos, promedios ni conclusiones. Cada gráfica seleccionada conserva sus series, puntos, fechas, unidades y escala. Las comparaciones no se mezclan para ahorrar hojas.

El PDF indica cuántas filas y gráficas muestra respecto al detalle disponible. Las tablas seleccionadas llevan su propio recuento. Las filas anuales sin precio publicado no desplazan las observaciones existentes. En la edición breve se muestran los nombres de las fuentes sin repetir sus URL en cada fila y se omiten los identificadores internos de referencias. La página, los anexos y Excel conservan el modelo completo, incluidas las direcciones y los identificadores originales.

La política actúa sobre copias de presentación y verifica el resultado real de PDFKit. No reduce los tamaños de letra ni recorta páginas. Las celdas mantienen 7.2 puntos y la narrativa 8.2. Se ampliaron las fechas de los ejes, las etiquetas de plazos y las leyendas de curvas que antes usaban entre 5.8 y 6.2 puntos a 6.5 puntos. El mínimo del diseño para los demás rótulos de ejes es 6.3 puntos.

El lector informa de la edición breve junto a las acciones de descarga. La versión de presentación invalida las vistas previas anteriores. Las ediciones propias sin una clave del catálogo usan también el exportador comprobado.

## Verificación reproducible

- `npm run test:reports:pdf-limit`: 75 modelos y un caso sintético de 600 filas que excede el límite antes de la selección. Verifica resúmenes completos, filas íntegras, fechas, unidades, series sin muestreo adicional, evidencia inmutable y tamaños de letra en el PDF real.
- `node scripts/test-report-print-preservation.mjs`: 20,299 celdas en 75 modelos, con fechas, unidades, monedas y precisión conservadas por las transformaciones tabulares sin selección.
- Pruebas del flujo de columnas, gráficas agrupadas, librería anual, lector React, descargas y ediciones propias. Las comprobaciones de ediciones propias distinguen las tablas aportadas por el usuario de indicadores sin observaciones verificables: las primeras mantienen sus columnas y los indicadores originales siguen guardados.
- Lint y compilación local.
- Auditoría de todos los PDF sobre la misma muestra fija:

```powershell
node scripts/audit-report-spacing.mjs --output-dir=output/report-five-pages-20261023/final --max-pages=5 --check-legibility --check-layout --max-interior-gap=100 --compare=output/report-fewer-pages-20261023/all/after.json
```

La carpeta contiene `sources.json`, copiado de la auditoría anterior para comparar exactamente los mismos datos. Los resultados se guardan en `after.json`, `after-gaps.json` y los PDF individuales; las imágenes de revisión visual se encuentran junto a ellos. El auditor considera únicamente la edición entregada, excluyendo las pruebas previas de composición.

Esta revisión trabaja sobre datos guardados. Los envíos automáticos permanecen desactivados.
