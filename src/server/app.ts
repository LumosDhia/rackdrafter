import { existsSync } from 'node:fs';
import Fastify, { type FastifyServerOptions } from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import { ApiError } from './errors.ts';
import { closeDatabase, openDatabase, type Db } from './db/client.ts';
import { registerAuth } from './plugins/auth.ts';
import { clientDistDir, registerSpa } from './plugins/spa.ts';
import { registerViteDev } from './plugins/vite-dev.ts';
import { registerHealth } from './routes/health.ts';
import { registerProjects } from './routes/projects.ts';
import { registerVersions } from './routes/versions.ts';
import { registerShares } from './routes/shares.ts';
import { registerAnalysis } from './routes/analysis.ts';
import { registerExport } from './routes/export.ts';
import { seedIfNeeded } from './seed.ts';

export interface BuildAppOptions {
  dbPath: string;
  token?: string;
  dev?: boolean;
  logger?: FastifyServerOptions['logger'];
  seed?: boolean;
}

export async function buildApp(opts: BuildAppOptions) {
  const app = Fastify({
    logger: opts.logger ?? false,
    bodyLimit: 5 * 1024 * 1024,
  }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const db: Db = openDatabase(opts.dbPath);
  if (opts.seed) seedIfNeeded(db);

  app.decorate('db', db);

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ApiError) {
      const payload: Record<string, unknown> = {
        error: { code: err.code, message: err.message, details: err.details },
      };
      if (err.extra) Object.assign(payload, err.extra);
      return reply.status(err.status).send(payload);
    }
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (statusCode === 413) {
      return reply.status(413).send({
        error: { code: 'payload_too_large', message: 'Payload too large' },
      });
    }
    if (statusCode === 400 || (err as { validation?: unknown }).validation) {
      const message = err instanceof Error ? err.message : 'bad request';
      return reply.status(400).send({
        error: { code: 'bad_request', message },
      });
    }
    req.log.error(err);
    return reply.status(500).send({ error: { code: 'internal', message: 'Internal error' } });
  });

  await registerAuth(app, opts.token);
  await registerHealth(app);
  await registerProjects(app, db);
  await registerVersions(app, db);
  await registerShares(app, db);
  await registerAnalysis(app, db);
  await registerExport(app, db);

  const dist = clientDistDir();
  const isProd = process.env.NODE_ENV === 'production';
  if (opts.dev) {
    await registerViteDev(app);
  } else if (isProd || existsSync(dist)) {
    await registerSpa(app);
  }

  app.addHook('onClose', async () => {
    closeDatabase(db);
  });

  return app;
}
