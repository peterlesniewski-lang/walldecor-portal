'use server';

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { revalidatePath } from "next/cache";
import bcrypt from 'bcrypt';

export async function updateArchitectAdminFields(
    architectId: string,
    data: { tier_override: string | null; commission_rate: number }
) {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'ADMIN') {
        throw new Error("Unauthorized");
    }

    const VALID_TIER_OVERRIDES = [null, 'SILVER', 'GOLD', 'PLATINUM'];
    if (!VALID_TIER_OVERRIDES.includes(data.tier_override)) {
        throw new Error("Nieprawidłowa wartość tier. Dozwolone: SILVER, GOLD, PLATINUM lub brak (Auto).");
    }

    if (typeof data.commission_rate !== 'number' || data.commission_rate < 0 || data.commission_rate > 100) {
        throw new Error("Stawka prowizji musi być liczbą z zakresu 0–100.");
    }

    await query(
        "UPDATE users SET tier_override = ?, commission_rate = ? WHERE id = ?",
        [data.tier_override, data.commission_rate, architectId]
    );

    revalidatePath(`/dashboard/admin/architects/${architectId}`);
    revalidatePath('/dashboard/admin');

    return { success: true };
}

export async function updateProfile(data: {
    studio_name?: string,
    nip?: string,
    address?: string,
    bank_account?: string,
}) {
    const session = await getServerSession(authOptions);
    if (!session) throw new Error("Unauthorized");

    await query(
        `UPDATE users SET 
            studio_name = ?, nip = ?, address = ?, bank_account = ?
        WHERE id = ?`,
        [
            data.studio_name || null,
            data.nip || null,
            data.address || null,
            data.bank_account || null,
            session.user.id
        ]
    );

    revalidatePath('/dashboard');
    return { success: true };
}

export async function updateArchitectData(
    architectId: string,
    data: {
        name: string;
        email: string;
        studio_name: string;
        nip: string;
        address: string;
        bank_account: string;
        is_vat_payer: boolean;
    }
) {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'ADMIN') throw new Error("Unauthorized");

    if (!data.name.trim()) throw new Error("Imię i nazwisko jest wymagane");
    if (!data.email.trim()) throw new Error("Email jest wymagany");

    const existing = await query<any>(
        "SELECT id FROM users WHERE email = ? AND id != ?",
        [data.email.trim().toLowerCase(), architectId]
    );
    if (existing.length > 0) throw new Error("Użytkownik z tym adresem email już istnieje");

    await query(
        `UPDATE users SET name = ?, email = ?, studio_name = ?, nip = ?, address = ?, bank_account = ?, is_vat_payer = ? WHERE id = ?`,
        [
            data.name.trim(),
            data.email.trim().toLowerCase(),
            data.studio_name || null,
            data.nip || null,
            data.address || null,
            data.bank_account || null,
            data.is_vat_payer ? 1 : 0,
            architectId,
        ]
    );

    revalidatePath(`/dashboard/admin/architects/${architectId}`);
    revalidatePath('/dashboard/admin');
    revalidatePath('/dashboard/admin/settings');
    return { success: true };
}

export async function deleteArchitect(architectId: string) {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'ADMIN') throw new Error("Unauthorized");

    await query("DELETE FROM users WHERE id = ? AND role = 'ARCHI'", [architectId]);

    revalidatePath('/dashboard/admin');
    revalidatePath('/dashboard/admin/settings');
    return { success: true };
}

export async function getAllArchitectNames(): Promise<{ id: string; name: string }[]> {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'STAFF')) throw new Error("Unauthorized");
    return query<any>("SELECT id, name FROM users WHERE role = 'ARCHI' ORDER BY name ASC");
}

export async function resetArchitectPassword(architectId: string, newPassword: string) {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'ADMIN') {
        throw new Error("Unauthorized");
    }

    if (newPassword.length < 6) {
        throw new Error("Hasło musi mieć co najmniej 6 znaków");
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await query(
        "UPDATE users SET password = ? WHERE id = ?",
        [hashedPassword, architectId]
    );

    revalidatePath(`/dashboard/admin/architects/${architectId}`);
    return { success: true };
}
