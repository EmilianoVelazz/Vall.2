# Mejoras implementadas en Informes

Implementación local del 20 de octubre de 2026, a partir de la revisión de informes. Se conservan las tablas y gráficas completas, la cobertura mundial y la separación entre informes diarios y librería anual.

## Datos y entrega

- La evidencia diaria conserva observaciones fechadas hasta seleccionar las dos últimas sesiones comparables. No inventa observaciones de fines de semana ni admite fechas posteriores al corte.
- México conserva entradas válidas por referencia y los informes anteriores cuando falla una fuente. Los datos conservados mantienen su fecha original y muestran estado conservado o parcial; la fecha de un intento no los convierte en datos nuevos.
- Los envíos programados comprueban el corte esperado y la fecha del informe concreto, también en reintentos. Un informe conservado anterior al corte no se entrega como actualizado.
- Los informes personales creados desde cero usan composición narrativa para conservar resumen, secciones y cierre en lectura y exportaciones.

## Lectura y explicación

- Las actualizaciones automáticas conservan la posición de lectura. Si cambia el informe disponible, el lector ofrece abrir el nuevo corte.
- Las tarjetas muestran estado del dato, fecha del corte y última observación disponible. Los informes diarios permiten filtrar por país y producto o referencia; el resumen y las descargas siguen incluyendo el documento completo, según el aviso de pantalla.
- Causas y consecuencias incorpora el movimiento observado, fechas, contexto disponible y posibles repercusiones. Las hipótesis no se presentan como causas confirmadas. Las referencias financieras se distinguen de precios físicos.
- Los anexos abiertos desde un informe conservan exactamente esa edición. La procedencia permanece en Anexos y no se agrega al cuerpo ordinario del informe.
- Portada, librería anual, anexos, historial y descargas comparten el idioma seleccionado. Se conservan cifras, fechas, monedas y unidades.

## Historial diario

Nueva pestaña con filtros de familia, informe y fecha, lectura de ediciones cerradas, anexos de la edición y descargas PDF/CSV. Las rutas requieren autenticación. El archivo admite únicamente informes base públicos de las colecciones conocidas; excluye documentos personales y anuales. Las ediciones se crean de forma exclusiva e inmutable, sin sobrescribir un archivo existente.

El historial comienza con los cortes disponibles al activarlo y guarda las siguientes generaciones. No reconstruye informes diarios de fechas para las que no existe una edición guardada. La comparación dentro de cada edición sigue siendo entre sesiones, aunque el archivo permita consultar varias fechas.

### Persistencia del despliegue

En local se usa `backend/cache/report-history`. En Dokploy debe montarse un volumen persistente privado y configurar `VALL_REPORT_HISTORY_DIR` con su ruta dentro del contenedor, por ejemplo `/data/vallnews/report-history`. El proceso necesita permisos de lectura, escritura y creación de enlaces duros en ese volumen. En Vercel el destino predeterminado pertenece a `/tmp`, que no garantiza conservación entre instancias. No se ha inspeccionado ni modificado el montaje remoto de Dokploy.

## Validación

- Pruebas de regresión de conservación de México, comparación viernes/lunes, contenido personal, vigencia de envíos, inmutabilidad del archivo, autenticación y validación de fechas.
- Pruebas de entrega y programación con funciones simuladas: no se enviaron correos reales.
- Cobertura de traducción de los seis idiomas admitidos y formatos de exportación.
- Pruebas de navegador aisladas con modelos públicos: filtros, aviso de nuevo corte, conservación del desplazamiento, anexos de la edición, historial, idioma de descargas y anchuras de 320 a 1440 píxeles.
- Compilación de producción y ESLint de los archivos modificados.

Las pruebas de navegador utilizan sesiones y respuestas aisladas; no reutilizan credenciales del usuario. La validación funcional no equivale a verificar la exactitud económica de cada cotización externa.
