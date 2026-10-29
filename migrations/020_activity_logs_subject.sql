-- 020: Obiekt, którego dotyczy wpis w logu aktywności (activity_logs.subject_id).
--      Integracja Subiekt zapisuje tu id dokumentu (subiekt_documents.id) dla SUBIEKT_ZK_CHANGED,
--      SUBIEKT_PROJECT_CREATED i SUBIEKT_OWNER_MISMATCH. Historia zmian zamówienia na stronie projektu
--      jest wybierana po dokumentach projektu (subject_id IN …), a nie po projectId w metadata — dzięki
--      temu zmiana zapisana, gdy dokument był jeszcze nieprzypisany, pokazuje się po przypisaniu.
--      Stare wpisy mają NULL. Zob. PLAN-SUBIEKT-2026-10-29.md, Loop 3.

ALTER TABLE activity_logs ADD COLUMN subject_id VARCHAR(36) NULL;
CREATE INDEX IF NOT EXISTS idx_activity_logs_event_subject ON activity_logs(event_type, subject_id);
