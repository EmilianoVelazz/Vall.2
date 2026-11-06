import { existsSync } from 'node:fs';
import path from 'node:path';

export const RETIRED_FILES = [
  'assets/img/mexico-productivo.png',
  'assets/img/robot.svg',
  'assets/img/vall-ai-mascot.svg',
  'assets/js/chat-widget.js',
  'assets/js/login.js',
  'assets/js/page-loader.js',
  'assets/js/flags-widget.js',
  'assets/css/login.css',
  'assets/css/finanzas-map-unified.css',
  'assets/css/finanzas-bolsa-harmony.css',
  'frontend/src/pages/Geopolitica.jsx',
  'frontend/src/pages/Geopolitica.css',
  'frontend/src/components/AcledMap.jsx',
  'frontend/src/data/acledDemo.js',
  'frontend/src/components/DataSphere.jsx',
  'frontend/src/components/ProteinGlobalOverview.jsx',
  'frontend/src/components/SalaNoticiasMercados.jsx',
  'frontend/src/lib/animaInicio.js',
  'frontend/src/lib/animaLogin.js',
  'frontend/src/lib/fondoWebGL.js',
  'frontend/src/lib/usePresentationMotion.js',
  'frontend/src/lib/reportEditorPresets.js',
];

// Evita que restaurar una carpeta antigua publique otra vez motores retirados.
export function assertRetiredFilesAbsent(root) {
  const present = RETIRED_FILES.filter(file => existsSync(path.join(root, file)));
  if (present.length) throw new Error(`Código retirado reapareció: ${present.join(', ')}`);
}
