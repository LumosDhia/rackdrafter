import { z } from 'zod';

// ports come in from the inspector input as strings, "8080" failed z.number().
// coerce for now, probably wrong long term
const port = z.coerce.number().int().min(1).max(65535);

const ipv4 = z.string().regex(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);

export const NodeSchema = z.object({
  id: z.string(),
  kind: z.enum(['device', 'service', 'network', 'group', 'note']),
  label: z.string().min(1),
  position: z.object({ x: z.number(), y: z.number() }),
  ip: ipv4.optional(),
  port: port.optional(),
  notes: z.string().default(''),
});

export const LinkSchema = z.object({
  id: z.string(),
  kind: z.string(),
  source: z.string(),
  target: z.string(),
});

export const ProjectSchema = z.object({
  schemaVersion: z.number().default(1),
  id: z.string(),
  name: z.string().min(1).max(80),
  nodes: z.array(NodeSchema),
  links: z.array(LinkSchema),
});
