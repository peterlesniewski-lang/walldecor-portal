INSERT OR IGNORE INTO email_templates (id, slug, name, subject, content, description) VALUES (
    'et_6',
    'PROFILE_INCOMPLETE',
    'Prośba o uzupełnienie profilu',
    'Uzupełnij swój profil w Portalu Architekta WallDecor',
    '<p>Cześć {{user_name}},</p><p>Zauważyliśmy, że Twój profil w <strong>Portalu Architekta WallDecor</strong> nie jest w pełni uzupełniony — brakuje m.in. numeru konta bankowego lub danych do faktury.</p><p>Bez tych informacji nie będziemy mogli zrealizować Twojej wypłaty prowizji.</p><p>Zaloguj się do panelu i uzupełnij swoje dane w sekcji <strong>Ustawienia → Profil</strong>.</p><p>Pozdrawiamy,<br>Zespół WallDecor</p>',
    'Wysyłane do architekta gdy brak danych bankowych przy próbie realizacji wypłaty'
);
