-- 016: Nowy program partnerski (Partner 10% / Partner Plus 12% / Partner Premium 15%)
--      + wymuszenie zmiany hasła po pierwszym logowaniu.

-- Stawka użyta do naliczenia prowizji (ułamek, np. 0.10) — zapisywana na rekordzie,
-- żeby historyczne prowizje nie zmieniały się po awansie/zmianie statusu architekta.
ALTER TABLE commissions ADD COLUMN rate REAL NULL;

-- Konta z hasłem tymczasowym muszą je zmienić przy pierwszym logowaniu.
ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN password_changed_at DATETIME NULL;
