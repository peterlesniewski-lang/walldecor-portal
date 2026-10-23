import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { Banner } from "@/components/ui";
import { canRegisterArchitects } from "@/lib/rbac";
import InvitationsClient, { type InvitationListItem } from "./InvitationsClient";

export const metadata = {
    title: 'Zaproszenia | WallDecor Admin',
};

export const dynamic = 'force-dynamic';

/** MySQL (mysql2) zwraca DATETIME jako Date, SQLite jako string. */
type DbDate = string | Date | null | undefined;

interface InvitationRow {
    id: string;
    email: string;
    name: string | null;
    studio_name: string | null;
    status: string;
    sent_at: DbDate;
    send_count: number | string;
    last_error: string | null;
    expires_at: DbDate;
    accepted_at: DbDate;
    created_at: DbDate;
    is_expired: number | string;
    invited_by_name: string | null;
}

/**
 * Zaproszenia do portalu: lista + panel masowego dodawania. Dostęp: ADMIN i STAFF (jak rejestracja architekta).
 * Token zaproszenia nie trafia do klienta; link pobierany na żądanie przez getInvitationLink.
 */
export default async function InvitationsPage() {
    const session = await getServerSession(authOptions);
    if (!session || !canRegisterArchitects(session.user.role)) {
        return <Banner tone="danger" title="Brak uprawnień">Ta strona jest dostępna tylko dla administratora i zespołu.</Banner>;
    }

    const rows = await query<InvitationRow>(`
        SELECT i.id, i.email, i.name, i.studio_name, i.status, i.sent_at, i.send_count, i.last_error,
               i.expires_at, i.accepted_at, i.created_at,
               CASE WHEN i.expires_at <= NOW() THEN 1 ELSE 0 END as is_expired,
               u.name as invited_by_name
        FROM invitations i
        LEFT JOIN users u ON u.id = i.invited_by
        ORDER BY i.created_at DESC
    `);

    const toIso = (v: DbDate): string | null => {
        if (!v) return null;
        if (v instanceof Date) return v.toISOString();
        return String(v);
    };

    const invitations: InvitationListItem[] = rows.map((r) => ({
        id: r.id,
        email: r.email,
        name: r.name ?? null,
        studio_name: r.studio_name ?? null,
        status: r.status,
        sent_at: toIso(r.sent_at),
        send_count: Number(r.send_count) || 0,
        last_error: r.last_error ?? null,
        expires_at: toIso(r.expires_at),
        accepted_at: toIso(r.accepted_at),
        created_at: toIso(r.created_at),
        is_expired: Number(r.is_expired) === 1,
        invited_by_name: r.invited_by_name ?? null,
    }));

    return <InvitationsClient invitations={invitations} />;
}
