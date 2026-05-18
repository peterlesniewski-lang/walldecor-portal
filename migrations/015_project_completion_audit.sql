-- Migration 015: Audit who finalized a project.
-- Status ZAKOŃCZONY is treated as the staff/admin verification point.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS completed_by VARCHAR(255) NULL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS completed_at DATETIME NULL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS completion_note TEXT NULL;

-- Fresh installs define the foreign key in deploy/schema.mysql.sql.
-- Existing databases skip it here to avoid duplicate-constraint differences across MySQL/MariaDB versions.

-- SQLite fallback if running migrations manually:
-- ALTER TABLE projects ADD COLUMN completed_by TEXT NULL;
-- ALTER TABLE projects ADD COLUMN completed_at DATETIME NULL;
-- ALTER TABLE projects ADD COLUMN completion_note TEXT NULL;
