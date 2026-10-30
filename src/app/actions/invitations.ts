'use server';

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query, withTransaction } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { v4 as uuidv4 } from "uuid";
import { sendEmail } from "@/lib/email";
import { INTERNAL_MODE_INVITATION_NOTE, isSkippedByInternalMode } from "@/lib/internalMode";
import { logActivity } from "@/lib/services";
import { canRegisterArchitects } from "@/lib/rbac";
import { buildArchitectInvitedPlaceholders } from "@/lib/emailPlaceholders";
import {
    INVITATION_SEND_BATCH,
    INVITATION_TTL_DAYS,
    buildInvitationLink,
    chunk,
    generateInvitationToken,
    isValidEmail,
    normalizeEmail,
} from "@/lib/invitations";

const INVITATIONS_PATH = '/dashboard/admin/invitations';

async function requireInviter() {
    const session = await getServerSession(authOptions);
    if (!session || !canRegisterArchitects(session.user.role)) {
        throw new Error("Brak uprawnień. Zaproszenia może wysyłać administrator lub zespół.");
    }
    return session;
}

function portalUrl(): string {
    return process.env.NEXTAUTH_URL || 'http://localhost:3000';
}

function placeholders(n: number): string {
    return Array.from({ length: n }, () => '?').join(', ');
}

interface SendableInvitation {
    id: string;
    email: string;
    name: string | null;
    token: string;
    status: string;
    is_expired: number;
}

function errorMessage(error: unknown, fallback: string): string {
    if (typeof error === 'string' && error) return error;
    if (error && typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string') {
        return (error as { message: string }).message;
    }
    return fallback;
}

