'use server';

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query, withTransaction } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/services";
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';
import { spendCashback } from "@/lib/cashback";
import { writeFile, mkdir, unlink } from 'fs/promises';
import { join } from 'path';
import crypto from 'crypto';
import { sendEmail } from "@/lib/email";


function generateTempPassword(): string {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    return Array.from(crypto.randomBytes(12)).map(b => chars[b % chars.length]).join('');
}

const VALID_PROJECT_STATUSES = ['ZGŁOSZONY', 'PRZYJĘTY', 'W_REALIZACJI', 'ZAKOŃCZONY', 'NIEZREALIZOWANY'];

export async function createProject(data: {
    name: string,
    client_label: string,
    items: Array<{
        category: string,
        description?: string,
        amount_net: number
    }>,
    ownerId?: string
}) {
    const session = await getServerSession(authOptions);
    if (!session) throw new Error("Unauthorized");

    if (!data.name || data.name.trim().length === 0) throw new Error("Nazwa projektu jest wymagana.");
    if (data.name.trim().length > 200) throw new Error("Nazwa projektu nie może przekraczać 200 znaków.");
    if (!data.client_label || data.client_label.trim().length === 0) throw new Error("Nazwa klienta jest wymagana.");
    if (data.client_label.trim().length > 200) throw new Error("Nazwa klienta nie może przekraczać 200 znaków.");

    const projectId = uuidv4();
    const ownerId = (session.user.role === 'ADMIN' || session.user.role === 'STAFF') && data.ownerId
        ? data.ownerId
        : session.user.id;

    // 1. Create Project
    await query(
        "INSERT INTO projects (id, owner_id, name, client_label, status) VALUES (?, ?, ?, ?, ?)",
        [projectId, ownerId, data.name, data.client_label, 'ZGŁOSZONY']
    );

    // 2. Add items
    for (const item of data.items) {
        if (item.amount_net > 0) {
            await query(
                "INSERT INTO project_items (id, project_id, type, category, description, amount_net) VALUES (?, ?, ?, ?, ?, ?)",
                [`i_${uuidv4().substring(0, 8)}`, projectId, 'PRODUCT', item.category, item.description || null, item.amount_net]
            );
        }
    }

    revalidatePath('/dashboard/projects');
    revalidatePath('/dashboard');

    // --- Email Notifications ---
    try {
        const userRes = await query<any>("SELECT name, email FROM users WHERE id = ?", [ownerId]);
        const adminRes = await query<any>("SELECT email FROM users WHERE role = 'ADMIN' LIMIT 1");

        if (userRes.length > 0) {
            await sendEmail('PROJECT_ADDED_USER', userRes[0].email, {
                user_name: userRes[0].name,
                project_name: data.name,
                client_label: data.client_label
            });
        }

        if (adminRes.length > 0) {
            await sendEmail('PROJECT_ADDED_ADMIN', adminRes[0].email, {
                user_name: userRes[0]?.name || 'Architekt',
                project_name: data.name
            });
        }
    } catch (err) {
        console.error("Email notification failed:", err);
    }


    return { success: true, projectId };
}

