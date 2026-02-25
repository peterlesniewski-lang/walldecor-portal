-- Migration 004: Create cashback_redemptions table
-- Stores requests for cashback realization via discount codes.

-- MySQL:
CREATE TABLE IF NOT EXISTS cashback_redemptions (
    id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    code VARCHAR(100) NULL,
    status ENUM('PENDING', 'COMPLETED') DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- SQLite equivalent (for local dev):
-- CREATE TABLE cashback_redemptions (
--     id TEXT PRIMARY KEY,
--     user_id TEXT NOT NULL,
--     amount REAL NOT NULL,
--     code TEXT,
--     status TEXT DEFAULT 'PENDING',
--     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--     processed_at TIMESTAMP,
--     FOREIGN KEY (user_id) REFERENCES users(id)
-- );
