# Proteínas: fuentes y gráficas

Se incorporan 19 referencias semanales de DG AGRI para porcino clase E, vacuno AR3 y huevo de gallinas en suelo. La consulta real del 20 de octubre recuperó 18: el porcino E de Italia permanece sin dato. Los países con precios son España, Alemania, Francia, Dinamarca, Países Bajos, Polonia, Italia, Bélgica e Irlanda.

Junto a CEPEA (2) y FranceAgriMer–RNM (10), hay 30 precios físicos disponibles. Se conservan siete referencias de futuros de Yahoo/Sina, separadas de los mercados físicos. El catálogo contiene 38 referencias y 37 tienen un precio fechado.

Mercolleida se consulta directamente mediante el conector público existente. Las tendencias de porcino/insumos y los comentarios de porcino/vacuno llevan su fecha y procedencia. No se reconstruyen precios absolutos a partir de flechas o comentarios. Las tablas originales están en anexos; los comentarios se muestran después de las gráficas, sin duplicarlos como tabla en el cuerpo del informe.

Las 13 gráficas aparecen junto a cada especie en la lectura y el PDF. Las diarias comparan las dos últimas publicaciones de cada referencia y muestran sus fechas. Las semanales/mensuales sólo representan el último nivel publicado, agrupado por unidad; no se calcula una variación diaria. En DG AGRI, la fecha es el fin de la semana de referencia, no la fecha exacta de publicación, que no ofrece esa respuesta de la API.

El cargador valida país, clase/producto, moneda, unidad, periodo semanal, fechas válidas, duplicados contradictorios y corte. Agrupa las descargas en tres solicitudes oficiales. Ante un fallo conserva únicamente una serie previa de la misma identidad/unidad/frecuencia y marca el dato como conservado. Se mantiene la actualización de precios físicos cada 30 minutos al consultar un informe y en los cortes programados; el cliente público de Mercolleida tiene su propio caché de diez minutos.

Fuentes:

- [DG AGRI: documentación oficial de la API](https://agridata.ec.europa.eu/extensions/API_Documentation/GeneralInfo.html)
- [Mercolleida](https://www.mercolleida.com/es/)
- [CEPEA: pollo](https://www.cepea.org.br/br/indicador/frango.aspx)
- [FranceAgriMer–RNM](https://rnm.franceagrimer.fr/)

Validación: consulta real en `output/proteinas-fuentes/consulta-publica.json`; pruebas de cargadores, guardado, CSV, modelo PDF, fechas y fallas; navegador aislado a 320–1440 px; compilación y ESLint. PDF de muestra de ocho páginas revisado visualmente: `output/pdf/proteinas-formato-boletin.pdf`.

## Corrección de actualización del navegador

La biblioteca conservaba el primer payload en estado y devolvía ese corte indefinidamente cuando se regresaba al área. Ahora los informes base se vuelven a consultar al entrar al área, al recuperar el foco y periódicamente mientras la página está visible. El resultado mantiene la referencia seleccionada y reemplaza su objeto por la versión nueva. Un borrador en edición impide la actualización periódica. El botón «Actualizar datos» permite solicitar el corte sin vaciar la lectura abierta. Los informes guardados conservan su contenido.

Las fuentes de proteínas aparecen al inicio del resumen, con Mercolleida y los proveedores físicos antes de los futuros. Se incrementó la versión de presentación para invalidar vistas PDF conservadas en el cliente.

Se reprodujo en una prueba de navegador una primera respuesta con sólo Yahoo; el botón la sustituyó por el corte multifuente sin perder la selección de Proteínas. Después se comprobó otra actualización automática. La prueba usa datos públicos reales del respaldo y autenticación aislada. También se validó el manejador real de `/api/market-executive-reports` con almacenamiento aislado: 38 referencias y 13 gráficas. No se accedió a la sesión privada del usuario. Evidencia visual: `output/proteinas-boletin/fuentes-actualizadas.png`.

Compilación, ESLint y pruebas específicas de proteínas/actualización: correctas. La prueba general `test-report-presentation.mjs` falló en una aserción de texto de PDF genérico («Conservar el dato»); este cambio no modifica ese renderizador. No se considera una validación aprobada.
