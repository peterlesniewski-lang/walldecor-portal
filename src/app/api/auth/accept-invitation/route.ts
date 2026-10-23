import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { withTransaction } from '@/lib/db';
import { logActivity } from '@/lib/services';
import { validatePasswordStrength } from '@/lib/passwordPolicy';
import { createRateLimiter } from '@/lib/rateLimit';
import { splitFullName } from '@/lib/invitations';

// Publiczny endpoint (bez sesji): limit prób per IP, jak w forgot-password.
const ipLimiter = createRateLimiter({ max: 20, windowMs: 15 * 60 * 1000 });

function getClientIp(req: NextRequest): string {
    const forwarded = req.headers.get('x-forwarded-for');
    if (forwarded) {
        const first = forwarded.split(',')[0]?.trim();
        if (first) return first;
    }
    return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

const INVALID_LINK = 'Link zaproszenia jest nieważny lub wygasł. Poproś WallDecor o nowe zaproszenie.';

/**
 * Akceptacja zaproszenia: zaproszony ustawia imię i nazwisko, pracownię i własne hasło.
 * Konto powstaje z must_change_password = 0 (hasło nie jest tymczasowe). Token jednorazowy.
 */
export async function POST(req: NextRequest) {
    try {
        if (!ipLimiter.check(getClientIp(req))) {
            return NextResponse.json({ error: 'Zbyt wiele prób. Spróbuj ponownie później.' }, { status: 429 });
        }

        const body = await req.json().catch(() => ({}));
        const { token, name, studio_name, password, acceptTerms } = body as Record<string, unknown>;

        if (!token || typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
            return NextResponse.json({ error: INVALID_LINK }, { status: 400 });
        }
        const fullName = typeof name === 'string' ? name.replace(/\s+/g, ' ').trim() : '';
        if (fullName.length < 3) {
            return NextResponse.json({ error: 'Podaj imię i nazwisko.' }, { status: 400 });
        }
        if (fullName.length > 120) {
            return NextResponse.json({ error: 'Imię i nazwisko jest za długie.' }, { status: 400 });
        }
        const studio = typeof studio_name === 'string' ? studio_name.trim().slice(0, 120) || null : null;
        if (typeof password !== 'string' || !password) {
            return NextResponse.json({ error: 'Hasło jest wymagane.' }, { status: 400 });
        }
        const passwordError = validatePasswordStrength(password);
        if (passwordError) {
            return NextResponse.json({ error: passwordError }, { status: 400 });
        }
        if (acceptTerms !== true) {
            return NextResponse.json({ error: 'Aby założyć konto, zaakceptuj regulamin programu partnerskiego.' }, { status: 400 });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const { first_name, last_name } = splitFullName(fullName);

        let outcome: 'ok' | 'invalid' | 'exists' = 'invalid';
        let createdUserId: string | null = null;
        let invitedEmail: string | null = null;

        await withTransaction(async (queryFn) => {
            const invitations = await queryFn<{ id: string; email: string; role: string }>(
                `SELECT id, email, role
                 FROM invitations
                 WHERE token = ?
                   AND status = 'PENDING'
                   AND expires_at > NOW()
                 FOR UPDATE`,
                [token]
            );
            if (invitations.length === 0) return;

            const invitation = invitations[0];
            invitedEmail = invitation.email;

            const existing = await queryFn<{ id: string }>("SELECT id FROM users WHERE LOWER(email) = ?", [invitation.email]);
            if (existing.length > 0) {
                outcome = 'exists';
                return;
            }

            const userId = uuidv4();
            const role = invitation.role === 'STAFF' || invitation.role === 'ADMIN' ? invitation.role : 'ARCHI';
            await queryFn(
                `INSERT INTO users (
                    id, name, first_name, last_name, email, password, role, studio_name,
                    must_change_password, password_changed_at, last_login_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                [userId, fullName, first_name, last_name, invitation.email, hashedPassword, role, studio]
            );
            await queryFn(
                "UPDATE invitations SET status = 'ACCEPTED', accepted_at = NOW(), accepted_user_id = ? WHERE id = ?",
                [userId, invitation.id]
            );

            createdUserId = userId;
            outcome = 'ok';
        });

        if (outcome === 'invalid') {
            return NextResponse.json({ error: INVALID_LINK }, { status: 400 });
        }
        if (outcome === 'exists') {
            return NextResponse.json(
                { error: 'Konto z tym adresem email już istnieje. Zaloguj się albo skorzystaj z resetu hasła.' },
                { status: 409 }
            );
        }

        await logActivity(createdUserId, 'INVITATION_ACCEPTED', `${fullName} aktywował(a) konto z zaproszenia`, { email: invitedEmail })
            .catch(() => {});

        return NextResponse.json({ ok: true, email: invitedEmail });
    } catch (error) {
        console.error('accept-invitation error:', error);
        return NextResponse.json({ error: 'Wystąpił błąd serwera.' }, { status: 500 });
    }
}
