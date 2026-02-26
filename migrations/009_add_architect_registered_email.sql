-- Add welcome email template for new architect account registration
INSERT INTO email_templates (id, slug, name, subject, content, description) VALUES (
    'et_6',
    'ARCHITECT_REGISTERED',
    'Rejestracja konta architekta',
    'Twoje konto w Portalu WallDecor jest gotowe',
    '<p>Cześć <strong>{{user_name}}</strong>,</p><p>Zostało dla Ciebie założone konto w <strong>Portalu Architekta WallDecor</strong>. Od teraz możesz śledzić swoje projekty, prowizje i cashback online.</p><p style="background:#f8f7f5;border-radius:12px;padding:20px;margin:24px 0;"><strong>Twoje dane logowania:</strong><br><br>Login (email): <strong>{{email}}</strong><br>Hasło tymczasowe: <strong style="font-family:monospace;font-size:16px;letter-spacing:2px;">{{password}}</strong></p><p>Zaloguj się tutaj: <a href="{{portal_url}}">{{portal_url}}</a></p><p style="color:#999;font-size:12px;">Zalecamy zmianę hasła po pierwszym logowaniu.</p><p>Pozdrawiamy,<br><strong>Zespół WallDecor</strong></p>',
    'Wysyłane do nowego architekta po założeniu konta (manualne lub automatycznie przez import CSV)'
);
