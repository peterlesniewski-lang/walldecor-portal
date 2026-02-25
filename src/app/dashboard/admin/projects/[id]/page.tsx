import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { notFound } from "next/navigation";
import {
    ArrowLeft,
    Building2,
    Receipt,
    Package,
    Wrench,
} from 'lucide-react';
import Link from 'next/link';
import AdminProjectDetailClient from './AdminProjectDetailClient';

const STATUS_COLORS: Record<string, string> = {
    ZGŁOSZONY: 'bg-blue-900/30 text-blue-600 border-blue-800/30',
    PRZYJĘTY: 'bg-emerald-900/30 text-emerald-600 border-emerald-800/30',
    W_REALIZACJI: 'bg-amber-100/30 text-amber-600 border-amber-800/30',
    ZAKOŃCZONY: 'bg-stone-200/30 text-stone-400 border-slate-600/30',
    NIEZREALIZOWANY: 'bg-red-50 text-red-600 border-red-800/30',
};

export default async function AdminProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'STAFF')) {
        return <div className="p-8">Brak uprawnień.</div>;
    }

    const isAdmin = session.user.role === 'ADMIN';
    const canChangeStatus = isAdmin || session.user.role === 'STAFF';

    // 1. Project + architect
    const projRes = await query<any>(`
        SELECT p.*, u.name as architect_name, u.id as architect_id
        FROM projects p
        LEFT JOIN users u ON p.owner_id = u.id
        WHERE p.id = ?
    `, [id]);
    if (projRes.length === 0) notFound();
    const project = projRes[0];

    // 2. Project items
    const items = await query<any>(
        "SELECT * FROM project_items WHERE project_id = ? ORDER BY type ASC",
        [id]
    );

    // 3. Commissions for this project
    const commissionsRes = await query<any>(`
        SELECT c.*, pi.category, pi.amount_net as item_amount
        FROM commissions c
        JOIN project_items pi ON c.project_item_id = pi.id
        WHERE c.project_id = ?
        ORDER BY c.status DESC
    `, [id]);

    const productItems = items.filter((i: any) => i.type === 'PRODUCT');
    const installationItems = items.filter((i: any) => i.type === 'INSTALLATION');
    const totalProduct = productItems.reduce((s: number, i: any) => s + Number(i.amount_net), 0);
    const totalInstallation = installationItems.reduce((s: number, i: any) => s + Number(i.amount_net), 0);
    const earnedComm = commissionsRes
        .filter((c: any) => c.status === 'EARNED')
        .reduce((s: number, c: any) => s + Number(c.amount_net), 0);
    const pendingComm = commissionsRes
        .filter((c: any) => c.status === 'PENDING')
        .reduce((s: number, c: any) => s + Number(c.amount_net), 0);

    return (
        <div className="space-y-10 pb-20">

            {/* Back */}
            <Link
                href="/dashboard/admin"
                className="inline-flex items-center gap-2 text-[10px] font-black text-stone-500 uppercase tracking-widest hover:text-stone-900 transition-all"
            >
                <ArrowLeft size={14} />
                Powrót do panelu admin
            </Link>

            {/* Header */}
            <div className="stat-card bg-gradient-to-br from-[#151518] to-[#0A0A0B] border border-black/5 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                <div className="flex items-center gap-6">
                    <div className="w-16 h-16 rounded-2xl bg-black/5 border border-black/10 flex items-center justify-center text-brand-primary">
                        <Building2 size={32} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-stone-900 mb-1">{project.name}</h1>
                        <div className="flex items-center gap-3 flex-wrap">
                            <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg border ${STATUS_COLORS[project.status] || 'bg-black/5 text-stone-500 border-black/10'}`}>
                                {project.status}
                            </span>
                            <span className="text-[10px] text-stone-500 font-bold">{project.client_label}</span>
                            <span className="text-stone-700">·</span>
                            <Link
                                href={`/dashboard/admin/architects/${project.architect_id}`}
                                className="text-[10px] text-stone-400 font-bold hover:text-brand-primary transition-all"
                            >
                                {project.architect_name}
                            </Link>
                            <span className="text-stone-700">·</span>
                            <span className="text-[10px] text-stone-600 font-bold">
                                {new Date(project.created_at).toLocaleDateString('pl-PL')}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Value summary */}
                <div className="text-right shrink-0">
                    <p className="text-3xl font-black gold-text leading-none">
                        {totalProduct.toLocaleString('pl-PL')}
                        <span className="text-[12px] text-stone-500 ml-1">PLN</span>
                    </p>
                    <p className="text-[10px] text-stone-600 font-bold mt-1">wartość produktów</p>
                </div>
            </div>

            {/* KPI strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'Produkty netto', value: `${totalProduct.toLocaleString('pl-PL')} PLN`, color: 'text-brand-primary', bg: 'bg-brand-primary/10', icon: Package },
                    { label: 'Montaż netto', value: `${totalInstallation.toLocaleString('pl-PL')} PLN`, color: 'text-stone-400', bg: 'bg-black/5', icon: Wrench },
                    { label: 'Prowizja earned', value: `${earnedComm.toLocaleString('pl-PL')} PLN`, color: 'text-emerald-600', bg: 'bg-emerald-50', icon: Receipt },
                    { label: 'Prowizja pending', value: `${pendingComm.toLocaleString('pl-PL')} PLN`, color: 'text-amber-600', bg: 'bg-amber-50', icon: Receipt },
                ].map((kpi, i) => (
                    <div key={i} className="stat-card bg-card border border-black/5 py-6">
                        <div className={`w-10 h-10 rounded-xl ${kpi.bg} flex items-center justify-center ${kpi.color} border border-black/5 mb-4`}>
                            <kpi.icon size={20} />
                        </div>
                        <p className="text-[9px] font-black text-stone-500 uppercase tracking-widest mb-1">{kpi.label}</p>
                        <p className="text-xl font-black text-stone-900 leading-tight">{kpi.value}</p>
                    </div>
                ))}
            </div>

            {/* Interactive section — client component */}
            <AdminProjectDetailClient
                project={project}
                items={items}
                commissions={commissionsRes}
                isAdmin={isAdmin}
                canChangeStatus={canChangeStatus}
            />
        </div>
    );
}
