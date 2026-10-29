'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, CardBody, CardHeader, EmptyState, InlineConfirm, PROJECT_STATUS, StatusPill, formatPLN } from '@/components/ui';
import { assignDocumentToProject, createProjectFromDocument, ignoreDocument } from '@/app/actions/subiekt';
import type { AssignableProject, CandidateProject, UnassignedDocRow } from '@/lib/subiekt/queries';
import { assignmentReasonLabel, formatDocDate } from '@/lib/subiekt/labels';
import { ErrorBanner } from '../../projects/[id]/ErrorBanner';
import { INPUT_CLASS, LABEL_CLASS, ROW_CLASS, SELECT_SM_CLASS, TD_CLASS, TH_CLASS } from '../../projects/[id]/styles';

interface ArchitectOption {
    id: string;
    name: string;
    subiekt_code: string | null;
}

interface Props {
    documents: UnassignedDocRow[];
    architects: ArchitectOption[];
    /** Projekty dla dokumentów bez architekta (wszystkie poza NIEZREALIZOWANY). */
    assignableProjects: AssignableProject[];
}

/** Pole tekstowe: INPUT_CLASS ze stałą wysokością 40 px zamienioną na minimalną. */
const TEXTAREA_CLASS = `${INPUT_CLASS.replace('h-10', 'min-h-16')} py-2`;
const statusLabel = (status: string) => PROJECT_STATUS[status]?.label ?? status;

