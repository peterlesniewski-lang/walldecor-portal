'use client';

import React, { useRef, useState } from 'react';
import {
    FileText, Image as ImageIcon, Upload, Trash2, Download,
    Loader2, AlertCircle, Paperclip, X, CheckCircle2
} from 'lucide-react';

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

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon({ mimeType }: { mimeType: string }) {
    if (mimeType.startsWith('image/')) {
        return <ImageIcon size={14} className="text-blue-500" />;
    }
    return <FileText size={14} className="text-amber-500" />;
}

export default function ProjectFilesSection({
    projectId,
    currentUserId,
    initialFiles,
    isAdmin,
}: ProjectFilesSectionProps) {
    const [files, setFiles] = useState<ProjectFile[]>(initialFiles);
    const [category, setCategory] = useState<'DOC' | 'PHOTO'>('DOC');
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const selected = e.target.files;
        if (!selected || selected.length === 0) return;

        setUploadError(null);
        setUploading(true);

        try {
            for (const file of Array.from(selected)) {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('category', category);

                const res = await fetch(`/api/projects/${projectId}/files`, {
                    method: 'POST',
                    body: formData,
                });

                const json = await res.json();

                if (!res.ok) {
                    setUploadError(json.error || 'Błąd przesyłania pliku');
                    break;
                }

                setFiles((prev) => [json.file, ...prev]);
            }
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleDelete = async (fileId: string) => {
        setDeletingId(fileId);
        setConfirmDeleteId(null);

        try {
            const res = await fetch(`/api/projects/${projectId}/files/${fileId}`, {
                method: 'DELETE',
            });

            if (res.ok) {
                setFiles((prev) => prev.filter((f) => f.id !== fileId));
            }
        } finally {
            setDeletingId(null);
        }
    };

    const canDeleteFile = (file: ProjectFile) => {
        if (isAdmin) return true;
        return file.uploaded_by === currentUserId;
    };

    return (
        <div className="stat-card bg-card border border-black/5 p-6 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                    <Paperclip size={14} className="text-brand-primary" />
                    <h3 className="text-[10px] font-black text-stone-500 uppercase tracking-[0.3em]">
                        Pliki projektu
                    </h3>
                    {files.length > 0 && (
                        <span className="text-[10px] font-black text-stone-400">({files.length})</span>
                    )}
                </div>

                <div className="flex items-center gap-3">
                    {/* Category toggle */}
                    <div className="flex items-center gap-1 bg-black/5 rounded-xl p-1">
                        {(['DOC', 'PHOTO'] as const).map((cat) => (
                            <button
                                key={cat}
                                onClick={() => setCategory(cat)}
                                className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                                    category === cat
                                        ? 'bg-white shadow-sm text-stone-900'
                                        : 'text-stone-500 hover:text-stone-700'
                                }`}
                            >
                                {cat === 'DOC' ? 'Dokument' : 'Zdjęcie'}
                            </button>
                        ))}
                    </div>

                    {/* Upload button */}
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="flex items-center gap-2 px-3 py-2 bg-black/5 hover:bg-black/10 border border-black/10 rounded-xl text-[9px] font-black text-stone-700 uppercase tracking-widest transition-all disabled:opacity-50"
                    >
                        {uploading ? (
                            <Loader2 size={12} className="animate-spin" />
                        ) : (
                            <Upload size={12} />
                        )}
                        {uploading ? 'Przesyłanie...' : 'Dodaj plik'}
                    </button>

                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,.webp"
                        multiple
                        className="hidden"
                        onChange={handleFileChange}
                    />
                </div>
            </div>

            {/* Upload error */}
            {uploadError && (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                    <AlertCircle size={14} />
                    <span className="text-[11px] font-bold">{uploadError}</span>
                    <button onClick={() => setUploadError(null)} className="ml-auto">
                        <X size={12} />
                    </button>
                </div>
            )}

            {/* File list */}
            {files.length === 0 ? (
                <div className="py-8 text-center border border-dashed border-black/10 rounded-2xl">
                    <Paperclip size={20} className="mx-auto text-stone-300 mb-2" />
                    <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">
                        Brak załączników
                    </p>
                </div>
            ) : (
                <div className="space-y-1">
                    {files.map((file) => (
                        <div
                            key={file.id}
                            className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-black/5 transition-all group"
                        >
                            {/* Category badge */}
                            <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg border shrink-0 ${
                                file.category === 'PHOTO'
                                    ? 'bg-blue-50 text-blue-500 border-blue-200'
                                    : 'bg-amber-50 text-amber-600 border-amber-200'
                            }`}>
                                {file.category === 'PHOTO' ? 'Foto' : 'Doc'}
                            </span>

                            {/* Icon + name */}
                            <FileIcon mimeType={file.mime_type} />
                            <span className="flex-1 text-[11px] font-bold text-stone-700 truncate" title={file.original_name}>
                                {file.original_name}
                            </span>

                            {/* Meta */}
                            <span className="text-[10px] text-stone-400 font-medium shrink-0 hidden sm:block">
                                {formatBytes(file.file_size)}
                            </span>
                            <span className="text-[10px] text-stone-400 font-medium shrink-0 hidden md:block">
                                {new Date(file.created_at).toLocaleDateString('pl-PL')}
                            </span>
                            {isAdmin && (
                                <span className="text-[10px] text-stone-400 font-medium shrink-0 hidden lg:block max-w-[120px] truncate" title={file.uploaded_by_name}>
                                    {file.uploaded_by_name}
                                </span>
                            )}

                            {/* Actions */}
                            <div className="flex items-center gap-1 shrink-0">
                                <a
                                    href={`/api/projects/${projectId}/files/${file.id}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="p-1.5 rounded-lg hover:bg-black/5 text-stone-400 hover:text-stone-700 transition-all"
                                    title="Pobierz"
                                >
                                    <Download size={13} />
                                </a>

                                {canDeleteFile(file) && (
                                    <>
                                        {confirmDeleteId === file.id ? (
                                            <div className="flex items-center gap-1">
                                                <span className="text-[9px] font-black text-red-500 uppercase tracking-widest">Usuń?</span>
                                                <button
                                                    onClick={() => handleDelete(file.id)}
                                                    disabled={deletingId === file.id}
                                                    className="p-1 rounded-lg text-[9px] font-black text-red-500 hover:bg-red-50 transition-all"
                                                >
                                                    {deletingId === file.id ? (
                                                        <Loader2 size={11} className="animate-spin" />
                                                    ) : (
                                                        <CheckCircle2 size={13} />
                                                    )}
                                                </button>
                                                <button
                                                    onClick={() => setConfirmDeleteId(null)}
                                                    className="p-1 rounded-lg text-stone-400 hover:bg-black/5 transition-all"
                                                >
                                                    <X size={13} />
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => setConfirmDeleteId(file.id)}
                                                className="p-1.5 rounded-lg hover:bg-red-50 text-stone-400 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100"
                                                title="Usuń"
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
