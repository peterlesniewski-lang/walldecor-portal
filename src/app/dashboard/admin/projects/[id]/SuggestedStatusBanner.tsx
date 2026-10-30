'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Banner, Button, InlineConfirm, StatusPill } from '@/components/ui';
import type { SuggestedStatusReason } from '@/lib/subiekt/status';
import { applySuggestedStatus } from '@/app/actions/subiekt';
import { projectStatusLabel } from '@/lib/subiekt/labels';
import { ErrorBanner } from './ErrorBanner';

const PARTIAL_HINT = 'Status mógł zmienić się częściowo — sprawdź kartę statusu.';

interface Props {
    projectId: string;
    /** Status wyliczony z dokumentów Subiekta (getSuggestedStatus), różny od bieżącego i osiągalny; null = brak zmiany. */
    suggested: string | null;
    /** RECONCILE_OPEN: otwarte uzgodnienie faktur — zakończenie zablokowane do zapisu karty uzgodnienia (Loop 5b). */
    reason?: SuggestedStatusReason | null;
    /** Czy użytkownik może zastosować status (canManageOperationalProjects, z serwera). */
    canApply: boolean;
}

/** Baner „Sugerowany status” na stronie projektu: dokumenty podpowiadają, admin stosuje (decyzja biznesowa 5). */
export default function SuggestedStatusBanner({ projectId, suggested, reason, canApply }: Props) {
    const router = useRouter();
    const [confirming, setConfirming] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const apply = async () => {
        setLoading(true);
        setError('');
        try {
            const result = await applySuggestedStatus(projectId);
            if (!result.ok) setError(`${result.error} ${PARTIAL_HINT}`);
        } catch (e: unknown) {
            setError(`${e instanceof Error && e.message ? e.message : 'Nie udało się zmienić statusu.'} ${PARTIAL_HINT}`);
        } finally {
            // Także po błędzie: kroki statusu nie są jedną transakcją, więc część mogła się już zapisać.
            setConfirming(false);
            setLoading(false);
            router.refresh();
        }
    };

    const blocked = reason === 'RECONCILE_OPEN';

    // Otwarte uzgodnienie, a podpowiedź nie zmienia statusu: tylko powód blokady, bez przycisku.
    if (!suggested) {
        return blocked ? (
            <Banner tone="warning" title="Najpierw uzgodnij faktury z zamówieniem">
                Faktury z Subiekta nie zgadzają się z zamówieniem. Projekt można zakończyć po zapisaniu karty „Uzgodnij faktury z zamówieniem” poniżej.
            </Banner>
        ) : null;
    }

    const label = projectStatusLabel(suggested);

    return (
        <div className="space-y-3">
            <Banner
                tone="info"
                title={
                    <span className="inline-flex flex-wrap items-center gap-2">
                        Na podstawie dokumentów Subiekt sugerowany status:
                        <StatusPill kind="project" status={suggested} />
                    </span>
                }
                action={
                    canApply && !confirming ? (
                        <Button size="sm" variant="secondary" onClick={() => setConfirming(true)}>
                            Zastosuj
                        </Button>
                    ) : undefined
                }
            >
                {blocked && (
                    <span className="mb-1 block font-semibold text-warning">
                        Najpierw uzgodnij faktury z zamówieniem — dopiero potem projekt będzie można zakończyć.
                    </span>
                )}
                {confirming ? (
                    <InlineConfirm
                        className="mt-2"
                        question={<>Zmienić status projektu na <strong>{label}</strong>?</>}
                        confirmLabel="Zastosuj"
                        cancelLabel="Anuluj"
                        loading={loading}
                        onConfirm={apply}
                        onCancel={() => setConfirming(false)}
                    />
                ) : (
                    'Status zmieni się dopiero po zatwierdzeniu, tak samo jak przy ręcznej zmianie (prowizje, finalizacja).'
                )}
            </Banner>
            {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}
        </div>
    );
}