export async function updateProjectStatus(projectId: string, status: string) {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'STAFF')) {
        throw new Error("Unauthorized");
    }

    if (!VALID_PROJECT_STATUSES.includes(status)) {
        throw new Error("Nieprawidłowy status projektu.");
    }

    await query(
        "UPDATE projects SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [status, projectId]
    );

    // Log the change
    await logActivity(session.user.id, 'PROJECT_STATUS_CHANGE', `Zmieniono status projektu ${projectId} na ${status}`, { projectId, status });

    // PRZYJĘTY / W_REALIZACJI: create PENDING commission entries so admin KPI shows in-progress commissions
    if (status === 'PRZYJĘTY' || status === 'W_REALIZACJI') {
        const existingComm = await query<any>(
            "SELECT id FROM commissions WHERE project_id = ? LIMIT 1",
            [projectId]
        );
        if (existingComm.length === 0) {
            const projectData = await query<any>(`
                SELECT p.owner_id, u.commission_rate, u.email, u.name, p.name as project_name
                FROM projects p
                JOIN users u ON p.owner_id = u.id
                WHERE p.id = ?
            `, [projectId]);

            if (projectData.length > 0) {
                const { owner_id, commission_rate, email, name, project_name } = projectData[0];

                // Email notification for acceptance
                if (status === 'PRZYJĘTY') {
                    await sendEmail('PROJECT_ACCEPTED', email, {
                        user_name: name,
                        project_name: project_name
                    }).catch(err => console.error("Email notification failed:", err));
                }

                const items = await query<any>(
                    "SELECT id, amount_net FROM project_items WHERE project_id = ? AND type = 'PRODUCT'",
                    [projectId]
                );

                for (const item of items) {
                    const rate = (commission_rate && commission_rate > 0) ? commission_rate : 7;
                    const commAmount = (item.amount_net * rate) / 100;
                    if (commAmount > 0) {
                        await query(
                            "INSERT INTO commissions (id, project_id, project_item_id, architect_id, amount_net, status) VALUES (?, ?, ?, ?, ?, 'PENDING')",
                            [`c_${uuidv4().substring(0, 8)}`, projectId, item.id, owner_id, commAmount]
                        );
                    }
                }
            }
        }
    }

    // ZAKOŃCZONY: finalize commissions using progressive bracket system, credit wallet cashback
    if (status === 'ZAKOŃCZONY') {
        // Guard against double-processing (read outside transaction)
        const existingTrans = await query<any>(
            "SELECT id FROM wallet_transactions WHERE related_item_id IN (SELECT id FROM project_items WHERE project_id = ?) LIMIT 1",
            [projectId]
        );

        if (existingTrans.length > 0) {
            console.log(`Project ${projectId} already processed for cashback. Skipping.`);
        } else {
            const projectData = await query<any>(
                "SELECT p.owner_id FROM projects p WHERE p.id = ?",
                [projectId]
            );

            if (projectData.length > 0) {
                const { owner_id } = projectData[0];

                // --- Read phase (outside transaction) ---
                const prevTurnoverRes = await query<any>(`
                    SELECT COALESCE(SUM(i.amount_net), 0) as total
                    FROM project_items i
                    JOIN projects p ON i.project_id = p.id
                    WHERE p.owner_id = ?
                      AND i.type = 'PRODUCT'
                      AND p.status = 'ZAKOŃCZONY'
                      AND p.id != ?
                `, [owner_id, projectId]);
                let runningTurnover = Number(prevTurnoverRes[0]?.total || 0);

                const items = await query<any>(
                    "SELECT id, amount_net FROM project_items WHERE project_id = ? AND type = 'PRODUCT'",
                    [projectId]
                );

                const pendingCommMap: Record<string, string | null> = {};
                for (const item of items) {
                    const pendingComm = await query<any>(
                        "SELECT id FROM commissions WHERE project_item_id = ? AND status = 'PENDING' LIMIT 1",
                        [item.id]
                    );
                    pendingCommMap[item.id] = pendingComm.length > 0 ? pendingComm[0].id : null;
                }

                // --- Compute phase (pure JS, no DB) ---
                const brackets = [
                    { threshold: 10000, rate: 0.07 },
                    { threshold: 50000, rate: 0.07 },
                    { threshold: 120000, rate: 0.10 },
                    { threshold: Infinity, rate: 0.14 },
                ];

                const itemOps: Array<{ item: any; commAmount: number; cashbackAmount: number }> = [];
                for (const item of items) {
                    const itemAmount = Number(item.amount_net);
                    let remaining = itemAmount;
                    let commAmount = 0;
                    for (const bracket of brackets) {
                        if (remaining <= 0) break;
                        const bracketStart = bracket === brackets[0] ? 0 : brackets[brackets.indexOf(bracket) - 1].threshold;
                        const capacityInBracket = bracket.threshold - Math.max(runningTurnover, bracketStart);
                        if (capacityInBracket <= 0) continue;
                        const portion = Math.min(remaining, capacityInBracket);
                        commAmount += portion * bracket.rate;
                        remaining -= portion;
                    }
                    runningTurnover += itemAmount;
                    itemOps.push({ item, commAmount, cashbackAmount: itemAmount * 0.02 });
                }

                // --- Write phase (all in one transaction) ---
                await withTransaction(async (queryFn) => {
                    for (const { item, commAmount, cashbackAmount } of itemOps) {
                        if (pendingCommMap[item.id]) {
                            await queryFn(
                                "UPDATE commissions SET status = 'EARNED', amount_net = ? WHERE project_item_id = ? AND status = 'PENDING'",
                                [commAmount, item.id]
                            );
                        } else if (commAmount > 0) {
                            await queryFn(
                                "INSERT INTO commissions (id, project_id, project_item_id, architect_id, amount_net, status) VALUES (?, ?, ?, ?, ?, 'EARNED')",
                                [`c_${uuidv4().substring(0, 8)}`, projectId, item.id, owner_id, commAmount]
                            );
                        }

                        if (cashbackAmount > 0) {
                            const expiresAt = new Date();
                            expiresAt.setFullYear(expiresAt.getFullYear() + 1);
                            await queryFn(
                                "INSERT INTO wallet_transactions (id, user_id, type, amount, related_item_id, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
                                [`t_${uuidv4().substring(0, 8)}`, owner_id, 'EARN', cashbackAmount, item.id, expiresAt.toISOString()]
                            );
                        }
                    }
                });
            }
        }
    }

    // NIEZREALIZOWANY: cancel any PENDING commissions for rejected projects
    if (status === 'NIEZREALIZOWANY') {
        await query(
            "DELETE FROM commissions WHERE project_id = ? AND status = 'PENDING'",
            [projectId]
        );
    }

    revalidatePath('/dashboard/admin');
    revalidatePath('/dashboard/projects');
    revalidatePath('/dashboard/wallet');
    revalidatePath('/dashboard');

    return { success: true };
}

