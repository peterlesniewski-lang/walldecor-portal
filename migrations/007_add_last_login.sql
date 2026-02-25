-- Migration 007: Add last_login_at to users table
-- Tracks the most recent successful login for each user (used in admin Settings).

ALTER TABLE users ADD COLUMN last_login_at DATETIME NULL;

-- MySQL equivalent (idempotent):
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at DATETIME NULL;
