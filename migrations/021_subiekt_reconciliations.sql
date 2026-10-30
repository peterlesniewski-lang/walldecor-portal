-- 021: Uzgodnienie faktur z zamówieniem (PLAN-SUBIEKT-2026-10-29.md, Loop 5b).
--      Jeden wiersz na łańcuch dokumentów (korzeń ZK, root_external_id) w projekcie. Powstaje, gdy suma faktur
--      (FS + KFS) łańcucha różni się od ZK, a faktury nie odzwierciedlają pozycji ZK.
--      status        : OPEN (czeka na admina, blokuje ZAKOŃCZONY) | RESOLVED (admin wpisał kwoty) | AUTO_CLOSED
--                      (łańcuch znów zgodny — mirror albo równe sumy — lub bez faktur)
--      fingerprint   : posortowane external_id:net_total wszystkich FS i KFS łańcucha (reconcile.ts → fingerprint);
--                      zmiana przy RESOLVED przywraca OPEN
--      amounts_json  : decyzja admina, JSON { "<subiekt_position_id pozycji ZK>": amount_net }
--      resolved_by   : users.id admina

CREATE TABLE IF NOT EXISTS subiekt_reconciliations (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    project_id VARCHAR(36) NOT NULL,
    root_external_id INTEGER NOT NULL,
    status VARCHAR(16) NOT NULL,
    zk_net DECIMAL(12,2) NOT NULL,
    invoiced_net DECIMAL(12,2) NOT NULL,
    fingerprint VARCHAR(2000) NOT NULL,
    amounts_json MEDIUMTEXT NULL,
    note VARCHAR(500) NULL,
    opened_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME NULL,
    resolved_by VARCHAR(36) NULL,
    UNIQUE (project_id, root_external_id)
);
CREATE INDEX IF NOT EXISTS idx_subiekt_reconciliations_status ON subiekt_reconciliations(status);