export async function getAllArchitects() {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'STAFF')) {
        throw new Error("Unauthorized");
    }

    return await query<any>("SELECT id, name FROM users WHERE role = 'ARCHI' ORDER BY name ASC");
}

export async function registerArchitect(data: {
    first_name: string,
    last_name: string,
    email: string,
    studio_name?: string,
    nip?: string,
    address?: string,
    bank_account?: string,
    is_vat_payer: boolean,
    password?: string
}) {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'STAFF')) {
        throw new Error("Unauthorized");
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.email)) {
        throw new Error("Nieprawidłowy format adresu email.");
    }

    const userId = uuidv4();
    const fullName = `${data.first_name} ${data.last_name}`;

    // Hash password (provided or auto-generated)
    const generatedPassword = data.password ? undefined : generateTempPassword();
    const passwordToHash = data.password || generatedPassword!;
    const hashedPassword = await bcrypt.hash(passwordToHash, 10);

    await query(
        `INSERT INTO users (
            id, name, first_name, last_name, email, password, 
            role, studio_name, nip, address, bank_account, is_vat_payer
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            userId,
            fullName,
            data.first_name,
            data.last_name,
            data.email,
            hashedPassword,
            'ARCHI',
            data.studio_name || null,
            data.nip || null,
            data.address || null,
            data.bank_account || null,
            data.is_vat_payer ? 1 : 0
        ]
    );

    // --- Email Notification ---
    try {
        await sendEmail('ARCHITECT_REGISTERED', data.email, {
            user_name: fullName,
            password: passwordToHash,
            site_url: process.env.NEXTAUTH_URL || 'http://localhost:3000'
        });

    } catch (err) {
        console.error("Email notification failed:", err);
    }

    revalidatePath('/dashboard/admin');
    return { success: true, userId, generatedPassword };
}


export async function getArchitectById(id: string) {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'STAFF')) {
        throw new Error("Unauthorized");
    }

    const res = await query<any>("SELECT * FROM users WHERE id = ?", [id]);
    return res.length > 0 ? res[0] : null;
}

export async function updateArchitect(id: string, data: {
    first_name: string,
    last_name: string,
    email: string,
    studio_name?: string,
    nip?: string,
    address?: string,
    bank_account?: string,
    is_vat_payer: boolean
}) {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'STAFF')) {
        throw new Error("Unauthorized");
    }

    const fullName = `${data.first_name} ${data.last_name}`;

    await query(
        `UPDATE users SET 
            name = ?, first_name = ?, last_name = ?, email = ?, 
            studio_name = ?, nip = ?, address = ?, bank_account = ?, is_vat_payer = ?
        WHERE id = ?`,
        [
            fullName,
            data.first_name,
            data.last_name,
            data.email,
            data.studio_name || null,
            data.nip || null,
            data.address || null,
            data.bank_account || null,
            data.is_vat_payer ? 1 : 0,
            id
        ]
    );

    revalidatePath('/dashboard/admin');
    return { success: true };
}

export async function requestPayout() {
    // THIS ACTION IS NOW DEPRECATED FOR CASH WITHDRAWAL as per user request.
    // Cashback (2%) should only be redeemable for discount cards.
    throw new Error("Wypłata gotówkowa z Portfela Cashback jest niedostępna. Środki możesz wykorzystać wymieniając je na karty rabatowe.");
}

export async function requestCommissionPayout(formData: FormData) {
    const session = await getServerSession(authOptions);
    if (!session) throw new Error("Unauthorized");

    const amount = Number(formData.get('amount'));
    const invoiceFile = formData.get('invoice') as File;

    if (!amount || amount < 100) {
        throw new Error("Minimalna kwota wypłaty prowizji to 100 PLN");
    }

    if (!invoiceFile || invoiceFile.size === 0) {
        throw new Error("Załączenie obrazu faktury (PDF) jest wymagane.");
    }

    // Validate PDF magic bytes server-side
    const headerBytes = await invoiceFile.slice(0, 4).arrayBuffer();
    const header = Buffer.from(headerBytes).toString('ascii');
    if (header !== '%PDF') {
        throw new Error("Plik musi być w formacie PDF.");
    }

    // 1. Verify EARNED commissions match the requested amount
    const earnedRes = await query<any>(
        "SELECT COALESCE(SUM(amount_net), 0) as total FROM commissions WHERE architect_id = ? AND status = 'EARNED'",
        [session.user.id]
    );
    const earnedTotal = Number(earnedRes[0]?.total || 0);

    if (amount > earnedTotal) {
        throw new Error("Niewystarczająca ilość zarobionej prowizji.");
    }

    // 2. Handle File Upload
    const fileName = `invoice_${session.user.id}_${Date.now()}.pdf`;
    const uploadDir = join(process.cwd(), 'private_uploads', 'invoices');
    const filePath = join(uploadDir, fileName);

    try {
        await mkdir(uploadDir, { recursive: true });
        const bytes = await invoiceFile.arrayBuffer();
        const buffer = Buffer.from(bytes);
        await writeFile(filePath, buffer);
    } catch (error) {
        console.error("File upload error:", error);
        throw new Error("Błąd podczas zapisywania pliku faktury.");
    }

    const invoiceUrl = `/api/invoices/${fileName}`;

    // 3. FIFO: select only the commissions needed to cover the requested amount
    const earnedComms = await query<any>(
        "SELECT id, amount_net FROM commissions WHERE architect_id = ? AND status = 'EARNED' ORDER BY created_at ASC",
        [session.user.id]
    );

    const toLock: string[] = [];
    let accumulated = 0;
    for (const comm of earnedComms) {
        if (accumulated >= amount) break;
        toLock.push(comm.id);
        accumulated += Number(comm.amount_net);
    }

    if (toLock.length === 0 || accumulated < amount) {
        await unlink(filePath).catch(() => { });
        throw new Error("Niewystarczająca ilość zarobionej prowizji.");
    }

    // 4. Create payout request and lock selected commissions atomically.
    // If either DB write fails, roll back and clean up the uploaded file.
    const requestId = `pr_${uuidv4().substring(0, 12)}`;
    try {
        await withTransaction(async (queryFn) => {
            await queryFn(
                "INSERT INTO payout_requests (id, architect_id, amount, status, type, invoice_url) VALUES (?, ?, ?, 'PENDING', 'COMMISSION', ?)",
                [requestId, session.user.id, amount, invoiceUrl]
            );
            for (const id of toLock) {
                await queryFn(
                    "UPDATE commissions SET status = 'IN_PAYMENT', payout_id = ? WHERE id = ?",
                    [requestId, id]
                );
            }
        });
    } catch (error) {
        await unlink(filePath).catch(() => { }); // best-effort cleanup on DB failure
        throw error;
    }

    await logActivity(session.user.id, 'COMMISSION_PAYOUT_REQUEST', `Zgłoszono wypłatę prowizji na kwotę ${amount} PLN`, { amount, requestId, invoiceUrl });

    revalidatePath('/dashboard/wallet');
    revalidatePath('/dashboard/admin');

    return { success: true, amount };
}

export async function updatePayoutStatus(payoutId: string, newStatus: string) {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'STAFF')) {
        throw new Error("Unauthorized");
    }

    // Get request info
    const reqRes = await query<any>("SELECT * FROM payout_requests WHERE id = ?", [payoutId]);
    const payoutReq = reqRes[0];
    if (!payoutReq) throw new Error("Wniosek nie istnieje");

    // Guard against re-processing terminal states
    if (payoutReq.status === 'PAID' || payoutReq.status === 'REJECTED') {
        throw new Error("Ten wniosek został już ostatecznie rozliczony i nie może być zmieniony.");
    }

    // 1. Update payout request status
    await query(
        "UPDATE payout_requests SET status = ?, processed_at = CURRENT_TIMESTAMP, processed_by = ? WHERE id = ?",
        [newStatus, session.user.id, payoutId]
    );

    // 2. Map Payout status to Commission status
    // Payout PENDING/IN_PAYMENT -> Commission IN_PAYMENT
    // Payout APPROVED/PAID -> Commission PAID
    // Payout REJECTED -> Commission EARNED (reverted)
    let commissionStatus = 'EARNED';
    if (newStatus === 'IN_PAYMENT') commissionStatus = 'IN_PAYMENT';
    else if (newStatus === 'APPROVED' || newStatus === 'PAID') commissionStatus = 'PAID';
    else if (newStatus === 'REJECTED') commissionStatus = 'EARNED';

    // 3. Update linked commissions
    await query(
        "UPDATE commissions SET status = ? WHERE payout_id = ?",
        [commissionStatus, payoutId]
    );

    // 4. Handle side effects
    if (newStatus === 'REJECTED') {
        await query("UPDATE commissions SET payout_id = NULL WHERE payout_id = ?", [payoutId]);
    }

    // Debit wallet via FIFO spendCashback if payout is being approved/paid for the first time
    // ONLY for types that are not COMMISSION (commissions are handled by updating commission status)
    const isFinalStatus = payoutReq.status === 'APPROVED' || payoutReq.status === 'PAID';
    const movingToFinal = newStatus === 'APPROVED' || newStatus === 'PAID';

    if (movingToFinal && !isFinalStatus && payoutReq.type !== 'COMMISSION') {
        await spendCashback(payoutReq.architect_id, Number(payoutReq.amount));
    }

    await logActivity(session.user.id, 'PAYOUT_STATUS_CHANGE', `Zmieniono status wypłaty ${payoutId} na ${newStatus}`, { payoutId, newStatus });

    revalidatePath('/dashboard/wallet');
    revalidatePath('/dashboard/admin');

    // --- Email Notifications ---
    if (newStatus === 'PAID') {
        try {
            const architectRes = await query<any>("SELECT name, email FROM users WHERE id = ?", [payoutReq.architect_id]);
            if (architectRes.length > 0) {
                await sendEmail('PAYOUT_PROCESSED', architectRes[0].email, {
                    user_name: architectRes[0].name,
                    amount: payoutReq.amount.toString()
                });
            }
        } catch (err) {
            console.error("Email notification failed:", err);
        }
    }


    // Revalidate specific projects linked to this payout
    const projectsRes = await query<any>("SELECT DISTINCT project_id FROM commissions WHERE payout_id = ?", [payoutId]);
    for (const p of projectsRes) {
        if (p.project_id) revalidatePath(`/dashboard/admin/projects/${p.project_id}`);
    }

    return { success: true };
}

// ─── Admin: project item management ──────────────────────────────────────────
export async function updateProjectItem(itemId: string, amount_net: number, note?: string) {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'ADMIN') throw new Error("Unauthorized");

    if (amount_net < 0) throw new Error("Kwota nie może być ujemna");

    // Get current item and project info
    const itemRes = await query<any>(`
        SELECT i.*, p.status, p.owner_id 
        FROM project_items i
        JOIN projects p ON i.project_id = p.id
        WHERE i.id = ?
    `, [itemId]);

    if (itemRes.length === 0) throw new Error("Pozycja nie istnieje");
    const item = itemRes[0];
    const oldAmount = Number(item.amount_net);
    const projectId = item.project_id;
    const status = item.status;
    const ownerId = item.owner_id;

    // 1. Update the item itself
    await query("UPDATE project_items SET amount_net = ? WHERE id = ?", [amount_net, itemId]);

    // 2. Handle commissions/cashback based on status
    if (status === 'PRZYJĘTY' || status === 'W_REALIZACJI') {
        const projectData = await query<any>("SELECT u.commission_rate FROM users u WHERE u.id = ?", [ownerId]);
        const rate = (projectData[0]?.commission_rate && projectData[0].commission_rate > 0) ? projectData[0].commission_rate : 7;
        const newCommAmount = (amount_net * rate) / 100;

        await query(
            "UPDATE commissions SET amount_net = ?, note = ? WHERE project_item_id = ? AND status = 'PENDING'",
            [newCommAmount, note || 'Korekta kwoty', itemId]
        );
    } else if (status === 'ZAKOŃCZONY' && item.type === 'PRODUCT') {
        // Full project recalculation (S5 fix): editing one item shifts bracket boundaries for all
        // subsequent items in the project, so we recalculate all items and create adjustments.

        const brackets = [
            { threshold: 10000, rate: 0.07 },
            { threshold: 50000, rate: 0.07 },
            { threshold: 120000, rate: 0.10 },
            { threshold: Infinity, rate: 0.14 },
        ];

        const calcComm = (amt: number, startTurnover: number) => {
            let rem = amt;
            let comm = 0;
            let currentTO = startTurnover;
            for (const b of brackets) {
                if (rem <= 0) break;
                const bStart = b === brackets[0] ? 0 : brackets[brackets.indexOf(b) - 1].threshold;
                const capacity = b.threshold - Math.max(currentTO, bStart);
                if (capacity <= 0) continue;
                const portion = Math.min(rem, capacity);
                comm += portion * b.rate;
                rem -= portion;
                currentTO += portion;
            }
            return comm;
        };

        // Baseline turnover from other completed projects
        const prevTurnoverRes = await query<any>(`
            SELECT COALESCE(SUM(i.amount_net), 0) as total
            FROM project_items i
            JOIN projects p ON i.project_id = p.id
            WHERE p.owner_id = ?
              AND i.type = 'PRODUCT'
              AND p.status = 'ZAKOŃCZONY'
              AND p.id != ?
        `, [ownerId, projectId]);
        let runningTurnover = Number(prevTurnoverRes[0]?.total || 0);

        // All PRODUCT items in the project in a consistent order (ORDER BY id for reproducibility)
        const projectItems = await query<any>(
            "SELECT id, amount_net FROM project_items WHERE project_id = ? AND type = 'PRODUCT' ORDER BY id ASC",
            [projectId]
        );

        for (const pi of projectItems) {
            const piAmount = Number(pi.amount_net);
            const targetComm = calcComm(piAmount, runningTurnover);
            runningTurnover += piAmount;

            // Sum of all existing EARNED commission records for this item (initial + any prior adjustments)
            const existingCommRes = await query<any>(
                "SELECT COALESCE(SUM(amount_net), 0) as total FROM commissions WHERE project_item_id = ? AND status = 'EARNED'",
                [pi.id]
            );
            const existingComm = Number(existingCommRes[0]?.total || 0);
            const diffComm = targetComm - existingComm;

            if (Math.abs(diffComm) > 0.001) {
                await query(
                    "INSERT INTO commissions (id, project_id, project_item_id, architect_id, amount_net, status, note) VALUES (?, ?, ?, ?, ?, 'EARNED', ?)",
                    [`c_${uuidv4().substring(0, 8)}`, projectId, pi.id, ownerId, diffComm, note || 'Korekta wielopozycyjna (przeliczenie projektu)']
                );
            }
        }

        // Cashback: flat 2% delta for the edited item only (no bracket dependency)
        const oldCashback = oldAmount * 0.02;
        const newCashback = amount_net * 0.02;
        const diffCashback = newCashback - oldCashback;

        if (Math.abs(diffCashback) > 0.01) {
            const transType = diffCashback > 0 ? 'EARN' : 'SPEND';
            const expiresAt = new Date();
            expiresAt.setFullYear(expiresAt.getFullYear() + 1);

            await query(
                "INSERT INTO wallet_transactions (id, user_id, type, amount, related_item_id, description, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                [`t_${uuidv4().substring(0, 8)}`, ownerId, transType, Math.abs(diffCashback), itemId, note || (diffCashback > 0 ? 'Korekta: zwiększenie kwoty' : 'Korekta: zwrot/pomniejszenie kwoty'), diffCashback > 0 ? expiresAt.toISOString() : null]
            );
        }
    }

    revalidatePath(`/dashboard/admin/projects/${projectId}`);
    revalidatePath('/dashboard/admin');
    revalidatePath('/dashboard/wallet');

    return { success: true };
}

export async function addProjectItem(projectId: string, data: {
    type: 'PRODUCT' | 'INSTALLATION';
    category: string;
    description?: string;
    amount_net: number;
    order_number?: string;
    invoice_number?: string;
    is_paid?: boolean;
}, note?: string) {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'ADMIN') throw new Error("Unauthorized");

    if (data.amount_net <= 0) throw new Error("Kwota musi być większa od 0");

    const itemId = `i_${uuidv4().substring(0, 8)}`;
    await query(
        "INSERT INTO project_items (id, project_id, type, category, description, amount_net, order_number, invoice_number, is_paid) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [itemId, projectId, data.type, data.category, data.description || null, data.amount_net, data.order_number || null, data.invoice_number || null, data.is_paid ? 1 : 0]
    );

    // Get project status
    const projRes = await query<any>("SELECT status, owner_id FROM projects WHERE id = ?", [projectId]);
    if (projRes.length > 0) {
        const { status, owner_id } = projRes[0];

        if (status === 'PRZYJĘTY' || status === 'W_REALIZACJI') {
            const userData = await query<any>("SELECT commission_rate FROM users WHERE id = ?", [owner_id]);
            const rate = (userData[0]?.commission_rate && userData[0].commission_rate > 0) ? userData[0].commission_rate : 7;
            const commAmount = (data.amount_net * rate) / 100;
            if (commAmount > 0) {
                await query(
                    "INSERT INTO commissions (id, project_id, project_item_id, architect_id, amount_net, status, note) VALUES (?, ?, ?, ?, ?, 'PENDING', ?)",
                    [`c_${uuidv4().substring(0, 8)}`, projectId, itemId, owner_id, commAmount, note || 'Nowa pozycja po akceptacji']
                );
            }
        } else if (status === 'ZAKOŃCZONY' && data.type === 'PRODUCT') {
            // Immediate EARNED commission and EARN cashback
            const turnoverRes = await query<any>(`
                SELECT COALESCE(SUM(i.amount_net), 0) as total
                FROM project_items i
                JOIN projects p ON i.project_id = p.id
                WHERE p.owner_id = ? AND i.type = 'PRODUCT' AND p.status = 'ZAKOŃCZONY'
            `, [owner_id]);
            const currentTurnover = Number(turnoverRes[0]?.total || 0) - data.amount_net; // Turnover BEFORE this new item

            const brackets = [
                { threshold: 10000, rate: 0.07 },
                { threshold: 50000, rate: 0.07 },
                { threshold: 120000, rate: 0.10 },
                { threshold: Infinity, rate: 0.14 },
            ];

            let rem = data.amount_net;
            let commAmount = 0;
            let tempTO = currentTurnover;
            for (const b of brackets) {
                if (rem <= 0) break;
                const bStart = b === brackets[0] ? 0 : brackets[brackets.indexOf(b) - 1].threshold;
                const capacity = b.threshold - Math.max(tempTO, bStart);
                if (capacity <= 0) continue;
                const portion = Math.min(rem, capacity);
                commAmount += portion * b.rate;
                rem -= portion;
                tempTO += portion;
            }

            if (commAmount > 0) {
                await query(
                    "INSERT INTO commissions (id, project_id, project_item_id, architect_id, amount_net, status, note) VALUES (?, ?, ?, ?, ?, 'EARNED', ?)",
                    [`c_${uuidv4().substring(0, 8)}`, projectId, itemId, owner_id, commAmount, note || 'Nowa pozycja po rozliczeniu']
                );
            }

            const cashbackAmount = data.amount_net * 0.02;
            if (cashbackAmount > 0) {
                const expiresAt = new Date();
                expiresAt.setFullYear(expiresAt.getFullYear() + 1);
                await query(
                    "INSERT INTO wallet_transactions (id, user_id, type, amount, related_item_id, description, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    [`t_${uuidv4().substring(0, 8)}`, owner_id, 'EARN', cashbackAmount, itemId, note || 'Cashback: nowa pozycja po rozliczeniu', expiresAt.toISOString()]
                );
            }
        }
    }

    revalidatePath(`/dashboard/admin/projects/${projectId}`);
    revalidatePath('/dashboard/admin');
    revalidatePath('/dashboard/wallet');

    return { success: true, itemId };
}

export async function deleteProjectItem(itemId: string, note?: string) {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'ADMIN') throw new Error("Unauthorized");

    const itemRes = await query<any>(`
        SELECT i.*, p.status, p.owner_id 
        FROM project_items i
        JOIN projects p ON i.project_id = p.id
        WHERE i.id = ?
    `, [itemId]);
    if (itemRes.length === 0) return { success: true };

    const item = itemRes[0];
    const projectId = item.project_id;
    const status = item.status;

    if (status === 'ZAKOŃCZONY') {
        // Adjust amount to 0 — generates correction entries for commission and cashback
        return await updateProjectItem(itemId, 0, note || 'Usunięcie pozycji (korekta do 0)');
    }

    // For other statuses, we can delete and also cleanup PENDING commissions
    await query("DELETE FROM commissions WHERE project_item_id = ? AND status = 'PENDING'", [itemId]);
    await query("DELETE FROM project_items WHERE id = ?", [itemId]);

    revalidatePath(`/dashboard/admin/projects/${projectId}`);
    revalidatePath('/dashboard/admin');

    return { success: true };
}

export async function assignProjectCaretaker(projectId: string, staffId: string | null) {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'STAFF')) {
        throw new Error("Unauthorized");
    }

    await query("UPDATE projects SET staff_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [staffId, projectId]);

    await logActivity(
        session.user.id,
        'PROJECT_CARETAKER_ASSIGNED',
        `Przypisano opiekuna (ID: ${staffId || 'BRAK'}) do projektu ${projectId}`,
        { projectId, staffId }
    );

    revalidatePath('/dashboard/admin');
    revalidatePath(`/dashboard/admin/projects/${projectId}`);
    return { success: true };
}

export async function getAllStaff() {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'STAFF')) {
        throw new Error("Unauthorized");
    }

    return await query<any>("SELECT id, name FROM users WHERE role IN ('ADMIN', 'STAFF') ORDER BY name ASC");
}

export async function updateProjectItemMeta(itemId: string, meta: {
    order_number?: string | null;
    invoice_number?: string | null;
    is_paid?: boolean;
}) {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'STAFF')) {
        throw new Error("Unauthorized");
    }

    const itemRes = await query<any>("SELECT project_id FROM project_items WHERE id = ?", [itemId]);
    if (itemRes.length === 0) throw new Error("Pozycja nie istnieje");
    const projectId = itemRes[0].project_id;

    await query(
        "UPDATE project_items SET order_number = ?, invoice_number = ?, is_paid = ? WHERE id = ?",
        [meta.order_number ?? null, meta.invoice_number ?? null, meta.is_paid ? 1 : 0, itemId]
    );

    revalidatePath(`/dashboard/admin/projects/${projectId}`);
    return { success: true };
}

export async function updatePayoutInvoiceNumber(payoutId: string, invoiceNumber: string) {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'STAFF')) {
        throw new Error("Unauthorized");
    }

    await query(
        "UPDATE payout_requests SET invoice_number = ? WHERE id = ?",
        [invoiceNumber.trim() || null, payoutId]
    );

    revalidatePath('/dashboard/admin');
    return { success: true };
}


export async function applyCashbackToProject(projectId: string, amount: number) {
    const session = await getServerSession(authOptions);
    if (!session) throw new Error("Unauthorized");

    // 1. Verify project ownership and status
    const projectRes = await query<any>("SELECT * FROM projects WHERE id = ? AND owner_id = ?", [projectId, session.user.id]);
    const project = projectRes[0];
    if (!project) throw new Error("Projekt nie został znaleziony lub brak uprawnień");

    if (project.status === 'ZAKOŃCZONY' || project.status === 'NIEZREALIZOWANY') {
        throw new Error("Nie można zastosować cashbacku do zakończonego lub odrzuconego projektu");
    }

    // 2. Spend the cashback
    await spendCashback(session.user.id, amount);

    // 3. Log activity
    await logActivity(session.user.id, 'PROJECT_CASHBACK_APPLIED', `Zastosowano cashback w wysokości ${amount} PLN do projektu ${projectId}`, { projectId, amount });

    revalidatePath(`/dashboard/projects/${projectId}`);
    revalidatePath('/dashboard/wallet');
    revalidatePath('/dashboard');

    return { success: true };
}
