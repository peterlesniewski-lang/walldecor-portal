// Program partnerski WallDecor — statusy, progi obrotu i stawki prowizji.
// Jedyne źródło prawdy dla stawek; żadna akcja nie powinna zaszywać procentu na stałe.

export type PartnerStatusId = 'PARTNER' | 'PARTNER_PLUS' | 'PARTNER_PREMIUM';

export interface PartnerTier {
    id: PartnerStatusId;
    label: string;
    rate: number;       // stawka prowizji, np. 0.10
    from: number;       // dolny próg obrotu netto kwalifikowanego (PLN)
    to: number;         // górny próg (Infinity dla najwyższego)
}

export const PARTNER_TIERS: PartnerTier[] = [
    { id: 'PARTNER', label: 'Partner', rate: 0.10, from: 0, to: 30000 },
    { id: 'PARTNER_PLUS', label: 'Partner Plus', rate: 0.12, from: 30000, to: 50000 },
    { id: 'PARTNER_PREMIUM', label: 'Partner Premium', rate: 0.15, from: 50000, to: Infinity },
];

export const CASHBACK_RATE = 0.02;

// Stare wartości tier_override (sprzed zmiany programu) mapowane na nowe statusy,
// żeby istniejące rekordy w users nie wymagały migracji danych.
const LEGACY_OVERRIDE_MAP: Record<string, PartnerStatusId> = {
    BEGINNER: 'PARTNER',
    SILVER: 'PARTNER',
    GOLD: 'PARTNER_PLUS',
    PLATINUM: 'PARTNER_PREMIUM',
};

export function normalizeStatusOverride(value: string | null | undefined): PartnerStatusId | null {
    if (!value) return null;
    if (PARTNER_TIERS.some(t => t.id === value)) return value as PartnerStatusId;
    return LEGACY_OVERRIDE_MAP[value] ?? null;
}

export function getTierById(id: PartnerStatusId): PartnerTier {
    return PARTNER_TIERS.find(t => t.id === id) ?? PARTNER_TIERS[0];
}

export function getTierForTurnover(turnover: number): PartnerTier {
    const t = Number(turnover) || 0;
    for (let i = PARTNER_TIERS.length - 1; i >= 0; i--) {
        if (t >= PARTNER_TIERS[i].from) return PARTNER_TIERS[i];
    }
    return PARTNER_TIERS[0];
}

export interface PartnerStatusInfo {
    status: PartnerStatusId;
    label: string;
    rate: number;
    isOverride: boolean;
    nextStatus: PartnerStatusId | null;
    nextLabel: string | null;
    nextThreshold: number | null;
    turnoverToNext: number;
    progress: number; // 0..1 w obrębie bieżącego przedziału
}

// Status partnera na podstawie obrotu kwalifikowanego; ręczny override admina ma pierwszeństwo
// i wpływa również na stawkę prowizji (nie tylko na wyświetlanie).
export function getPartnerStatusInfo(turnover: number, overrideValue?: string | null): PartnerStatusInfo {
    const override = normalizeStatusOverride(overrideValue);
    const tier = override ? getTierById(override) : getTierForTurnover(turnover);
    const t = Number(turnover) || 0;

    const idx = PARTNER_TIERS.findIndex(x => x.id === tier.id);
    const next = idx < PARTNER_TIERS.length - 1 ? PARTNER_TIERS[idx + 1] : null;

    const turnoverToNext = next ? Math.max(0, next.from - t) : 0;
    const progress = next
        ? Math.min(Math.max((t - tier.from) / Math.max(next.from - tier.from, 1), 0), 1)
        : 1;

    return {
        status: tier.id,
        label: tier.label,
        rate: tier.rate,
        isOverride: Boolean(override),
        nextStatus: next?.id ?? null,
        nextLabel: next?.label ?? null,
        nextThreshold: next?.from ?? null,
        turnoverToNext,
        progress,
    };
}

// Stawka prowizji dla danego obrotu kwalifikowanego (z uwzględnieniem override).
export function getCommissionRateForTurnover(turnover: number, overrideValue?: string | null): number {
    return getPartnerStatusInfo(turnover, overrideValue).rate;
}
