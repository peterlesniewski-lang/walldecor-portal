'use client';

import { useState } from 'react';
import { Mail, Edit2, Check, X, Send, Info } from 'lucide-react';
import { updateEmailTemplate, testEmailTemplate } from '@/app/actions/emailTemplates';

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
            alert('Wprowadź adres email do testu');
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
        <div className="space-y-6">
            {/* Feedback Message */}
            {msg && (
                <div className={`fixed bottom-8 right-8 p-4 rounded-xl shadow-2xl z-50 border ${msg.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
                    } flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4`}>
                    {msg.type === 'success' ? <Check size={18} /> : <X size={18} />}
                    <span className="font-bold text-sm tracking-tight">{msg.text}</span>
                </div>
            )}

            <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-sm">
                <div className="p-6 border-b border-stone-100 bg-stone-50/50">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center text-orange-600">
                            <Mail size={20} />
                        </div>
                        <div>
                            <h2 className="text-sm font-black text-stone-900 uppercase tracking-tighter">Szablony Powiadomień Email</h2>
                            <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mt-0.5">Konfiguruj treści wiadomości systemowych</p>
                        </div>
                    </div>
                </div>

                <div className="divide-y divide-stone-100">
                    {templates.map((template) => (
                        <div key={template.id} className="p-6">
                            {editingId === template.id ? (
                                <div className="space-y-4">
                                    <div className="flex justify-between items-start mb-2">
                                        <h3 className="font-bold text-stone-900 italic tracking-tight">{template.name}</h3>
                                        <div className="flex items-center gap-2">
                                            <label className="flex items-center gap-2 text-[10px] font-bold text-stone-500 uppercase cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={editForm.is_active}
                                                    onChange={(e) => setEditForm(f => ({ ...f, is_active: e.target.checked }))}
                                                    className="w-4 h-4 rounded text-orange-600 focus:ring-orange-500 border-stone-300"
                                                />
                                                Aktywny
                                            </label>
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Temat Wiadomości</label>
                                        <input
                                            value={editForm.subject}
                                            onChange={(e) => setEditForm(f => ({ ...f, subject: e.target.value }))}
                                            className="w-full text-sm font-bold p-3 bg-stone-100 border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                                        />
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Treść (HTML)</label>
                                        <textarea
                                            rows={8}
                                            value={editForm.content}
                                            onChange={(e) => setEditForm(f => ({ ...f, content: e.target.value }))}
                                            className="w-full text-sm font-medium p-3 bg-stone-100 border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all font-mono"
                                        />
                                    </div>

                                    <div className="bg-blue-50 p-3 rounded-xl flex gap-3 text-blue-700">
                                        <Info size={16} className="shrink-0 mt-0.5" />
                                        <div className="text-[10px] leading-relaxed">
                                            <span className="font-bold block mb-1">Dostępne tagi:</span>
                                            <code className="bg-blue-100 px-1 rounded">{"{{user_name}}"}</code>,
                                            <code className="bg-blue-100 px-1 rounded ml-1">{"{{project_name}}"}</code>,
                                            <code className="bg-blue-100 px-1 rounded ml-1">{"{{client_label}}"}</code>,
                                            <code className="bg-blue-100 px-1 rounded ml-1">{"{{amount}}"}</code>,
                                            <code className="bg-blue-100 px-1 rounded ml-1">{"{{card_code}}"}</code>
                                        </div>
                                    </div>

                                    <div className="flex gap-2 justify-end pt-2">
                                        <button
                                            onClick={() => setEditingId(null)}
                                            className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-stone-500 hover:text-stone-700 transition-colors"
                                        >
                                            Anuluj
                                        </button>
                                        <button
                                            disabled={isSaving}
                                            onClick={() => handleSave(template.id)}
                                            className="px-6 py-2 bg-stone-900 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-orange-600 transition-colors disabled:opacity-50"
                                        >
                                            {isSaving ? 'Zapisywanie...' : 'Zapisz Zmiany'}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-1">
                                            <h3 className="font-bold text-stone-900 italic tracking-tight">{template.name}</h3>
                                            <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-black uppercase tracking-tighter ${template.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-100 text-stone-500'
                                                }`}>
                                                {template.is_active ? 'Aktywny' : 'Wyłączony'}
                                            </span>
                                            <span className="text-[10px] font-medium text-stone-400 font-mono">{template.slug}</span>
                                        </div>
                                        <p className="text-xs text-stone-500 mb-3">{template.description}</p>
                                        <div className="bg-stone-50 p-3 rounded-xl border border-stone-100 space-y-2">
                                            <div>
                                                <span className="text-[9px] font-black text-stone-400 uppercase tracking-widest block mb-0.5">Temat:</span>
                                                <p className="text-xs font-bold text-stone-800">{template.subject}</p>
                                            </div>
                                            <div>
                                                <span className="text-[9px] font-black text-stone-400 uppercase tracking-widest block mb-0.5">Podgląd treści:</span>
                                                <div className="text-[10px] text-stone-500 line-clamp-2 italic" dangerouslySetInnerHTML={{ __html: template.content.replace(/<[^>]*>?/gm, '') }} />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-2 shrink-0">
                                        <button
                                            onClick={() => startEditing(template)}
                                            className="flex items-center gap-2 px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 text-[10px] font-black uppercase tracking-widest rounded-xl transition-colors"
                                        >
                                            <Edit2 size={12} />
                                            Edytuj
                                        </button>

                                        <div className="flex flex-col gap-1.5 pt-2 border-t border-stone-100">
                                            <div className="flex gap-1">
                                                <input
                                                    placeholder="Test email..."
                                                    className="w-full text-[10px] p-2 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-orange-500/20"
                                                    value={testEmail}
                                                    onChange={(e) => setTestEmail(e.target.value)}
                                                />
                                                <button
                                                    onClick={() => handleTest(template.id)}
                                                    className="p-2 bg-white border border-stone-200 text-stone-600 hover:text-orange-600 rounded-lg transition-colors"
                                                    title="Wyślij test"
                                                >
                                                    <Send size={12} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
