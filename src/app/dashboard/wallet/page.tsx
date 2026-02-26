import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { getArchitectStats } from "@/lib/services";
import {
    ArrowDownCircle,
    ArrowUpCircle,
    History,
    Info,
    CreditCard,
    User,
    CheckCircle2,
    XCircle,
    AlertCircle,
    Loader2,
    Clock
} from 'lucide-react';
import CommissionPayoutButton from "@/components/CommissionPayoutButton";
import RedeemCashbackButton from "@/components/RedeemCashbackButton";
import MyDiscountCards from "@/components/MyDiscountCards";
import { getMyRedemptions } from "@/app/actions/cashback";
import { formatPLN } from "@/lib/utils";

export default async function WalletPage() {
    const session = await getServerSession(authOptions);
    if (!session) return null;

    const [stats, transactions, pendingPayout, redemptions] = await Promise.all([
        getArchitectStats(session.user.id),
        query<any>(
            "SELECT * FROM wallet_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 200",
            [session.user.id]
        ),
        query<any>(
            "SELECT id, amount, status, created_at FROM payout_requests WHERE architect_id = ? AND (status IN ('PENDING', 'IN_PAYMENT', 'HOLD') OR (status IN ('REJECTED', 'PAID') AND created_at >= datetime('now', '-90 days'))) ORDER BY created_at DESC",
            [session.user.id]
        ),
        getMyRedemptions()
    ]);

    const activePayout = pendingPayout.find((pr: any) => ['PENDING', 'IN_PAYMENT', 'HOLD'].includes(pr.status));
    const hasPendingRequest = !!activePayout;
    const isCommissionEligible = !hasPendingRequest && stats.earnedCommission >= 100;

    return (
        <div className="space-y-12 pb-20">
            {/* Main Stats: Wallet & Commissions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                {/* 1. Earned Commissions Card (Cash Payout) */}
                <div className="stat-card bg-emerald-500/5 border border-emerald-500/10 flex flex-col justify-between p-10 relative group">
                    <div className="absolute inset-0 overflow-hidden pointer-events-none">
                        <div className="absolute top-0 right-0 p-12 opacity-5 group-hover:opacity-10 transition-opacity text-emerald-500">
                            <ArrowDownCircle size={160} />
                        </div>
                    </div>
                    <div className="relative z-10">
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <p className="text-[10px] font-black text-emerald-500/70 uppercase tracking-[0.3em] mb-1 text-emerald-500">Prowizja Zarobiona (Gotówka)</p>
                                <h3 className="text-5xl font-black text-stone-900">{formatPLN(stats.earnedCommission)} <span className="text-xl font-bold ml-1">PLN</span></h3>
                            </div>
                            <div className={`p-4 rounded-2xl ${hasPendingRequest ? 'bg-blue-500/10 text-blue-600' : isCommissionEligible ? 'bg-emerald-500/10 text-emerald-500' : 'bg-black/5 text-stone-600'} border border-black/5`}>
                                {hasPendingRequest ? <Loader2 className="animate-spin" size={32} /> : isCommissionEligible ? <CheckCircle2 size={32} /> : <CreditCard size={32} />}
                            </div>
                        </div>

                        {hasPendingRequest ? (
                            <div className={`flex items-center gap-3 p-4 rounded-2xl border mb-8 ${activePayout.status === 'HOLD' ? 'bg-amber-500/5 border-amber-500/20' : 'bg-blue-500/5 border-blue-500/20'
                                }`}>
                                <AlertCircle size={16} className={activePayout.status === 'HOLD' ? 'text-amber-500' : 'text-blue-600'} />
                                <p className={`text-[10px] font-bold uppercase tracking-widest leading-relaxed ${activePayout.status === 'HOLD' ? 'text-amber-500' : 'text-blue-600'
                                    }`}>
                                    {activePayout.status === 'IN_PAYMENT'
                                        ? `Wypłata ${formatPLN(activePayout.amount)} PLN jest w trakcie realizacji.`
                                        : activePayout.status === 'HOLD'
                                            ? `Wniosek o wypłatę ${formatPLN(activePayout.amount)} PLN został wstrzymany.`
                                            : `Wniosek o wypłatę ${formatPLN(activePayout.amount)} PLN oczekuje na zatwierdzenie.`
                                    }
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-4 mb-8">
                                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
                                    <span className="text-stone-500">Próg wypłaty</span>
                                    <span className="text-stone-900">100 PLN</span>
                                </div>
                                <div className="w-full h-2 bg-black/5 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full ${isCommissionEligible ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-brand-primary'}`}
                                        style={{ width: `${Math.min((stats.earnedCommission / 100) * 100, 100)}%` }}
                                    ></div>
                                </div>
                            </div>
                        )}
                    </div>

                    <CommissionPayoutButton
                        isEligible={isCommissionEligible}
                        amount={stats.earnedCommission}
                        projectNames={stats.earnedProjects || []}
                    />
                </div>

                {/* 2. Cashback Card (Store Purchases) */}
                <div className="stat-card bg-card border border-black/5 flex flex-col justify-between p-10 relative group">
                    <div className="absolute inset-0 overflow-hidden pointer-events-none">
                        <div className="absolute top-0 right-0 p-12 opacity-5 group-hover:opacity-10 transition-opacity">
                            <History size={160} />
                        </div>
                    </div>
                    <div className="relative z-10">
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <p className="text-[10px] font-black text-stone-500 uppercase tracking-[0.3em] mb-1">Portfel Cashback</p>
                                <h3 className="text-5xl font-black text-stone-900 gold-text">{formatPLN(stats.cashbackBalance)} <span className="text-xl font-bold ml-1">PLN</span></h3>
                            </div>
                            <div className="p-4 rounded-2xl bg-brand-primary/10 text-brand-primary border border-brand-primary/20">
                                <Info size={32} />
                            </div>
                        </div>

                        <div className="flex items-center gap-3 p-4 rounded-2xl bg-black/5 border border-black/10 mb-8">
                            <Info size={16} className="text-stone-500" />
                            <p className="text-[10px] font-bold text-stone-500 uppercase tracking-widest leading-relaxed">
                                Wymień na karty rabatowe do sklepu WallDecor w panelu poniżej
                            </p>
                        </div>
                    </div>

                    <RedeemCashbackButton balance={stats.cashbackBalance} />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                {/* Transaction History */}
                <div className="lg:col-span-2 space-y-8">
                    <div className="flex items-center justify-between px-2">
                        <h3 className="text-xs font-black text-stone-500 uppercase tracking-[0.3em] flex items-center gap-3">
                            <span className="w-2 h-2 bg-brand-primary rounded-full"></span>
                            Historia Operacji
                        </h3>
                    </div>

                    <div className="space-y-4">
                        {/* Payout requests — shown at top of history */}
                        {pendingPayout.map((pr: any) => {
                            const isPending = pr.status === 'PENDING';
                            const isInPayment = pr.status === 'IN_PAYMENT';
                            const isHold = pr.status === 'HOLD';
                            const isRejected = pr.status === 'REJECTED';
                            const isPaid = pr.status === 'PAID';
                            return (
                                <div key={pr.id} className={`stat-card p-6 flex items-center border ${
                                    isPending   ? 'bg-blue-50/60 border-blue-100' :
                                    isInPayment ? 'bg-blue-50/60 border-blue-100' :
                                    isHold      ? 'bg-amber-50/60 border-amber-100' :
                                    isRejected  ? 'bg-red-50/60 border-red-100' :
                                    'bg-emerald-50/60 border-emerald-100'
                                }`}>
                                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mr-6 border ${
                                        isPending || isInPayment ? 'bg-blue-100 border-blue-200 text-blue-600' :
                                        isHold      ? 'bg-amber-100 border-amber-200 text-amber-600' :
                                        isRejected  ? 'bg-red-100 border-red-200 text-red-600' :
                                        'bg-emerald-100 border-emerald-200 text-emerald-600'
                                    }`}>
                                        {isPending   ? <Clock size={24} /> :
                                         isInPayment ? <Loader2 size={24} className="animate-spin" /> :
                                         isHold      ? <AlertCircle size={24} /> :
                                         isRejected  ? <XCircle size={24} /> :
                                         <CheckCircle2 size={24} />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className={`text-base font-black truncate ${
                                            isPending || isInPayment ? 'text-blue-700' :
                                            isHold     ? 'text-amber-700' :
                                            isRejected ? 'text-red-700' :
                                            'text-emerald-700'
                                        }`}>
                                            {isPending   ? 'Wniosek o wypłatę — oczekuje na zatwierdzenie' :
                                             isInPayment ? 'Wniosek o wypłatę — w realizacji' :
                                             isHold      ? 'Wniosek o wypłatę — wstrzymany' :
                                             isRejected  ? 'Wniosek o wypłatę — odrzucony' :
                                             'Wypłata zrealizowana'}
                                        </h4>
                                        <div className="text-[10px] text-stone-500 font-bold uppercase tracking-widest mt-1">
                                            {new Date(pr.created_at).toLocaleString('pl-PL')}
                                        </div>
                                    </div>
                                    <div className="text-right ml-4">
                                        <div className={`text-xl font-black ${isRejected ? 'text-red-500 line-through' : isPaid ? 'text-emerald-600' : 'text-stone-700'}`}>
                                            -{formatPLN(pr.amount)} PLN
                                        </div>
                                        <div className={`text-[9px] font-black uppercase tracking-widest mt-1 ${
                                            isPending   ? 'text-blue-500' :
                                            isInPayment ? 'text-blue-500' :
                                            isHold      ? 'text-amber-500' :
                                            isRejected  ? 'text-red-500' :
                                            'text-emerald-600'
                                        }`}>
                                            {isPending ? 'Oczekuje' : isInPayment ? 'W realizacji' : isHold ? 'Wstrzymany' : isRejected ? 'Odrzucony' : 'Wypłacono'}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        {transactions.length > 0 ? transactions.map((t: any) => (
                            <div key={t.id} className="stat-card bg-card p-6 flex items-center group hover:bg-stone-50 transition-all border border-black/5">
                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mr-6 border transition-transform group-hover:scale-105 ${t.type === 'EARN' || t.type === 'ADJUST' ? 'bg-emerald-50 border-emerald-800/50 text-emerald-500' :
                                    t.type === 'SPEND' ? 'bg-brand-primary/10 border-brand-primary/20 text-brand-primary' :
                                        'bg-red-50 border-red-800/50 text-red-600'
                                    }`}>
                                    {t.type === 'EARN' || t.type === 'ADJUST' ? <ArrowDownCircle size={24} /> : <ArrowUpCircle size={24} />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-3 mb-1">
                                        <h4 className="text-base font-black text-stone-900 truncate group-hover:gold-text transition-colors">
                                            {t.description || (t.type === 'EARN' ? 'Naliczenie Cashback' : t.type === 'ADJUST' ? 'Korekta salda' : 'Obciążenie konta')}
                                        </h4>
                                    </div>
                                    <div className="text-[10px] text-stone-600 font-bold uppercase tracking-widest">
                                        {new Date(t.created_at).toLocaleString('pl-PL')}
                                    </div>
                                </div>
                                <div className="text-right ml-4">
                                    <div className={`text-xl font-black ${t.type === 'EARN' || t.type === 'ADJUST' ? 'text-emerald-500' : 'text-stone-900'}`}>
                                        {t.type === 'EARN' || t.type === 'ADJUST' ? '+' : '-'}{formatPLN(t.amount)} PLN
                                    </div>
                                    {t.expires_at && (
                                        <div className="text-[9px] text-stone-700 font-bold uppercase mt-1 italic">
                                            Ważne do: {new Date(t.expires_at).toLocaleDateString()}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )) : (
                            <div className="stat-card bg-card py-20 text-center border border-black/5">
                                <p className="text-sm font-bold text-stone-600 uppercase tracking-widest">Brak zarejestrowanych operacji</p>
                            </div>
                        )}
                    </div>

                    {/* Discount Cards Section */}
                    <MyDiscountCards redemptions={redemptions} />
                </div>

                {/* Support & Regulation Sidebar */}
                <div className="space-y-8">
                    <div className="stat-card bg-card p-8 border border-black/5 flex flex-col justify-between min-h-[400px]">
                        <div>
                            <h4 className="text-[10px] font-black text-brand-primary uppercase tracking-[0.2em] mb-8 border-b border-black/5 pb-4">Zasady Programu</h4>
                            <div className="space-y-8">
                                <div className="flex gap-4">
                                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500 border border-emerald-500/20 shrink-0">
                                        <CheckCircle2 size={16} />
                                    </div>
                                    <div>
                                        <p className="text-xs font-black text-stone-900 uppercase tracking-widest mb-1">Naliczenie</p>
                                        <p className="text-[11px] text-stone-500 font-medium leading-relaxed">Prowizja naliczana jest automatycznie po opłaceniu zamówienia przez klienta.</p>
                                    </div>
                                </div>
                                <div className="flex gap-4">
                                    <div className="w-8 h-8 rounded-lg bg-black/5 flex items-center justify-center text-stone-500 border border-black/5 shrink-0">
                                        <Info size={16} />
                                    </div>
                                    <div>
                                        <p className="text-xs font-black text-stone-900 uppercase tracking-widest mb-1">Rozliczenia</p>
                                        <p className="text-[11px] text-stone-500 font-medium leading-relaxed">Wypłata środków możliwa jest po przedłożeniu faktury lub rachunku (min. 100 PLN).</p>
                                    </div>
                                </div>
                                <div className="flex gap-4">
                                    <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500 border border-amber-500/20 shrink-0">
                                        <AlertCircle size={16} />
                                    </div>
                                    <div>
                                        <p className="text-xs font-black text-stone-900 uppercase tracking-widest mb-1">Ważność</p>
                                        <p className="text-[11px] text-stone-500 font-medium leading-relaxed">Środki w Portfelu (Cashback) wygasają po 12 miesiącach od daty ich przyznania.</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>

                    <div className="stat-card bg-card p-8 border border-black/5">
                        <div className="flex items-center gap-4 p-4 rounded-2xl bg-black/5 border border-black/5 group hover:border-brand-primary/30 transition-all cursor-pointer">
                            <div className="w-12 h-12 rounded-xl bg-brand-primary/10 flex items-center justify-center text-brand-primary group-hover:bg-brand-primary/20 transition-all">
                                <User size={24} />
                            </div>
                            <div>
                                <p className="text-xs font-black text-stone-900 uppercase tracking-widest">Opiekun Finansowy</p>
                                <p className="text-[10px] text-stone-600 font-bold group-hover:text-stone-400 transition-all">finanse@walldecor.pl</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
