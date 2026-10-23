'use client';

import React, { useId, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { updateArchitectAdminFields, resetArchitectPassword } from '@/app/actions/architects';
import { PASSWORD_POLICY_HINT } from '@/lib/passwordPolicy';
import { Button, Card, CardBody, CardHeader, InlineConfirm } from '@/components/ui';

interface Props {
    architectId: string;
    currentTierOverride: string | null;
    autoTier: string;
}

const LABEL = 'mb-1.5 block text-[13px] font-semibold text-ink';
const CONTROL = 'h-10 w-full rounded-sm border border-border-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-3';

export default function ArchitectProfileClient({ architectId, currentTierOverride, autoTier }: Props) {
    const router = useRouter();
    const uid = useId();
    const [tierOverride, setTierOverride] = useState<string>(currentTierOverride || 'AUTO');
    const [loading, setLoading] = useState(false);
    const [resetLoading, setResetLoading] = useState(false);
    const [confirmingReset, setConfirmingReset] = useState(false);
    const [saved, setSaved] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [resetPassword, setResetPassword] = useState('');
    const [resetSuccess, setResetSuccess] = useState(false);
    const [resetError, setResetError] = useState<string | null>(null);

    const handleSave = async () => {
        setLoading(true);
        setSaveError(null);
        try {
            await updateArchitectAdminFields(architectId, {
                tier_override: tierOverride === 'AUTO' ? null : tierOverride,
            });
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
            router.refresh();
        } catch (err: any) {
            console.error(err);
            setSaveError(err?.message || 'Nie udało się zapisać statusu.');
        } finally {
            setLoading(false);
        }
    };

    const handleResetPassword = async () => {
        if (!resetPassword) return;
        setResetLoading(true);
        setResetError(null);
        try {
            await resetArchitectPassword(architectId, resetPassword);
            setResetSuccess(true);
            setResetPassword('');
            setTimeout(() => setResetSuccess(false), 3000);
        } catch (err: any) {
            setResetError(err?.message || 'Nie udało się zresetować hasła.');
        } finally {
            setResetLoading(false);
            setConfirmingReset(false);
        }
    };

    return (
        <Card as="section">
            <CardHeader title="Status partnerski" />
            <CardBody className="space-y-5">
                {/* Status automatyczny */}
                <div className="rounded-sm border border-border bg-surface-2 px-4 py-3">
                    <p className="label-caps">Status automatyczny (z obrotu)</p>
                    <p className="mt-1 text-sm font-semibold text-ink">{autoTier}</p>
                </div>

                {/* Override: wpływa na stawkę prowizji przy kolejnych rozliczeniach */}
                <div>
                    <label className={LABEL} htmlFor={`${uid}-override`}>Ręczny override statusu</label>
                    <select
                        id={`${uid}-override`}
                        value={tierOverride}
                        onChange={(e) => setTierOverride(e.target.value)}
                        className={CONTROL}
                    >
                        <option value="AUTO">Auto (z obrotu)</option>
                        <option value="PARTNER">Partner — 10%</option>
                        <option value="PARTNER_PLUS">Partner Plus — 12%</option>
                        <option value="PARTNER_PREMIUM">Partner Premium — 15%</option>
                    </select>
                    <p className="mt-1.5 text-[13px] text-ink-2">
                        Override blokuje automatyczne przeliczanie statusu i decyduje o stawce nowych prowizji. Historyczne prowizje nie zmieniają się.
                    </p>
                </div>

                <div className="space-y-2">
                    <Button variant="secondary" fullWidth loading={loading} onClick={handleSave}>
                        {saved ? 'Zapisano' : 'Zapisz zmiany'}
                    </Button>
                    {saveError && <p role="alert" className="text-[13px] text-danger">{saveError}</p>}
                </div>

                {/* Reset hasła */}
                <div className="space-y-3 border-t border-border pt-5">
                    <h3 className="text-sm font-semibold text-ink">Reset hasła</h3>
                    <div>
                        <label className={LABEL} htmlFor={`${uid}-pw`}>Nowe hasło</label>
                        <input
                            id={`${uid}-pw`}
                            type="password"
                            autoComplete="new-password"
                            value={resetPassword}
                            onChange={(e) => { setResetPassword(e.target.value); setConfirmingReset(false); }}
                            aria-invalid={resetError ? true : undefined}
                            aria-describedby={`${uid}-pw-hint`}
                            className={`${CONTROL} ${resetError ? 'border-danger!' : ''}`}
                        />
                        {resetError ? (
                            <p id={`${uid}-pw-hint`} role="alert" className="mt-1.5 text-[13px] text-danger">{resetError}</p>
                        ) : (
                            <p id={`${uid}-pw-hint`} className="mt-1.5 text-[13px] text-ink-2">{PASSWORD_POLICY_HINT}</p>
                        )}
                    </div>

                    {confirmingReset ? (
                        <InlineConfirm
                            question="Zresetować hasło tego konta?"
                            confirmLabel="Zresetuj hasło"
                            cancelLabel="Zostaw"
                            danger
                            loading={resetLoading}
                            onConfirm={handleResetPassword}
                            onCancel={() => setConfirmingReset(false)}
                        />
                    ) : (
                        <Button
                            variant="danger"
                            fullWidth
                            icon={<KeyRound size={16} aria-hidden="true" />}
                            disabled={!resetPassword}
                            onClick={() => { setResetError(null); setConfirmingReset(true); }}
                        >
                            Zresetuj hasło
                        </Button>
                    )}
                    {resetSuccess && <p role="status" className="text-[13px] font-semibold text-success">Hasło zostało zresetowane.</p>}
                </div>
            </CardBody>
        </Card>
    );
}