/** Skrzynka „Nieprzypisane dokumenty”: przypisz do projektu, utwórz projekt albo zignoruj. */
export default function SubiektInboxClient({ documents, architects, assignableProjects }: Props) {
    return (
        <Card as="section" className="overflow-hidden">
            <CardHeader
                title="Nieprzypisane dokumenty"
                action={documents.length > 0 ? <StatusPill tone="warning">{documents.length}</StatusPill> : undefined}
            />
            {documents.length === 0 ? (
                <CardBody>
                    <EmptyState
                        title="Skrzynka jest pusta"
                        description="Wszystkie dokumenty z Subiekta są przypisane do projektów albo zignorowane."
                    />
                </CardBody>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[1120px] border-collapse text-sm">
                        <thead>
                            <tr>
                                <th scope="col" className={TH_CLASS}>Dokument</th>
                                <th scope="col" className={TH_CLASS}>Data</th>
                                <th scope="col" className={TH_CLASS}>Kontrahent</th>
                                <th scope="col" className={`${TH_CLASS} text-right`}>Netto</th>
                                <th scope="col" className={TH_CLASS}>Architekt</th>
                                <th scope="col" className={TH_CLASS}>Powód</th>
                                <th scope="col" className={TH_CLASS}>Akcje</th>
                            </tr>
                        </thead>
                        <tbody>
                            {documents.map((doc) => (
                                <InboxRow
                                    key={doc.id}
                                    doc={doc}
                                    architects={architects}
                                    projects={doc.architect_id ? doc.candidateProjects : assignableProjects}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Card>
    );
}

type Panel = 'assign' | 'create' | 'ignore' | null;

function projectLabel(project: CandidateProject | AssignableProject): string {
    const owner = 'owner_name' in project && project.owner_name ? ` · ${project.owner_name}` : '';
    return `${project.name}${owner} · ${statusLabel(project.status)}`;
}

function InboxRow({
    doc,
    architects,
    projects,
}: {
    doc: UnassignedDocRow;
    architects: ArchitectOption[];
    projects: Array<CandidateProject | AssignableProject>;
}) {
    const router = useRouter();
    const [panel, setPanel] = useState<Panel>(null);
    const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
    const [ownerId, setOwnerId] = useState(doc.architect_id ?? '');
    const [note, setNote] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Po odświeżeniu lista projektów może się zmienić — wtedy wybór wraca do pierwszego z listy.
    const selectedProject = projects.find((p) => p.id === projectId) ?? projects[0] ?? null;
    const architectLabel = doc.architect_name ?? doc.architect_code ?? '—';

    const open = (next: Panel) => {
        setError('');
        setPanel(next);
    };
    const close = () => {
        setPanel(null);
        setNote('');
        setError('');
    };

    const run = async (action: () => Promise<unknown>, fallback: string) => {
        setLoading(true);
        setError('');
        try {
            await action();
            setPanel(null);
            router.refresh();
        } catch (e: unknown) {
            setError(e instanceof Error && e.message ? e.message : fallback);
        } finally {
            setLoading(false);
        }
    };

    const doAssign = () => {
        if (!selectedProject) {
            setError('Wybierz projekt.');
            return;
        }
        return run(() => assignDocumentToProject(doc.id, selectedProject.id), 'Nie udało się przypisać dokumentu.');
    };

    const doCreate = () => {
        if (!ownerId) {
            setError('Wybierz architekta.');
            return;
        }
        return run(() => createProjectFromDocument(doc.id, ownerId), 'Nie udało się utworzyć projektu.');
    };

    const doIgnore = () => {
        if (!note.trim()) {
            setError('Podaj powód zignorowania.');
            return;
        }
        return run(() => ignoreDocument(doc.id, note.trim()), 'Nie udało się zignorować dokumentu.');
    };

    const ownerName = architects.find((a) => a.id === ownerId)?.name ?? doc.architect_name ?? 'architekta';

    return (
        <>
            <tr className={ROW_CLASS}>
                <td className={TD_CLASS}>
                    <div className="whitespace-nowrap font-semibold text-ink">{doc.number}</div>
                    <div className="mt-0.5 text-xs text-ink-3">{doc.type} · id {doc.external_id}</div>
                </td>
                <td className={`${TD_CLASS} whitespace-nowrap tnum text-ink-2`}>{formatDocDate(doc.issued_at)}</td>
                <td className={`${TD_CLASS} max-w-[200px]`}>{doc.contractor_name || '—'}</td>
                <td className={`${TD_CLASS} whitespace-nowrap text-right font-semibold tnum text-ink`}>{formatPLN(doc.net_total)}</td>
                <td className={`${TD_CLASS} text-ink-2`}>{architectLabel}</td>
                <td className={TD_CLASS}>
                    <StatusPill tone="warning">{assignmentReasonLabel(doc.assignment_note)}</StatusPill>
                </td>
                <td className={TD_CLASS}>
                    <div className="flex flex-wrap items-center gap-2">
                        {projects.length > 0 ? (
                            <>
                                <label className="sr-only" htmlFor={`assign-${doc.id}`}>Projekt dla {doc.number}</label>
                                <select
                                    id={`assign-${doc.id}`}
                                    value={selectedProject?.id ?? ''}
                                    onChange={(e) => setProjectId(e.target.value)}
                                    disabled={loading}
                                    className={`${SELECT_SM_CLASS} w-60`}
                                >
                                    {projects.map((p) => (
                                        <option key={p.id} value={p.id}>{projectLabel(p)}</option>
                                    ))}
                                </select>
                                <Button size="sm" variant="secondary" disabled={loading} onClick={() => open('assign')}>
                                    Przypisz
                                </Button>
                            </>
                        ) : (
                            <span className="text-xs text-ink-3">Architekt nie ma projektów</span>
                        )}
                        {doc.can_create_project && (
                            <Button size="sm" variant="secondary" disabled={loading} onClick={() => open('create')}>
                                Nowy projekt
                            </Button>
                        )}
                        <Button size="sm" variant="ghost" disabled={loading} onClick={() => open('ignore')}>
                            Ignoruj
                        </Button>
                    </div>
                </td>
            </tr>

            {(panel || error) && (
                <tr className="border-t border-border bg-surface-2">
                    <td colSpan={7} className="space-y-3 px-4 py-4">
                        {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}

                        {panel === 'assign' && selectedProject && (
                            <InlineConfirm
                                question={<>Przypisać <strong>{doc.number}</strong> do projektu „{selectedProject.name}”?</>}
                                confirmLabel="Przypisz"
                                cancelLabel="Anuluj"
                                loading={loading}
                                onConfirm={doAssign}
                                onCancel={close}
                            />
                        )}

                        {panel === 'create' && (
                            <div className="flex flex-wrap items-end gap-3">
                                {!doc.architect_id && (
                                    <div className="w-72">
                                        <label className={LABEL_CLASS} htmlFor={`owner-${doc.id}`}>Architekt projektu</label>
                                        <select
                                            id={`owner-${doc.id}`}
                                            value={ownerId}
                                            onChange={(e) => setOwnerId(e.target.value)}
                                            disabled={loading}
                                            className={INPUT_CLASS}
                                        >
                                            <option value="">Wybierz architekta…</option>
                                            {architects.map((a) => (
                                                <option key={a.id} value={a.id}>
                                                    {a.subiekt_code ? `${a.name} (${a.subiekt_code})` : a.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                                <InlineConfirm
                                    question={
                                        ownerId
                                            ? <>Utworzyć nowy projekt dla <strong>{ownerName}</strong> z dokumentu {doc.number}?</>
                                            : <>Wybierz architekta, potem utwórz projekt z {doc.number}.</>
                                    }
                                    confirmLabel="Utwórz projekt"
                                    cancelLabel="Anuluj"
                                    loading={loading}
                                    onConfirm={doCreate}
                                    onCancel={close}
                                />
                            </div>
                        )}

                        {panel === 'ignore' && (
                            <div className="flex flex-wrap items-end gap-3">
                                <div className="min-w-[260px] flex-1">
                                    <label className={LABEL_CLASS} htmlFor={`ignore-${doc.id}`}>Powód zignorowania (wymagany)</label>
                                    <textarea
                                        id={`ignore-${doc.id}`}
                                        value={note}
                                        onChange={(e) => setNote(e.target.value)}
                                        maxLength={500}
                                        rows={2}
                                        placeholder="np. dokument testowy, sprzedaż bez architekta"
                                        className={TEXTAREA_CLASS}
                                        autoFocus
                                    />
                                </div>
                                <InlineConfirm
                                    question={<>Zignorować {doc.number}? Kolejna synchronizacja go nie przywróci.</>}
                                    confirmLabel="Ignoruj"
                                    cancelLabel="Anuluj"
                                    danger
                                    loading={loading}
                                    onConfirm={doIgnore}
                                    onCancel={close}
                                />
                            </div>
                        )}
                    </td>
                </tr>
            )}
        </>
    );
}
