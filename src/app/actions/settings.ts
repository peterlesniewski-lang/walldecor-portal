'use server';

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { revalidatePath } from "next/cache";
import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";

function requireAdmin(session: any) {
    if (!session || session.user.role !== 'ADMIN') {
        throw new Error("Brak uprawnień. Wymagana rola ADMIN.");
    }
}

export async function createUser(data: {
    name: string;
    email: string;
    password: string;
    role: 'STAFF' | 'ADMIN';
}) {
    const session = await getServerSession(authOptions);
    requireAdmin(session);

    if (!data.name.trim()) throw new Error("Imię jest wymagane.");
    if (!data.email.trim() || !data.email.includes('@')) throw new Error("Podaj poprawny adres email.");
    if (data.password.length < 8) throw new Error("Hasło musi mieć co najmniej 8 znaków.");
    if (!['STAFF', 'ADMIN'].includes(data.role)) throw new Error("Nieprawidłowa rola.");

    const existing = await query<any>("SELECT id FROM users WHERE email = ?", [data.email.toLowerCase().trim()]);
    if (existing.length > 0) throw new Error("Użytkownik z tym adresem email już istnieje.");

    const hashed = await bcrypt.hash(data.password, 10);
    const userId = `u_${uuidv4().substring(0, 8)}`;

    await query(
        "INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)",
        [userId, data.name.trim(), data.email.toLowerCase().trim(), hashed, data.role]
    );

    revalidatePath('/dashboard/admin/settings');
    return { success: true };
}

export async function resetUserPassword(userId: string, newPassword: string) {
    const session = await getServerSession(authOptions);
    requireAdmin(session);

    if (newPassword.length < 8) throw new Error("Hasło musi mieć co najmniej 8 znaków.");

    const userRes = await query<any>("SELECT id FROM users WHERE id = ?", [userId]);
    if (userRes.length === 0) throw new Error("Użytkownik nie istnieje.");

    const hashed = await bcrypt.hash(newPassword, 10);
    await query("UPDATE users SET password = ? WHERE id = ?", [hashed, userId]);

    revalidatePath('/dashboard/admin/settings');
    return { success: true };
}

export async function updateUserRole(userId: string, role: 'STAFF' | 'ADMIN') {
    const session = await getServerSession(authOptions);
    requireAdmin(session);

    if (!['STAFF', 'ADMIN'].includes(role)) throw new Error("Nieprawidłowa rola.");

    // Prevent demoting yourself
    if (userId === (session as any).user.id) throw new Error("Nie możesz zmienić własnej roli.");

    await query("UPDATE users SET role = ? WHERE id = ? AND role IN ('STAFF', 'ADMIN')", [role, userId]);

    revalidatePath('/dashboard/admin/settings');
    return { success: true };
}
