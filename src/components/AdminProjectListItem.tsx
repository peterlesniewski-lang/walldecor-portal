'use client';

import React, { useState } from 'react';
import { Building2 } from 'lucide-react';
import { updateProjectStatus } from '@/app/actions/projects';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Banner, Button, Card, InlineConfirm, formatNumber } from '@/components/ui';

interface AdminProjectListItemProps {
    project: any;
}

export default function AdminProjectListItem({ project }: AdminProjectListItemProps) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    // null | 'PRZYJĘTY' | 'NIEZREALIZOWANY'
    const [confirming, setConfirming] = useState<string | null>(null);

    const handleConfirm = async () => {
        if (!confirming) return;
        setLoading(true);
        setError('');
        try {
            const result = await updateProjectStatus(project.id, confirming);
            if (!result.success) {
                setError(result.error);
                setConfirming(null);
                return;
            }
            router.refresh();
        } catch (err: any) {
            console.error(err);
            setError('Nie udało się zmienić statusu projektu. Spróbuj ponownie.');
            setConfirming(null);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card className="px-5 py-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex min-w-0 items-center gap-4">
                    <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brass-soft text-brass-ink">
                        <Building2 size={18} />
                    </span>
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <Link
                                href={`/dashboard/admin/projects/${project.id}`}
                                className="truncate font-semibold text-ink hover:underline hover:underline-offset-2"
                            >
                                {project.name}
                            </Link>
                            <span className="max-w-[140px] truncate font-mono text-[13px] text-ink-3">{project.id}</span>
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-ink-2">
                            <span>{project.architect_name}</span>
                            <span>
                                <span className="font-display text-lg tnum text-ink">{formatNumber(project.total_value)}</span>
                                <small className="ml-1 text-xs text-ink-3">PLN</small>
                            </span>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 md:justify-end">
                    {confirming ? (
                        <InlineConfirm
                            question={confirming === 'PRZYJĘTY' ? 'Zaakceptować projekt?' : 'Odrzucić projekt?'}
                            confirmLabel={confirming === 'PRZYJĘTY' ? 'Zaakceptuj' : 'Odrzuć'}
                            cancelLabel="Anuluj"
                            danger={confirming !== 'PRZYJĘTY'}
                            loading={loading}
                            onConfirm={handleConfirm}
                            onCancel={() => setConfirming(null)}
                        />
                    ) : (
                        <>
                            <Button variant="danger" size="sm" onClick={() => setConfirming('NIEZREALIZOWANY')}>
                                Odrzuć
                            </Button>
                            <Button size="sm" onClick={() => setConfirming('PRZYJĘTY')}>
                                Zaakceptuj
                            </Button>
                        </>
                    )}
                </div>
            </div>
            {error && (
                <Banner tone="danger" className="mt-3">{error}</Banner>
            )}
        </Card>
    );
}
