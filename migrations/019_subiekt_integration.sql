-- 019: Integracja Subiekt GT. Dokumenty z Subiekta oznaczone architektem trafiają do tabel
--      pośrednich, są mapowane na projekty i pozycje (source = 'SUBIEKT'), a zmiany ZK zapisują
--      się jako snapshoty. Zob. PLAN-SUBIEKT-2026-10-29.md.
--
--      Loop 0: pochodzenie pozycji projektu (rdzeń src/lib/projectItems.ts zapisuje te kolumny).
--      source              : MANUAL (panel admina) | SUBIEKT (synchronizacja)
--      subiekt_document_id : id dokumentu w subiekt_documents
--      subiekt_position_id : id pozycji dokumentu w Subiekcie
--      Loop 1: kod architekta w Subiekcie, ręczne przełączenie typu pozycji, tabele pośrednie
--      (dokumenty, snapshoty, uruchomienia agenta).
--      SQLite nie obsługuje ADD COLUMN ... UNIQUE, dlatego indeks unikalny jest osobną instrukcją.

ALTER TABLE project_items ADD COLUMN source VARCHAR(16) NOT NULL DEFAULT 'MANUAL';
ALTER TABLE project_items ADD COLUMN subiekt_document_id VARCHAR(36) NULL;
ALTER TABLE project_items ADD COLUMN subiekt_position_id INTEGER NULL;

ALTER TABLE users ADD COLUMN subiekt_code VARCHAR(64) NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_subiekt_code ON users(subiekt_code);

ALTER TABLE project_items ADD COLUMN type_overridden INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_project_items_subiekt_doc ON project_items(subiekt_document_id);

CREATE TABLE IF NOT EXISTS subiekt_documents (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    external_id INTEGER NOT NULL UNIQUE,
    type VARCHAR(8) NOT NULL,
    number VARCHAR(64) NOT NULL,
    issued_at DATE NOT NULL,
    contractor_name VARCHAR(255) NOT NULL,
    contractor_nip VARCHAR(20) NULL,
    architect_code VARCHAR(64) NULL,
    architect_id VARCHAR(36) NULL,
    parent_external_id INTEGER NULL,
    root_external_id INTEGER NULL,
    project_id VARCHAR(36) NULL,
    net_total DECIMAL(12,2) NOT NULL,
    gross_total DECIMAL(12,2) NOT NULL,
    is_paid INTEGER NOT NULL DEFAULT 0,
    remarks TEXT NULL,
    content_hash CHAR(64) NOT NULL,
    positions_json TEXT NOT NULL,
    assignment_status VARCHAR(16) NOT NULL DEFAULT 'UNASSIGNED',
    assignment_note TEXT NULL,
    first_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_run_id VARCHAR(36) NULL
);
CREATE INDEX IF NOT EXISTS idx_subiekt_documents_project ON subiekt_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_subiekt_documents_root ON subiekt_documents(root_external_id);
CREATE INDEX IF NOT EXISTS idx_subiekt_documents_assignment ON subiekt_documents(assignment_status);

CREATE TABLE IF NOT EXISTS subiekt_document_snapshots (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    document_id VARCHAR(36) NOT NULL,
    run_id VARCHAR(36) NOT NULL,
    content_hash CHAR(64) NOT NULL,
    positions_json TEXT NOT NULL,
    net_total DECIMAL(12,2) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_subiekt_snapshots_document ON subiekt_document_snapshots(document_id, created_at);

CREATE TABLE IF NOT EXISTS subiekt_sync_runs (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    agent_version VARCHAR(32) NULL,
    started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at DATETIME NULL,
    pages_received INTEGER NOT NULL DEFAULT 0,
    pages_expected INTEGER NOT NULL DEFAULT 0,
    documents_accepted INTEGER NOT NULL DEFAULT 0,
    documents_unchanged INTEGER NOT NULL DEFAULT 0,
    documents_rejected INTEGER NOT NULL DEFAULT 0,
    documents_unassigned INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(16) NOT NULL DEFAULT 'RUNNING',
    error TEXT NULL
);
