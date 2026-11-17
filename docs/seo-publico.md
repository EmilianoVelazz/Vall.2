# SEO público de VALLNews

El catálogo `shared/public-site.json` define las páginas públicas, sus textos y
metadatos, y las rutas privadas. El dominio canónico es `https://vallnews.com`.
Los informes, las conversaciones y las cuentas conservan su autenticación.

`npm run build` compila React y prerenderiza las ocho páginas públicas desde los
mismos componentes que utiliza el navegador. Genera robots.txt, sitemap.xml,
HTML de acceso con noindex y una página 404. El sitemap sólo contiene páginas
públicas; no se inventan fechas lastmod. La carpeta de manifiesto de Vite se
retira después de preparar el HTML.

En Dokploy, Express sirve esas páginas y distingue los errores reales de las
rutas válidas. Los alias antiguos y el host www redirigen permanentemente,
conservando parámetros. Los recursos estáticos ausentes devuelven 404. Los CSS
públicos pueden revalidarse mediante ETag; los bundles con hash conservan su
caché immutable. La configuración de Vercel conserva las rutas API y sirve el
árbol de páginas generado sin el antiguo fallback universal; requiere su propia
validación si se vuelve a desplegar en esa plataforma.

La portada no precarga módulos privados. Las fuentes adicionales sólo se
solicitan en las secciones privadas; el globo 3D se carga con la portada y
conserva el giro manual con movimiento reducido. El usuario puede
activar el movimiento automático desde la portada. Si el navegador no admite
WebGL, la alternativa visual también permite pausar y activar el giro.

Comprobaciones:

- `npm run build`
- `npm run test:seo` (HTTP real local y navegador de escritorio/móvil)
- `npm run lint`
- En producción: verificar robots, sitemap, canonical, redirecciones, 404 y
  exclusión del acceso. Revisar que las páginas públicas sigan siendo legibles
  sin ejecutar JavaScript.

Para cerrar la medición de posicionamiento falta acceso a Search Console:
verificar la propiedad, enviar `/sitemap.xml`, inspeccionar las páginas públicas
y seguir cobertura, impresiones y clics. No se deben introducir credenciales de
verificación inventadas ni prometer indexación. PageSpeed y los datos de campo
deben medirse cuando estén disponibles; esta implementación no acredita por sí
sola haber aprobado Core Web Vitals.
