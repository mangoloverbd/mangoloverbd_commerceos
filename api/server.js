// Vercel auto-detects files in /api as serverless functions.
// This thin wrapper re-exports the Express app so all /api/* routes
// are handled by the Express router in server/index.js.
export { default } from '../server/index.js';
