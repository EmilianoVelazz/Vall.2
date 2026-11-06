# Informe diario de proteínas

Se amplía `markets/proteins` sin sustituir los informes de México ni los indicadores oficiales de producción. Las causas y consecuencias permanecen después de las gráficas y ahora distinguen pollo, huevo, pescado, procesados, ganado y alimento.

## Cobertura conectada

Se conservan las siete referencias de futuros y alimento de Estados Unidos y China, y se añaden doce referencias físicas:

| Referencias | Fuente y plaza | Unidad original | Frecuencia publicada |
|---|---|---|---|
| Pollo congelado y refrigerado | CEPEA/ESALQ-USP, mayoreo de São Paulo, Brasil | BRL/kg | Diaria |
| Huevo M y G, categoría A, origen Francia | FranceAgriMer-RNM, Rungis | EUR/100 piezas sin IVA, caja de 360 | Diaria |
| Salmón entero eviscerado 2-3 kg, origen Noruega y Escocia | FranceAgriMer-RNM, Rungis | EUR/kg sin IVA | Diaria |
| Filete de salmón fresco, referencia 3-4 kg, origen Noruega | FranceAgriMer-RNM, Rungis | EUR/kg sin IVA | Diaria |
| Pollo entero estándar y filete estándar al vacío, origen Francia | FranceAgriMer-RNM, Rungis | EUR/kg sin IVA | Semanal |
| Salmón ahumado al vacío 1-2 kg, origen Noruega, y surimi en bloque de 1 kg | FranceAgriMer-RNM, Rungis | EUR/kg sin IVA | Semanal |
| Huevo líquido entero, envase de 1 kg | FranceAgriMer-RNM, restauración colectiva en Francia | EUR/kg sin IVA | Mensual |

Noruega y Escocia son orígenes del pescado; la plaza cotizada es Rungis, Francia. No se presentan como cotizaciones nacionales de Noruega o Reino Unido. La harina de soya sigue identificada como alimento animal, no como proteína procesada para consumo humano. No se añadieron acciones de empresas como sustitutos de precios de alimentos.

## Comparación y actualización

- Sólo las referencias diarias comparan sus últimas dos publicaciones válidas. Ambas fechas se muestran; no se interpolan fines de semana ni festivos.
- Pollo de Brasil y huevo francés: 16 y 19 de octubre de 2026 en la comprobación directa. Salmón fresco: 16 y 17 de octubre. No se fuerza una fecha común entre plazas.
- Las cinco referencias semanales/mensuales muestran sólo el último precio, su fecha, frecuencia y presentación en una tabla propia. No entran en cambios diarios, conteos al alza/baja ni gráficas de sesión. Tampoco exportan comparaciones semanales o mensuales al CSV.
- Los cortes automáticos existentes de 06:00 y 14:00, hora de Ciudad de México, cargan las nuevas fuentes. Al consultar el informe se vuelven a consultar si han pasado 30 minutos; las peticiones concurrentes comparten una sola actualización. No se requiere un proceso de IA para actualizar precios físicos.
- La consulta adicional no cambia los informes de granos, energía o noticias. Actualiza proteínas y su cobertura dentro del panorama de Mercados. Se conserva el funcionamiento de recuperación de cortes programados perdidos.
- Un dato conservado por una falla mantiene su fecha y se identifica como tal; un dato ausente queda sin precio, nunca en cero. Los precios diarios antiguos no producen variaciones recientes.
- La consulta adicional comprende 11 páginas: las dos series de pollo comparten una descarga. Hasta seis solicitudes simultáneas, plazo de 4.5 segundos por página. La persistencia usa el almacén existente, con respaldo local si falla la conexión remota.

## Validación y límites

El parser contrasta código de serie, nombre, presentación, etapa mayorista, moneda y unidad con la página fuente. En RNM se lee la columna `prix moyen`; en CEPEA `Valor R$`. Las columnas de variación mensual no se usan. Se rechazan fechas inválidas/futuras, duplicados contradictorios, promedios fuera del rango publicado y precios no positivos. RNM publica promedios de huevo sin mínimo/máximo; esa ausencia no invalida el promedio. Un cambio evidente de una serie diaria a semanal se rechaza.

La comprobación directa del 19 de octubre obtuvo las doce referencias nuevas, sin huecos: 19 referencias totales, 14 comparaciones diarias y 5 observaciones de contexto. La auditoría local está en `output/otros-informes/auditoria-proteinas-precios.json`, con fuente, enlace, unidad, frecuencia, fechas y valores. Esto verifica extracción e identidad frente a la fuente primaria; no es una auditoría independiente de la formación del precio con un segundo proveedor. No implica cobertura completa de todos los productos o países.

Fuentes: [CEPEA, pollo y metodología](https://www.cepea.org.br/br/indicador/frango.aspx), [RNM, red pública de precios de FranceAgriMer](https://rnm.franceagrimer.fr/rnm/). Cada serie RNM enlaza a su historial mediante `prix?LIBCOD=...`. CEPEA publica sus condiciones de uso y licencia en la página de origen; conservar atribución y revisar esas condiciones antes de redistribución comercial.

Pruebas: `scripts/test-report-protein-prices.cjs` (parseo, frecuencia, errores, recuperación, guardado, CSV, TTL y concurrencia), `scripts/test-report-global-commodities.cjs`, `scripts/test-report-sector-session.mjs`, compilación y revisión de pantalla/PDF con datos del caché.
