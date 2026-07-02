import { query } from "@/lib/db";
import { v4 as uuidv4 } from 'uuid';
import { walletBalanceSql } from "@/lib/walletSql";
import { getPartnerStatusInfo } from "@/lib/partnerProgram";

const IS_DEMO = process.env.DEMO_MODE === 'true';

export async function getArchitectStats(userId: string) {
    if (IS_DEMO) {
        return {
            earnedCommission: 1240,
            pendingCommission: 320,
            cashbackBalance: 840,
            activeProjects: 2,
            turnover: 15600,
            tier: 'PARTNER',
            tierLabel: 'Partner',
            commissionRate: 0.10,
            tierIsOverride: false,
            nextTier: 'PARTNER_PLUS',
            nextTierLabel: 'Partner Plus',
            turnoverToNext: 14400,
            tierProgress: 15600 / 30000,
            expiringSoon: { amount: 200, expires_at: new Date(Date.now() + 86400000 * 10).toISOString() },
            earnedProjects: ['Apartament Powiśle', 'Dom w Konstancinie']
        };
    }

    const earnedProjectsRes = await query<any>(`
        SELECT DISTINCT p.name 
        FROM projects p
        JOIN commissions c ON p.id = c.project_id
        WHERE c.architect_id = ? AND c.status = 'EARNED'
    `, [userId]);
    const earnedProjects = earnedProjectsRes.map((p: any) => p.name);

    const commissionsRes = await query<any>(`
        SELECT 
            COALESCE(SUM(CASE WHEN status = 'EARNED' THEN amount_net ELSE 0 END), 0) as earned,
            COALESCE(SUM(CASE WHEN status = 'PENDING' THEN amount_net ELSE 0 END), 0) as pending,
            COALESCE(SUM(CASE WHEN status = 'IN_PAYMENT' THEN amount_net ELSE 0 END), 0) as in_payment,
            COALESCE(SUM(CASE WHEN status = 'PAID' THEN amount_net ELSE 0 END), 0) as paid
        FROM commissions 
        WHERE architect_id = ?
    `, [userId]);

    const comm = commissionsRes[0] || { earned: 0, pending: 0, in_payment: 0, paid: 0 };
    const earnedCommission = comm.earned; // Still available to withdraw
    const pendingCommission = Number(comm.pending) + Number(comm.in_payment);
    const totalRealizedCommission = Number(comm.earned) + Number(comm.in_payment) + Number(comm.paid);

    const balanceRes = await query<any>(`SELECT (${walletBalanceSql('?')}) as balance`, [userId]);
    const cashbackBalance = Number(balanceRes[0]?.balance || 0);

    const projectsRes = await query<any>("SELECT COUNT(*) as count FROM projects WHERE owner_id = ? AND status != 'NIEZREALIZOWANY'", [userId]);
    const activeProjects = projectsRes[0].count;

    const turnoverRes = await query<any>(`
        SELECT COALESCE(SUM(i.amount_net), 0) as total
        FROM project_items i
        JOIN projects p ON i.project_id = p.id
        WHERE p.owner_id = ? AND i.type = 'PRODUCT' AND p.status = 'ZAKOŃCZONY'
    `, [userId]);
    const turnover = turnoverRes[0].total;

    // 5. Status partnerski (program: Partner 10% / Partner Plus 12% / Partner Premium 15%)
    // Ręczny override admina (tier_override) ma pierwszeństwo.
    const userRes = await query<any>("SELECT tier_override FROM users WHERE id = ?", [userId]);
    const partnerStatus = getPartnerStatusInfo(Number(turnover), userRes[0]?.tier_override);

    // 6. Expiring Cashback
    const expiringSoonRes = await query<any>(`
        SELECT amount, expires_at 
        FROM wallet_transactions 
        WHERE user_id = ? AND type = 'EARN' AND expires_at > NOW()
        ORDER BY expires_at ASC LIMIT 1
    `, [userId]);

    return {
        earnedCommission,
        pendingCommission,
        totalRealizedCommission,
        cashbackBalance,
        activeProjects,
        turnover,
        tier: partnerStatus.status,
        tierLabel: partnerStatus.label,
        commissionRate: partnerStatus.rate,
        tierIsOverride: partnerStatus.isOverride,
        nextTier: partnerStatus.nextStatus,
        nextTierLabel: partnerStatus.nextLabel,
        turnoverToNext: partnerStatus.turnoverToNext,
        tierProgress: partnerStatus.progress,
        expiringSoon: expiringSoonRes[0] || null,
        earnedProjects
    };
}

