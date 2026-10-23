import Link from 'next/link';
import { MailX, ArrowLeft } from 'lucide-react';
import { query } from '@/lib/db';
import { Button } from '@/components/ui';
import { AuthShell } from '../AuthShell';
import AcceptInvitationForm from './AcceptInvitationForm';

export const metadata = {
    title: 'Aktywacja konta | WallDecor',
};

export const dynamic = 'force-dynamic';

type InvitationRow = {
    id: string;
    email: string;
    name: string | null;
    studio_name: string | null;
    status: string;
    is_expired: number;
};

function Unavailable({ title, description }: { title: string; description: string }) {
    return (
        <div className="space-y-5 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-danger-soft text-danger">
                <MailX size={22} aria-hidden="true" />
            </div>
            <div>
                <p className="font-display text-xl text-ink">{title}</p>
                <p className="mt-2 text-sm leading-relaxed text-ink-2">{description}</p>
            </div>
            <Button href="/auth/signin" variant="secondary" fullWidth icon={<ArrowLeft size={14} aria-hidden="true" />}>
                Przejdź do logowania
            </Button>
        </div>
    );
}

/**
 * Publiczna strona aktywacji konta z zaproszenia (/auth/invite?token=...).
 * Token sprawdzany server-side; formularz dostaje tylko dane do wstępnego wypełnienia.
 */
export default async function InvitePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
    const { token } = await searchParams;
    const validToken = typeof token === 'string' && /^[a-f0-9]{64}$/.test(token);

    let invitation: InvitationRow | null = null;
    if (validToken) {
        const rows = await query<InvitationRow>(
            `SELECT id, email, name, studio_name, status,
                    CASE WHEN expires_at <= NOW() THEN 1 ELSE 0 END as is_expired
             FROM invitations WHERE token = ?`,
            [token]
        );
        invitation = rows[0] ?? null;
    }

    let body: React.ReactNode;
    if (!invitation) {
        body = (
            <Unavailable
                title="Link jest nieprawidłowy"
                description="Ten link aktywacyjny nie istnieje. Sprawdź, czy został skopiowany w całości, albo poproś WallDecor o nowe zaproszenie."
            />
        );
    } else if (invitation.status === 'ACCEPTED') {
        body = (
            <Unavailable
                title="Konto jest już aktywne"
                description={`Zaproszenie dla ${invitation.email} zostało już wykorzystane. Zaloguj się swoim hasłem albo skorzystaj z resetu hasła.`}
            />
        );
    } else if (invitation.status === 'REVOKED') {
        body = (
            <Unavailable
                title="Zaproszenie zostało anulowane"
                description="To zaproszenie nie jest już aktywne. Jeśli to pomyłka, skontaktuj się z zespołem WallDecor."
            />
        );
    } else if (Number(invitation.is_expired) === 1) {
        body = (
            <Unavailable
                title="Zaproszenie wygasło"
                description="Link aktywacyjny był ważny 14 dni. Poproś WallDecor o ponowne wysłanie zaproszenia."
            />
        );
    } else {
        body = (
            <AcceptInvitationForm
                token={token!}
                email={invitation.email}
                initialName={invitation.name ?? ''}
                initialStudio={invitation.studio_name ?? ''}
            />
        );
    }

    return (
        <AuthShell title="Aktywacja konta" subtitle="Portal Partnera WallDecor">
            {body}
            {invitation && invitation.status === 'PENDING' && Number(invitation.is_expired) === 0 && (
                <p className="mt-6 text-center text-[13px] text-ink-2">
                    Masz już konto?{' '}
                    <Link href="/auth/signin" className="font-semibold text-brass-ink hover:underline">Zaloguj się</Link>
                </p>
            )}
        </AuthShell>
    );
}
