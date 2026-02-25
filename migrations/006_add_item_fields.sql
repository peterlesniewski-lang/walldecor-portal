-- Migration 006: Add order/invoice tracking fields to project_items; add invoice_number to payout_requests
-- Run after migration 005.

-- STEP 1: project_items — tracking fields
-- order_number  : nr zamówienia WallDecor (order reference)
-- invoice_number: nr faktury klienta (client-facing invoice on the project item)
-- is_paid       : czy klient opłacił tę pozycję
ALTER TABLE project_items ADD COLUMN order_number  TEXT NULL;
ALTER TABLE project_items ADD COLUMN invoice_number TEXT NULL;
ALTER TABLE project_items ADD COLUMN is_paid        BOOLEAN NOT NULL DEFAULT 0;

-- STEP 2: payout_requests — invoice from architect to WallDecor
-- invoice_number: numer faktury wystawionej przez architekta dla WallDecor (Nr dokumentu)
ALTER TABLE payout_requests ADD COLUMN invoice_number TEXT NULL;

-- Notes:
-- SQLite : ALTER TABLE ADD COLUMN supported as-is; no IF NOT EXISTS needed for fresh columns.
-- MySQL  : Use ADD COLUMN IF NOT EXISTS for idempotency:
--   ALTER TABLE project_items  ADD COLUMN IF NOT EXISTS order_number   VARCHAR(100) NULL;
--   ALTER TABLE project_items  ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(100) NULL;
--   ALTER TABLE project_items  ADD COLUMN IF NOT EXISTS is_paid        BOOLEAN NOT NULL DEFAULT 0;
--   ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(100) NULL;
