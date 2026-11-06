# Paleta neutra de los informes

Los informes comparten nueve tonos azul grisáceo de baja saturación, tanto para barras y curvas como para sus leyendas. Se conservan signos, cifras, etiquetas y patrones de línea para distinguir las series. Se suavizaron los encabezados a azul pizarra, los fondos a gris azulado claro y los acentos verdes y rosados de comparativas y avisos a tonos neutros. El PDF de informes personalizados también consume la paleta común.

Los estilos compartidos se aplican a Finanzas, Mercados y México, incluidas las ediciones anuales y el boletín de Proteínas. La versión de presentación pasó a `2026-10-22-paleta-neutra-informes-25` para renovar la vista previa de PDF en memoria. Los PDF descargados previamente conservan su apariencia; deben generarse de nuevo.

Verificación local:

- Saturación HSL máxima de las nueve series: 18 %.
- Contraste del texto blanco sobre los dos encabezados principales: 9,61:1 y 5,39:1. Estos valores corresponden a encabezados; no son una certificación de accesibilidad de toda la página.
- 14 PDF diarios generados con la misma muestra del escaneo anterior: 73 páginas, sin cambios de paginación, páginas vacías ni huecos superiores al límite de revisión de 100 puntos.
- Inspección visual de páginas renderizadas de Bolsa, Mercado de proteínas y Panorama nacional de México.
- Lectura de los colores realmente aplicados en los 14 informes diarios y una muestra anual de Energía y metales de 2022: todas las series pertenecen a la paleta compartida, con encabezados neutros y sin desbordamiento horizontal. Resultados en `ui-colors.json`.
- Diseño de gráficas, flujo de columnas PDF, presentación y ESLint aprobados. La comprobación de idiomas también pasó con IA, almacenamiento y SMTP simulados. Su primera ejecución encontró la pausa global de correos; se repitió con la disponibilidad del programador simulada únicamente dentro del proceso de prueba, sin modificar la configuración ni activar envíos reales.
- Compilación de producción aprobada, con el aviso conocido de Vite sobre paquetes grandes.

Evidencia: `output/paleta-informes-20261022/`, con `color-check.json`, `scan.log`, `build.log`, `idiomas-simulados.log`, exportaciones PDF, PNG renderizados y una captura de las barras en pantalla. El servidor local se reinició con los envíos programados desactivados y responde en los puertos 3101 y 5273. No se publicó un despliegue.
