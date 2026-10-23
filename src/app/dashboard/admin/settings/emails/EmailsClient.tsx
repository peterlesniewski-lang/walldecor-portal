'use client';

import { useState } from 'react';
import { Edit2, Send } from 'lucide-react';
import { updateEmailTemplate, testEmailTemplate } from '@/app/actions/emailTemplates';
import { Banner, Button, Card, CardBody, CardHeader, StatusPill } from '@/components/ui';

const FIELD_LABEL = 'text-[13px] font-semibold text-ink-2';
const FIELD_INPUT =
    'w-full rounded-sm border border-border-strong bg-surface px-3 text-[15px] text-ink placeholder:text-ink-3 ' +
    'focus:border-ink focus:outline-none focus:shadow-[0_0_0_3px_rgba(26,25,23,0.08)]';

interface EmailTemplate {
    id: string;
    slug: string;
    name: string;
    subject: string;
    content: string;
    description: string;
    is_active: number;
    updated_at: string;
}

export default function EmailsClient({ initialTemplates }: { initialTemplates: EmailTemplate[] }) {
    const [templates, setTemplates] = useState(initialTemplates);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState({ subject: '', content: '', is_active: true });
    const [testEmail, setTestEmail] = useState('');
    const [msg, setMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const startEditing = (template: EmailTemplate) => {
        setEditingId(template.id);
        setEditForm({
            subject: template.subject,
            content: template.content,
            is_active: template.is_active === 1
        });
    };

    const handleSave = async (id: string) => {
        setIsSaving(true);
        try {
            const res = await updateEmailTemplate(id, editForm);
            if (res.success) {
                setTemplates(prev => prev.map(t => t.id === id ? { ...t, ...editForm, is_active: editForm.is_active ? 1 : 0 } : t));
                setEditingId(null);
                setMsg({ type: 'success', text: 'Szablon został zaktualizowany.' });
            }
        } catch (err: any) {
            setMsg({ type: 'error', text: err.message });
        } finally {
            setIsSaving(false);
            setTimeout(() => setMsg(null), 3000);
        }
    };

    const handleTest = async (id: string) => {
        if (!testEmail) {
            setMsg({ type: 'error', text: 'Wprowadź adres email do testu.' });
            setTimeout(() => setMsg(null), 5000);
            return;
        }
        try {
            const res = await testEmailTemplate(id, testEmail);
            if (res && res.success) {
                setMsg({ type: 'success', text: res.logged ? 'Email zalogowany w konsoli serwera (DEV).' : 'Email testowy został wysłany.' });
            } else {
                setMsg({ type: 'error', text: 'Błąd wysyłki: ' + ((res?.error as any)?.message || 'Unknown error') });
            }
        } catch (err: any) {

            setMsg({ type: 'error', text: err.message });
        } finally {
            setTimeout(() => setMsg(null), 5000);
        }
    };

    return (
        <div className="space-y-4">
            {/* Feedback Message (komunikat pływający: float) */}
            {msg && (
                <div className="fixed inset-x-4 bottom-4 z-50 sm:inset-x-auto sm:bottom-8 sm:right-8 sm:w-[380px]">
                    <Banner tone={msg.type === 'success' ? 'success' : 'danger'} className="shadow-float">
                        {msg.text}
                    </Banner>
                </div>
            )}

            <div>
                <h3 className="font-display text-xl text-ink">Szablony powiadomień email</h3>
                <p className="mt-1 text-sm text-ink-2">Konfiguruj treści wiadomości systemowych.</p>
            </div>

            <div className="space-y-4">
                {templates.map((template) => (
                    <Card key={template.id} as="article">
                        {editingId === template.id ? (
                            <>
                                <CardHeader
                                    title={template.name}
                                    action={
                                        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-ink">
                                            <input
                                                type="checkbox"
                                                checked={editForm.is_active}
                                                onChange={(e) => setEditForm(f => ({ ...f, is_active: e.target.checked }))}
                                                className="h-4 w-4 rounded-sm border-border-strong accent-[#E3C15A]"
                                            />
                                            Aktywny
                                        </label>
                                    }
                                />
                                <CardBody className="space-y-4">
                                    <div className="flex flex-col gap-1.5">
                                        <label htmlFor={`tpl-subject-${template.id}`} className={FIELD_LABEL}>Temat wiadomości</label>
                                        <input
                                            id={`tpl-subject-${template.id}`}
                                            value={editForm.subject}
                                            onChange={(e) => setEditForm(f => ({ ...f, subject: e.target.value }))}
                                            className={`${FIELD_INPUT} h-10`}
                                        />
                                    </div>

                                    <div className="flex flex-col gap-1.5">
                                        <label htmlFor={`tpl-content-${template.id}`} className={FIELD_LABEL}>Treść (HTML)</label>
                                        <textarea
                                            id={`tpl-content-${template.id}`}
                                            rows={8}
                                            value={editForm.content}
                                            onChange={(e) => setEditForm(f => ({ ...f, content: e.target.value }))}
                                            className={`${FIELD_INPUT} py-2.5 font-mono text-[13px] leading-relaxed`}
                                        />
                                    </div>

                                    <Banner tone="info" title="Dostępne tagi">
                                        <span className="flex flex-wrap items-center gap-1.5">
                                            {['{{user_name}}', '{{project_name}}', '{{client_label}}', '{{amount}}', '{{card_code}}'].map((tag) => (
                                                <code key={tag} className="rounded-sm border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-ink">{tag}</code>
                                            ))}
                                        </span>
                                    </Banner>

                                    <div className="flex justify-end gap-2">
                                        <Button variant="ghost" onClick={() => setEditingId(null)}>
                                            Anuluj
                                        </Button>
                                        <Button loading={isSaving} onClick={() => handleSave(template.id)}>
                                            {isSaving ? 'Zapisywanie...' : 'Zapisz zmiany'}
                                        </Button>
                                    </div>
                                </CardBody>
                            </>
                        ) : (
                            <CardBody className="flex flex-col justify-between gap-5 md:flex-row md:items-start">
                                <div className="min-w-0 flex-1">
                                    <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                                        <h3 className="font-semibold text-ink">{template.name}</h3>
                                        <StatusPill tone={template.is_active ? 'success' : 'neutral'}>
                                            {template.is_active ? 'Aktywny' : 'Wyłączony'}
                                        </StatusPill>
                                        <span className="font-mono text-xs text-ink-2">{template.slug}</span>
                                    </div>
                                    <p className="mb-3 text-sm text-ink-2">{template.description}</p>
                                    <div className="space-y-2.5 rounded-sm border border-border bg-surface-2 p-3.5">
                                        <div>
                                            <span className="label-caps mb-0.5 block">Temat</span>
                                            <p className="text-sm font-medium text-ink">{template.subject}</p>
                                        </div>
                                        <div>
                                            <span className="label-caps mb-0.5 block">Podgląd treści</span>
                                            <p className="line-clamp-2 text-[13px] text-ink-2">
                                                {template.content.replace(/<[^>]*>?/gm, '').replace(/&nbsp;/g, ' ')}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex shrink-0 flex-col gap-3 md:w-[240px]">
                                    <Button variant="secondary" icon={<Edit2 size={14} />} onClick={() => startEditing(template)}>
                                        Edytuj
                                    </Button>

                                    <div className="space-y-1.5 border-t border-border pt-3">
                                        <label htmlFor={`tpl-test-${template.id}`} className={FIELD_LABEL}>Wyślij test na adres</label>
                                        <div className="flex gap-2">
                                            <input
                                                id={`tpl-test-${template.id}`}
                                                type="email"
                                                placeholder="adres@email.pl"
                                                className={`${FIELD_INPUT} h-8 min-w-0 flex-1 text-[13px]`}
                                                value={testEmail}
                                                onChange={(e) => setTestEmail(e.target.value)}
                                            />
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                icon={<Send size={14} />}
                                                onClick={() => handleTest(template.id)}
                                                title="Wyślij test"
                                                aria-label="Wyślij test"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </CardBody>
                        )}
                    </Card>
                ))}
            </div>
        </div>
    );
}
