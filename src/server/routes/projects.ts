import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { emptyProject } from '#shared/domain/defaults.ts';
import { clock } from '#shared/domain/clock.ts';
import { migrateProject } from '#shared/domain/migrations.ts';
import { ProjectSchema } from '#shared/domain/schema.ts';
import type { Project } from '#shared/domain/types.ts';
import { getSeed } from '#shared/seeds/index.ts';
import type { Db } from '../db/client.ts';
import {
  assignNewIdentity,
  deleteProject,
  getProject,
  getProjectRow,
  insertProject,
  listProjects,
  renameProject,
  toMeta,
} from '../db/repo/projects.ts';
import { latestVersionNo, maybeAutoVersion } from '../db/repo/versions.ts';
import { hashDocument } from '../hash.ts';
import { badRequest, notFound, unsupportedDocument } from '../errors.ts';
import { projects as projectsTable } from '../db/schema.ts';
import { eq } from 'drizzle-orm';
import { parseBody } from '../parse.ts';

function parseIncomingDocument(raw: unknown): Project {
  let migrated: unknown;
  try {
    migrated = migrateProject(raw);
  } catch (err) {
    throw unsupportedDocument(err instanceof Error ? err.message : 'migration failed');
  }
  const parsed = ProjectSchema.safeParse(migrated);
  if (!parsed.success) {
    throw unsupportedDocument('document failed schema validation', parsed.error.issues);
  }
  return parsed.data;
}

export async function registerProjects(app: FastifyInstance, db: Db): Promise<void> {
  app.get('/api/projects', async () => ({ projects: listProjects(db) }));

  app.post(
    '/api/projects',
    {
      schema: {
        body: z.object({
          name: z.string().min(1).max(80),
          document: z.unknown().optional(),
          fromSeed: z.enum(['homelab', 'k3s-cicd']).optional(),
        }),
      },
    },
    async (req, reply) => {
      const { name, document, fromSeed } = parseBody(
        z.object({
          name: z.string().min(1).max(80),
          document: z.unknown().optional(),
          fromSeed: z.enum(['homelab', 'k3s-cicd']).optional(),
        }),
        req.body,
      );
      let source: 'manual' | 'import' | 'seed' = 'manual';
      let label = 'Created';
      let base: Project;
      if (fromSeed) {
        const builder = getSeed(fromSeed);
        if (!builder) throw badRequest(`seed ${fromSeed} is not available`);
        base = builder();
        source = 'seed';
        label = `Seed ${fromSeed}`;
      } else if (document !== undefined) {
        base = parseIncomingDocument(document);
        source = 'import';
        label = 'Imported';
      } else {
        base = emptyProject(name);
      }
      const named = assignNewIdentity(base, name);
      const created = insertProject(db, named, source, label);
      return reply.code(201).send(created);
    },
  );

  app.get('/api/projects/:id', async (req) => {
    const { id } = req.params as { id: string };
    return getProject(db, id);
  });

  app.patch(
    '/api/projects/:id',
    { schema: { body: z.object({ name: z.string().min(1).max(80) }) } },
    async (req) => {
      const { id } = req.params as { id: string };
      const { name } = parseBody(z.object({ name: z.string().min(1).max(80) }), req.body);
      return { meta: renameProject(db, id, name) };
    },
  );

  app.put(
    '/api/projects/:id/document',
    {
      schema: {
        body: z.object({
          baseSeq: z.number().int().nonnegative(),
          document: z.unknown(),
        }),
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const row = getProjectRow(db, id);
      if (!row) throw notFound('Project not found');
      const put = parseBody(
        z.object({ baseSeq: z.number().int().nonnegative(), document: z.unknown() }),
        req.body,
      );
      if (put.baseSeq !== row.docSeq) {
        const current = getProject(db, id);
        return reply.code(409).send({
          error: { code: 'conflict', message: 'stale baseSeq' },
          current,
        });
      }
      const document = parseIncomingDocument(put.document);
      document.id = row.id;
      document.updatedAt = clock.nowIso();
      const hash = hashDocument(document);
      if (hash === row.docHash) {
        return { meta: toMeta(row, latestVersionNo(db, id)), autoVersion: null };
      }
      const nextSeq = row.docSeq + 1;
      const now = clock.now();
      const serialized = JSON.stringify(document);
      db.update(projectsTable)
        .set({
          name: document.name,
          schemaVersion: document.schemaVersion,
          document: serialized,
          docSeq: nextSeq,
          docHash: hash,
          nodeCount: document.nodes.length,
          updatedAt: now,
        })
        .where(eq(projectsTable.id, id))
        .run();
      const autoVersion = maybeAutoVersion(db, id, {
        schemaVersion: document.schemaVersion,
        document: serialized,
        docHash: hash,
        docSeq: nextSeq,
      });
      const meta = toMeta(
        {
          id: row.id,
          slug: row.slug,
          name: document.name,
          docSeq: nextSeq,
          nodeCount: document.nodes.length,
          createdAt: row.createdAt,
          updatedAt: now,
        },
        latestVersionNo(db, id),
      );
      return { meta, autoVersion };
    },
  );

  app.delete('/api/projects/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    deleteProject(db, id);
    return reply.code(204).send();
  });

  app.post(
    '/api/projects/:id/duplicate',
    { schema: { body: z.object({ name: z.string().min(1).max(80).optional() }).optional() } },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const { document } = getProject(db, id);
      const { name } = parseBody(z.object({ name: z.string().min(1).max(80).optional() }), req.body ?? {});
      const nextName = name ?? `${document.name} copy`;
      const copy = assignNewIdentity(document, nextName);
      const created = insertProject(db, copy, 'manual', 'Duplicated');
      return reply.code(201).send(created);
    },
  );
}
