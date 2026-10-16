import pg from 'pg';
import { buildApp } from './app.js';
import { initDatabase } from './database.js';
import { stopTelemetry } from './instrumentation.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString)
  throw new Error(
    'DATABASE_URL is required; use the development command to load local configuration',
  );
const pool = new pg.Pool({
  connectionString,
  max: 10,
  connectionTimeoutMillis: 5000,
});
const app = buildApp({ pool });
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  await app.close();
  await pool.end();
  await stopTelemetry();
}
process.once('SIGTERM', () => {
  void shutdown();
});
process.once('SIGINT', () => {
  void shutdown();
});
try {
  await initDatabase(pool);
  await app.listen({ host: '0.0.0.0', port: 4318 });
  process.stdout.write(
    `${JSON.stringify({ kind: 'ready', service: 'checkout-api', port: 4318 })}\n`,
  );
} catch (error) {
  await shutdown();
  throw error;
}
