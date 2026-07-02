import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
import { withTransaction } from '@/lib/db';

export async function POST(req: NextRequest) {
    try {
        const { token, password } = await req.json();

        if (!token || typeof token !== 'string') {
            return NextResponse.json({ error: 'Nieprawidłowy link resetujący.' }, { status: 400 });
        }

        if (!password || typeof password !== 'string' || password.length < 8) {
            return NextResponse.json({ error: 'Hasło musi mieć co najmniej 8 znaków.' }, { status: 400 });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        let tokenWasConsumed = false;

        await withTransaction(async (queryFn) => {
            const tokens = await queryFn<any>(
                `SELECT t.id, t.user_id, t.expires_at
                 FROM password_reset_tokens t
                 WHERE t.token = ?
                   AND t.used = 0
                   AND t.expires_at > NOW()
                 FOR UPDATE`,
                [token]
            );

            if (tokens.length === 0) {
                return;
            }

            const resetToken = tokens[0];

            // Hasło ustawione samodzielnie przez użytkownika — nie jest tymczasowe.
            await queryFn(
                "UPDATE users SET password = ?, must_change_password = 0, password_changed_at = CURRENT_TIMESTAMP, last_login_at = CURRENT_TIMESTAMP WHERE id = ?",
                [hashedPassword, resetToken.user_id]
            );

            await queryFn(
                "UPDATE password_reset_tokens SET used = 1 WHERE id = ?",
                [resetToken.id]
            );

            tokenWasConsumed = true;
        });

        if (!tokenWasConsumed) {
            return NextResponse.json(
                { error: 'Link resetujący jest nieważny lub wygasł. Poproś o nowy.' },
                { status: 400 }
            );
        }

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error('reset-password error:', error);
        return NextResponse.json({ error: 'Wystąpił błąd serwera.' }, { status: 500 });
    }
}
