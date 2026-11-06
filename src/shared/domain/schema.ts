import { z } from 'zod';

// first pass, just enough to validate what the canvas saves
export const NodeSchema = z.object({
  id: z.string(),
  kind: z.string(),
  label: z.string(),
  position: z.object({ x: z.number(), y: z.number() }),
  ip: z.string().optional(),
  port: z.number().optional(),
});

export const LinkSchema = z.object({
  id: z.string(),
  kind: z.string(),
  source: z.string(),
  target: z.string(),
});

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  nodes: z.array(NodeSchema),
  links: z.array(LinkSchema),
});
