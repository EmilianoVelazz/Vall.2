const fs = require('fs');
let content = fs.readFileSync('frontend/src/pages/Mercados.jsx', 'utf8');

const bad_block = `                  </span>
                  <span><i className="fas fa-globe" /> FAO · volumen {ANIO_PROT}</span>
                  <span><i className="fas fa-clock" /> {hora ? \`Actualizado \${hora}\` : 'Actualizando…'}</span>
                </div>
              </div>

              {/* Dos medidores y no uno. El de presión de alimento cuenta el
                  COSTO —de dónde viene y hacia dónde va—, pero no dice nada de
                  la posición del país, que es la otra mitad de la pregunta:
                  México importa cerdo y pollo y exporta res, y eso cambia por
                  completo a quién le conviene que el grano suba. El envoltorio
                  es el mismo que ya usa Energía & Metales para sus dos. */}
              <div className="mkt-hero-gauges">
                <div className="grain-pressure-card">
                  <small>Presión de alimento</small>
                  <strong>{proteinas ? \`\${proteinas.presionAlimento}/100\` : '—'}</strong>
                  <div><i style={{ width: \`\${proteinas?.presionAlimento ?? 0}%\` }} /></div>
                  <span>{proteinas?.etiquetaAlimento || 'Calculando…'}</span>`;

content = content.replace(bad_block, '');

content = content.replace(
    '<i>Tasa con la que se convierte el tablero</i></span>',
    '<i>Aplica a granos; precios de carne son nativos MXN</i></span>'
);

fs.writeFileSync('frontend/src/pages/Mercados.jsx', content);
console.log('Fixed Mercados.jsx');
