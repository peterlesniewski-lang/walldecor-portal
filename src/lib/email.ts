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

export async function sendEmail(slug: string, to: string, placeholders: Record<string, string>) {
    try {
        // 1. Fetch template
        const templates = await query<any>(
            "SELECT * FROM email_templates WHERE slug = ? AND is_active = 1",
            [slug]
        );

        if (templates.length === 0) {
            console.warn(`Email template for slug "${slug}" not found or inactive.`);
            return;
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

        // 3. Send email
        const mailOptions = {
            from: process.env.EMAIL_FROM || '"WallDecor - Portal Architekta" <no-reply@walldecor.pl>',
            to,
            subject,
            html: content,
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
