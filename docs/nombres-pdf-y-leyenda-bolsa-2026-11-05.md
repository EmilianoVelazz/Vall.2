# Descargas, vista previa y leyenda de Bolsa

- El nombre de descarga utiliza el título real del informe, su edición y la fecha del corte. En la biblioteca anual utiliza el año del informe. Las copias personalizadas conservan su título; se eliminan caracteres incompatibles con nombres de archivo.
- «Descargar PDF», «Guardar PDF» y el adjunto del exportador comparten el mismo generador de nombres. CSV y Excel incorporan además la identificación «Datos».
- Al abrir un informe se presenta la vista previa del PDF. Se reutiliza el archivo para descargarlo y se conserva «Lectura» como opción secundaria. Los errores muestran una opción de reintento; no se repiten solicitudes automáticamente después de un fallo.
- En la leyenda histórica de Bolsa, el porcentaje sigue al nombre del índice con una separación corta, tanto en PDF como en SVG. Las fechas siguen debajo. Se mantienen las 42 referencias del corte comprobado.
- El histórico global respeta el filtro de país sin insertar un índice de referencia ajeno al país. Las comparativas explícitas contra un índice conservan su referencia.

Verificación: nueve informes de Finanzas, Mercados y México abrieron la vista previa y descargaron archivos PDF válidos con el nombre esperado, sin regenerar el archivo al descargarlo. La comprobación del PDF de Bolsa verificó las 42 filas de la leyenda, la separación entre nombre y porcentaje, y la ausencia de recortes; el informe conserva tres páginas. Pasaron las pruebas de nombres, históricos, evolución, exportación histórica y ESLint de los archivos modificados. Compilación de producción completada.

Evidencia local: `output/download-button-20261030/results.json` y `output/bolsa-leyenda-20261105/`. Los envíos automáticos continúan desactivados. No se despliega ni se publica en Git con este ajuste.
