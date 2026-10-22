import { Card, CardBody, CardHeader } from '@/components/ui';
import type { Project } from './types';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 border-t border-border py-3 first:border-t-0 first:pt-0 last:pb-0 sm:grid-cols-[130px_minmax(0,1fr)]">
            <dt className="text-[13px] font-semibold text-ink-2">{label}</dt>
            <dd className="min-w-0 break-words text-sm text-ink">{children}</dd>
        </div>
    );
}

const NONE = <span className="text-ink-3">—</span>;

/** Dane partnera. Numer konta tylko dla ADMIN (STAFF dostaje bank_account = null z page.tsx i nie widzi wiersza). */
export default function PartnerCard({ architect, isAdmin }: { architect: NonNullable<Project['architect']>; isAdmin: boolean }) {
    return (
        <Card as="section">
            <CardHeader title="Dane partnera" />
            <CardBody>
                <dl>
                    <Row label="Studio / nazwisko">
                        <span className="font-semibold">{architect.studio_name || architect.name}</span>
                    </Row>
                    <Row label="NIP">
                        {architect.nip ? <span className="tnum">{architect.nip}</span> : NONE}
                    </Row>
                    <Row label="Email">{architect.email || NONE}</Row>
                    <Row label="Adres">{architect.address || NONE}</Row>
                    {architect.is_vat_payer !== undefined && (
                        <Row label="VAT">{architect.is_vat_payer ? 'Płatnik VAT' : 'Nie jest płatnikiem VAT'}</Row>
                    )}
                    {isAdmin && (
                        <Row label="Numer konta">
                            {architect.bank_account ? (
                                <span className="select-all font-mono text-[13px] tnum">{architect.bank_account}</span>
                            ) : (
                                NONE
                            )}
                        </Row>
                    )}
                </dl>
            </CardBody>
        </Card>
    );
}
