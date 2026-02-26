'use server';

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { revalidatePath } from "next/cache";
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { sendEmail } from '@/lib/email';
import { updateProjectStatus } from './projects';

function generateTempPassword(): string {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    return Array.from(crypto.randomBytes(12)).map(b => chars[b % chars.length]).join('');
}

export interface ImportRowInput {
    architectName: string;
    architectEmail: string;    // B — used for auto-registration if architect not found
    architectStudio?: string;  // M — set on new account only
    architectNip?: string;     // N — set on new account only
    architectAddress?: string; // O — set on new account only
    clientLabel: string;
    orderNumber: string;
    amountNet: number;
    isPaid: boolean;
    prowizjaRozliczona: boolean;
    invoiceNumber: string;
}

export interface ImportRowResult {
    rowIndex: number;
    status: 'success' | 'skipped' | 'error';
    architectName: string;
    orderNumber: string;
    projectId?: string;
    architectId?: string;
    newAccountCreated?: boolean;
    message?: string;
}

export interface ImportResult {
    successCount: number;
    skippedCount: number;
    errorCount: number;
    newAccountsCreated: number;
    results: ImportRowResult[];
}

export async function importProjectsFromCSV(rows: ImportRowInput[], importedAt?: string | null): Promise<ImportResult> {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'ADMIN') throw new Error("Unauthorized");

    if (!rows || rows.length === 0) throw new Error("Brak wierszy do importu");

    // Load all architects into a lowercase map for O(1) lookup
    const allArchitects = await query<{ id: string; name: string }>(
        "SELECT id, name FROM users WHERE role = 'ARCHI'"
    );
    const architectMap = new Map<string, string>();
    for (const a of allArchitects) {
        architectMap.set(a.name.toLowerCase().trim(), a.id);
    }

    const results: ImportRowResult[] = [];
    let successCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    let newAccountsCreated = 0;

    const portalUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://portal.walldecor.pl';

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowResult: ImportRowResult = {
            rowIndex: i,
            architectName: row.architectName,
            orderNumber: row.orderNumber,
            status: 'error',
        };

        try {
            // ── 1. Resolve architect ──────────────────────────────────────────
            let architectId = architectMap.get(row.architectName.toLowerCase().trim());

            if (!architectId) {
                // Architect not found — try auto-registration if email provided
                const email = row.architectEmail.trim().toLowerCase();

                if (!email || !email.includes('@')) {
                    rowResult.message = `Architekt "${row.architectName}" nie znaleziony w systemie. Dodaj email do CSV aby auto-zarejestrować.`;
                    results.push(rowResult);
                    errorCount++;
                    continue;
                }

                // Check if email is already taken
                const emailTaken = await query<any>(
                    "SELECT id FROM users WHERE email = ?",
                    [email]
                );
                if (emailTaken.length > 0) {
                    rowResult.message = `Email "${email}" jest już przypisany do innego konta`;
                    results.push(rowResult);
                    errorCount++;
                    continue;
                }

                // Create new ARCHI account
                const newArchitectId = crypto.randomUUID();
                const tempPassword = generateTempPassword();
                const hashedPassword = await bcrypt.hash(tempPassword, 10);

                await query(
                    "INSERT INTO users (id, name, email, password, role, studio_name, nip, address) VALUES (?, ?, ?, ?, 'ARCHI', ?, ?, ?)",
                    [newArchitectId, row.architectName.trim(), email, hashedPassword,
                     row.architectStudio?.trim() || null,
                     row.architectNip?.trim() || null,
                     row.architectAddress?.trim() || null]
                );

                // Send welcome email (non-blocking — failure doesn't abort import)
                await sendEmail('ARCHITECT_REGISTERED', email, {
                    user_name: row.architectName.trim(),
                    email,
                    password: tempPassword,
                    portal_url: portalUrl,
                });

                // Cache for subsequent rows with the same architect in this batch
                architectMap.set(row.architectName.toLowerCase().trim(), newArchitectId);
                architectId = newArchitectId;
                rowResult.newAccountCreated = true;
                newAccountsCreated++;
            }

            // ── 2. Validate amount ────────────────────────────────────────────
            if (!row.amountNet || row.amountNet <= 0) {
                rowResult.message = 'Nieprawidłowa kwota netto (musi być > 0)';
                results.push(rowResult);
                errorCount++;
                continue;
            }

            // ── 3. Duplicate guard by order_number ───────────────────────────
            if (row.orderNumber) {
                const existing = await query<any>(
                    "SELECT id FROM project_items WHERE order_number = ?",
                    [row.orderNumber]
                );
                if (existing.length > 0) {
                    rowResult.status = 'skipped';
                    rowResult.message = `Duplikat — nr zamówienia "${row.orderNumber}" już istnieje`;
                    results.push(rowResult);
                    skippedCount++;
                    continue;
                }
            }

            // ── 4. Insert project + item ──────────────────────────────────────
            const projectId = crypto.randomUUID();
            const itemId = 'i_' + crypto.randomUUID().replace(/-/g, '').substring(0, 8);
            const projectName = row.orderNumber || `${row.clientLabel} / import`;
            // importedAt: use provided date (noon) or let DB default to CURRENT_TIMESTAMP
            const createdAt = importedAt ? `${importedAt} 12:00:00` : null;

            if (createdAt) {
                await query(
                    "INSERT INTO projects (id, owner_id, name, client_label, status, created_at) VALUES (?, ?, ?, ?, 'ZGŁOSZONY', ?)",
                    [projectId, architectId, projectName, row.clientLabel || '—', createdAt]
                );
                await query(
                    "INSERT INTO project_items (id, project_id, type, category, amount_net, order_number, invoice_number, is_paid, created_at) VALUES (?, ?, 'PRODUCT', 'Inne', ?, ?, ?, ?, ?)",
                    [itemId, projectId, row.amountNet, row.orderNumber || null, row.invoiceNumber || null, row.isPaid ? 1 : 0, createdAt]
                );
            } else {
                await query(
                    "INSERT INTO projects (id, owner_id, name, client_label, status) VALUES (?, ?, ?, ?, 'ZGŁOSZONY')",
                    [projectId, architectId, projectName, row.clientLabel || '—']
                );
                await query(
                    "INSERT INTO project_items (id, project_id, type, category, amount_net, order_number, invoice_number, is_paid) VALUES (?, ?, 'PRODUCT', 'Inne', ?, ?, ?, ?)",
                    [itemId, projectId, row.amountNet, row.orderNumber || null, row.invoiceNumber || null, row.isPaid ? 1 : 0]
                );
            }

            // ── 5. Advance to ZAKOŃCZONY if commission is settled ─────────────
            if (row.prowizjaRozliczona) {
                await updateProjectStatus(projectId, 'ZAKOŃCZONY');
            }

            rowResult.status = 'success';
            rowResult.projectId = projectId;
            rowResult.architectId = architectId;
            results.push(rowResult);
            successCount++;

        } catch (err: any) {
            rowResult.status = 'error';
            rowResult.message = err.message || 'Nieznany błąd podczas importu';
            results.push(rowResult);
            errorCount++;
        }
    }

    revalidatePath('/dashboard/admin');
    revalidatePath('/dashboard/admin/settings');

    return { successCount, skippedCount, errorCount, newAccountsCreated, results };
}
