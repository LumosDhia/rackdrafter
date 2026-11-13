import { buildApp } from '../../src/server/app.ts';

export async function makeApp(opts: { token?: string; seed?: boolean } = {}) {
  return buildApp({
    dbPath: ':memory:',
    token: opts.token,
    dev: false,
    logger: false,
    seed: opts.seed ?? false,
  });
}
