'use client';

import React, { useEffect, useRef, useState } from 'react';
import { FileText, Image as ImageIcon, Upload, Trash2, Download, Paperclip, X, ZoomIn } from 'lucide-react';
import { Banner, Button, Card, CardHeader, EmptyState, InlineConfirm, cx, formatDate } from '@/components/ui';

export interface ProjectFile {
    id: string;
    project_id: string;
    uploaded_by: string;
    uploaded_by_name: string;
    original_name: string;
    stored_name: string;
    mime_type: string;
    file_size: number;
    category: 'DOC' | 'PHOTO';
    created_at: string;
}

interface ProjectFilesSectionProps {
    projectId: string;
    currentUserId: string;
    initialFiles: ProjectFile[];
    isAdmin: boolean;
}

type FilterMode = 'ALL' | 'DOC' | 'PHOTO';

const FILTERS: { key: FilterMode; label: string }[] = [
    { key: 'ALL', label: 'Wszystkie' },
    { key: 'DOC', label: 'Dokumenty' },
    { key: 'PHOTO', label: 'Zdjęcia' },
];

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString('pl-PL', { maximumFractionDigits: 1 })} KB`;
    return `${(bytes / (1024 * 1024)).toLocaleString('pl-PL', { maximumFractionDigits: 1 })} MB`;
}

function FileTypeIcon({ mimeType }: { mimeType: string }) {
    const isImage = mimeType.startsWith('image/');
    return (
        <span
            className={cx(
                'grid h-9 w-9 shrink-0 place-items-center rounded-sm',
                isImage ? 'bg-info-soft text-info' : 'bg-brass-soft text-brass-ink',
            )}
        >
            {isImage ? <ImageIcon size={16} aria-hidden="true" /> : <FileText size={16} aria-hidden="true" />}
        </span>
    );
}

const ICON_ACTION_CLASS =
    'grid h-8 w-8 shrink-0 place-items-center rounded-sm text-ink-2 transition-colors hover:bg-ink/5 hover:text-ink';

// ─── Lightbox ────────────────────────────────────────────────────────────────

function Lightbox({ file, projectId, onClose }: { file: ProjectFile; projectId: string; onClose: () => void }) {
    const src = `/api/projects/${projectId}/files/${file.id}`;

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label={`Podgląd: ${file.original_name}`}
            className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-4"
            onClick={onClose}
        >
            <button
                type="button"
                onClick={onClose}
                aria-label="Zamknij podgląd"
                className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-sm bg-surface text-ink shadow-float transition-colors hover:bg-surface-2"
            >
                <X size={18} aria-hidden="true" />
            </button>
            <div
                className="relative flex max-h-[90vh] max-w-[90vw] flex-col items-center gap-3"
                onClick={(e) => e.stopPropagation()}
            >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={src}
                    alt={file.original_name}
                    className="max-h-[80vh] max-w-full rounded-md object-contain shadow-float"
                />
                <div className="flex flex-wrap items-center justify-center gap-3 rounded-sm bg-surface px-3 py-2 shadow-float">
                    <p className="min-w-0 truncate text-sm text-ink">{file.original_name}</p>
                    <Button
                        variant="secondary"
                        size="sm"
                        href={src}
                        target="_blank"
                        rel="noreferrer"
                        icon={<Download size={14} aria-hidden="true" />}
                    >
                        Pobierz
                    </Button>
                </div>
            </div>
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ProjectFilesSection({
    projectId,
    currentUserId,
    initialFiles,
    isAdmin,
}: ProjectFilesSectionProps) {
    const [files, setFiles] = useState<ProjectFile[]>(initialFiles);
    const [filter, setFilter] = useState<FilterMode>('ALL');
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [lightboxFile, setLightboxFile] = useState<ProjectFile | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Kategoria uploadu podąża za zakładką (przy „Wszystkie” domyślnie dokument)
    const uploadCategory: 'DOC' | 'PHOTO' = filter === 'PHOTO' ? 'PHOTO' : 'DOC';

    const acceptAttr =
        filter === 'PHOTO'
            ? '.jpg,.jpeg,.png,.webp'
            : filter === 'DOC'
            ? '.pdf'
            : '.pdf,.jpg,.jpeg,.png,.webp';

    const visibleFiles = filter === 'ALL' ? files : files.filter((f) => f.category === filter);

    const countFor = (key: FilterMode) => (key === 'ALL' ? files.length : files.filter((f) => f.category === key).length);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const selected = e.target.files;
        if (!selected || selected.length === 0) return;

        setError(null);
        setUploading(true);

        try {
            for (const file of Array.from(selected)) {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('category', uploadCategory);

                const res = await fetch(`/api/projects/${projectId}/files`, {
                    method: 'POST',
                    body: formData,
                });

                const json = await res.json().catch(() => ({}));

                if (!res.ok) {
                    setError(json.error || 'Błąd przesyłania pliku');
                    break;
                }

                setFiles((prev) => [json.file, ...prev]);
            }
        } catch {
            setError('Błąd przesyłania pliku');
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleDelete = async (fileId: string) => {
        setDeletingId(fileId);
        setError(null);

        try {
            const res = await fetch(`/api/projects/${projectId}/files/${fileId}`, {
                method: 'DELETE',
            });

            if (res.ok) {
                setFiles((prev) => prev.filter((f) => f.id !== fileId));
                setConfirmDeleteId(null);
            } else {
                const json = await res.json().catch(() => ({}));
                setError(json.error || 'Nie udało się usunąć pliku');
                setConfirmDeleteId(null);
            }
        } catch {
            setError('Nie udało się usunąć pliku');
            setConfirmDeleteId(null);
        } finally {
            setDeletingId(null);
        }
    };

    const canDeleteFile = (file: ProjectFile) => {
        if (isAdmin) return true;
        return file.uploaded_by === currentUserId;
    };

    const uploadLabel = uploading
        ? 'Przesyłanie…'
        : filter === 'PHOTO'
        ? 'Dodaj zdjęcie'
        : filter === 'DOC'
        ? 'Dodaj dokument'
        : 'Dodaj plik';

    return (
        <>
            {lightboxFile && (
                <Lightbox file={lightboxFile} projectId={projectId} onClose={() => setLightboxFile(null)} />
            )}

            <Card as="section" className="overflow-hidden">
                <CardHeader
                    title={files.length > 0 ? `Pliki projektu (${files.length})` : 'Pliki projektu'}
                    action={
                        <>
                            <Button
                                variant="secondary"
                                size="sm"
                                loading={uploading}
                                icon={<Upload size={16} aria-hidden="true" />}
                                onClick={() => fileInputRef.current?.click()}
                            >
                                {uploadLabel}
                            </Button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept={acceptAttr}
                                multiple
                                className="hidden"
                                onChange={handleFileChange}
                            />
                        </>
                    }
                />

                {/* Zakładki */}
                <div role="tablist" aria-label="Rodzaj plików" className="flex gap-1 overflow-x-auto border-b border-border px-3">
                    {FILTERS.map(({ key, label }) => {
                        const active = filter === key;
                        return (
                            <button
                                key={key}
                                type="button"
                                role="tab"
                                aria-selected={active}
                                onClick={() => setFilter(key)}
                                className={cx(
                                    '-mb-px whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors',
                                    active
                                        ? 'border-ink text-ink'
                                        : 'border-transparent text-ink-2 hover:text-ink',
                                )}
                            >
                                {label}
                                <span className="tnum ml-1.5 text-xs text-ink-3">{countFor(key)}</span>
                            </button>
                        );
                    })}
                </div>

                <div className="space-y-4 p-5">
                    {error && (
                        <Banner
                            tone="danger"
                            title={error}
                            action={
                                <Button size="sm" variant="ghost" onClick={() => setError(null)}>
                                    Zamknij
                                </Button>
                            }
                        />
                    )}

                    {visibleFiles.length === 0 ? (
                        <EmptyState
                            icon={<Paperclip size={20} aria-hidden="true" />}
                            title={files.length === 0 ? 'Brak załączników' : 'Brak plików w tej kategorii'}
                            description={files.length === 0 ? 'Dodaj dokument lub zdjęcie, aby dołączyć je do projektu.' : undefined}
                        />
                    ) : (
                        <ul className="-my-1 divide-y divide-border">
                            {visibleFiles.map((file) => {
                                const isImage = file.mime_type.startsWith('image/');
                                const confirming = confirmDeleteId === file.id;
                                return (
                                    <li key={file.id} className="flex flex-wrap items-center gap-3 py-3">
                                        <FileTypeIcon mimeType={file.mime_type} />

                                        <div className="min-w-0 flex-1 basis-48">
                                            <p className="truncate text-sm font-semibold text-ink" title={file.original_name}>
                                                {file.original_name}
                                            </p>
                                            <p className="mt-0.5 text-xs text-ink-2">
                                                <span className="tnum">{formatBytes(file.file_size)}</span>
                                                <span aria-hidden="true" className="mx-1.5 text-ink-3">·</span>
                                                <span className="tnum">{formatDate(file.created_at)}</span>
                                                {isAdmin && file.uploaded_by_name && (
                                                    <>
                                                        <span aria-hidden="true" className="mx-1.5 text-ink-3">·</span>
                                                        <span>{file.uploaded_by_name}</span>
                                                    </>
                                                )}
                                            </p>
                                        </div>

                                        {confirming ? (
                                            <InlineConfirm
                                                question="Usunąć plik?"
                                                confirmLabel="Usuń plik"
                                                cancelLabel="Zostaw"
                                                danger
                                                loading={deletingId === file.id}
                                                onConfirm={() => handleDelete(file.id)}
                                                onCancel={() => setConfirmDeleteId(null)}
                                            />
                                        ) : (
                                            <div className="flex shrink-0 items-center gap-0.5">
                                                {isImage && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setLightboxFile(file)}
                                                        className={ICON_ACTION_CLASS}
                                                        aria-label={`Podgląd: ${file.original_name}`}
                                                        title="Podgląd"
                                                    >
                                                        <ZoomIn size={16} aria-hidden="true" />
                                                    </button>
                                                )}
                                                <a
                                                    href={`/api/projects/${projectId}/files/${file.id}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className={ICON_ACTION_CLASS}
                                                    aria-label={`Pobierz: ${file.original_name}`}
                                                    title="Pobierz"
                                                >
                                                    <Download size={16} aria-hidden="true" />
                                                </a>
                                                {canDeleteFile(file) && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setConfirmDeleteId(file.id)}
                                                        className={cx(ICON_ACTION_CLASS, 'hover:bg-danger-soft hover:text-danger')}
                                                        aria-label={`Usuń: ${file.original_name}`}
                                                        title="Usuń"
                                                    >
                                                        <Trash2 size={16} aria-hidden="true" />
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </Card>
        </>
    );
}
