import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
import { query } from '@/lib/db';

export async function POST(req: NextRequest) {
    try {
        const { token, password } = await req.json();

        if (!token || typeof token !== 'string') {
            return NextResponse.json({ error: 'Nieprawidłowy link resetujący.' }, { status: 400 });
        }

        if (!password || typeof password !== 'string' || password.length < 8) {
            return NextResponse.json({ error: 'Hasło musi mieć co najmniej 8 znaków.' }, { status: 400 });
        }

        // Find valid, unused, non-expired token
        const tokens = await query<any>(
            `SELECT t.id, t.user_id, t.expires_at
             FROM password_reset_tokens t
             WHERE t.token = ?
               AND t.used = 0
               AND t.expires_at > NOW()`,
            [token]
        );

        if (tokens.length === 0) {
            return NextResponse.json(
                { error: 'Link resetujący jest nieważny lub wygasł. Poproś o nowy.' },
                { status: 400 }
            );
        }

        const resetToken = tokens[0];
        const hashedPassword = await bcrypt.hash(password, 12);

        // Update password and mark token as used in one go
        await query(
            "UPDATE users SET password = ?, last_login_at = CURRENT_TIMESTAMP WHERE id = ?",
            [hashedPassword, resetToken.user_id]
        );

        await query(
            "UPDATE password_reset_tokens SET used = 1 WHERE id = ?",
            [resetToken.id]
        );

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error('reset-password error:', error);
        return NextResponse.json({ error: 'Wystąpił błąd serwera.' }, { status: 500 });
    }
}
