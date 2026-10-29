'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, CardBody, CardHeader, InlineConfirm, StatusPill, formatPLN } from '@/components/ui';
import { mergeProjects } from '@/app/actions/subiekt';
import { ErrorBanner } from './ErrorBanner';

interface Candidate {
    id: string;
    name: string;
    status: string;
    itemsTotal: number;
}

interface Props {
    projectId: string;
    /** getMergeCandidates: ten sam architekt, poza ZAKOŃCZONY / NIEZREALIZOWANY. */
    candidates: Candidate[];
}

/** „Połącz projekty” (tylko ADMIN — rodzic renderuje kartę po canManageFinancialOperations). */
export default function MergeProjectsCard({ projectId, candidates }: Props) {
    const router = useRouter();
    const [selected, setSelected] = useState<string[]>([]);
    const [confirming, setConfirming] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    if (candidates.length === 0) return null;

    // Po odświeżeniu część kandydatów może zniknąć — liczymy tylko te, które wciąż są na liście.
    const chosen = candidates.filter((c) => selected.includes(c.id));
    const chosenTotal = chosen.reduce((sum, c) => sum + c.itemsTotal, 0);

    const toggle = (id: string) =>
        setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

    const merge = async () => {
        setLoading(true);
        setError('');
        try {
            const result = await mergeProjects(projectId, chosen.map((c) => c.id));
            if (result.ok) {
                setSelected([]);
                router.refresh();
            } else {
                setError(result.error);
            }
        } catch (e: unknown) {
            setError(e instanceof Error && e.message ? e.message : 'Nie udało się połączyć projektów.');
        } finally {
            setConfirming(false);
            setLoading(false);
        }
    };

    return (
        <Card as="section">
            <CardHeader title="Połącz projekty" />
            <CardBody className="space-y-4">
                <p className="text-sm text-ink-2">Projekty tego samego architekta, które można dołączyć do tego projektu.</p>
                {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}
                <ul className="divide-y divide-border rounded-sm border border-border">
                    {candidates.map((c) => (
                        <li key={c.id}>
                            <label className="flex cursor-pointer items-center has-[:disabled]:cursor-default gap-3 px-4 py-3 text-sm hover:bg-surface-2">
                                <input
                                    type="checkbox"
                                    checked={selected.includes(c.id)}
                                    onChange={() => toggle(c.id)}
                                    disabled={loading || confirming}
                                    className="h-4 w-4 accent-brass-ink"
                                />
                                <span className="min-w-0 flex-1 font-semibold text-ink">{c.name}</span>
                                <StatusPill kind="project" status={c.status} />
                                <span className="w-32 text-right tnum text-ink-2">{formatPLN(c.itemsTotal)}</span>
                            </label>
                        </li>
                    ))}
                </ul>
                {confirming ? (
                    <InlineConfirm
                        question={
                            <>
                                Połączyć do tego projektu: {chosen.map((c, i) => (
                                    <span key={c.id}>{i > 0 && ', '}<strong>„{c.name}”</strong></span>
                                ))} (pozycje razem {formatPLN(chosenTotal)})? Projekty źródłowe zostaną usunięte, ich pozycje, dokumenty, pliki i prowizje trafią do tego projektu.
                            </>
                        }
                        confirmLabel="Połącz"
                        cancelLabel="Anuluj"
                        danger
                        loading={loading}
                        onConfirm={merge}
                        onCancel={() => setConfirming(false)}
                    />
                ) : (
                    <div className="flex flex-wrap items-center gap-3">
                        <Button variant="secondary" disabled={chosen.length === 0} onClick={() => setConfirming(true)}>
                            Połącz do tego projektu
                        </Button>
                        {chosen.length > 0 && (
                            <span className="text-sm tnum text-ink-2">
                                Wybrano {chosen.length} · pozycje {formatPLN(chosenTotal)}
                            </span>
                        )}
                    </div>
                )}
            </CardBody>
        </Card>
    );
}
