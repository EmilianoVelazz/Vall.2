# Diagnóstico de la tabla de proteínas de Puebla

8 de octubre de 2026. Cambios locales, sin publicar.

La captura mostraba dos problemas distintos: los enlaces Markdown aparecían
como texto en las celdas estructuradas, y la tabla solo decía «No disponible»
para pollo y res sin explicar qué había respondido la fuente.

## Consulta pública comprobada

Se descargaron los cuatro reportes del SNIIM con año 2026, mes 10, días 01–08,
todos con HTTP 200. Las capturas HTML están en
`output/diagnostico-proteinas-puebla/`.

- Pollo entero: el lector recuperó registros de otras plazas, pero el HTML
  consultado no incluye una plaza de Puebla.
- Res en canal: el lector recuperó registros de otros rastros, pero el HTML
  consultado no incluye una plaza de Puebla.
- Huevo blanco al mayoreo: el reporte incluye Central de Abasto de Puebla,
  27.00 MXN/kg como precio frecuente, fecha 2026-10-07. No es precio por docena.
- Cerdo: la referencia de Puebla disponible en la tabla es la de Porcicultura,
  38.00 MXN/kg vivo, fecha 2026-10-07; no es precio en canal.

Reportes consultados:

- [Pollo entero](https://www.economia-sniim.gob.mx/SNIIM-Pecuarios-Nacionales/e_Ent.asp?RegPag=1000&prod=P01&anio=2026&mes=10&del=01&al=08&destino=0&origen=0).
- [Bovinos en canal](https://www.economia-sniim.gob.mx/SNIIM-Pecuarios-Nacionales/e_Can.asp?RegPag=1000&Var=Bov&anio=2026&mes=10&del=01&al=08&destino=0&origen=0).
- [Huevo](https://www.economia-sniim.gob.mx/SNIIM-Pecuarios-Nacionales/e_Hue.asp?RegPag=1000&prod=H01&sem=0&anio=2026&mes=10&del=01&al=08&destino=0&origen=0).

Estos resultados describen la cobertura de esos reportes y periodo. No
demuestran ausencia de ofertas comerciales ni ausencia de precios en otras
fuentes. No se rellenan Puebla con precios de otros estados ni con precios
minoristas de otra presentación.

## Correcciones

- Las celdas estructuradas usan el renderizador de enlaces escapados y
  restringidos a HTTP/HTTPS. La tabla muestra «SNIIM» o «Porcicultura.com» como
  enlace, en lugar de desplegar la URL completa.
- Las tablas de varias columnas conservan un ancho legible y desplazamiento
  horizontal en móvil. Las cabeceras y valores no se parten por letra.
- El conector entrega cobertura por producto, estado, reporte y periodo:
  disponible, sin registro local utilizable, sin registros utilizables o error
  de fuente. La tabla explica el motivo y enlaza el reporte incluso cuando
  no hay una cotización local.
- Se corrigió la lectura de encabezados sin dos puntos, como «Q.R. Mercado de
  Chetumal, Quintana Roo». Esos registros ya no heredan la plaza anterior.
- Se retiraron dos caracteres NUL al final de la hoja CSS.
- Se cambió la versión de los recursos del chat para renovar su caché.

## Pruebas

`npm run test:puebla` comprueba cobertura, errores de fuente, separación de
plazas y el navegador con bundle real. El navegador verifica cuatro enlaces
pulsables, ausencia de URLs extensas en las celdas, datos parciales explícitos
y desplazamiento de la tabla en móvil. Sesión y fuentes son simuladas en estas
pruebas; no se atribuye exactitud de datos reales a los fixtures.

También se comprobaron las suites de proteínas, inteligencia, seguridad/XSS,
el perfil y memoria en navegador, lint y compilación. No se añadieron cifras
estimadas de pollo o res de Puebla. La solución para completar esas cotizaciones
requiere una fuente que publique esa plaza y presentación, o una oferta fechada
del proveedor local.
