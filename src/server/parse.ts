import type { z } from 'zod';
import { badRequest } from './errors.ts';

export function parseBody<T>(schema: z.ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) throw badRequest('invalid body', result.error.issues);
  return result.data;
}
