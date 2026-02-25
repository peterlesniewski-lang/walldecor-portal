-- Migration 001: Add payout_requests table
-- Supports both MySQL (production) and SQLite (local dev).
-- Run this once against your database before deploying the wallet-based payout flow.
--
-- Context: payout_requests replaces the IN_PAYOUT commission status mechanism.
-- A payout request represents an architect's request to withdraw their wallet (cashback) balance.
-- On ADMIN approval, spendCashback() creates a SPEND entry in wallet_transactions.
--
-- If you have existing commissions with status = 'IN_PAYOUT', those are orphaned by this migration.
-- Decide manually per-record: either mark them 'EARNED' (revert) or 'PAID' (finalize).

-- MySQL:
CREATE TABLE IF NOT EXISTS payout_requests (
    id VARCHAR(50) PRIMARY KEY,
    architect_id VARCHAR(50) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP NULL,
    processed_by VARCHAR(50) NULL,
    FOREIGN KEY (architect_id) REFERENCES users(id),
    FOREIGN KEY (processed_by) REFERENCES users(id)
);

-- SQLite equivalent (run instead of the above when DB_TYPE=sqlite):
-- CREATE TABLE IF NOT EXISTS payout_requests (
--     id TEXT PRIMARY KEY,
--     architect_id TEXT NOT NULL,
--     amount REAL NOT NULL,
--     status TEXT NOT NULL DEFAULT 'PENDING',
--     created_at TEXT DEFAULT (datetime('now')),
--     processed_at TEXT NULL,
--     processed_by TEXT NULL
-- );
