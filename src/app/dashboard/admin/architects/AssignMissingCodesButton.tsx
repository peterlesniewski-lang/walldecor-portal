'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Hash } from 'lucide-react';
import { Banner, Button } from '@/components/ui';
import { assignMissingSubiektCodes } from '@/app/actions/subiekt';

/**
 * „Nadaj brakujące kody” na liście architektów (tylko ADMIN, renderowany tylko gdy są konta bez kodu):
 * nadaje kody A-xxx po kolei (created_at, potem nazwa) i odświeża listę — po sukcesie przycisk znika.
 */
export default function AssignMissingCodesButton({ missingCount }: { missingCount: number }) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const assign = async () => {
        setLoading(true);
        setError('');
        try {
            const result = await assignMissingSubiektCodes();
            if (!result.ok) {
                setError(result.error);
                return;
            }
            router.refresh();
        } catch (e: unknown) {
            setError(e instanceof Error && e.message ? e.message : 'Nie udało się nadać kodów.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col items-end gap-2">
            <Button
                variant="secondary"
                size="sm"
                icon={<Hash size={16} aria-hidden="true" />}
                loading={loading}
                onClick={assign}
                title={`Konta architektów bez kodu Subiekt: ${missingCount}`}
            >
                Nadaj brakujące kody ({missingCount})
            </Button>
            {error && <Banner tone="danger" title={error} />}
        </div>
    );
}
