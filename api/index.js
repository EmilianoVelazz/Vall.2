// Serverless entry point for Vercel.
// Root package.json has "type":"module" so this file is ESM.
// We use createRequire to load the CommonJS Express app.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const app = require('../backend/server.js');
export default app;
