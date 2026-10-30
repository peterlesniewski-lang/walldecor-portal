'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, CardBody, CardHeader, InlineConfirm, PROJECT_STATUS, StatusPill } from '@/components/ui';
import { updateProjectStatus } from '@/app/actions/projects';
import { ErrorBanner } from './ErrorBanner';
import type { Project } from './types';

/** Macierz dozwolonych przejść statusu projektu. Pierwsza pozycja to naturalny krok naprzód. */
const NEXT_STATUSES: Record<string, { label: string; next: string; danger?: boolean }[]> = {
    ZGŁOSZONY: [
        { next: 'PRZYJĘTY', label: 'Akceptuj' },
        { next: 'NIEZREALIZOWANY', label: 'Odrzuć', danger: true },
    ],
    PRZYJĘTY: [
        { next: 'W_REALIZACJI', label: 'Rozpocznij realizację' },
        { next: 'NIEZREALIZOWANY', label: 'Odrzuć', danger: true },
    ],
    W_REALIZACJI: [
        { next: 'ZAKOŃCZONY', label: 'Zakończ projekt' },
        { next: 'NIEZREALIZOWANY', label: 'Odrzuć', danger: true },
    ],
};

interface Props {
    project: Project;
    canChangeStatus: boolean;
    /** Czy ten przycisk może być primary (na ekranie jest tylko jeden primary). */
    allowPrimary: boolean;
}

export default function ProjectStatusCard({ project, canChangeStatus, allowPrimary }: Props) {
    const router = useRouter();
    const [confirming, setConfirming] = useState<string | null>(null); // status czekający na potwierdzenie
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const transitions = NEXT_STATUSES[project.status] ?? [];

    const execute = async (next: string) => {
        setLoading(true);
        setError('');
        try {
            const result = await updateProjectStatus(project.id, next);
            setConfirming(null);
            setLoading(false);
            if (!result.success) {
                setError(result.error);
                return;
            }
            router.refresh();
        } catch (e: any) {
            setError(e.message || 'Błąd zmiany statusu.');
            setLoading(false);
            setConfirming(null);
        }
    };

    if (!canChangeStatus || transitions.length === 0) return null;

    const confirmingEntry = confirming ? transitions.find((t) => t.next === confirming) : null;

    return (
        <Card as="section">
            <CardHeader title="Status projektu" action={<StatusPill kind="project" status={project.status} />} />
            <CardBody className="space-y-4">
                {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}

                {confirming ? (
                    <InlineConfirm
                        question={<>Zmienić status na <strong>{PROJECT_STATUS[confirming]?.label ?? 'nowy'}</strong>?</>}
                        confirmLabel={confirmingEntry?.label ?? 'Potwierdź'}
                        danger={confirmingEntry?.danger}
                        loading={loading}
                        onConfirm={() => execute(confirming)}
                        onCancel={() => setConfirming(null)}
                    />
                ) : (
                    <div className="flex flex-wrap gap-3">
                        {transitions.map((t, i) => (
                            <Button
                                key={t.next}
                                variant={t.danger ? 'danger' : i === 0 && allowPrimary ? 'primary' : 'secondary'}
                                onClick={() => setConfirming(t.next)}
                            >
                                {t.label}
                            </Button>
                        ))}
                    </div>
                )}
            </CardBody>
        </Card>
    );
}
