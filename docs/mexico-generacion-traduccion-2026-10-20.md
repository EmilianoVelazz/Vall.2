# Generación de México y coherencia del idioma

## Fallo corregido

La construcción de `mx_proteins` concatenaba especie, entidad, presentación, plazas y proveedor en una etiqueta limitada a 140 caracteres. Las referencias reales con varias plazas superaban ese límite: el normalizador rechazaba el informe y abortaba la generación del catálogo completo de México.

Las etiquetas extensas ahora utilizan un encabezado breve y una huella estable de su identidad completa. Las tablas conservan los nombres completos de las plazas y las presentaciones. Un grupo de plazas distinto produce otra identidad, evitando unir observaciones que no son comparables. Se mantienen los límites del normalizador de informes editables.

Se regeneraron los cuatro informes con consultas reales, sin errores de las tres fuentes del corte. Se verificaron panorama, bolsa y tipo de cambio, proteínas por entidad, y producción de granos y minería.

## Traducción

- Las descripciones de frecuencia utilizan palabras en español en vez de códigos como `daily`, `weekly` o `monthly`.
- El traductor recibe todos los fragmentos mostrados: títulos, filas, unidades, leyendas, resúmenes, cobertura territorial y explicaciones. El diccionario conserva la correspondencia con el texto original.
- El modelo compartido reconstruye las frases con el texto original antes de aplicar la traducción. Esto evita insertar etiquetas traducidas dentro de una plantilla española que ya no coincidiría con el diccionario.
- Se completaron rótulos nativos del boletín y nombres de países y familias en inglés, francés, italiano, alemán y japonés.
- El proveedor recibe instrucciones de terminología, gramática y coherencia del idioma. Si conserva un párrafo español completo y claramente identificable, se solicita su reparación; si vuelve a fallar, se rechaza esa traducción y se conserva el original.
- La librería anual admite la ausencia del anexo diario al preparar la traducción.

Las fechas, cantidades, identidades, frecuencias internas y series numéricas conservan su valor. La validación de párrafos sin traducir detecta un fallo concreto; no constituye una certificación automática de calidad lingüística completa.

## Comprobaciones

- `node scripts/test-mexico-reports.mjs`: generación de los cuatro informes, etiquetas largas, identidad estable, tablas completas, copias editables, rutas, caché y PDF.
- `node scripts/test-report-translation-coverage.mjs`: cobertura de los textos mostrados de México y mercados en cinco idiomas, sin frases reconstruidas con idiomas mezclados; rechazo y reparación de párrafos sin traducir; librería anual.
- `node scripts/test-report-languages.mjs`: seis idiomas, catorce orígenes, formatos de exportación, cifras, caché privada, correo y programación con servicios simulados.
- `node scripts/test-mexico-report-library-ui.cjs`: ruta real y corte público actual en un servidor aislado; los cuatro informes visibles con tablas en español e inglés, sin Google Translate. El proveedor lingüístico está simulado para comprobar la integración de pantalla.
- Prueba adicional con el traductor real: un ejemplo público sobre pollo en Lima se tradujo al inglés manteniendo `4.00 PEN/kg`, `3.90 PEN/kg` y ambas fechas.
- Compilación de producción y revisión estática de los archivos modificados.

El servidor local se reinició con las correcciones. Las comprobaciones visuales anteriores se interrumpieron por un límite temporal del revisor automático; se completaron cuando el servicio volvió a estar disponible.
