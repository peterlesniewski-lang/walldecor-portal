'use server';

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { logActivity } from "@/lib/services";
import { validatePasswordStrength } from "@/lib/passwordPolicy";
import bcrypt from 'bcrypt';

export async function changeOwnPassword(currentPassword: string, newPassword: string) {
    const session = await getServerSession(authOptions);
    if (!session) throw new Error("Unauthorized");

    if (!currentPassword) throw new Error("Podaj obecne hasło.");

    const strengthError = validatePasswordStrength(newPassword);
    if (strengthError) throw new Error(strengthError);

    if (currentPassword === newPassword) {
        throw new Error("Nowe hasło musi różnić się od obecnego.");
    }

    const users = await query<any>("SELECT id, password FROM users WHERE id = ?", [session.user.id]);
    const user = users[0];
    if (!user) throw new Error("Użytkownik nie istnieje.");
    if (!user.password) throw new Error("To konto loguje się przez Google — nie ma hasła do zmiany.");

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) throw new Error("Obecne hasło jest nieprawidłowe.");

    const hashed = await bcrypt.hash(newPassword, 10);
    await query(
        "UPDATE users SET password = ?, must_change_password = 0, password_changed_at = CURRENT_TIMESTAMP WHERE id = ?",
        [hashed, session.user.id]
    );

    await logActivity(session.user.id, 'PASSWORD_CHANGED', 'Użytkownik zmienił swoje hasło', null);

    return { success: true };
}

export async function getMustChangePassword(): Promise<boolean> {
    const session = await getServerSession(authOptions);
    if (!session) return false;
    const res = await query<any>("SELECT must_change_password FROM users WHERE id = ?", [session.user.id]);
    return Number(res[0]?.must_change_password || 0) === 1;
}