export async function getArchitectProjects(userId: string, role?: string) {
    if (IS_DEMO) {
        return [
            {
                id: 'p1',
                name: 'Apartament Powiśle',
                client_label: 'Jan Kowalski',
                status: 'ZAKOŃCZONY',
                total_value: 12000,
                created_at: new Date().toISOString()
            },
            {
                id: 'p2',
                name: 'Dom w Konstancinie',
                client_label: 'Rodzina Nowak',
                status: 'W_REALIZACJI',
                total_value: 45000,
                created_at: new Date().toISOString()
            }
        ];
    }

    const isAdmin = role === 'ADMIN' || role === 'STAFF';

    const projects = await query<any>(`
        SELECT
            p.*,
            u.name as architect_name,
            (SELECT SUM(amount_net) FROM project_items WHERE project_id = p.id) as total_value,
            (
                SELECT SUM(c.amount_net)
                FROM commissions c
                JOIN project_items i ON c.project_item_id = i.id
                WHERE i.project_id = p.id AND c.status IN ('EARNED', 'IN_PAYMENT', 'PAID')
            ) as commission_amount,
            (
                SELECT pr.invoice_url
                FROM commissions c
                JOIN payout_requests pr ON c.payout_id = pr.id
                WHERE c.project_id = p.id 
                LIMIT 1
            ) as invoice_url
        FROM projects p
        JOIN users u ON p.owner_id = u.id
        ${isAdmin ? '' : 'WHERE p.owner_id = ?'}
        ORDER BY p.created_at DESC
    `, isAdmin ? [] : [userId]);

    // Enhance with items and commissions for accordion view (bulk fetch to avoid N+1)
    if (projects.length > 0) {
        const ids = projects.map((p: any) => p.id);
        const placeholders = ids.map(() => '?').join(',');
        const [allItems, allCommissions] = await Promise.all([
            query<any>(`SELECT * FROM project_items WHERE project_id IN (${placeholders})`, ids),
            query<any>(`SELECT * FROM commissions WHERE project_id IN (${placeholders})`, ids),
        ]);
        for (const project of projects) {
            project.items = allItems.filter((i: any) => i.project_id === project.id);
            project.commissions = allCommissions.filter((c: any) => c.project_id === project.id);
        }
    }

    return projects;
}
export async function getProjectDetails(id: string) {
    if (IS_DEMO) {
        return {
            id,
            name: 'Apartament Powiśle',
            client_label: 'Jan Kowalski',
            status: 'W_REALIZACJI',
            created_at: new Date().toISOString(),
            items: [
                { id: 'i1', category: 'Tapety', description: 'Salon - ściana główna', amount_net: 4500, commission_rate: 0.15 },
                { id: 'i2', category: 'Sztukateria', description: 'Gzymsy w całym mieszkaniu', amount_net: 2800, commission_rate: 0.15 },
                { id: 'i3', category: 'Meble', description: 'Kanpa narożna i pufa', amount_net: 12000, commission_rate: 0.10 }
            ]
        };
    }
    const projects = await query<any>("SELECT * FROM projects WHERE id = ?", [id]);
    const project = projects[0];
    if (!project) return null;

    const items = await query<any>("SELECT * FROM project_items WHERE project_id = ?", [id]);
    project.items = items;

    // Get commissions for this project
    const commissions = await query<any>("SELECT * FROM commissions WHERE project_id = ?", [id]);
    project.commissions = commissions;

    // Get architect info
    const architect = await query<any>("SELECT name, email, role, studio_name, nip, address, bank_account FROM users WHERE id = ?", [project.owner_id]);
    project.architect = architect[0] || null;

    // Get payout request if any
    const payouts = await query<any>(`
        SELECT pr.* 
        FROM payout_requests pr
        JOIN commissions c ON pr.id = c.payout_id
        WHERE c.project_id = ?
        LIMIT 1
    `, [id]);
    project.payout = payouts[0] || null;

    return project;
}

