'use server';

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query, withTransaction } from "@/lib/db";
import { revalidatePath } from "next/cache";
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { sendEmail } from '@/lib/email';
import { buildArchitectRegisteredPlaceholders } from '@/lib/emailPlaceholders';
import { getCommissionRateForTurnover } from '@/lib/partnerProgram';
import { nextSubiektCode, withSubiektCodeRetry } from '@/lib/subiekt/codes';

const HISTORICAL_COMPLETION_NOTE = 'Import historyczny — prowizja rozliczona poza portalem';
const HISTORICAL_COMMISSION_NOTE = 'Import historyczny (rozliczona)';

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

    const portalUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';

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

                // Kod architekta do Subiekta (A-xxx) nadawany w tej samej transakcji co konto.
                await withSubiektCodeRetry(async (queryFn) => {
                    const subiektCode = await nextSubiektCode();
                    await queryFn(
                        "INSERT INTO users (id, name, email, password, role, studio_name, nip, address, must_change_password, subiekt_code) VALUES (?, ?, ?, ?, 'ARCHI', ?, ?, ?, 1, ?)",
                        [newArchitectId, row.architectName.trim(), email, hashedPassword,
                         row.architectStudio?.trim() || null,
                         row.architectNip?.trim() || null,
                         row.architectAddress?.trim() || null,
                         subiektCode]
                    );
                });

                // Send welcome email (non-blocking — failure doesn't abort import)
                await sendEmail('ARCHITECT_REGISTERED', email, buildArchitectRegisteredPlaceholders({
                    userName: row.architectName.trim(),
                    email,
                    password: tempPassword,
                    portalUrl,
                }));

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

            // ── 4. Insert project + item (+ historical commission) ────────────
            const projectId = crypto.randomUUID();
            const itemId = 'i_' + crypto.randomUUID().replace(/-/g, '').substring(0, 8);
            const projectName = row.orderNumber || `${row.clientLabel} / import`;
            // importedAt: use provided date (noon) or let DB default to CURRENT_TIMESTAMP
            const createdAt = importedAt ? `${importedAt} 12:00:00` : null;

            if (row.prowizjaRozliczona) {
                // Prowizja za ten projekt została już wypłacona poza portalem (kolumna K = Tak).
                // NIE przechodzimy przez standardowe domykanie projektu z projects.ts: tworzyłoby to prowizję EARNED
                // (dostępną do wypłaty => ryzyko podwójnej wypłaty) oraz naliczało cashback 2%.
                // Zamiast tego, atomowo: projekt ZAKOŃCZONY + pozycja + prowizja PAID.
                //
                // Świadoma decyzja: BRAK wpisów w wallet_transactions — za historyczne projekty
                // nie przyznajemy cashbacku (nie było go w momencie realizacji zamówień).
                //
                // Stawka = status partnerski z obrotu kwalifikowanego architekta PRZED tym projektem
                // (suma PRODUCT w projektach ZAKOŃCZONYCH, z uwzględnieniem users.tier_override).
                // Zapytanie jest wykonywane per wiersz wewnątrz transakcji, więc wiersze tego samego
                // architekta z tego importu widzą obrót z poprzednich wierszy.
                await withTransaction(async (queryFn) => {
                    const turnoverRes = await queryFn<any>(`
                        SELECT COALESCE(SUM(i.amount_net), 0) as total
                        FROM project_items i
                        JOIN projects p ON i.project_id = p.id
                        WHERE p.owner_id = ?
                          AND i.type = 'PRODUCT'
                          AND p.status = 'ZAKOŃCZONY'
                    `, [architectId]);
                    const turnoverBefore = Number(turnoverRes[0]?.total || 0);
                    const overrideRes = await queryFn<any>("SELECT tier_override FROM users WHERE id = ?", [architectId]);
                    const rate = getCommissionRateForTurnover(turnoverBefore, overrideRes[0]?.tier_override);
                    const commissionAmount = row.amountNet * rate;

                    if (createdAt) {
                        await queryFn(
                            "INSERT INTO projects (id, owner_id, name, client_label, status, created_at, completed_by, completed_at, completion_note) VALUES (?, ?, ?, ?, 'ZAKOŃCZONY', ?, ?, ?, ?)",
                            [projectId, architectId, projectName, row.clientLabel || '—', createdAt, session.user.id, createdAt, HISTORICAL_COMPLETION_NOTE]
                        );
                    } else {
                        await queryFn(
                            "INSERT INTO projects (id, owner_id, name, client_label, status, completed_by, completed_at, completion_note) VALUES (?, ?, ?, ?, 'ZAKOŃCZONY', ?, CURRENT_TIMESTAMP, ?)",
                            [projectId, architectId, projectName, row.clientLabel || '—', session.user.id, HISTORICAL_COMPLETION_NOTE]
                        );
                    }
                    await queryFn(
                        "INSERT INTO project_items (id, project_id, type, category, amount_net, order_number, invoice_number, is_paid) VALUES (?, ?, 'PRODUCT', 'Inne', ?, ?, ?, ?)",
                        [itemId, projectId, row.amountNet, row.orderNumber || null, row.invoiceNumber || null, row.isPaid ? 1 : 0]
                    );
                    await queryFn(
                        "INSERT INTO commissions (id, project_id, project_item_id, architect_id, amount_net, status, rate, note) VALUES (?, ?, ?, ?, ?, 'PAID', ?, ?)",
                        [`c_${itemId}_import`, projectId, itemId, architectId, commissionAmount, rate, HISTORICAL_COMMISSION_NOTE]
                    );
                });
            } else if (createdAt) {
                await query(
                    "INSERT INTO projects (id, owner_id, name, client_label, status, created_at) VALUES (?, ?, ?, ?, 'ZGŁOSZONY', ?)",
                    [projectId, architectId, projectName, row.clientLabel || '—', createdAt]
                );
                await query(
                    "INSERT INTO project_items (id, project_id, type, category, amount_net, order_number, invoice_number, is_paid) VALUES (?, ?, 'PRODUCT', 'Inne', ?, ?, ?, ?)",
                    [itemId, projectId, row.amountNet, row.orderNumber || null, row.invoiceNumber || null, row.isPaid ? 1 : 0]
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
