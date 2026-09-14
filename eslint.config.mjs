/*
 * Configuración de ESLint para VALLNews.
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 * El proyecto vivió sin linter, y eso dejó pasar a un commit un carácter suelto
 * en `backend/server.js`:
 *
 *     if (pathPath.endsWith('.html')) {2
 *
 * Ese `2` es JavaScript VÁLIDO —la inserción automática de punto y coma lo
 * convierte en la sentencia muerta `2;`— así que `node --check` pasaba, el
 * servidor arrancaba y nada fallaba a la vista. La regla que lo caza es
 * `no-unused-expressions`, y por eso está encendida como error abajo.
 *
 * ── El criterio: cazar FALLOS, no imponer estilo ───────────────────────────
 * Este archivo NO trae reglas de formato (comillas, sangría, punto y coma
 * final). Un linter de estilo sobre un código ya escrito produce miles de
 * avisos, se silencia entero a la semana y deja de avisar también de lo que
 * importa. Aquí solo hay reglas que señalan algo roto o muerto.
 *
 * Uso:  npm run lint        (informe)
 *       npm run lint:fix    (arregla lo autocorregible)
 */
import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';

/* Reglas de fallo real, comunes a todo el proyecto. Van aparte para que las
   tres zonas (backend, frontend, scripts) no puedan divergir por descuido. */
const REGLAS_COMUNES = {
    /* LA regla de este archivo: caza el `2` suelto y cualquier sentencia que se
       calcula y se tira.

       `allowShortCircuit` va en true porque `window.setSuppChartType && window
       .setSuppChartType(v)` SÍ se usa aquí como guarda deliberada (Finanzas.jsx)
       cuando el puente con el código legado puede no estar montado todavía.
       Permitirlo no debilita lo que importa: un literal suelto como `2;` se
       sigue marcando igual, que es el caso que motivó esta configuración. */
    'no-unused-expressions': ['error', { allowShortCircuit: true, allowTernary: false }],

    /* Variables e imports que sobran. Esta es la regla que destapa el código
       muerto que deja atrás un refactor.

       `argsIgnorePattern` perdona tres familias de PARÁMETROS (nunca variables):
         · `next`, `req`, `res` → Express obliga a declararlos. Su manejador de
           errores DEBE tener aridad 4 (err, req, res, next) o Express deja de
           reconocerlo como tal, aunque no se use ninguno.
         · `e` → el parámetro de evento en `onChange={(e) => …}`. Son ~40 casos
           en Finanzas.jsx, todos convención y ninguno un fallo; sin perdonarlos
           sepultaban los avisos que sí importan.
         · `_algo` → el marcador explícito de «esto no se usa y lo sé».

       `caughtErrors: 'none'` por lo mismo: `catch (e) { … }` sin mirar `e` es
       deliberado en toda la base. */
    'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_|^next$|^req$|^res$|^e$',
        varsIgnorePattern: '^_',
        caughtErrors: 'none',
    }],

    'no-constant-condition': ['error', { checkLoops: false }],
    'no-dupe-keys': 'error',          // dos veces la misma clave: la segunda gana en silencio
    'no-dupe-else-if': 'error',
    'no-duplicate-case': 'error',
    'no-unreachable': 'error',
    'no-self-compare': 'error',
    'no-template-curly-in-string': 'warn',  // '${x}' en comillas normales no interpola
    'no-fallthrough': 'error',
    'require-atomic-updates': 'off',        // demasiados falsos positivos con async/await
    eqeqeq: ['warn', 'smart'],

    /* `catch {}` vacío es un patrón deliberado y frecuente aquí: «si falla, da
       igual» (localStorage sin permiso, mkdir de una caché que ya existe). Los
       sitios donde aparece llevan comentario. Se sigue exigiendo cuerpo en los
       demás bloques vacíos, que ahí sí suelen ser un olvido. */
    'no-empty': ['error', { allowEmptyCatch: true }],

    /* Apagada a propósito: los tres usos que marca son saneadores que quitan
       caracteres de control a posta —nombres de archivo en routes/attachments.js
       y texto del modelo en ai/response-schema.js—. La regla existe para cazar
       un control invisible pegado por accidente en un literal; aquí el rango
       \x00-\x1f está escrito explícitamente y es justo el objetivo del código. */
    'no-control-regex': 'off',
};

