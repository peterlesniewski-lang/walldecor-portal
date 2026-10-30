'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CornerDownRight } from 'lucide-react';
import { Button, Card, CardBody, CardHeader, InlineConfirm, StatusPill, formatDate } from '@/components/ui';
import { moveDocumentToProject } from '@/app/actions/subiekt';
import type { DocRow, ProjectDocChain, ProjectReconciliation } from '@/lib/subiekt/queries';
import { assignmentStatusEntry, formatDocAmount, formatDocDate, projectStatusLabel } from '@/lib/subiekt/labels';
import { ErrorBanner } from './ErrorBanner';
import { SELECT_SM_CLASS } from './styles';

export interface MoveTarget {
    id: string;
    name: string;
    status: string;
}

interface Props {
    chains: ProjectDocChain[];
    summary: { zkTotal: number; fsTotal: number; remainingToInvoice: number };
    /** Projekty tego samego architekta, do których można przenieść łańcuch (getMergeCandidates). */
    moveTargets: MoveTarget[];
    /** Przenoszenie łańcucha przelicza prowizje — canManageFinancialOperations z serwera. */
    canMoveDocuments: boolean;
    /** Uzgodnienia RESOLVED (Loop 5b) — linia „Faktury uzgodnione ręcznie …” przy łańcuchu. */
    resolved?: ProjectReconciliation[];
}

/** „Dokumenty Subiekt” projektu: łańcuchy ZK/FP → WZ/FS/KFS z kwotami, płatnością i sposobem przypisania. */
export default function SubiektDocumentsCard({ chains, summary, moveTargets, canMoveDocuments, resolved = [] }: Props) {
    if (chains.length === 0) return null;

    return (
        <Card as="section" className="overflow-hidden">
            <CardHeader
                title="Dokumenty Subiekt"
                action={
                    <span className="text-right text-[13px] tnum text-ink-2">
                        ZK: {formatDocAmount(summary.zkTotal)} · FS: {formatDocAmount(summary.fsTotal)} · do zafakturowania: {formatDocAmount(summary.remainingToInvoice)}
                    </span>
                }
            />
            <CardBody flush>
                <ol className="divide-y divide-border">
                    {chains.map((chain) => (
                        <li key={chain.rootExternalId} className="px-5 py-4">
                            {chain.root ? (
                                <DocLine doc={chain.root} />
                            ) : (
                                <p className="text-[13px] text-ink-3">Dokument źródłowy łańcucha (id {chain.rootExternalId}) nie należy do tego projektu.</p>
                            )}
                            {chain.children.length > 0 && (
                                <ul className="mt-2 space-y-2 border-l border-border pl-4 sm:ml-2">
                                    {chain.children.map((doc) => (
                                        <li key={doc.id} className="flex items-start gap-2">
                                            <CornerDownRight size={14} aria-hidden="true" className="mt-1 shrink-0 text-ink-3" />
                                            <DocLine doc={doc} />
                                        </li>
                                    ))}
                                </ul>
                            )}
                            {resolved.filter((r) => r.rootExternalId === chain.rootExternalId).map((r) => (
                                <p key={r.rootExternalId} className="mt-2 text-[13px] text-ink-2">
                                    Faktury uzgodnione ręcznie {formatDate(r.resolvedAt)}{r.resolvedByName ? ` przez ${r.resolvedByName}` : ''}{' · '}
                                    <a href="#zmiany-subiekt" className="font-semibold text-brass-ink underline-offset-2 hover:underline">historia</a>
                                </p>
                            ))}
                            {canMoveDocuments && chain.root && isMovableRoot(chain.root) && moveTargets.length > 0 && (
                                <MoveChain root={chain.root} targets={moveTargets} />
                            )}
                        </li>
                    ))}
                </ol>
            </CardBody>
        </Card>
    );
}

const isMovableRoot = (doc: DocRow) => (doc.type === 'ZK' || doc.type === 'FP') && doc.assignment_status !== 'IGNORED';

function DocLine({ doc }: { doc: DocRow }) {
    const assignment = assignmentStatusEntry(doc.assignment_status);
    return (
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
            <span className="font-semibold text-ink">{doc.number}</span>
            <span className="tnum text-ink-2">{formatDocDate(doc.issued_at)}</span>
            <span className="font-semibold tnum text-ink">{formatDocAmount(doc.net_total)}</span>
            {doc.type === 'FS' && (
                <StatusPill tone={doc.is_paid ? 'success' : 'neutral'}>{doc.is_paid ? 'zapłacona' : 'niezapłacona'}</StatusPill>
            )}
            <StatusPill tone={assignment.tone}>{assignment.label}</StatusPill>
        </div>
    );
}

function MoveChain({ root, targets }: { root: DocRow; targets: MoveTarget[] }) {
    const router = useRouter();
    const [targetId, setTargetId] = useState(targets[0]?.id ?? '');
    const [confirming, setConfirming] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const target = targets.find((t) => t.id === targetId) ?? targets[0] ?? null;

    const move = async () => {
        if (!target) return;
        setLoading(true);
        setError('');
        try {
            const result = await moveDocumentToProject(root.id, target.id);
            if (result.ok) router.refresh();
            else setError(result.error);
        } catch (e: unknown) {
            setError(e instanceof Error && e.message ? e.message : 'Nie udało się przenieść dokumentu.');
        } finally {
            setConfirming(false);
            setLoading(false);
        }
    };

    return (
        <div className="mt-3 space-y-2">
            {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}
            {confirming && target ? (
                <InlineConfirm
                    question={<>Przenieść <strong>{root.number}</strong> z dokumentami pochodnymi i ich pozycjami do „{target.name}”?</>}
                    confirmLabel="Przenieś"
                    cancelLabel="Anuluj"
                    loading={loading}
                    onConfirm={move}
                    onCancel={() => setConfirming(false)}
                />
            ) : (
                <div className="flex flex-wrap items-center gap-2">
                    <label className="text-[13px] font-semibold text-ink-2" htmlFor={`move-${root.id}`}>Przenieś do…</label>
                    <select
                        id={`move-${root.id}`}
                        value={target?.id ?? ''}
                        onChange={(e) => setTargetId(e.target.value)}
                        className={`${SELECT_SM_CLASS} w-72 max-w-full`}
                    >
                        {targets.map((t) => (
                            <option key={t.id} value={t.id}>{`${t.name} · ${projectStatusLabel(t.status)}`}</option>
                        ))}
                    </select>
                    <Button size="sm" variant="secondary" onClick={() => setConfirming(true)}>Przenieś</Button>
                </div>
            )}
        </div>
    );
}
