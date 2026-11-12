import { expectTypeOf } from 'vitest';
import type { z } from 'zod';
import type { Project } from './types.ts';
import type { ProjectSchema } from './schema.ts';

expectTypeOf<z.infer<typeof ProjectSchema>>().toEqualTypeOf<Project>();
