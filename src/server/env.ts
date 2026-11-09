import { z } from 'zod';

const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4747),
  HOST: z.string().default('127.0.0.1'),
  RACKDRAFTER_DB: z.string().default('./data/rackdrafter.db'),
  RACKDRAFTER_TOKEN: z.string().optional(),
  RACKDRAFTER_INSECURE: z.string().optional(),
  RACKDRAFTER_SEED: z.string().default('1'),
  LOG_LEVEL: z.string().default('info'),
  NODE_ENV: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost']);

export function loadEnv(raw: NodeJS.ProcessEnv = process.env): Env {
  const env = EnvSchema.parse(raw);
  if (env.RACKDRAFTER_TOKEN !== undefined && env.RACKDRAFTER_TOKEN.length < 24) {
    throw new Error('RACKDRAFTER_TOKEN must be at least 24 characters');
  }
  const insecure = env.RACKDRAFTER_INSECURE === '1';
  if (!LOOPBACK.has(env.HOST) && !env.RACKDRAFTER_TOKEN && !insecure) {
    throw new Error(`Refusing to bind HOST=${env.HOST} without RACKDRAFTER_TOKEN or RACKDRAFTER_INSECURE=1`);
  }
  return env;
}
