-- Migration 002: Standardize role string + add project_id to commissions
-- Run after migration 001. Safe to run multiple times (idempotent where possible).

-- STEP 1: Standardize architect role string.
-- Historical data may contain 'ARCH_I'. All architect users must use 'ARCHI'.
-- After this runs, remove the IN ('ARCHI', 'ARCH_I') dual-lookup workaround from code.
UPDATE users SET role = 'ARCHI' WHERE role = 'ARCH_I';

-- STEP 2: Add project_id column to commissions table.
-- This column links commissions directly to a project (in addition to project_item_id).
-- Required for PENDING commission queries and cancellation on project rejection.
--
-- MySQL:
ALTER TABLE commissions ADD COLUMN IF NOT EXISTS project_id VARCHAR(50) NULL;
ALTER TABLE commissions ADD CONSTRAINT IF NOT EXISTS fk_commissions_project
    FOREIGN KEY (project_id) REFERENCES projects(id);

-- SQLite equivalent (SQLite does not support IF NOT EXISTS on ALTER TABLE ADD COLUMN):
-- Check if column exists first, then run:
-- ALTER TABLE commissions ADD COLUMN project_id TEXT NULL;
-- (Foreign key is enforced at application level in SQLite mode.)

-- STEP 3: Backfill project_id for existing commission records via project_item_id.
UPDATE commissions c
JOIN project_items i ON c.project_item_id = i.id
SET c.project_id = i.project_id
WHERE c.project_id IS NULL;
