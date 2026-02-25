-- Migration 003: Add tier_override to users table
-- Allows ADMIN to manually assign a tier to an architect
-- NULL = auto-calculated from turnover; values: 'SILVER' | 'GOLD' | 'PLATINUM'
ALTER TABLE users ADD COLUMN tier_override TEXT NULL;

-- Also add commission_rate if not present (individual rate for BEGINNER bracket)
-- ALTER TABLE users ADD COLUMN commission_rate REAL NULL; -- already exists from earlier migrations
