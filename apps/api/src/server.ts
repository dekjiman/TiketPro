import 'dotenv/config';
import { buildApp } from './index.js';
import { env } from './config/env.js';

async function main() {
  const app = await buildApp();
  
  await app.listen({ port: env.API_PORT, host: '0.0.0.0' });
  
  console.log(`Server running on port ${env.API_PORT} in ${env.NODE_ENV} mode`);
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});