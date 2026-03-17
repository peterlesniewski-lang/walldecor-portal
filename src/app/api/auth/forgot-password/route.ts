import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { query } from '@/lib/db';
import { sendEmail } from '@/lib/email';

export async function POST(req: NextRequest) {
    try {
        const { email } = await req.json();

        if (!email || typeof email !== 'string') {
            return NextResponse.json({ error: 'Podaj adres email.' }, { status: 400 });
        }

        const users = await query<any>(
            "SELECT id, email, provider FROM users WHERE email = ?",
            [email.toLowerCase().trim()]
        );

        // Always return success to avoid email enumeration
        if (users.length === 0) {
            return NextResponse.json({ ok: true });
        }

        const user = users[0];

        // OAuth users can't reset password via email
        if (user.provider !== 'credentials') {
            return NextResponse.json({ ok: true });
        }

        // Invalidate any existing unused tokens for this user
        await query(
            "UPDATE password_reset_tokens SET used = 1 WHERE user_id = ? AND used = 0",
            [user.id]
        );

        // Create new token valid for 1 hour
        const tokenId = uuidv4();
        const token = uuidv4();
        await query(
            `INSERT INTO password_reset_tokens (id, user_id, token, expires_at)
             VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR))`,
            [tokenId, user.id, token]
        );

        const resetLink = `${process.env.NEXTAUTH_URL}/auth/reset-password?token=${token}`;

        await sendEmail('PASSWORD_RESET', user.email, {
            reset_link: resetLink,
        });

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error('forgot-password error:', error);
        return NextResponse.json({ error: 'Wystąpił błąd serwera.' }, { status: 500 });
    }
}
