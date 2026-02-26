CREATE TABLE IF NOT EXISTS email_templates (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    subject TEXT NOT NULL,
    content TEXT NOT NULL,
    description TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Seed default templates
INSERT INTO email_templates (id, slug, name, subject, content, description) VALUES 
('et_1', 'PROJECT_ADDED_USER', 'Potwierdzenie zgłoszenia projektu', 'Zgłoszenie projektu: {{project_name}}', '<p>Cześć {{user_name}},</p><p>Dziękujemy za zgłoszenie nowego projektu: <strong>{{project_name}}</strong> (Klient: {{client_label}}). Nasz zespół wkrótce go zweryfikuje.</p><p>Pozdrawiamy,<br>Zespół WallDecor</p>', 'Wysyłane do architekta po dodaniu nowego projektu'),
('et_2', 'PROJECT_ADDED_ADMIN', 'Nowy projekt do weryfikacji', 'Nowy projekt: {{project_name}}', '<p>Architekt {{user_name}} dodał nowy projekt: <strong>{{project_name}}</strong>.</p><p>Zaloguj się do panelu, aby go zweryfikować.</p>', 'Wysyłane do administratora po dodaniu projektu przez architekta'),
('et_3', 'PROJECT_ACCEPTED', 'Projekt został zaakceptowany', 'Twój projekt {{project_name}} został zaakceptowany!', '<p>Cześć {{user_name}},</p><p>Mamy dobrą wiadomość! Twój projekt <strong>{{project_name}}</strong> został zaakceptowany przez administratora.</p><p>Pozdrawiamy,<br>Zespół WallDecor</p>', 'Wysyłane do architekta po akceptacji projektu'),
('et_4', 'PAYOUT_REDEEMED_CARD', 'Twoja karta rabatowa jest gotowa', 'Karta rabatowa dla projektu {{project_name}}', '<p>Cześć {{user_name}},</p><p>Twoje środki z projektu {{project_name}} zostały wymienione na kartę rabatową.</p><p>Kod karty: <strong>{{card_code}}</strong></p><p>Pozdrawiamy,<br>Zespół WallDecor</p>', 'Wysyłane do architekta po wygenerowaniu karty rabatowej'),
('et_5', 'PAYOUT_PROCESSED', 'Wypłata została zrealizowana', 'Wypłata środków: {{amount}} PLN', '<p>Cześć {{user_name}},</p><p>Twoja prośba o wypłatę {{amount}} PLN została przetworzona i zrealizowana.</p><p>Pozdrawiamy,<br>Zespół WallDecor</p>', 'Wysyłane do architekta po zatwierdzeniu wypłaty prowizji');