export async function getAdminMetrics() {
    // 1. Turnover Net Commissionable (12m)
    const turnoverRes = await query<any>(`
        SELECT COALESCE(SUM(amount_net), 0) as total
        FROM project_items i
        JOIN projects p ON i.project_id = p.id
        WHERE i.type = 'PRODUCT'
        AND p.status = 'ZAKOŃCZONY'
        AND p.created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
    `);
    const turnover12m = turnoverRes[0].total;

    // 1b. Pipeline value — sum of PRODUCT items by active status
    const pipelineValueRes = await query<any>(`
        SELECT
            COALESCE(SUM(CASE WHEN p.status = 'W_REALIZACJI' THEN i.amount_net ELSE 0 END), 0) as in_progress_value,
            COALESCE(SUM(CASE WHEN p.status = 'ZGŁOSZONY'    THEN i.amount_net ELSE 0 END), 0) as submitted_value
        FROM project_items i
        JOIN projects p ON i.project_id = p.id
        WHERE i.type = 'PRODUCT'
    `);
    const inProgressValue = pipelineValueRes[0].in_progress_value;
    const submittedValue  = pipelineValueRes[0].submitted_value;

    // 2. Commissions: EARNED = available for payout; PENDING = not yet finalized; IN_PAYMENT = processing; PAID = done
    const commissionsEARNED = await query<any>(`
        SELECT COALESCE(SUM(amount_net), 0) as total
        FROM commissions
        WHERE status = 'EARNED'
    `);

    const commissionsPENDING = await query<any>(`
        SELECT COALESCE(SUM(amount_net), 0) as total
        FROM commissions
        WHERE status = 'PENDING'
    `);

    const commissionsINPAYMENT = await query<any>(`
        SELECT COALESCE(SUM(amount_net), 0) as total
        FROM commissions
        WHERE status = 'IN_PAYMENT'
    `);

    // 3. Wallet Stats (EARN entries excluded if expired; ADJUST always positive; everything else negative)
    const walletRes = await query<any>(`
        SELECT
            (${walletBalanceSql()}) as total_available,
            COALESCE(SUM(CASE WHEN type = 'EARN' AND expires_at BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 30 DAY) THEN amount ELSE 0 END), 0) as expiring_30d
        FROM wallet_transactions
    `);

    // 4. Partner Structure — tier counts based on cumulative PRODUCT turnover
    // tier_override takes precedence if set
    const architectsTurnoverRes = await query<any>(`
        SELECT
            u.id,
            u.tier_override,
            COALESCE((
                SELECT SUM(i.amount_net)
                FROM project_items i
                JOIN projects p ON i.project_id = p.id
                WHERE p.owner_id = u.id AND i.type = 'PRODUCT' AND p.status = 'ZAKOŃCZONY'
            ), 0) as turnover
        FROM users u
        WHERE u.role = 'ARCHI'
    `);

    const getTier = (a: any): string =>
        getPartnerStatusInfo(Number(a.turnover), a.tier_override).status;

    const tierCounts = {
        partner: architectsTurnoverRes.filter((a: any) => getTier(a) === 'PARTNER').length,
        partnerPlus: architectsTurnoverRes.filter((a: any) => getTier(a) === 'PARTNER_PLUS').length,
        partnerPremium: architectsTurnoverRes.filter((a: any) => getTier(a) === 'PARTNER_PREMIUM').length,
    };

    // 5. Operational Alerts
    const alertsRes = await query<any>(`
        SELECT
            (SELECT COUNT(*) FROM projects WHERE staff_id IS NULL AND status != 'NIEZREALIZOWANY') as without_caretaker,
            (SELECT COUNT(*) FROM projects WHERE updated_at < DATE_SUB(NOW(), INTERVAL 14 DAY) AND status NOT IN ('ZAKOŃCZONY', 'NIEZREALIZOWANY')) as stale_projects
    `);

    // 6. Payout Forecast — partners eligible or near-eligible with no pending payout request
    const forecastRes = await query<any>(`
        SELECT
            u.name,
            wt_summary.user_id,
            wt_summary.wallet_balance
        FROM (
            SELECT
                u.id as user_id,
                (${walletBalanceSql('u.id')}) as wallet_balance
            FROM users u
            WHERE u.role = 'ARCHI'
        ) wt_summary
        JOIN users u ON wt_summary.user_id = u.id
        LEFT JOIN payout_requests pr
            ON wt_summary.user_id = pr.architect_id AND pr.status = 'PENDING'
        WHERE pr.id IS NULL
          AND wt_summary.wallet_balance >= 150
    `);

    const payoutForecast = {
        eligible: forecastRes.filter((r: any) => Number(r.wallet_balance) >= 300).map((r: any) => ({ name: r.name, balance: r.wallet_balance })),
        nearEligible: forecastRes.filter((r: any) => Number(r.wallet_balance) >= 150 && Number(r.wallet_balance) < 300).map((r: any) => ({ name: r.name, balance: r.wallet_balance })),
        eligibleCount: forecastRes.filter((r: any) => Number(r.wallet_balance) >= 300).length,
        nearEligibleCount: forecastRes.filter((r: any) => Number(r.wallet_balance) >= 150 && Number(r.wallet_balance) < 300).length,
        forecastTotal: forecastRes
            .filter((r: any) => Number(r.wallet_balance) >= 300)
            .reduce((acc: number, r: any) => acc + Number(r.wallet_balance), 0)
    };

    // 7. Project pipeline stats
    const projectStatsRes = await query<any>(`
        SELECT
            COUNT(*) as total,
            SUM(CASE WHEN status = 'ZAKOŃCZONY'      THEN 1 ELSE 0 END) as completed,
            SUM(CASE WHEN status = 'NIEZREALIZOWANY'  THEN 1 ELSE 0 END) as rejected,
            SUM(CASE WHEN status = 'W_REALIZACJI'    THEN 1 ELSE 0 END) as in_progress,
            SUM(CASE WHEN status = 'PRZYJĘTY'        THEN 1 ELSE 0 END) as accepted,
            SUM(CASE WHEN status = 'ZGŁOSZONY'       THEN 1 ELSE 0 END) as submitted
        FROM projects
    `);
    const ps = projectStatsRes[0];
    const activeProjects = Number(ps.total) - Number(ps.rejected);
    const projectStats = {
        total: Number(ps.total),
        completed: Number(ps.completed),
        rejected: Number(ps.rejected),
        inProgress: Number(ps.in_progress),
        accepted: Number(ps.accepted),
        submitted: Number(ps.submitted),
        conversionRate: activeProjects > 0
            ? Math.round(Number(ps.completed) / activeProjects * 100)
            : 0
    };

    return {
        turnover12m,
        commissions: {
            earned: commissionsEARNED[0].total,
            pendingApproval: commissionsPENDING[0].total,
            inPayment: commissionsINPAYMENT[0].total,
            total: Number(commissionsEARNED[0].total) + Number(commissionsPENDING[0].total) + Number(commissionsINPAYMENT[0].total)
        },
        wallet: {
            totalAvailable: walletRes[0].total_available,
            expiring30d: walletRes[0].expiring_30d
        },
        tiers: tierCounts,
        alerts: {
            withoutCaretaker: alertsRes[0].without_caretaker,
            staleProjects: alertsRes[0].stale_projects
        },
        payoutForecast,
        projects: projectStats,
        pipeline: {
            inProgressValue,
            submittedValue,
        }
    };
}


export async function getUserById(id: string) {
    const res = await query<any>("SELECT * FROM users WHERE id = ?", [id]);
    return res.length > 0 ? res[0] : null;
}

export async function logActivity(userId: string | null, eventType: string, description: string, metadata?: any) {
    const id = `act_${uuidv4().replace(/-/g, '').substring(0, 12)}`;
    await query(
        "INSERT INTO activity_logs (id, user_id, event_type, description, metadata) VALUES (?, ?, ?, ?, ?)",
        [id, userId, eventType, description, metadata ? JSON.stringify(metadata) : null]
    );
}

export async function getAdminActivity(limit = 20) {
    const parsedLimit = Number(limit);
    const safeLimit = Number.isFinite(parsedLimit)
        ? Math.min(Math.max(Math.trunc(parsedLimit), 1), 100)
        : 20;

    return await query<any>(`
        SELECT a.*, u.name as user_name
        FROM activity_logs a
        LEFT JOIN users u ON a.user_id = u.id
        ORDER BY a.created_at DESC
        LIMIT ${safeLimit}
    `);
}
