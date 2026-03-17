-- Migration 012: Add OAuth support columns to users table
-- provider: 'credentials' | 'google'
-- provider_account_id: OAuth provider's user ID (NULL for credentials users)
-- password: now nullable (OAuth users don't have a password)

-- MySQL / Production:
ALTER TABLE users MODIFY COLUMN password VARCHAR(255) NULL;
ALTER TABLE users ADD COLUMN provider VARCHAR(20) NOT NULL DEFAULT 'credentials' AFTER password;
ALTER TABLE users ADD COLUMN provider_account_id VARCHAR(255) NULL AFTER provider;
ALTER TABLE users ADD UNIQUE INDEX idx_provider_account (provider, provider_account_id);

-- SQLite / Development note:
-- SQLite does not support MODIFY COLUMN or ADD UNIQUE INDEX.
-- Run these instead (SQLite supports ADD COLUMN since 3.35+):
--   ALTER TABLE users ADD COLUMN provider TEXT NOT NULL DEFAULT 'credentials';
--   ALTER TABLE users ADD COLUMN provider_account_id TEXT;
-- Or recreate the SQLite DB from scratch if starting fresh.
