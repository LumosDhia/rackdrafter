import { createHash } from 'node:crypto';
import { canonicalHashSource } from '#shared/domain/canonical.ts';
import type { Project } from '#shared/domain/types.ts';

export function hashDocument(project: Project): string {
  return createHash('sha256').update(canonicalHashSource(project)).digest('hex');
}
