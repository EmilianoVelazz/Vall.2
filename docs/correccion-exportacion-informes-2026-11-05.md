# Carga y exportación de informes · 5 de noviembre de 2026

La preparación de Granos, Energía y Panorama fallaba con `Cannot read properties of undefined (reading 'day')`. El cálculo de repercusiones físicas exclusivo de Proteínas devolvía el booleano `false` para los demás informes; el acceso posterior a `periods[period]` provocaba la excepción. También afectaba al Panorama financiero al componer su capítulo de mercados.

Se sustituyó esa condición por una selección que devuelve una referencia o `undefined`, con acceso opcional a sus periodos. Los demás informes conservan su propia explicación de repercusiones. No se rellenan variaciones ausentes con cero.

Se añadió una regresión para cortes diarios y semanales de otros mercados, incluidos cortes sin referencias. La versión de presentación se actualizó para invalidar las representaciones anteriores.

## Comprobaciones

- Los 14 informes de la caché local se prepararon sin excepciones en ediciones diarias y semanales: 28 modelos. También pasaron por la composición y el enriquecimiento usados por la API.
- Una simulación de navegador pulsó los botones reales de descarga y recibió nueve PDF con HTTP 200: Bolsa, Bonos, Divisas, Panorama financiero, Granos, Energía, Proteínas, Panorama de Mercados y Proteínas de México. Utiliza la aplicación compilada y el enrutador real de exportación con una identidad de prueba aislada; no representa una prueba de las credenciales de las cuentas reales.
- Pasaron las pruebas ejecutivas de mercados, auditoría, cobertura americana y distribución de Proteínas. Las simulaciones diarias y semanales de Proteínas conservaron cinco páginas legibles.
- Compilación y revisión de sintaxis aprobadas. Se conservan las advertencias previas de tamaño de paquetes y recursos estáticos del compilador.
- Se reinició el proyecto local: página, API y proxy de API responden con HTTP 200. Los envíos automáticos permanecen desactivados.

La revisión también observó errores independientes de conexión con Supabase en las consultas de perfiles. No se cambiaron políticas ni se omitieron validaciones de acceso del servidor local para resolver la exportación.

Resultados de la simulación del botón: `output/download-button-20261030/results.json` (ruta histórica del comprobador, ejecución del 5 de noviembre). Registros del servicio reiniciado: `output/exportacion-20261105/`.
