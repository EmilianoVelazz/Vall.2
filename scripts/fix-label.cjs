const fs = require('fs');
let content = fs.readFileSync('frontend/src/pages/Mercados.jsx', 'utf8');

content = content.replace(
  '<span><small>USD/MXN</small><strong>{proteinas ? `$${proteinas.fx.toFixed(4)}` : \'—\'}</strong><i>Tasa con la que se convierte el tablero</i></span>',
  '<span><small>USD/MXN</small><strong>{proteinas ? `$${proteinas.fx.toFixed(4)}` : \'—\'}</strong><i>Aplica a granos; precios de carne son nativos MXN</i></span>'
);

fs.writeFileSync('frontend/src/pages/Mercados.jsx', content);