/** Data ważności do maila: liczona w JS tylko do wyświetlenia (dd.MM.rrrr), porównania są w SQL. */
function expiresAtLabel(): string {
    const d = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
    return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ─── Sprawdzenie listy przed utworzeniem ─────────────────────────────────────

export interface InvitationEmailCheck {
    /** Emaile, które mają już konto w systemie. */
    existingUsers: string[];
    /** Emaile z aktywnym (niewygasłym) zaproszeniem PENDING. */
    pendingInvites: string[];
}

export async function checkInvitationEmails(emails: string[]): Promise<InvitationEmailCheck> {
    await requireInviter();
    const normalized = Array.from(new Set((emails || []).map(normalizeEmail).filter(isValidEmail)));
    const existingUsers = new Set<string>();
    const pendingInvites = new Set<string>();

    for (const part of chunk(normalized, 200)) {
        const users = await query<{ email: string }>(
            `SELECT LOWER(email) as email FROM users WHERE LOWER(email) IN (${placeholders(part.length)})`,
            part
        );
        users.forEach(u => existingUsers.add(u.email));

        const invites = await query<{ email: string }>(
            `SELECT email FROM invitations
             WHERE status = 'PENDING' AND expires_at > NOW() AND email IN (${placeholders(part.length)})`,
            part
        );
        invites.forEach(i => pendingInvites.add(i.email));
    }

    return { existingUsers: Array.from(existingUsers), pendingInvites: Array.from(pendingInvites) };
}

// ─── Tworzenie zaproszeń ─────────────────────────────────────────────────────

export interface InvitationRowInput {
    email: string;
    name?: string | null;
    studio_name?: string | null;
}

export type CreateInvitationRowStatus = 'created' | 'renewed' | 'exists' | 'invited' | 'invalid';

export interface CreateInvitationsResult {
    created: number;
    renewed: number;
    skippedExisting: number;
    skippedInvited: number;
    invalid: number;
    /** Id zaproszeń gotowych do wysyłki (nowe + odnowione). */
    ids: string[];
    rows: { email: string; status: CreateInvitationRowStatus; message?: string; id?: string }[];
}

/**
 * Tworzy zaproszenia (bez wysyłki maila). Email z kontem → pominięty; aktywne zaproszenie → pominięte;
 * wygasłe zaproszenie PENDING → odnowione (nowy token, nowa ważność, do ponownej wysyłki).
 * Wysyłka osobno przez sendInvitations, partiami, żeby kilkaset maili nie blokowało jednego żądania.
 */
export async function createInvitations(rows: InvitationRowInput[]): Promise<CreateInvitationsResult> {
    const session = await requireInviter();
    if (!rows || rows.length === 0) throw new Error("Lista zaproszeń jest pusta.");
    if (rows.length > 1000) throw new Error("Maksymalnie 1000 zaproszeń na raz. Podziel listę.");

    const result: CreateInvitationsResult = {
        created: 0, renewed: 0, skippedExisting: 0, skippedInvited: 0, invalid: 0, ids: [], rows: [],
    };

    // 1. Walidacja + deduplikacja w obrębie listy
    const seen = new Set<string>();
    const valid: { email: string; name: string | null; studio_name: string | null }[] = [];
    for (const row of rows) {
        const email = normalizeEmail(row.email || '');
        if (!isValidEmail(email)) {
            result.invalid++;
            result.rows.push({ email: row.email || '', status: 'invalid', message: 'Nieprawidłowy adres email' });
            continue;
        }
        if (seen.has(email)) {
            result.invalid++;
            result.rows.push({ email, status: 'invalid', message: 'Duplikat w liście' });
            continue;
        }
        seen.add(email);
        valid.push({
            email,
            name: (row.name || '').trim().slice(0, 120) || null,
            studio_name: (row.studio_name || '').trim().slice(0, 120) || null,
        });
    }

    // 2. Istniejące konta i zaproszenia
    const check = await checkInvitationEmails(valid.map(v => v.email));
    const existingUsers = new Set(check.existingUsers);
    const pendingInvites = new Set(check.pendingInvites);

    const expiredPending = new Map<string, string>(); // email -> invitation id
    for (const part of chunk(valid.map(v => v.email), 200)) {
        const rowsExpired = await query<{ id: string; email: string }>(
            `SELECT id, email FROM invitations
             WHERE status = 'PENDING' AND expires_at <= NOW() AND email IN (${placeholders(part.length)})`,
            part
        );
        rowsExpired.forEach(r => expiredPending.set(r.email, r.id));
    }

    // 3. Zapis (jedna transakcja: albo wszystkie, albo nic)
    await withTransaction(async (q) => {
        for (const v of valid) {
            if (existingUsers.has(v.email)) {
                result.skippedExisting++;
                result.rows.push({ email: v.email, status: 'exists', message: 'Konto z tym adresem już istnieje' });
                continue;
            }
            if (pendingInvites.has(v.email)) {
                result.skippedInvited++;
                result.rows.push({ email: v.email, status: 'invited', message: 'Aktywne zaproszenie już czeka na odpowiedź' });
                continue;
            }

            const token = generateInvitationToken();
            const expiredId = expiredPending.get(v.email);
            if (expiredId) {
                await q(
                    `UPDATE invitations
                     SET token = ?, name = COALESCE(?, name), studio_name = COALESCE(?, studio_name),
                         invited_by = ?, expires_at = DATE_ADD(NOW(), INTERVAL ${INVITATION_TTL_DAYS} DAY),
                         sent_at = NULL, last_error = NULL
                     WHERE id = ?`,
                    [token, v.name, v.studio_name, session.user.id, expiredId]
                );
                result.renewed++;
                result.ids.push(expiredId);
                result.rows.push({ email: v.email, status: 'renewed', id: expiredId });
                continue;
            }

            const id = uuidv4();
            await q(
                `INSERT INTO invitations (id, email, name, studio_name, role, token, status, invited_by, expires_at)
                 VALUES (?, ?, ?, ?, 'ARCHI', ?, 'PENDING', ?, DATE_ADD(NOW(), INTERVAL ${INVITATION_TTL_DAYS} DAY))`,
                [id, v.email, v.name, v.studio_name, token, session.user.id]
            );
            result.created++;
            result.ids.push(id);
            result.rows.push({ email: v.email, status: 'created', id });
        }
    });

    if (result.created + result.renewed > 0) {
        await logActivity(
            session.user.id,
            'INVITATIONS_CREATED',
            `Utworzono ${result.created + result.renewed} zaproszeń do portalu`,
            { created: result.created, renewed: result.renewed, skippedExisting: result.skippedExisting, skippedInvited: result.skippedInvited }
        );
    }

    revalidatePath(INVITATIONS_PATH);
    return result;
}

// ─── Wysyłka (partiami) ─────────────────────────────────────────────────────

export interface SendInvitationsResult {
    sent: number;
    failed: number;
    /** Pominięte: zaakceptowane / anulowane / nieznane id. */
    skipped: number;
    /** Niewysłane celowo w trybie wewnętrznym (PORTAL_INTERNAL_MODE) — nie są błędem wysyłki. */
    skippedInternalMode: number;
    rows: { id: string; email: string; ok: boolean; error?: string; skippedInternalMode?: boolean }[];
}

/**
 * Wysyła maile z zaproszeniem dla podanych id (maks. INVITATION_SEND_BATCH na wywołanie).
 * Wygasłe zaproszenie dostaje nowy token i nową ważność; ważne zachowuje token, a ważność
 * jest przedłużana (link z poprzedniego maila nadal działa, np. gdy pierwszy trafił do spamu).
 */
export async function sendInvitations(ids: string[]): Promise<SendInvitationsResult> {
    const session = await requireInviter();
    const result: SendInvitationsResult = { sent: 0, failed: 0, skipped: 0, skippedInternalMode: 0, rows: [] };
    const batch = Array.from(new Set((ids || []).filter(Boolean))).slice(0, INVITATION_SEND_BATCH);
    if (batch.length === 0) return result;

    const invitations = await query<SendableInvitation>(
        `SELECT id, email, name, token, status,
                CASE WHEN expires_at <= NOW() THEN 1 ELSE 0 END as is_expired
         FROM invitations WHERE id IN (${placeholders(batch.length)})`,
        batch
    );
    const byId = new Map<string, SendableInvitation>(invitations.map((i) => [i.id, i]));
    const base = portalUrl();

    for (const id of batch) {
        const inv = byId.get(id);
        if (!inv || inv.status !== 'PENDING') {
            result.skipped++;
            continue;
        }

        let token: string = inv.token;
        if (Number(inv.is_expired) === 1) {
            token = generateInvitationToken();
            await query(
                `UPDATE invitations SET token = ?, expires_at = DATE_ADD(NOW(), INTERVAL ${INVITATION_TTL_DAYS} DAY) WHERE id = ?`,
                [token, id]
            );
        } else {
            await query(
                `UPDATE invitations SET expires_at = DATE_ADD(NOW(), INTERVAL ${INVITATION_TTL_DAYS} DAY) WHERE id = ?`,
                [id]
            );
        }

        const emailResult = await sendEmail('ARCHITECT_INVITED', inv.email, buildArchitectInvitedPlaceholders({
            userName: inv.name,
            email: inv.email,
            inviteLink: buildInvitationLink(base, token),
            expiresAt: expiresAtLabel(),
            portalUrl: base,
        }));

        if (emailResult.success) {
            await query(
                "UPDATE invitations SET sent_at = NOW(), send_count = send_count + 1, last_error = NULL WHERE id = ?",
                [id]
            );
            result.sent++;
            result.rows.push({ id, email: inv.email, ok: true });
        } else if (isSkippedByInternalMode(emailResult)) {
            // Tryb wewnętrzny: zaproszenie czeka na otwarcie portalu; osobny stan, nie błąd wysyłki.
            await query("UPDATE invitations SET last_error = ? WHERE id = ?", [INTERNAL_MODE_INVITATION_NOTE, id]);
            result.skippedInternalMode++;
            result.rows.push({ id, email: inv.email, ok: false, skippedInternalMode: true, error: INTERNAL_MODE_INVITATION_NOTE });
        } else {
            const message = errorMessage(emailResult.error, 'Wysyłka nie powiodła się');
            await query("UPDATE invitations SET last_error = ? WHERE id = ?", [String(message).slice(0, 500), id]);
            result.failed++;
            result.rows.push({ id, email: inv.email, ok: false, error: String(message) });
        }
    }

    if (result.sent > 0) {
        await logActivity(session.user.id, 'INVITATIONS_SENT', `Wysłano ${result.sent} zaproszeń do portalu`, { sent: result.sent, failed: result.failed });
    }

    revalidatePath(INVITATIONS_PATH);
    return result;
}

export async function resendInvitation(id: string): Promise<SendInvitationsResult> {
    return sendInvitations([id]);
}

// ─── Pozostałe akcje ────────────────────────────────────────────────────────

export async function revokeInvitation(id: string) {
    const session = await requireInviter();
    const rows = await query<{ id: string; email: string; status: string }>("SELECT id, email, status FROM invitations WHERE id = ?", [id]);
    if (rows.length === 0) throw new Error("Zaproszenie nie istnieje.");
    if (rows[0].status !== 'PENDING') throw new Error("Można anulować tylko zaproszenie, które czeka na odpowiedź.");

    await query("UPDATE invitations SET status = 'REVOKED' WHERE id = ? AND status = 'PENDING'", [id]);
    await logActivity(session.user.id, 'INVITATION_REVOKED', `Anulowano zaproszenie dla ${rows[0].email}`, { invitationId: id });
    revalidatePath(INVITATIONS_PATH);
    return { success: true };
}

/** Link aktywacyjny do ręcznego przekazania (np. gdy mail nie dochodzi). Tylko dla ważnych zaproszeń PENDING. */
export async function getInvitationLink(id: string): Promise<{ link: string; email: string }> {
    await requireInviter();
    const rows = await query<{ email: string; token: string; status: string; is_expired: number }>(
        `SELECT email, token, status, CASE WHEN expires_at <= NOW() THEN 1 ELSE 0 END as is_expired
         FROM invitations WHERE id = ?`,
        [id]
    );
    if (rows.length === 0) throw new Error("Zaproszenie nie istnieje.");
    const inv = rows[0];
    if (inv.status !== 'PENDING') throw new Error("To zaproszenie nie jest już aktywne.");
    if (Number(inv.is_expired) === 1) throw new Error("Zaproszenie wygasło. Wyślij je ponownie, aby wygenerować nowy link.");
    return { link: buildInvitationLink(portalUrl(), inv.token), email: inv.email };
}
