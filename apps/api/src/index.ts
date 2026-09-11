import 'dotenv/config';
import { loadServerEnv } from '@career-lens-ai/config';
import { buildApp } from './app.js';

async function main(): Promise<void> {
  const env = loadServerEnv();
  const app = await buildApp(env);

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void main();