export default [
    {
        /* Lo que el linter NO mira, y por qué:
           · assets/js/vendor → librerías de terceros minificadas. Ajeno.
           · assets/css → no es JavaScript; ESLint no lo mira de todos modos.
           · dist, node_modules, .claude/worktrees → generado o ajeno.
           · boveda_obsidian, linear-design, tusitio-design, api_Gemini → notas y
             material de apoyo, no código de la aplicación.

           OJO: `assets/**` estaba aquí entero, descrito como «el sitio HTML
           anterior a React». Eso dejó de ser cierto al migrar: React CARGA ese
           código en runtime (Finanzas.jsx, Inicio.jsx, Geopolitica.jsx,
           AsistenteFlotante.jsx), y son ~14 800 líneas vivas —la zona más
           grande y compleja del proyecto— sin un solo análisis estático.
           Al destaparla salió a la primera un fallo visible en producción: el
           `replace(/^[🔴…]/)` sin flag `u` de finanzas-page.js:1056, que dejaba
           medio emoji («�») en el modal de riesgo. Ver el bloque de assets/js
           más abajo para el porqué de sus reglas. */
        ignores: [
            '**/node_modules/**',
            'dist/**',
            'frontend/dist/**',
            'assets/js/vendor/**',
            '.claude/**',
            '.venv/**',          // paquetes de Python; traen .js vendorizados
            '_scratch/**',        // trabajo desechable, ya ignorado por git
            'scripts/_verify/**', // salida de los verificadores; git ya la ignora
            'boveda_obsidian/**',
            'linear-design/**',
            'tusitio-design/**',
            'api_Gemini/**',
            '.agents/**',
        ],
    },

    // ── Backend: CommonJS sobre Node ────────────────────────────────────────
    {
        files: ['backend/**/*.js', 'backend/**/*.cjs', 'api/**/*.js'],
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: 'commonjs',
            globals: { ...globals.node },
        },
        rules: { ...js.configs.recommended.rules, ...REGLAS_COMUNES },
    },

    /* ── Guiones de build y verificación: ESM sobre Node ─────────────────────
       Llevan TAMBIÉN los globales de navegador, y no es un descuido: los
       verificadores (verify-page, verify-mercados…) manejan Puppeteer, y el
       cuerpo de cada `page.evaluate(() => …)` se ejecuta dentro de la página, no
       en Node. Sin los globales de navegador, ESLint marcaba `document` y
       `window` como no definidos y salían ~250 falsos positivos que tapaban
       cualquier aviso real de estos archivos. */
    {
        files: ['scripts/**/*.mjs', '*.mjs'],
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: 'module',
            globals: { ...globals.node, ...globals.browser },
        },
        rules: { ...js.configs.recommended.rules, ...REGLAS_COMUNES },
    },
    {
        files: ['scripts/**/*.cjs'],
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: 'commonjs',
            globals: { ...globals.node },
        },
        rules: { ...js.configs.recommended.rules, ...REGLAS_COMUNES },
    },

    /* ── assets/js: guiones clásicos de navegador, cargados por React ────────
       No son módulos: son `<script>` que `lib/loadScripts.js` inyecta y que se
       comunican colgando cosas de `window`. De ahí las tres desviaciones:

       · `sourceType: 'script'` — no hay import/export. Marcarlos como módulo
         cambia el modo estricto y la semántica del `this` de nivel superior.
       · `no-undef: 'off'` — es la regla que obligaría a declarar aquí cada
         global compartido entre archivos (VDS, Chart, LightweightCharts, y las
         decenas que estos guiones se pasan entre sí). Encenderla daría cientos
         de avisos sobre código que funciona, y el resultado conocido es que se
         silencia el archivo entero.
       · `no-unused-vars: 'off'` — por lo mismo: una función que solo se llama
         desde otro guion, o desde un `onclick` del HTML, aquí parece muerta.
         En el resto del proyecto esta regla sí está encendida.

       Lo que SÍ se persigue es lo que rompe de verdad: sintaxis inválida,
       ramas inalcanzables, claves duplicadas y la familia de errores de expresión
       regular —que es justo la que escondía el fallo del modal de riesgo—. */
    {
        files: ['assets/js/**/*.js'],
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: 'script',
            globals: { ...globals.browser },
        },
        rules: {
            ...js.configs.recommended.rules,
            ...REGLAS_COMUNES,
            'no-undef': 'off',
            'no-unused-vars': 'off',

            /* La que cazó el bug: una clase de caracteres con emojis y sin flag
               `u` se lee en unidades UTF-16 y acaba conteniendo mitades sueltas
               de surrogate. Va como error a propósito; nunca es intencionado. */
            'no-misleading-character-class': 'error',

            /* PROBADA Y DESCARTADA: `no-implicit-globals`. La idea era cazar el
               fallo propio de esta zona —dos guiones pisándose una variable—,
               pero da 201 avisos, seis veces los 33 del proyecto entero. Y no
               son falsos positivos exactamente: declarar globales de nivel
               superior es LA forma en que estos archivos se comunican, así que
               la regla pide reescribirlos todos. Encenderla enterraría los
               avisos reales bajo ruido, que es justo cómo muere un linter
               (ver la cabecera de este archivo). Si algún día se quiere el
               aislamiento, el camino es envolver en IIFE archivo a archivo,
               no un aviso global que nadie va a atender. */
        },
    },

    // ── Frontend React: ESM sobre navegador ─────────────────────────────────
    {
        files: ['frontend/src/**/*.{js,jsx}'],
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: 'module',
            globals: { ...globals.browser },
            parserOptions: { ecmaFeatures: { jsx: true } },
        },
        /* jsx-a11y se REGISTRA pero sus reglas no se encienden aquí. El motivo es
           concreto: `Header.jsx` ya trae un `eslint-disable-next-line
           jsx-a11y/no-noninteractive-element-interactions`, y con el plugin sin
           registrar ESLint da «Definition for rule was not found» —un error duro
           que haría fallar `npm run lint` entero por un comentario—. Registrarlo
           resuelve la directiva sin añadir un solo aviso nuevo, y deja el
           accesorio puesto para cuando se quiera activar la tanda de
           accesibilidad a propósito (`...jsxA11y.flatConfigs.recommended.rules`). */
        plugins: { react, 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
        settings: { react: { version: 'detect' } },
        rules: {
            ...js.configs.recommended.rules,
            ...react.configs.flat.recommended.rules,
            ...REGLAS_COMUNES,

            /* Con el JSX transform nuevo (React 18 + @vitejs/plugin-react) no
               hace falta importar React para usar JSX. Sin apagar estas dos, el
               linter pide un import que el proyecto no necesita. */
            'react/react-in-jsx-scope': 'off',
            'react/jsx-uses-react': 'off',

            /* Los dos motivos de tener el plugin de hooks. El primero es un fallo
               duro: un hook tras un `return` temprano descoloca el orden de los
               hooks entre renders y React rompe. El segundo avisa de
               dependencias que faltan en un useEffect —la causa clásica de
               «se quedó con el dato viejo»— y va como aviso porque en esta base
               hay omisiones deliberadas y documentadas. */
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/exhaustive-deps': 'warn',

            /* Este proyecto no usa PropTypes ni TypeScript; exigirlos aquí serían
               cientos de avisos sin ningún fallo detrás. */
            'react/prop-types': 'off',

            /* Apagada por coherencia con el criterio de este archivo: es una regla
               de ESTILO, no de fallo. `<option>L'Oréal</option>` es JSX válido y
               se pinta bien; la regla solo pediría escribir `&apos;`. En una
               interfaz en español y con nombres franceses eso es ruido constante
               sobre texto que funciona. */
            'react/no-unescaped-entities': 'off',

            /* dangerouslySetInnerHTML se usa en tres sitios, TODOS pasando por
               lib/textoEnriquecido.js, que sanea con lista blanca. Está
               verificado contra vectores de XSS reales, así que la regla queda
               como aviso: sirve de recordatorio si aparece un cuarto uso, que sí
               habría que revisar. */
            'react/no-danger': 'warn',
        },
    },
];
