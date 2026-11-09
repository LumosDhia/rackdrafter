CREATE TABLE projects (
  id              TEXT PRIMARY KEY,
  slug            TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  schema_version  INTEGER NOT NULL,
  document        TEXT NOT NULL CHECK (json_valid(document)),
  doc_seq         INTEGER NOT NULL DEFAULT 0,
  doc_hash        TEXT NOT NULL,
  node_count      INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX projects_updated_at ON projects(updated_at DESC);
--> statement-breakpoint
CREATE TABLE project_versions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version_no      INTEGER NOT NULL,
  label           TEXT NOT NULL DEFAULT '',
  source          TEXT NOT NULL CHECK (source IN ('auto','manual','restore','import','seed')),
  schema_version  INTEGER NOT NULL,
  document        TEXT NOT NULL CHECK (json_valid(document)),
  doc_hash        TEXT NOT NULL,
  doc_seq         INTEGER NOT NULL,
  created_at      INTEGER NOT NULL,
  UNIQUE (project_id, version_no)
);
--> statement-breakpoint
CREATE INDEX project_versions_project ON project_versions(project_id, version_no DESC);
--> statement-breakpoint
CREATE TABLE shares (
  token           TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version_no      INTEGER,
  created_at      INTEGER NOT NULL,
  expires_at      INTEGER,
  revoked_at      INTEGER
);
--> statement-breakpoint
CREATE INDEX shares_project ON shares(project_id);
--> statement-breakpoint
CREATE TABLE meta (
  key             TEXT PRIMARY KEY,
  value           TEXT NOT NULL
);
