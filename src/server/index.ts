import { loadEnv } from './env.ts';
import { buildApp } from './app.ts';

const env = loadEnv();
const isProd = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

const app = await buildApp({
  dbPath: env.RACKDRAFTER_DB,
  token: env.RACKDRAFTER_TOKEN,
  dev: !isProd && !isTest,
  logger: isTest ? false : { level: env.LOG_LEVEL },
  seed: env.RACKDRAFTER_SEED !== '0',
});

const shutdown = async () => {
  await app.close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

await app.listen({ port: env.PORT, host: env.HOST });
