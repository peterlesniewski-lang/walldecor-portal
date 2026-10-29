-- 019: Integracja Subiekt GT. Dokumenty z Subiekta oznaczone architektem trafiają do tabel
--      pośrednich, są mapowane na projekty i pozycje (source = 'SUBIEKT'), a zmiany ZK zapisują
--      się jako snapshoty. Zob. PLAN-SUBIEKT-2026-10-29.md.
--
--      Loop 0: tylko pochodzenie pozycji projektu (rdzeń src/lib/projectItems.ts zapisuje te kolumny).
--      source              : MANUAL (panel admina) | SUBIEKT (synchronizacja)
--      subiekt_document_id : id dokumentu w subiekt_documents (tabela dochodzi w Loop 1)
--      subiekt_position_id : id pozycji dokumentu w Subiekcie
--      Pozostała część migracji 019 (tabele subiekt_*, users.subiekt_code, indeksy) — Loop 1.

ALTER TABLE project_items ADD COLUMN source VARCHAR(16) NOT NULL DEFAULT 'MANUAL';
ALTER TABLE project_items ADD COLUMN subiekt_document_id VARCHAR(36) NULL;
ALTER TABLE project_items ADD COLUMN subiekt_position_id INTEGER NULL;
