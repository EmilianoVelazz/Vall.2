# Bonos: comparativas visuales desde 2020

- El cargador del Tesoro consulta todos los años desde 2020 hasta el año del corte. Antes consultaba solamente 2020 y los dos años recientes. Si una descarga anual falla se conservan las observaciones previas de la misma base.
- Cinco gráficas en el lector y el PDF: curva soberana con tres fechas observadas; Treasury 2/10/30 años; SOFR y TIIE de fondeo; nominal/TIPS/breakeven a diez años; OAS corporativos y EMBIG México. Máximo tres líneas por gráfica histórica.
- Las comparativas temporales muestran la última observación publicada de cada mes. El último mes es parcial; no hay promedios, interpolación ni extensión artificial hacia 2020. Se interrumpen los trazos si faltan más de 62 días.
- Las tasas conservan unidades porcentuales; las primas conservan puntos base. SOFR y TIIE son referencias de monedas distintas. OAS y EMBIG miden riesgos distintos. Las notas lo explican.
- Las series públicas de OAS verificadas comienzan en octubre de 2023; el inicio real figura en las leyendas del PDF y en la metodología del lector. Treasury, SOFR, TIIE, TIPS, breakeven y EMBIG conservan observaciones desde 2020 cuando las fuentes las aportan.
- Banxico sin token puede completar cierres mensuales mediante su consulta pública de calendario. Reutiliza meses ya obtenidos, limita concurrencia y respeta un plazo común de descarga. No cambia la identidad de las series.
- El formato de datos de Bonos pasa a versión 4 para actualizar las ediciones base almacenadas. Las ediciones guardadas preservan las observaciones canónicas, a partir de las que se reconstruyen las gráficas.
- PDF diario y semanal: dos páginas, con las 26 referencias de tablas y cuatro indicadores del tablero en la muestra pública verificada; sin eliminar información para hacer espacio a las gráficas.

Validación: pruebas de Bonos, fechas/periodos/unidades, recuperación de todos los años intermedios, cierres mensuales públicos sin token, persistencia exacta de gráficas, compilación y lint. Simulación del lector en escritorio y móvil, filtros por país, selección de leyenda y descarga HTTP 200 de ambas ediciones. PDF renderizado e inspeccionado visualmente.

Los envíos programados permanecen desactivados. No se modifican cuentas ni se ejecutan migraciones de Supabase.
