import nodemailer from 'nodemailer';
import { query } from './db';

const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT) || 587,
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

// Obrazki wklejone do edytora szablonów jako data-URI (np. zrzuty ekranu typu "Prtnsc")
// są przez klientów pocztowych pokazywane jako załączniki — usuwamy je z treści maila.
function stripEmbeddedImages(html: string): string {
    return html.replace(/<img[^>]*src=["']data:[^>]*>/gi, '');
}

// Plain-text fallback dla klientów bez HTML.
function htmlToPlainText(html: string): string {
    return html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|li|ul|ol|h[1-6])>/gi, '\n')
        .replace(/<li[^>]*>/gi, '- ')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

export async function sendEmail(slug: string, to: string, placeholders: Record<string, string>) {
    try {
        // 1. Fetch template
        const templates = await query<any>(
            "SELECT * FROM email_templates WHERE slug = ? AND is_active = 1",
            [slug]
        );

        if (templates.length === 0) {
            console.warn(`Email template for slug "${slug}" not found or inactive.`);
            return { success: false, error: `Email template for slug "${slug}" not found or inactive.` };
        }

        const template = templates[0];
        let subject = template.subject;
        let content = template.content;

        // 2. Replace placeholders
        Object.keys(placeholders).forEach(key => {
            const regex = new RegExp(`{{${key}}}`, 'g');
            subject = subject.replace(regex, placeholders[key] || '');
            content = content.replace(regex, placeholders[key] || '');
        });

        content = stripEmbeddedImages(content);

        // 3. Send email
        const mailOptions = {
            from: process.env.EMAIL_FROM || '"WallDecor - Portal Architekta" <no-reply@walldecor.pl>',
            to,
            subject,
            html: content,
            text: htmlToPlainText(content),
        };

        if (process.env.NODE_ENV === 'development' && !process.env.EMAIL_HOST) {
            console.log('--- Development Email Log ---');
            console.log('To:', to);
            console.log('Subject:', subject);
            console.log('Body:', content);
            console.log('------------------------------');
            return { success: true, logged: true };
        }

        const info = await transporter.sendMail(mailOptions);
        console.log('Email sent:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('Failed to send email:', error);
        return { success: false, error };
    }
}
