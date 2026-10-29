'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Banner, Button, InlineConfirm, PROJECT_STATUS, StatusPill } from '@/components/ui';
import { applySuggestedStatus } from '@/app/actions/subiekt';
import { ErrorBanner } from './ErrorBanner';

interface Props {
    projectId: string;
    /** Status wyliczony z dokumentów Subiekta (computeSuggestedStatus), różny od bieżącego i osiągalny. */
    suggested: string;
    /** Czy użytkownik może zastosować status (canManageOperationalProjects, z serwera). */
    canApply: boolean;
}

/** Baner „Sugerowany status” na stronie projektu: dokumenty podpowiadają, admin stosuje (decyzja biznesowa 5). */
export default function SuggestedStatusBanner({ projectId, suggested, canApply }: Props) {
    const router = useRouter();
    const [confirming, setConfirming] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const apply = async () => {
        setLoading(true);
        setError('');
        try {
            await applySuggestedStatus(projectId);
            setConfirming(false);
            router.refresh();
        } catch (e: unknown) {
            setError(e instanceof Error && e.message ? e.message : 'Nie udało się zmienić statusu.');
            setConfirming(false);
        } finally {
            setLoading(false);
        }
    };

    const label = PROJECT_STATUS[suggested]?.label ?? suggested;

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
