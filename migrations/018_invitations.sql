-- 018: Zaproszenia do portalu (moduł masowego dodawania architektów).
--      Admin/staff wkleja listę emaili, system wysyła link aktywacyjny; zaproszony sam ustawia
--      imię, pracownię i hasło (bez hasła tymczasowego, bez must_change_password).
--      Status: PENDING (niewysłane/wysłane/wygasłe wg sent_at i expires_at) | ACCEPTED | REVOKED.

CREATE TABLE IF NOT EXISTS invitations (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255) NULL,
    studio_name VARCHAR(255) NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'ARCHI',
    token VARCHAR(64) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    invited_by VARCHAR(36) NULL,
    expires_at DATETIME NOT NULL,
    sent_at DATETIME NULL,
    send_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT NULL,
    accepted_at DATETIME NULL,
    accepted_user_id VARCHAR(36) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_status ON invitations(status);

INSERT INTO email_templates (id, slug, name, subject, content, description) VALUES (
    'et_8',
    'ARCHITECT_INVITED',
    'Zaproszenie do portalu',
    'Zaproszenie do Panelu Architekta WallDecor',
    '<p>Dzień dobry,</p><p>zapraszamy Cię do <strong>Panelu Architekta WallDecor</strong> — miejsca, w którym w jednym widoku zobaczysz projekty realizowane wspólnie z nami, zamówienia i rozliczenia prowizyjne.</p><p>Po aktywacji konta możesz:</p><ul><li>sprawdzać status aktualnych projektów i zamówień,</li><li>śledzić etap realizacji poszczególnych zgłoszeń,</li><li>kontrolować aktualną wartość prowizji dostępnej do wypłaty,</li><li>sprawdzać historię rozliczeń,</li><li>korzystać z dostępnych środków cashback,</li><li>dodawać faktury PDF potrzebne do wypłaty prowizji,</li><li>sprawdzać swój aktualny poziom prowizyjny.</li></ul><p style="background:#f8f7f5;border-radius:12px;padding:20px;margin:24px 0;"><strong>Aktywacja konta:</strong><br><br><a href="{{invite_link}}" style="display:inline-block;background:#1a1917;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:600;">Aktywuj konto i ustaw hasło</a><br><br>Login: <strong>{{email}}</strong><br>Link jest ważny do <strong>{{expires_at}}</strong>.</p><p style="color:#666;font-size:13px;">Jeśli przycisk nie działa, skopiuj ten adres do przeglądarki:<br>{{invite_link}}</p><p>Jeśli nie spodziewasz się tej wiadomości, po prostu ją zignoruj — konto nie zostanie utworzone.</p><p>W razie pytań pozostajemy do dyspozycji.</p><p>Pozdrawiamy serdecznie,<br><strong>Zespół WallDecor</strong></p>',
    'Wysyłane do zaproszonego architekta: link aktywacyjny do założenia konta (moduł Zaproszenia)'
);
