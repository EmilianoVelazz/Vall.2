# Comprobación de descargas de informes

Se completaron 20 descargas HTTP simuladas y seis descargas desde la interfaz del proyecto local. No se encontraron fallos en los casos probados. Los PDF recibidos se abren y tienen como máximo cinco páginas; los archivos Excel y CSV también se abren y contienen datos.

## Desde la página local

| Archivo | Resultado |
| --- | --- |
| Bolsa diaria, PDF | Descarga completa; cinco páginas. |
| Bolsa diaria, Excel | Libro válido con 22 hojas; 6,091 observaciones más encabezado en la hoja Observaciones. |
| Proteínas de México diaria, PDF | Descarga completa; cinco páginas. |
| Proteínas semanal, PDF | Descarga completa; cinco páginas. |
| Bolsa anual 2025, PDF | Descarga completa; cinco páginas. |
| Bolsa anual 2025, CSV | Lectura UTF-8 correcta; 275 registros. |

Los archivos se verificaron en Descargas después de recibir el evento de descarga del navegador. Los PDF se abrieron con pdfplumber, el Excel con openpyxl y el CSV con el lector CSV de Python. Se conserva una captura de los controles anuales comprobados en `output/report-download-simulations-20261023/descargas-comprobadas.png`.

## Simulación HTTP

`node scripts/test-report-downloads-http.mjs` utiliza la ruta real de exportación y el cliente de descarga del frontend. Se ejecuta en un servidor local aislado, con identidad y localización de prueba; no modifica cuentas reales, no consulta IA o Supabase y no envía correos. Usa la muestra fija de la auditoría anterior en `output/report-five-pages-20261023/final/sources.json`.

Se descargaron PDF y Excel de diez casos: Bolsa y Divisas diarias; Proteínas y Granos diarios; Proteínas de México diaria; Bolsa semanal; Bonos 2022; Proteínas 2023; Panorama de Mercados 2024; Proteínas de México 2025.

Se comprobaron respuesta HTTP 200, tipo de archivo, nombre de descarga, longitud completa del contenido, caché privada, apertura de cada PDF y máximo de cinco páginas. Los diez Excel pasaron la comprobación CRC de su contenedor ZIP y se abrieron posteriormente con openpyxl. El modelo completo permaneció inmutable durante cada descarga. También se verificaron rechazos 401 sin sesión, 409 por cambio de cuenta y 429 al exceder el límite de exportaciones del usuario de prueba.

Resultados detallados: `output/report-download-simulations-20261023/http-results.json` y `file-open-checks.json`. Lint del nuevo verificador: correcto. Los envíos automáticos del proyecto local continúan desactivados.
