import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const projects = sqliteTable(
  'projects',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    schemaVersion: integer('schema_version').notNull(),
    document: text('document').notNull(),
    docSeq: integer('doc_seq').notNull().default(0),
    docHash: text('doc_hash').notNull(),
    nodeCount: integer('node_count').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [uniqueIndex('projects_slug_unique').on(t.slug), index('projects_updated_at').on(t.updatedAt)],
);

export const projectVersions = sqliteTable(
  'project_versions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    versionNo: integer('version_no').notNull(),
    label: text('label').notNull().default(''),
    source: text('source').notNull(),
    schemaVersion: integer('schema_version').notNull(),
    document: text('document').notNull(),
    docHash: text('doc_hash').notNull(),
    docSeq: integer('doc_seq').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('project_versions_project_version').on(t.projectId, t.versionNo),
    index('project_versions_project').on(t.projectId, t.versionNo),
  ],
);

export const shares = sqliteTable(
  'shares',
  {
    token: text('token').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    versionNo: integer('version_no'),
    createdAt: integer('created_at').notNull(),
    expiresAt: integer('expires_at'),
    revokedAt: integer('revoked_at'),
  },
  (t) => [index('shares_project').on(t.projectId)],
);

export const meta = sqliteTable('meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export const schema = { projects, projectVersions, shares, meta };
