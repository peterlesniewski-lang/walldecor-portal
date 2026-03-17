-- Migration 014: Add PASSWORD_RESET email template
INSERT INTO email_templates (id, slug, name, subject, content, description) VALUES (
    'et_7',
    'PASSWORD_RESET',
    'Reset hasła',
    'Reset hasła — Portal Architekta WallDecor',
    '<p>Cześć,</p><p>Otrzymaliśmy prośbę o reset hasła do Twojego konta w <strong>Portalu Architekta WallDecor</strong>.</p><p style="background:#f8f7f5;border-radius:12px;padding:20px;margin:24px 0;text-align:center;"><a href="{{reset_link}}" style="display:inline-block;background:linear-gradient(135deg,#D4AF37,#FFD700);color:#000;font-weight:900;padding:14px 32px;border-radius:999px;text-decoration:none;font-size:14px;letter-spacing:0.1em;text-transform:uppercase;">Resetuj hasło</a></p><p style="font-size:13px;color:#666;">Link jest ważny przez <strong>1 godzinę</strong>. Jeśli nie prosiłeś o reset hasła, zignoruj tę wiadomość.</p><p>Pozdrawiamy,<br><strong>Zespół WallDecor</strong></p>',
    'Wysyłane do użytkownika po kliknięciu "Zapomniałem hasła" na stronie logowania'
);
